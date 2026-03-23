import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { mergeSettings } from '../lib/securityPolicy.js';
import { logOperationFromReq } from '../lib/audit.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

export const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

const updateSchema = z.object({
  minPasswordLength: z.number().int().min(4).max(128).optional(),
  bannedPasswords: z.array(z.string().max(64)).max(500).optional(),
  idleTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  loginFailMaxAttempts: z.number().int().min(3).max(20).optional(),
  loginLockMinutes: z.number().int().min(5).max(1440).optional(),
  confirmSensitiveOperations: z.boolean().optional(),
  errorLogRetentionDays: z.number().int().min(30).max(3650).optional()
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
  res.json({ settings: merged });
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
  const merged = mergeSettings({ ...base, ...parsed.data });
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
  res.json({ settings: merged });
});
