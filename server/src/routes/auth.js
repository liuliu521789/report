import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import QRCode from 'qrcode';

import { getPool } from '../db/pool.js';
import { hashPassword, passwordNeedsRehash, verifyPassword } from '../services/password.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { effectiveEmployeePermissions } from '../lib/permissions.js';
import { clientIp, logLogin, logOperation, logOperationFromReq } from '../lib/audit.js';
import { getSecuritySettings, summarizeUserAgent, validatePasswordPlain } from '../lib/securityPolicy.js';
import { generateTotpSecret, totpKeyUri, verifyTotpToken } from '../lib/totp.js';
import { isPermissionedStaffType } from '../lib/accountTypes.js';
import { bumpTokenVersion, invalidateUserGuard } from '../lib/sessionGuard.js';
import { loginIpLimiter, loginUsernameLimiter } from '../middleware/rateLimit.js';

export const router = Router();

const TOTP_ISSUER = 'QC-Report';

function signPendingTotp({ userId, purpose }) {
  return jwt.sign(
    { typ: 'totp_pending', purpose, userId, sub: String(userId) },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );
}

function parsePendingTotp(token, expectedPurpose) {
  const p = jwt.verify(String(token || ''), process.env.JWT_SECRET);
  if (p.typ !== 'totp_pending' || p.purpose !== expectedPurpose) {
    const e = new Error('INVALID_PENDING_TOKEN');
    e.code = 'INVALID_PENDING_TOKEN';
    throw e;
  }
  const uid = Number(p.userId);
  if (!Number.isFinite(uid)) {
    const e = new Error('INVALID_PENDING_TOKEN');
    e.code = 'INVALID_PENDING_TOKEN';
    throw e;
  }
  return { userId: uid };
}

async function loadUserForToken(pool, userId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.real_name, u.account_type, u.employee_category_id, u.permissions_json,
            IFNULL(u.token_version, 0) AS token_version,
            IFNULL(u.force_change_password, 0) AS force_change_password,
            c.code AS employee_category_code,
            c.default_permissions_json AS category_default_json
     FROM users u
     LEFT JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  return rows?.[0] || null;
}

function buildTokenPayload(user) {
  if (user.account_type === 'super_admin') {
    return {
      sub: String(user.id),
      userId: user.id,
      username: user.username,
      realName: user.real_name || user.username,
      accountType: 'super_admin',
      employeeCategoryId: null,
      employeeCategoryCode: null,
      permissions: null,
      tv: Number(user.token_version || 0)
    };
  }
  const eff = effectiveEmployeePermissions(
    user.category_default_json,
    user.permissions_json,
    user.employee_category_code
  );
  return {
    sub: String(user.id),
    userId: user.id,
    username: user.username,
    realName: user.real_name || user.username,
    accountType: user.account_type,
    employeeCategoryId: user.employee_category_id,
    employeeCategoryCode: user.employee_category_code || null,
    permissions: eff,
    tv: Number(user.token_version || 0)
  };
}

function debugPermissionSnapshot(tag, user, payload) {
  const targetUser = String(process.env.DEBUG_AUTH_USERNAME || 'SALES-2604-001').trim();
  const uname = String(user?.username || '');
  if (!uname || uname !== targetUser) return;
  // eslint-disable-next-line no-console
  console.log(
    '[auth-debug]',
    JSON.stringify({
      tag,
      username: uname,
      accountType: payload?.accountType || user?.account_type || null,
      employeeCategoryCode: user?.employee_category_code || null,
      order_query: payload?.permissions?.order_management?.order_query ?? null,
      order_input: payload?.permissions?.order_management?.order_input ?? null,
      order_query_all: payload?.permissions?.order_management?.order_query_all ?? null,
      force_change_password: Number(user?.force_change_password || 0),
      token_version: Number(user?.token_version || 0)
    })
  );
}

function sessionJson(user, settings, token) {
  const payload = buildTokenPayload(user);
  debugPermissionSnapshot('sessionJson', user, payload);
  return {
    token,
    idleTimeoutMinutes: settings.idleTimeoutMinutes,
    user: {
      id: user.id,
      username: user.username,
      realName: user.real_name || user.username,
      accountType: user.account_type,
      employeeCategoryId: user.employee_category_id,
      employeeCategoryCode: user.employee_category_code || null,
      permissions: payload.permissions,
      forceChangePassword: !!user.force_change_password
    }
  };
}

/** JWT  wall-clock 上限，与「无操作自动退出」idleTimeoutMinutes 解耦；后者仅由前端计时，避免持续操作时仍被 token 固定时长踢下线 */
function sessionTokenMaxMinutes() {
  const raw = Number(process.env.JWT_SESSION_MAX_MINUTES);
  if (Number.isFinite(raw) && raw >= 15 && raw <= 24 * 60) return raw;
  return 12 * 60;
}

async function issueSessionToken(req, pool, user, settings) {
  const payload = buildTokenPayload(user);
  const expMin = sessionTokenMaxMinutes();
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: `${expMin}m` });
  const ip = clientIp(req);
  const ua = req.headers['user-agent'] || '';
  const device = summarizeUserAgent(ua);
  await logLogin(pool, {
    userId: user.id,
    username: user.username,
    ip,
    userAgent: ua,
    deviceSummary: device,
    success: true,
    failReason: null
  });
  return sessionJson(user, settings, token);
}

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128)
});

router.post('/login', loginIpLimiter(), loginUsernameLimiter(), async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { username, password } = parsed.data;
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const ip = clientIp(req);
  const ua = req.headers['user-agent'] || '';
  const device = summarizeUserAgent(ua);

  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.real_name, u.password_hash, u.is_active, u.account_type, u.employee_category_id,
            u.permissions_json, u.failed_login_count, u.locked_until,
            u.totp_secret, u.totp_enabled_at,
            IFNULL(u.token_version, 0) AS token_version,
            IFNULL(u.force_change_password, 0) AS force_change_password,
            IFNULL(u.require_two_factor, 0) AS user_require_two_factor,
            c.code AS employee_category_code,
            c.default_permissions_json AS category_default_json,
            IFNULL(c.require_two_factor, 0) AS category_require_two_factor
     FROM users u
     LEFT JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE (u.username = ? OR u.phone = ?) AND u.deleted_at IS NULL
     ORDER BY (u.username = ?) DESC
     LIMIT 1`,
    [username, username, username]
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
    /** 不向客户端泄露具体解锁时间，避免攻击者掌握节奏 */
    return res.status(403).json({ error: 'ACCOUNT_LOCKED' });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    const fails = Number(user.failed_login_count || 0) + 1;
    const max = settings.loginFailMaxAttempts;
    if (fails >= max) {
      const lockedUntilSql = new Date(Date.now() + settings.loginLockMinutes * 60 * 1000);
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

  /** 透明升级历史 PBKDF2 → argon2id */
  if (passwordNeedsRehash(user.password_hash)) {
    try {
      const fresh = await hashPassword(password);
      await pool.query(
        'UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
        [fresh, user.id]
      );
      user.password_hash = fresh;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[auth] password rehash failed:', e?.message || e);
    }
  }

  /** 2FA 触发条件：员工类别要求 / 超管个人开关 / 系统级超管全局开关 */
  const isStaff = isPermissionedStaffType(user.account_type);
  const isSuper = user.account_type === 'super_admin';
  const need2fa =
    (isStaff && Number(user.category_require_two_factor) === 1) ||
    (isSuper && (Number(user.user_require_two_factor) === 1 || settings.enforceTwoFactorForSuperAdmin === true));

  if (!need2fa) {
    const body = await issueSessionToken(req, pool, user, settings);
    return res.json(body);
  }

  const totpReady = user.totp_secret && user.totp_enabled_at;
  if (totpReady) {
    return res.json({
      step: 'totp_login',
      pendingToken: signPendingTotp({ userId: user.id, purpose: 'login' }),
      user: {
        id: user.id,
        username: user.username,
        realName: user.real_name || user.username,
        accountType: user.account_type,
        employeeCategoryId: user.employee_category_id
      }
    });
  }

  return res.json({
    step: 'totp_setup',
    pendingToken: signPendingTotp({ userId: user.id, purpose: 'setup' }),
    user: {
      id: user.id,
      username: user.username,
      realName: user.real_name || user.username,
      accountType: user.account_type,
      employeeCategoryId: user.employee_category_id
    }
  });
});

const pendingTokenSchema = z.object({
  pendingToken: z.string().min(1).max(2048)
});

const totpCodeSchema = z.object({
  pendingToken: z.string().min(1).max(2048),
  code: z.string().min(6).max(12)
});

/** 检查目标用户是否需要 2FA（员工类别 / 超管个人 / 系统级） */
async function userNeedsTwoFactor(pool, settings, row) {
  if (!row) return false;
  if (row.account_type === 'super_admin') {
    return Number(row.user_require_two_factor) === 1 || settings.enforceTwoFactorForSuperAdmin === true;
  }
  if (isPermissionedStaffType(row.account_type)) {
    return Number(row.category_require_two_factor) === 1;
  }
  return false;
}

router.post('/totp/provision', loginIpLimiter(), async (req, res) => {
  const parsed = pendingTokenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  let uid;
  try {
    ({ userId: uid } = parsePendingTotp(parsed.data.pendingToken, 'setup'));
  } catch {
    return res.status(401).json({ error: 'INVALID_PENDING_TOKEN' });
  }
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.account_type, u.is_active, u.totp_secret, u.totp_enabled_at,
            IFNULL(u.require_two_factor, 0) AS user_require_two_factor,
            IFNULL(c.require_two_factor, 0) AS category_require_two_factor
     FROM users u
     LEFT JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    [uid]
  );
  const row = rows?.[0];
  if (!row || !row.is_active) return res.status(404).json({ error: 'NOT_FOUND' });
  if (!(await userNeedsTwoFactor(pool, settings, row))) return res.status(403).json({ error: 'FORBIDDEN' });
  if (row.totp_enabled_at) return res.status(400).json({ error: 'TOTP_ALREADY_ENABLED' });

  let secret = row.totp_secret ? String(row.totp_secret) : null;
  if (!secret) {
    secret = generateTotpSecret();
    await pool.query('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, uid]);
  }

  const otpauthUrl = totpKeyUri({ issuer: TOTP_ISSUER, accountName: row.username, secret });
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200 });
  } catch {
    qrDataUrl = '';
  }
  res.json({ otpauthUrl, qrDataUrl });
});

router.post('/totp/activate', loginIpLimiter(), async (req, res) => {
  const parsed = totpCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  let uid;
  try {
    ({ userId: uid } = parsePendingTotp(parsed.data.pendingToken, 'setup'));
  } catch {
    return res.status(401).json({ error: 'INVALID_PENDING_TOKEN' });
  }
  const { code } = parsed.data;
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.account_type, u.is_active, u.totp_secret, u.totp_enabled_at,
            u.permissions_json, u.employee_category_id,
            IFNULL(u.token_version, 0) AS token_version,
            IFNULL(u.force_change_password, 0) AS force_change_password,
            IFNULL(u.require_two_factor, 0) AS user_require_two_factor,
            IFNULL(c.require_two_factor, 0) AS category_require_two_factor,
            c.default_permissions_json AS category_default_json
     FROM users u
     LEFT JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    [uid]
  );
  const row = rows?.[0];
  if (!row || !row.is_active) return res.status(404).json({ error: 'NOT_FOUND' });
  if (!(await userNeedsTwoFactor(pool, settings, row))) return res.status(403).json({ error: 'FORBIDDEN' });
  if (row.totp_enabled_at) return res.status(400).json({ error: 'TOTP_ALREADY_ENABLED' });
  const secret = row.totp_secret ? String(row.totp_secret) : '';
  if (!secret || !verifyTotpToken(secret, code)) {
    return res.status(400).json({ error: 'TOTP_CODE_INVALID' });
  }
  await pool.query('UPDATE users SET totp_enabled_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [uid]);
  const user = await loadUserForToken(pool, uid);
  if (!user) return res.status(404).json({ error: 'NOT_FOUND' });
  const body = await issueSessionToken(req, pool, user, settings);
  res.json(body);
});

router.post('/totp/verify-login', loginIpLimiter(), async (req, res) => {
  const parsed = totpCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  let uid;
  try {
    ({ userId: uid } = parsePendingTotp(parsed.data.pendingToken, 'login'));
  } catch {
    return res.status(401).json({ error: 'INVALID_PENDING_TOKEN' });
  }
  const { code } = parsed.data;
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const [rows] = await pool.query(
    `SELECT id, username, account_type, is_active, totp_secret, totp_enabled_at
     FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [uid]
  );
  const row = rows?.[0];
  if (!row || !row.is_active) return res.status(404).json({ error: 'NOT_FOUND' });
  if (!row.totp_enabled_at || !row.totp_secret) return res.status(400).json({ error: 'TOTP_NOT_READY' });
  if (!verifyTotpToken(String(row.totp_secret), code)) {
    return res.status(400).json({ error: 'TOTP_CODE_INVALID' });
  }
  const user = await loadUserForToken(pool, uid);
  if (!user) return res.status(404).json({ error: 'NOT_FOUND' });
  const body = await issueSessionToken(req, pool, user, settings);
  res.json(body);
});

router.get('/me', requireAuth, async (req, res) => {
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.real_name AS realName, u.account_type AS accountType,
            c.code AS employeeCategoryCode,
            c.name_zh AS employeeCategoryName,
            IFNULL(force_change_password, 0) AS forceChangePassword,
            u.totp_enabled_at AS totpEnabledAt,
            IFNULL(u.require_two_factor, 0) AS userRequireTwoFactor
     FROM users u
     LEFT JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.id = ? LIMIT 1`,
    [req.user.userId]
  );
  const row = rows?.[0] || {};
  if (String(req.user?.username || '') === String(process.env.DEBUG_AUTH_USERNAME || 'SALES-2604-001')) {
    // eslint-disable-next-line no-console
    console.log(
      '[auth-debug]',
      JSON.stringify({
        tag: 'me',
        username: req.user?.username || null,
        accountType: req.user?.accountType || null,
        order_query: req.user?.permissions?.order_management?.order_query ?? null,
        order_input: req.user?.permissions?.order_management?.order_input ?? null,
        order_query_all: req.user?.permissions?.order_management?.order_query_all ?? null,
        forceChangePassword: !!row.forceChangePassword
      })
    );
  }
  res.json({
    user: {
      ...req.user,
      realName: row.realName || req.user.realName || req.user.username,
      employeeCategoryCode: row.employeeCategoryCode || req.user.employeeCategoryCode || null,
      employeeCategoryName: row.employeeCategoryName || null,
      forceChangePassword: !!row.forceChangePassword,
      totpEnabled: !!row.totpEnabledAt
    },
    idleTimeoutMinutes: settings.idleTimeoutMinutes,
    confirmSensitiveOperations: settings.confirmSensitiveOperations
  });
});

const changePwSchema = z.object({
  oldPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128)
});

router.post('/change-password', requireAuth, loginIpLimiter(), async (req, res) => {
  const parsed = changePwSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { oldPassword, newPassword } = parsed.data;
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const v = validatePasswordPlain(newPassword, settings);
  if (!v.ok) return res.status(400).json({ error: v.code, message: v.message });

  const [rows] = await pool.query(
    'SELECT id, username, password_hash FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [req.user.userId]
  );
  const u = rows?.[0];
  if (!u) return res.status(404).json({ error: 'NOT_FOUND' });
  if (!(await verifyPassword(oldPassword, u.password_hash))) {
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
  if (oldPassword === newPassword) {
    return res.status(400).json({ error: 'PASSWORD_SAME_AS_OLD', message: '新密码不能与原密码相同' });
  }
  await pool.query(
    `UPDATE users SET password_hash = ?, force_change_password = 0,
                      password_changed_at = CURRENT_TIMESTAMP(3),
                      token_version = token_version + 1
     WHERE id = ?`,
    [await hashPassword(newPassword), u.id]
  );
  invalidateUserGuard(u.id);
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

router.post('/logout', requireAuth, async (req, res) => {
  /** bump token_version 让本设备及其它设备的旧 token 立即失效 */
  await bumpTokenVersion(undefined, req.user.userId);
  await logOperationFromReq(req, {
    module: '账号',
    action: '退出登录',
    detail: null,
    success: true
  });
  res.json({ ok: true });
});

const impersonateSchema = z.object({
  userId: z.coerce.number().int().positive()
});

/** 超级管理员一键以员工/管理身份登录（JWT 与权限与目标一致）；目标须为已启用且账号类型为员工或管理 */
router.post('/impersonate', requireAuth, requireSuperAdmin, async (req, res) => {
  const parsed = impersonateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const targetId = parsed.data.userId;
  if (targetId === req.user.userId) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const user = await loadUserForToken(pool, targetId);
  if (!user) return res.status(404).json({ error: 'NOT_FOUND' });
  const [act] = await pool.query(
    'SELECT is_active, account_type FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [targetId]
  );
  const row = act?.[0];
  if (!row || !isPermissionedStaffType(row.account_type) || !row.is_active) {
    return res.status(400).json({ error: 'INVALID_IMPERSONATION_TARGET' });
  }
  await logOperation(pool, {
    userId: req.user.userId,
    username: req.user.username,
    module: '账号',
    action: '模拟登录员工',
    detail: { targetUserId: targetId, targetUsername: user.username },
    success: true,
    ip: clientIp(req),
    userAgent: req.headers['user-agent'] || ''
  });
  const body = await issueSessionToken(req, pool, user, settings);
  res.json(body);
});

const bootstrapSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128)
});

/**
 * 初始化超管：
 * - 仅在 users 表为空时允许匿名调用；并且：
 *   - 必须显式 ALLOW_BOOTSTRAP=true，或仅来自本机 IP
 * - users 表非空时回退到 super_admin 鉴权
 * 这条接口实际上的"安全部署做法"是用 server/scripts/add-super-admin.mjs 直接走 CLI。
 */
function isLoopbackIp(ip) {
  const s = String(ip || '');
  return s === '127.0.0.1' || s === '::1' || s === '::ffff:127.0.0.1';
}

router.post(
  '/bootstrap-admin',
  loginIpLimiter(),
  async (req, res, next) => {
    const pool = getPool();
    const [countRows] = await pool.query('SELECT COUNT(*) AS c FROM users');
    const count = Number(countRows?.[0]?.c || 0);
    if (count > 0) {
      return requireAuth(req, res, () => requireSuperAdmin(req, res, next));
    }
    const allowEnv = String(process.env.ALLOW_BOOTSTRAP || '').toLowerCase() === 'true';
    const allowLoopback = isLoopbackIp(clientIp(req));
    if (!allowEnv && !allowLoopback) {
      return res.status(403).json({
        error: 'BOOTSTRAP_DISABLED',
        message: '初始化超管接口未启用：请在 server/.env 设置 ALLOW_BOOTSTRAP=true，或通过 npm run add-super-admin 直接创建。'
      });
    }
    return next();
  },
  async (req, res) => {
    const parsed = bootstrapSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const { username, password } = parsed.data;
    const pool = getPool();
    const settings = await getSecuritySettings(pool);
    const v = validatePasswordPlain(password, settings);
    if (!v.ok) return res.status(400).json({ error: v.code, message: v.message });

    try {
      const passwordHash = await hashPassword(password);
      const [result] = await pool.query(
        `INSERT INTO users (username, real_name, password_hash, account_type, is_active, password_changed_at)
         VALUES (?, ?, ?, 'super_admin', 1, CURRENT_TIMESTAMP(3))`,
        [username, username, passwordHash]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'USERNAME_EXISTS' });
      throw e;
    }
  }
);
