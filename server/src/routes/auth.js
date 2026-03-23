import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { hashPassword, verifyPassword } from '../services/password.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { effectiveEmployeePermissions } from '../lib/permissions.js';
import { clientIp, logLogin, logOperation } from '../lib/audit.js';
import { getSecuritySettings, summarizeUserAgent, validatePasswordPlain } from '../lib/securityPolicy.js';

export const router = Router();

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128)
});

function buildTokenPayload(user) {
  if (user.account_type === 'super_admin') {
    return {
      sub: String(user.id),
      userId: user.id,
      username: user.username,
      accountType: 'super_admin',
      employeeCategoryId: null,
      permissions: null
    };
  }
  const eff = effectiveEmployeePermissions(user.category_default_json, user.permissions_json);
  return {
    sub: String(user.id),
    userId: user.id,
    username: user.username,
    accountType: 'employee',
    employeeCategoryId: user.employee_category_id,
    permissions: eff
  };
}

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { username, password } = parsed.data;
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const ip = clientIp(req);
  const ua = req.headers['user-agent'] || '';
  const device = summarizeUserAgent(ua);

  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.password_hash, u.is_active, u.account_type, u.employee_category_id,
            u.permissions_json, u.failed_login_count, u.locked_until,
            c.default_permissions_json AS category_default_json
     FROM users u
     LEFT JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.username = ? LIMIT 1`,
    [username]
  );
  const user = rows?.[0];

  const fail = async (reason) => {
    await logLogin(pool, {
      userId: user?.id ?? null,
      username,
      ip,
      userAgent: ua,
      deviceSummary: device,
      success: false,
      failReason: reason
    });
  };

  if (!user) {
    await fail('用户不存在');
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  if (!user.is_active) {
    await fail('账号已禁用');
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  let lockedUntil = user.locked_until ? new Date(user.locked_until) : null;
  if (lockedUntil && lockedUntil <= new Date()) {
    await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?', [user.id]);
    lockedUntil = null;
  }
  if (lockedUntil && lockedUntil > new Date()) {
    await fail('账号已锁定');
    return res.status(403).json({ error: 'ACCOUNT_LOCKED', lockedUntil: user.locked_until });
  }

  if (!verifyPassword(password, user.password_hash)) {
    const fails = Number(user.failed_login_count || 0) + 1;
    const max = settings.loginFailMaxAttempts;
    let lockedUntilSql = null;
    if (fails >= max) {
      lockedUntilSql = new Date(Date.now() + settings.loginLockMinutes * 60 * 1000);
      await pool.query(
        'UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?',
        [0, lockedUntilSql, user.id]
      );
      await fail(`密码错误，已连续失败${max}次，账号锁定`);
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', locked: true });
    }
    await pool.query('UPDATE users SET failed_login_count = ? WHERE id = ?', [fails, user.id]);
    await fail('密码错误');
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  await pool.query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?', [user.id]);

  await logLogin(pool, {
    userId: user.id,
    username: user.username,
    ip,
    userAgent: ua,
    deviceSummary: device,
    success: true,
    failReason: null
  });

  const payload = buildTokenPayload(user);
  const expMin = Math.min(settings.idleTimeoutMinutes, 12 * 60);
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: `${expMin}m` });
  res.json({
    token,
    idleTimeoutMinutes: settings.idleTimeoutMinutes,
    user: {
      id: user.id,
      username: user.username,
      accountType: user.account_type,
      employeeCategoryId: user.employee_category_id,
      permissions: payload.permissions
    }
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  res.json({
    user: req.user,
    idleTimeoutMinutes: settings.idleTimeoutMinutes,
    confirmSensitiveOperations: settings.confirmSensitiveOperations
  });
});

const changePwSchema = z.object({
  oldPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128)
});

router.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePwSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { oldPassword, newPassword } = parsed.data;
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const v = validatePasswordPlain(newPassword, settings);
  if (!v.ok) return res.status(400).json({ error: v.code, message: v.message });

  const [rows] = await pool.query(
    'SELECT id, username, password_hash FROM users WHERE id = ? LIMIT 1',
    [req.user.userId]
  );
  const u = rows?.[0];
  if (!u) return res.status(404).json({ error: 'NOT_FOUND' });
  if (!verifyPassword(oldPassword, u.password_hash)) {
    await logOperation(pool, {
      userId: u.id,
      username: u.username,
      module: '账号',
      action: '修改密码失败',
      detail: { reason: '原密码错误' },
      success: false,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || ''
    });
    return res.status(400).json({ error: 'OLD_PASSWORD_WRONG' });
  }
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), u.id]);
  await logOperation(pool, {
    userId: u.id,
    username: u.username,
    module: '账号',
    action: '修改个人密码',
    detail: null,
    success: true,
    ip: clientIp(req),
    userAgent: req.headers['user-agent'] || ''
  });
  res.json({ ok: true });
});

const bootstrapSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128)
});

router.post('/bootstrap-admin', async (req, res, next) => {
  const pool = getPool();
  const [countRows] = await pool.query('SELECT COUNT(*) AS c FROM users');
  const count = Number(countRows?.[0]?.c || 0);
  if (count === 0) return next();
  return requireAuth(req, res, () => requireSuperAdmin(req, res, next));
}, async (req, res) => {
  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { username, password } = parsed.data;
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const v = validatePasswordPlain(password, settings);
  if (!v.ok) return res.status(400).json({ error: v.code, message: v.message });

  try {
    const passwordHash = hashPassword(password);
    const [result] = await pool.query(
      'INSERT INTO users (username, password_hash, account_type, is_active) VALUES (?, ?, \'super_admin\', 1)',
      [username, passwordHash]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'USERNAME_EXISTS' });
    throw e;
  }
});
