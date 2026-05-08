/**
 * 恢复干跑：把备份导入临时库做验证，不覆盖当前业务库。
 * 用法：
 *   npm run restore-dry-run
 *   npm run restore-dry-run -- 2026-04-27
 *   npm run restore-dry-run -- 2026-04-27 --keep
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import tar from 'tar';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { BACKUP_ROOT, listBackups, verifyBackupRecoverability } from '../src/backup/index.js';
import mysql from 'mysql2/promise';

function parseArgs() {
  const args = process.argv.slice(2);
  let backupId = '';
  let keep = false;
  for (const a of args) {
    if (a === '--keep') keep = true;
    else if (!backupId) backupId = a;
  }
  return { backupId: String(backupId || '').trim(), keep };
}

async function resolveBackupId(raw) {
  if (raw) return raw;
  const list = await listBackups();
  if (!list.length) throw new Error('未找到任何备份');
  return list[0].id;
}

function mysqlArgsForDb(dbName) {
  const host = process.env.MYSQL_HOST || 'localhost';
  const port = process.env.MYSQL_PORT || '3306';
  const user = process.env.MYSQL_USER || 'root';
  const pass = process.env.MYSQL_PASSWORD || '';
  const args = ['-h', String(host), '-P', String(port), '-u', String(user)];
  if (pass) args.push(`-p${pass}`);
  args.push(String(dbName));
  return args;
}

async function importSqlToDb({ dbName, sqlPath }) {
  const args = mysqlArgsForDb(dbName);
  await new Promise((resolve, reject) => {
    const proc = spawn('mysql', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    fs.createReadStream(sqlPath)
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
}

async function resolveSqlPath(backupDir) {
  const plain = path.join(backupDir, 'db.sql');
  if (fs.existsSync(plain)) return { sqlPath: plain, tempDir: '' };
  const pkg = path.join(backupDir, 'backup_package.tar.gz');
  if (!fs.existsSync(pkg)) {
    throw new Error('备份中缺少 db.sql 和 backup_package.tar.gz，无法执行 dry-run');
  }
  const tempDir = path.join(backupDir, `__dryrun_extract_${Date.now()}`);
  await fs.promises.mkdir(tempDir, { recursive: true });
  await tar.x({ file: pkg, cwd: tempDir, gzip: true });
  const sqlPath = path.join(tempDir, 'db.sql');
  if (!fs.existsSync(sqlPath)) throw new Error('backup_package.tar.gz 中缺少 db.sql');
  return { sqlPath, tempDir };
}

async function inspectRestoredDb(conn, dbName) {
  const [tablesRows] = await conn.query(
    `SELECT COUNT(*) AS c
     FROM information_schema.tables
     WHERE table_schema = ?`,
    [dbName]
  );
  const tableCount = Number(tablesRows?.[0]?.c || 0);

  const [usersExists] = await conn.query(
    `SELECT COUNT(*) AS c
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = 'users'`,
    [dbName]
  );
  let users = [];
  if (Number(usersExists?.[0]?.c || 0) > 0) {
    const [rows] = await conn.query(
      `SELECT id, username, account_type, is_active
       FROM ${dbName}.users
       ORDER BY id
       LIMIT 20`
    );
    users = rows || [];
  }
  return { tableCount, users };
}

async function main() {
  const { backupId: rawBackupId, keep } = parseArgs();
  const backupId = await resolveBackupId(rawBackupId);
  const backupDir = path.join(BACKUP_ROOT, backupId);
  if (!fs.existsSync(backupDir)) throw new Error(`备份不存在: ${backupId}`);

  const verify = await verifyBackupRecoverability({ backupId });
  const { sqlPath, tempDir } = await resolveSqlPath(backupDir);
  const restoreDbName = `qc_report_restore_dryrun_${Date.now()}`;
  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD
    });

    await conn.query(`CREATE DATABASE \`${restoreDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await importSqlToDb({ dbName: restoreDbName, sqlPath });
    const inspected = await inspectRestoredDb(conn, restoreDbName);

    console.log(JSON.stringify({
      ok: true,
      backupId,
      restoreDbName,
      keep,
      verify,
      inspected
    }, null, 2));
  } finally {
    if (conn) {
      if (!keep) {
        await conn.query(`DROP DATABASE IF EXISTS \`${restoreDbName}\``);
      }
      await conn.end();
    }
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

main().catch((e) => {
  console.error('restore dry-run 失败:', e?.message || e);
  process.exit(1);
});
