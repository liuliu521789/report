/**
 * 登录类接口的限流：
 * - 单 IP：默认 1 分钟 30 次（含密码与 TOTP），过则 429
 * - 单 (IP + username) 维度：默认 5 分钟 10 次失败，避免撞库绕过单账号锁定
 *
 * 仅对认证类路径启用，其他路径不受影响。
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { clientIp } from '../lib/audit.js';

const DISABLE_RATE_LIMIT =
  String(process.env.DISABLE_LOGIN_RATE_LIMIT || '').toLowerCase() === 'true';

function noop() {
  return (req, res, next) => next();
}

/** 单 IP 维度：覆盖密码登录、TOTP、bootstrap、change-password */
export function loginIpLimiter() {
  if (DISABLE_RATE_LIMIT) return noop();
  return rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientIp(req) || 'unknown',
    handler: (req, res) => {
      res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: '请求过于频繁，请稍后再试' });
    }
  });
}

/** 单 (IP + 输入用户编号) 维度，防撞库 */
export function loginUsernameLimiter() {
  if (DISABLE_RATE_LIMIT) return noop();
  return rateLimit({
    windowMs: 5 * 60_000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const ip = clientIp(req) || ipKeyGenerator(req) || 'unknown';
      const u = String(req?.body?.username || '').toLowerCase().slice(0, 64);
      return `${ip}|${u}`;
    },
    handler: (req, res) => {
      res.status(429).json({ error: 'TOO_MANY_REQUESTS', message: '尝试次数过多，请稍后再试' });
    }
  });
}
