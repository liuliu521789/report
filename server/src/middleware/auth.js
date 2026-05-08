import jwt from 'jsonwebtoken';

import { hasAnyPermission, hasPermission } from '../lib/permissions.js';
import { loadUserGuard } from '../lib/sessionGuard.js';

function getTokenFromReq(req) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];
  return null;
}

/** 允许跳过 force_change_password 拦截的端点：让用户能调用 /me、登出、改密本身 */
const FORCE_CHANGE_PASSWORD_BYPASS = new Set([
  'GET /api/auth/me',
  'POST /api/auth/change-password',
  'POST /api/auth/logout'
]);

function isForceChangePasswordBypass(req) {
  return FORCE_CHANGE_PASSWORD_BYPASS.has(`${req.method} ${req.baseUrl}${req.path}`);
}

export async function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  if (!payload.accountType) return res.status(401).json({ error: 'UNAUTHORIZED' });
  if (payload.userId == null && payload.sub != null) {
    const n = Number(payload.sub);
    if (Number.isFinite(n) && n >= 1) payload.userId = n;
  }
  if (!Number.isFinite(Number(payload.userId)) || Number(payload.userId) <= 0) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  /** 即时失效守卫：is_active / token_version / deleted_at（短期缓存） */
  let guard = null;
  try {
    guard = await loadUserGuard(payload.userId);
  } catch (e) {
    /** 数据库不可用时不应该把用户踢线，按 token 信任放行 */
    // eslint-disable-next-line no-console
    console.warn('[auth] sessionGuard load failed:', e?.message || e);
  }
  if (guard) {
    if (!guard.isActive) return res.status(401).json({ error: 'ACCOUNT_DISABLED' });
    if (Number(payload.tv ?? 0) !== Number(guard.tokenVersion ?? 0)) {
      return res.status(401).json({ error: 'SESSION_EXPIRED' });
    }
    if (guard.forceChangePassword && !isForceChangePasswordBypass(req)) {
      return res.status(403).json({ error: 'PASSWORD_MUST_CHANGE', message: '请先修改初始/重置密码' });
    }
  }

  req.user = payload;
  return next();
}

/** 仅超级管理员 */
export function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  if (req.user.accountType !== 'super_admin') return res.status(403).json({ error: 'FORBIDDEN' });
  return next();
}

/** 员工权限：JWT 中 permissions 为 null 表示超级管理员（全允许） */
export function requirePermission(module, key) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (req.user.accountType === 'super_admin') return next();
    if (hasPermission(req.user.permissions, module, key)) return next();
    return res.status(403).json({ error: 'FORBIDDEN' });
  };
}

export function requireAnyPermission(module, keys) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (req.user.accountType === 'super_admin') return next();
    if (hasAnyPermission(req.user.permissions, module, keys)) return next();
    return res.status(403).json({ error: 'FORBIDDEN' });
  };
}

/** 多个 (module,key) 满足其一即可，用于翻译等 */
export function requireAnyPermissionPairs(pairs) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (req.user.accountType === 'super_admin') return next();
    for (const [m, k] of pairs) {
      if (hasPermission(req.user.permissions, m, k)) return next();
    }
    return res.status(403).json({ error: 'FORBIDDEN' });
  };
}
