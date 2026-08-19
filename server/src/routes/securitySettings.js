import { Router } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getPool } from '../db/pool.js';
import { mergeSettings } from '../lib/securityPolicy.js';
import { logOperationFromReq } from '../lib/audit.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

export const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_FILE_PATH = path.resolve(__dirname, '../../.env');
const BACKUP_ENV_KEYS = [
  'BACKUP_ENABLED',
  'BACKUP_CRON',
  'BACKUP_RETENTION_DAYS',
  'BACKUP_ALERT_WEBHOOK_URL',
  'BACKUP_ALERT_LEVEL',
  'BACKUP_ALERT_DEDUP_MINUTES',
  'BACKUP_ENCRYPTION_KEY',
  'BACKUP_ENCRYPTION_KEY_OLD'
];

function parseEnvValue(raw) {
  const line = String(raw || '').trim();
  if (!line) return '';
  if ((line.startsWith('"') && line.endsWith('"')) || (line.startsWith("'") && line.endsWith("'"))) {
    return line.slice(1, -1);
  }
  return line;
}

function parseEnvText(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx <= 0) continue;
    const key = t.slice(0, idx).trim();
    const val = parseEnvValue(t.slice(idx + 1));
    out[key] = val;
  }
  return out;
}

async function readBackupEnvConfig() {
  let content = '';
  try {
    content = await fs.promises.readFile(ENV_FILE_PATH, 'utf8');
  } catch {
    content = '';
  }
  const parsed = parseEnvText(content);
  const levelRaw = String(parsed.BACKUP_ALERT_LEVEL || 'error').trim().toLowerCase();
  const dedupRaw = Number(parsed.BACKUP_ALERT_DEDUP_MINUTES);
  return {
    backupEnabled: String(parsed.BACKUP_ENABLED || '').toLowerCase() === 'true',
    backupCron: String(parsed.BACKUP_CRON || '0 2 * * *').trim() || '0 2 * * *',
    backupRetentionDays: Number(parsed.BACKUP_RETENTION_DAYS || 30) || 30,
    backupAlertWebhookUrl: String(parsed.BACKUP_ALERT_WEBHOOK_URL || ''),
    backupAlertLevel: ['off', 'error', 'critical'].includes(levelRaw) ? levelRaw : 'error',
    backupAlertDedupMinutes: Number.isFinite(dedupRaw) && dedupRaw >= 0 ? Math.floor(dedupRaw) : 10,
    backupEncryptionKey: String(parsed.BACKUP_ENCRYPTION_KEY || ''),
    backupEncryptionKeyOld: String(parsed.BACKUP_ENCRYPTION_KEY_OLD || '')
  };
}

async function writeEnvKeys(values) {
  let content = '';
  try {
    content = await fs.promises.readFile(ENV_FILE_PATH, 'utf8');
  } catch {
    content = '';
  }
  const lines = content ? content.split(/\r?\n/) : [];
  const keySet = new Set(BACKUP_ENV_KEYS);
  const touched = new Set();
  const outLines = lines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    const key = m?.[1];
    if (!key || !keySet.has(key)) return line;
    touched.add(key);
    return `${key}=${values[key] ?? ''}`;
  });
  for (const key of BACKUP_ENV_KEYS) {
    if (!touched.has(key)) outLines.push(`${key}=${values[key] ?? ''}`);
  }
  await fs.promises.writeFile(ENV_FILE_PATH, `${outLines.join('\n').replace(/\n+$/g, '')}\n`, 'utf8');
}

router.use(requireAuth);
router.use(requireSuperAdmin);

const updateSchema = z.object({
  minPasswordLength: z.number().int().min(4).max(128).optional(),
  bannedPasswords: z.array(z.string().max(64)).max(500).optional(),
  idleTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  loginFailMaxAttempts: z.number().int().min(3).max(20).optional(),
  loginLockMinutes: z.number().int().min(5).max(1440).optional(),
  confirmSensitiveOperations: z.boolean().optional(),
  errorLogRetentionDays: z.number().int().min(30).max(3650).optional(),
  loginLogRetentionDays: z.number().int().min(30).max(3650).optional(),
  operationLogRetentionDays: z.number().int().min(30).max(3650).optional(),
  backupConfig: z.object({
    backupEnabled: z.boolean().optional(),
    backupCron: z.string().min(1).max(64).optional(),
    backupRetentionDays: z.number().int().min(1).max(3650).optional(),
    backupAlertWebhookUrl: z.string().max(1024).optional(),
    backupAlertLevel: z.enum(['off', 'error', 'critical']).optional(),
    backupAlertDedupMinutes: z.number().int().min(0).max(1440).optional(),
    backupEncryptionKey: z.string().max(512).optional(),
    backupEncryptionKeyOld: z.string().max(2048).optional()
  }).optional()
});

router.get('/', async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.query('SELECT settings_json AS j FROM system_security_settings WHERE id=1 LIMIT 1');
  let raw = rows?.[0]?.j;
  if (raw && typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  const merged = mergeSettings(raw);
  const backupConfig = await readBackupEnvConfig();
  res.json({ settings: merged, backupConfig });
});

router.put('/', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  const [rows] = await pool.query('SELECT settings_json AS j FROM system_security_settings WHERE id=1 LIMIT 1');
  let raw = rows?.[0]?.j;
  if (raw && typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  const base = mergeSettings(raw && typeof raw === 'object' ? raw : {});
  const nextSettingsPayload = { ...parsed.data };
  delete nextSettingsPayload.backupConfig;
  const merged = mergeSettings({ ...base, ...nextSettingsPayload });
  await pool.query(
    'INSERT INTO system_security_settings (id, settings_json, updated_by) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json), updated_by=VALUES(updated_by)',
    [JSON.stringify(merged), req.user.userId]
  );
  await logOperationFromReq(req, {
    module: '系统安全',
    action: '修改安全策略',
    detail: { keys: Object.keys(parsed.data) },
    success: true
  });
  if (parsed.data.backupConfig) {
    const backupConfig = {
      backupEnabled: parsed.data.backupConfig.backupEnabled === true,
      backupCron: String(parsed.data.backupConfig.backupCron || '0 2 * * *').trim() || '0 2 * * *',
      backupRetentionDays: Number(parsed.data.backupConfig.backupRetentionDays || 30) || 30,
      backupAlertWebhookUrl: String(parsed.data.backupConfig.backupAlertWebhookUrl || ''),
      backupAlertLevel: String(parsed.data.backupConfig.backupAlertLevel || 'error')
        .trim()
        .toLowerCase(),
      backupAlertDedupMinutes: Math.max(0, Number(parsed.data.backupConfig.backupAlertDedupMinutes ?? 10) || 0),
      backupEncryptionKey: String(parsed.data.backupConfig.backupEncryptionKey || ''),
      backupEncryptionKeyOld: String(parsed.data.backupConfig.backupEncryptionKeyOld || '')
    };
    await writeEnvKeys({
      BACKUP_ENABLED: backupConfig.backupEnabled ? 'true' : 'false',
      BACKUP_CRON: backupConfig.backupCron,
      BACKUP_RETENTION_DAYS: String(backupConfig.backupRetentionDays),
      BACKUP_ALERT_WEBHOOK_URL: backupConfig.backupAlertWebhookUrl,
      BACKUP_ALERT_LEVEL: backupConfig.backupAlertLevel,
      BACKUP_ALERT_DEDUP_MINUTES: String(backupConfig.backupAlertDedupMinutes),
      BACKUP_ENCRYPTION_KEY: backupConfig.backupEncryptionKey,
      BACKUP_ENCRYPTION_KEY_OLD: backupConfig.backupEncryptionKeyOld
    });
    return res.json({ settings: merged, backupConfig });
  }
  const backupConfig = await readBackupEnvConfig();
  res.json({ settings: merged, backupConfig });
});
