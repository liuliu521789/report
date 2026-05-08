import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import tar from 'tar';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { getPool } from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUP_ROOT = path.resolve(__dirname, '../../backup');
export let isBackingUp = false;
const BACKUP_DIR_ID_RE = /^\d{4}-\d{2}-\d{2}$/;
const BACKUP_PACKAGE_META = 'backup_package.meta.json';
const BACKUP_ALERT_LEVELS = ['off', 'error', 'critical'];
const BACKUP_ALERT_LEVEL_WEIGHT = { off: 0, error: 1, critical: 2 };
const backupAlertDedupCache = new Map();

function getBackupRetentionDays() {
  const raw = Number(process.env.BACKUP_RETENTION_DAYS || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw);
}

async function createBackupJob({ jobType, triggerType, actorUserId, targetBackupId }) {
  const pool = getPool();
  const [r] = await pool.query(
    `INSERT INTO backup_jobs (job_type, trigger_type, target_backup_id, status, actor_user_id)
     VALUES (?, ?, ?, 'running', ?)`,
    [jobType, triggerType, targetBackupId || null, actorUserId || null]
  );
  return Number(r?.insertId || 0);
}

async function finishBackupJob(jobId, payload) {
  if (!jobId) return;
  const pool = getPool();
  const {
    status,
    backupId = null,
    sizeBytes = null,
    errorMessage = null,
    meta = null
  } = payload || {};
  await pool.query(
    `UPDATE backup_jobs
     SET status=?, backup_id=?, size_bytes=?, error_message=?, meta_json=CAST(? AS JSON),
         finished_at=NOW(3), duration_ms=TIMESTAMPDIFF(MICROSECOND, started_at, NOW(3)) DIV 1000
     WHERE id=?`,
    [status, backupId, sizeBytes, errorMessage, JSON.stringify(meta || {}), jobId]
  );
}

function getBackupAlertLevel() {
  const raw = String(process.env.BACKUP_ALERT_LEVEL || 'error')
    .trim()
    .toLowerCase();
  return BACKUP_ALERT_LEVELS.includes(raw) ? raw : 'error';
}

function getBackupAlertDedupMinutes() {
  const minutes = Number(process.env.BACKUP_ALERT_DEDUP_MINUTES || 10);
  if (!Number.isFinite(minutes) || minutes < 0) return 10;
  return Math.floor(minutes);
}

function normalizeAlertKeyPart(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 256);
}

function shouldSendBackupAlert({ level, dedupKey }) {
  const configuredLevel = getBackupAlertLevel();
  const configuredWeight = BACKUP_ALERT_LEVEL_WEIGHT[configuredLevel] || 0;
  const eventWeight = BACKUP_ALERT_LEVEL_WEIGHT[level] || 0;
  if (eventWeight < configuredWeight) return false;
  const dedupMinutes = getBackupAlertDedupMinutes();
  if (dedupMinutes <= 0) return true;
  const cacheKey = normalizeAlertKeyPart(dedupKey);
  if (!cacheKey) return true;
  const now = Date.now();
  const lastTs = backupAlertDedupCache.get(cacheKey) || 0;
  const dedupMs = dedupMinutes * 60 * 1000;
  if (now - lastTs < dedupMs) return false;
  backupAlertDedupCache.set(cacheKey, now);
  return true;
}

async function sendBackupFailureAlert({ source, message, level = 'error' }) {
  const webhook = String(process.env.BACKUP_ALERT_WEBHOOK_URL || '').trim();
  if (!webhook) return;
  const normalizedSource = normalizeAlertKeyPart(source || 'unknown') || 'unknown';
  const normalizedMessage = normalizeAlertKeyPart(message || 'unknown') || 'unknown';
  const dedupKey = `backup:${level}:${normalizedSource}:${normalizedMessage}`;
  if (!shouldSendBackupAlert({ level, dedupKey })) return;
  const text = [
    '系统数据备份失败告警',
    `级别: ${level}`,
    `来源: ${normalizedSource}`,
    `时间: ${new Date().toISOString()}`,
    `错误: ${normalizedMessage}`
  ].join('\n');
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: text } })
    });
  } catch {
    // ignore alert transport error
  }
}

function keyFingerprint(keyBytes) {
  return crypto.createHash('sha256').update(keyBytes).digest('hex').slice(0, 16);
}

function toSafeTimeToken(date) {
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`;
}

function getEncryptionKeyCandidates() {
  const currentRaw = String(process.env.BACKUP_ENCRYPTION_KEY || '').trim();
  const oldRawList = String(process.env.BACKUP_ENCRYPTION_KEY_OLD || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const values = [currentRaw, ...oldRawList].filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const val of values) {
    const bytes = crypto.createHash('sha256').update(val).digest();
    const fp = keyFingerprint(bytes);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push({ bytes, fingerprint: fp });
  }
  return out;
}

function parseMetaFile(metaPath) {
  try {
    const raw = fs.readFileSync(metaPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function encryptFileAesGcm({ inputPath, outputPath, keyBytes }) {
  return new Promise((resolve, reject) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes, iv);
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    input.on('error', reject);
    output.on('error', reject);
    output.on('finish', () => {
      const tag = cipher.getAuthTag();
      resolve({
        iv: iv.toString('base64'),
        tag: tag.toString('base64')
      });
    });
    input.pipe(cipher).pipe(output);
  });
}

async function decryptFileAesGcm({ inputPath, outputPath, keyBytes, ivBase64, tagBase64 }) {
  return new Promise((resolve, reject) => {
    const iv = Buffer.from(ivBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes, iv);
    decipher.setAuthTag(tag);
    const input = fs.createReadStream(inputPath);
    const output = fs.createWriteStream(outputPath);
    input.on('error', reject);
    output.on('error', reject);
    output.on('finish', resolve);
    input.pipe(decipher).pipe(output);
  });
}

async function createEncryptedPackage({ tarPath, encPath, metaPath, keyInfo, plainSha256 }) {
  const crypt = await encryptFileAesGcm({
    inputPath: tarPath,
    outputPath: encPath,
    keyBytes: keyInfo.bytes
  });
  const encSha256 = await sha256OfFile(encPath);
  const meta = {
    algorithm: 'aes-256-gcm',
    packageFile: path.basename(encPath),
    plainFile: path.basename(tarPath),
    plainSha256,
    encryptedSha256: encSha256,
    keyFingerprint: keyInfo.fingerprint,
    iv: crypt.iv,
    tag: crypt.tag,
    createdAt: new Date().toISOString()
  };
  await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

async function resolveDecryptionKey(meta) {
  const candidates = getEncryptionKeyCandidates();
  if (!candidates.length) return null;
  if (meta?.keyFingerprint) {
    const matched = candidates.find((k) => k.fingerprint === meta.keyFingerprint);
    if (matched) return matched;
  }
  return candidates[0];
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function ensureBackupRoot() {
  await ensureDir(BACKUP_ROOT);
}

async function dumpDatabase(destDir) {
  const host = process.env.MYSQL_HOST || 'localhost';
  const port = process.env.MYSQL_PORT || '3306';
  const user = process.env.MYSQL_USER || 'root';
  const pass = process.env.MYSQL_PASSWORD || '';
  const db = process.env.MYSQL_DATABASE;
  if (!db) throw new Error('MYSQL_DATABASE is required for backup');
  const dumpPath = path.join(destDir, 'db.sql');
  const args = ['--routines', '--triggers', '--single-transaction', '-h', String(host), '-P', String(port), '-u', String(user)];
  if (pass) args.push(`-p${pass}`);
  args.push(String(db));
  const out = fs.createWriteStream(dumpPath, { encoding: 'utf8' });
  await new Promise((resolve, reject) => {
    const proc = spawn('mysqldump', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stdout.pipe(out);
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `mysqldump exited with code ${code}`));
        return;
      }
      resolve(true);
    });
    out.on('error', reject);
  });
  const stat = await fs.promises.stat(dumpPath);
  return { path: dumpPath, size: stat.size };
}

async function tarFiles(uploadsDir, tarPath) {
  if (!fs.existsSync(uploadsDir)) return { path: '', size: 0 };
  await tar.c({ gzip: true, file: tarPath, cwd: uploadsDir }, ['.']);
  const stat = await fs.promises.stat(tarPath);
  return { path: tarPath, size: stat.size };
}

async function createBackupPackage() {
  await ensureBackupRoot();
  const now = new Date();
  const dayDirName = now.toISOString().slice(0, 10);
  const dayDir = path.join(BACKUP_ROOT, dayDirName);
  await ensureDir(dayDir);

  const dbResult = await dumpDatabase(dayDir);

  const uploadsDir = path.resolve(__dirname, '../../uploads');
  const tarPath = path.join(dayDir, 'files.tar.gz');
  let filesResult = { path: '', size: 0 };
  try {
    filesResult = await tarFiles(uploadsDir, tarPath);
  } catch {
    filesResult = { path: '', size: 0 };
  }

  const total = (dbResult?.size || 0) + (filesResult?.size || 0);
  const backupEntry = {
    id: `${dayDirName}_${toSafeTimeToken(now)}`,
    date: now.toISOString(),
    dayDir,
    dbPath: dbResult.path,
    filesPath: filesResult.path,
    size: total,
    createdAt: now.toISOString()
  };
  await logBackupEvent(backupEntry, 'completed');
  return backupEntry;
}

async function logBackupEvent(backupEntry, status, error) {
  const logsDir = path.join(BACKUP_ROOT, 'logs');
  await fs.promises.mkdir(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `backup_${backupEntry.id}.log`);
  const log = {
    id: backupEntry.id,
    date: backupEntry.date,
    dayDir: backupEntry.dayDir,
    dbPath: backupEntry.dbPath,
    filesPath: backupEntry.filesPath,
    size: backupEntry.size,
    createdAt: backupEntry.createdAt,
    status,
    error: error?.message
  };
  await fs.promises.appendFile(logPath, JSON.stringify(log) + '\n');
}

async function listBackups() {
  const result = [];
  try {
    const entries = await fs.promises.readdir(BACKUP_ROOT, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() && BACKUP_DIR_ID_RE.test(ent.name)) {
        const day = ent.name;
        const dayPath = path.join(BACKUP_ROOT, day);
        const dbPath = path.join(dayPath, 'db.sql');
        const filesPath = path.join(dayPath, 'files.tar.gz');
        const createdAt = (await fs.promises.stat(dayPath)).mtime.toISOString();
        let size = 0;
        try { size += (await fs.promises.stat(dbPath)).size; } catch { /* ignore */ }
        try { size += (await fs.promises.stat(filesPath)).size; } catch { /* ignore */ }
        result.push({
          id: day,
          date: createdAt,
          dayDir: dayPath,
          size,
          createdAt,
          hasDb: fs.existsSync(dbPath),
          hasFiles: fs.existsSync(filesPath)
        });
      }
    }
  } catch { /* ignore */ }
  result.sort((a, b) => b.id.localeCompare(a.id));
  return result;
}

async function listBackupJobs(limit = 50) {
  const pool = getPool();
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const [rows] = await pool.query(
    `SELECT id, job_type AS jobType, trigger_type AS triggerType, backup_id AS backupId, target_backup_id AS targetBackupId,
            status, started_at AS startedAt, finished_at AS finishedAt, duration_ms AS durationMs, size_bytes AS sizeBytes,
            actor_user_id AS actorUserId, error_message AS errorMessage
     FROM backup_jobs
     ORDER BY id DESC
     LIMIT ?`,
    [safeLimit]
  );
  return rows || [];
}

async function cleanupExpiredBackups() {
  const days = getBackupRetentionDays();
  if (days <= 0) return { deleted: 0, retentionDays: 0 };
  const entries = await listBackups();
  const nowMs = Date.now();
  let deleted = 0;
  for (const item of entries) {
    const createdMs = new Date(item.createdAt || item.date || item.id).getTime();
    if (!Number.isFinite(createdMs)) continue;
    const ageDays = (nowMs - createdMs) / (24 * 60 * 60 * 1000);
    if (ageDays > days) {
      try {
        await deleteBackup(item.id);
        deleted += 1;
      } catch {
        // keep best effort cleanup
      }
    }
  }
  return { deleted, retentionDays: days };
}

async function downloadBackup(backupId) {
  if (!BACKUP_DIR_ID_RE.test(String(backupId || ''))) {
    throw new Error('Invalid backup id');
  }
  const dayPath = path.join(BACKUP_ROOT, backupId);
  if (!fs.existsSync(dayPath)) throw new Error('Backup not found');
  const tarPath = path.join(dayPath, 'backup_package.tar.gz');
  const encPath = `${tarPath}.enc`;
  const metaPath = path.join(dayPath, BACKUP_PACKAGE_META);
  const keyCandidates = getEncryptionKeyCandidates();
  const currentKey = keyCandidates[0] || null;
  if (!fs.existsSync(tarPath)) {
    const entries = [];
    if (fs.existsSync(path.join(dayPath, 'db.sql'))) entries.push('db.sql');
    if (fs.existsSync(path.join(dayPath, 'files.tar.gz'))) entries.push('files.tar.gz');
    if (entries.length === 0) throw new Error('No backup files found');
    await tar.c({ gzip: true, file: tarPath, cwd: dayPath }, entries);
  }
  const plainSha256 = await sha256OfFile(tarPath);
  if (!currentKey) {
    const plainMeta = {
      algorithm: 'none',
      packageFile: path.basename(tarPath),
      plainSha256,
      createdAt: new Date().toISOString()
    };
    await fs.promises.writeFile(metaPath, JSON.stringify(plainMeta, null, 2), 'utf8');
    const stat = await fs.promises.stat(tarPath);
    return { path: tarPath, size: stat.size, filename: `backup_${backupId}.tar.gz`, encrypted: false };
  }
  const currentMeta = parseMetaFile(metaPath);
  const encryptedLooksValid =
    currentMeta &&
    currentMeta.algorithm === 'aes-256-gcm' &&
    currentMeta.plainSha256 === plainSha256 &&
    currentMeta.packageFile === path.basename(encPath) &&
    fs.existsSync(encPath);
  if (!encryptedLooksValid) {
    await createEncryptedPackage({ tarPath, encPath, metaPath, keyInfo: currentKey, plainSha256 });
  }
  const meta = parseMetaFile(metaPath);
  if (!meta) throw new Error('Backup package metadata not found');
  const verifyEncSha256 = await sha256OfFile(encPath);
  if (meta.encryptedSha256 && meta.encryptedSha256 !== verifyEncSha256) {
    throw new Error('Encrypted backup package checksum mismatch');
  }
  const stat = await fs.promises.stat(encPath);
  return { path: encPath, size: stat.size, filename: `backup_${backupId}.tar.gz.enc`, encrypted: true };
}

async function deleteBackup(backupId) {
  if (!BACKUP_DIR_ID_RE.test(String(backupId || ''))) {
    throw new Error('Invalid backup id');
  }
  const dayPath = path.join(BACKUP_ROOT, backupId);
  if (!fs.existsSync(dayPath)) throw new Error('Backup not found');
  await fs.promises.rm(dayPath, { recursive: true, force: true });
  return true;
}

async function restoreBackup(backupId) {
  if (!BACKUP_DIR_ID_RE.test(String(backupId || ''))) {
    throw new Error('Invalid backup id');
  }
  const pre = await createBackupPackage();
  const dayPath = path.join(BACKUP_ROOT, backupId);
  const dbPath = path.join(dayPath, 'db.sql');
  const tarPath = path.join(dayPath, 'files.tar.gz');
  const encPath = path.join(dayPath, 'backup_package.tar.gz.enc');
  const metaPath = path.join(dayPath, BACKUP_PACKAGE_META);
  if (!fs.existsSync(dbPath)) {
    if (!fs.existsSync(encPath) || !fs.existsSync(metaPath)) throw new Error('Backup SQL file not found');
    const meta = parseMetaFile(metaPath);
    const keyInfo = await resolveDecryptionKey(meta);
    if (!meta || !keyInfo) throw new Error('Encrypted backup cannot be restored (missing metadata/key)');
    const tempTar = path.join(dayPath, '__restore_tmp_backup_package.tar.gz');
    await decryptFileAesGcm({
      inputPath: encPath,
      outputPath: tempTar,
      keyBytes: keyInfo.bytes,
      ivBase64: meta.iv,
      tagBase64: meta.tag
    });
    await tar.x({ file: tempTar, cwd: dayPath, gzip: true });
    await fs.promises.rm(tempTar, { force: true });
  }
  if (!fs.existsSync(dbPath)) throw new Error('Backup SQL file not found');
  const host = process.env.MYSQL_HOST || 'localhost';
  const port = process.env.MYSQL_PORT || '3306';
  const user = process.env.MYSQL_USER || 'root';
  const pass = process.env.MYSQL_PASSWORD || '';
  const db = process.env.MYSQL_DATABASE;
  if (!db) throw new Error('MYSQL_DATABASE is required for restore');
  const args = ['-h', String(host), '-P', String(port), '-u', String(user)];
  if (pass) args.push(`-p${pass}`);
  args.push(String(db));
  await new Promise((resolve, reject) => {
    const proc = spawn('mysql', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    fs.createReadStream(dbPath)
      .on('error', reject)
      .pipe(proc.stdin)
      .on('error', reject);
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `mysql exited with code ${code}`));
        return;
      }
      resolve(true);
    });
  });
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  if (fs.existsSync(tarPath)) {
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    await tar.x({ file: tarPath, cwd: uploadsDir, gzip: true });
  }
  return { preBackupPath: pre?.dayDir, restored: true };
}

async function rotateBackupEncryption({ actorUserId = null } = {}) {
  const currentKey = getEncryptionKeyCandidates()[0] || null;
  if (!currentKey) throw new Error('BACKUP_ENCRYPTION_KEY is required for rotation');
  const jobId = await createBackupJob({
    jobType: 'backup',
    triggerType: 'system',
    actorUserId,
    targetBackupId: null
  });
  try {
    const backups = await listBackups();
    let rotated = 0;
    let skipped = 0;
    for (const item of backups) {
      const dayPath = path.join(BACKUP_ROOT, item.id);
      const tarPath = path.join(dayPath, 'backup_package.tar.gz');
      const encPath = `${tarPath}.enc`;
      const metaPath = path.join(dayPath, BACKUP_PACKAGE_META);
      if (!fs.existsSync(tarPath)) {
        skipped += 1;
        continue;
      }
      const plainSha256 = await sha256OfFile(tarPath);
      const meta = parseMetaFile(metaPath);
      if (
        meta &&
        meta.algorithm === 'aes-256-gcm' &&
        meta.plainSha256 === plainSha256 &&
        meta.keyFingerprint === currentKey.fingerprint &&
        fs.existsSync(encPath)
      ) {
        skipped += 1;
        continue;
      }
      await createEncryptedPackage({ tarPath, encPath, metaPath, keyInfo: currentKey, plainSha256 });
      rotated += 1;
    }
    await finishBackupJob(jobId, {
      status: 'success',
      meta: { rotated, skipped, total: rotated + skipped }
    });
    return { rotated, skipped, total: rotated + skipped };
  } catch (e) {
    await finishBackupJob(jobId, {
      status: 'failed',
      errorMessage: String(e?.message || e || 'rotation failed')
    });
    throw e;
  }
}

async function resolveLatestBackupId() {
  const backups = await listBackups();
  if (!backups.length) throw new Error('No backups found');
  return backups[0].id;
}

async function materializePackageTar({ dayPath, backupId }) {
  const tarPath = path.join(dayPath, 'backup_package.tar.gz');
  const encPath = `${tarPath}.enc`;
  const metaPath = path.join(dayPath, BACKUP_PACKAGE_META);
  let tempTarPath = '';
  if (fs.existsSync(tarPath)) {
    return { tarPath, tempTarPath };
  }
  if (!fs.existsSync(encPath) || !fs.existsSync(metaPath)) {
    const entries = [];
    if (fs.existsSync(path.join(dayPath, 'db.sql'))) entries.push('db.sql');
    if (fs.existsSync(path.join(dayPath, 'files.tar.gz'))) entries.push('files.tar.gz');
    if (!entries.length) {
      throw new Error(`Backup package not found: ${backupId}`);
    }
    await tar.c({ gzip: true, file: tarPath, cwd: dayPath }, entries);
    return { tarPath, tempTarPath };
  }
  const meta = parseMetaFile(metaPath);
  const keyInfo = await resolveDecryptionKey(meta);
  if (!meta || !keyInfo) throw new Error('Encrypted backup cannot be verified (missing metadata/key)');
  tempTarPath = path.join(dayPath, `__verify_tmp_${Date.now()}.tar.gz`);
  await decryptFileAesGcm({
    inputPath: encPath,
    outputPath: tempTarPath,
    keyBytes: keyInfo.bytes,
    ivBase64: meta.iv,
    tagBase64: meta.tag
  });
  return { tarPath: tempTarPath, tempTarPath };
}

async function verifyBackupRecoverability({ backupId = '', actorUserId = null } = {}) {
  const targetBackupId = String(backupId || '').trim() || (await resolveLatestBackupId());
  if (!BACKUP_DIR_ID_RE.test(targetBackupId)) throw new Error('Invalid backup id');
  const jobId = await createBackupJob({
    jobType: 'backup',
    triggerType: 'system',
    actorUserId,
    targetBackupId
  });
  const dayPath = path.join(BACKUP_ROOT, targetBackupId);
  let tempTarPath = '';
  try {
    if (!fs.existsSync(dayPath)) throw new Error('Backup not found');
    const { tarPath, tempTarPath: tmp } = await materializePackageTar({ dayPath, backupId: targetBackupId });
    tempTarPath = tmp;
    const pkgSha256 = await sha256OfFile(tarPath);
    const tempExtractDir = path.join(dayPath, `__verify_extract_${Date.now()}`);
    await fs.promises.mkdir(tempExtractDir, { recursive: true });
    await tar.x({ file: tarPath, cwd: tempExtractDir, gzip: true });
    const dbPath = path.join(tempExtractDir, 'db.sql');
    const filesTarPath = path.join(tempExtractDir, 'files.tar.gz');
    if (!fs.existsSync(dbPath)) throw new Error('Verify failed: db.sql missing in package');
    const dbStat = await fs.promises.stat(dbPath);
    if (!dbStat.size) throw new Error('Verify failed: db.sql is empty');
    const dbPreview = await new Promise((resolve, reject) => {
      const input = fs.createReadStream(dbPath, { encoding: 'utf8', start: 0, end: 8191 });
      let buf = '';
      input.on('data', (chunk) => {
        buf += chunk;
      });
      input.on('error', reject);
      input.on('end', () => resolve(buf));
    });
    if (!/CREATE TABLE|INSERT INTO|DROP TABLE/i.test(dbPreview.slice(0, 8000))) {
      throw new Error('Verify failed: db.sql content does not look valid');
    }
    let filesArchiveValid = false;
    if (fs.existsSync(filesTarPath)) {
      const list = [];
      await tar.t({
        file: filesTarPath,
        gzip: true,
        onentry: (entry) => {
          if (list.length < 3) list.push(entry.path);
        }
      });
      filesArchiveValid = true;
    }
    await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
    await finishBackupJob(jobId, {
      status: 'success',
      backupId: targetBackupId,
      meta: {
        action: 'verify',
        packageSha256: pkgSha256,
        dbSqlBytes: dbStat.size,
        filesArchiveValid
      }
    });
    return {
      backupId: targetBackupId,
      packageSha256: pkgSha256,
      dbSqlBytes: dbStat.size,
      filesArchiveValid
    };
  } catch (e) {
    await finishBackupJob(jobId, {
      status: 'failed',
      backupId: targetBackupId,
      errorMessage: String(e?.message || e || 'verify failed'),
      meta: { action: 'verify' }
    });
    throw e;
  } finally {
    if (tempTarPath) {
      await fs.promises.rm(tempTarPath, { force: true }).catch(() => {});
    }
  }
}

async function runBackup(options = {}) {
  const triggerType = String(options.triggerType || 'manual');
  const actorUserId = Number(options.actorUserId || 0) || null;
  if (isBackingUp) throw new Error('Backup already in progress');
  const jobId = await createBackupJob({ jobType: 'backup', triggerType, actorUserId, targetBackupId: null });
  isBackingUp = true;
  try {
    const backup = await createBackupPackage();
    const cleanup = await cleanupExpiredBackups();
    await finishBackupJob(jobId, {
      status: 'success',
      backupId: backup.id,
      sizeBytes: backup.size || 0,
      meta: { cleanup }
    });
    return backup;
  } catch (e) {
    await finishBackupJob(jobId, {
      status: 'failed',
      errorMessage: String(e?.message || e || 'backup failed')
    });
    await sendBackupFailureAlert({
      source: triggerType,
      message: String(e?.message || e || 'backup failed'),
      level: 'error'
    });
    throw e;
  } finally {
    isBackingUp = false;
  }
}

export {
  ensureBackupRoot,
  createBackupPackage,
  listBackups,
  downloadBackup,
  deleteBackup,
  restoreBackup,
  rotateBackupEncryption,
  verifyBackupRecoverability,
  listBackupJobs,
  cleanupExpiredBackups,
  ensureDir,
  BACKUP_ROOT,
  runBackup
};