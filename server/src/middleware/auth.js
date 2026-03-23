import jwt from 'jsonwebtoken';

import { defaultPermissionsQc, hasAnyPermission, hasPermission } from '../lib/permissions.js';

function getTokenFromReq(req) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1];
  return null;
}

export function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.accountType) {
      if (payload.role === 'admin') {
        payload.accountType = 'super_admin';
        payload.permissions = null;
      } else if (payload.role === 'inspector') {
        payload.accountType = 'employee';
        payload.permissions = defaultPermissionsQc();
      } else {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
      }
    }
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
}

export function requireRole(roles) {
  const roleSet = new Set(roles);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (!roleSet.has(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
    return next();
  };
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

