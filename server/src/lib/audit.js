import { getPool } from '../db/pool.js';
import { getSecuritySettings } from './securityPolicy.js';

/** 将 IPv6 回环 ::1、IPv4 映射 ::ffff:x.x.x.x 转为更易读的 IPv4，便于日志查看 */
export function normalizeClientIp(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s === '::1') return '127.0.0.1';
  if (s.startsWith('::ffff:')) return s.slice(7).slice(0, 64);
  return s.slice(0, 64);
}

export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  let ip = '';
  if (typeof xf === 'string' && xf.trim()) {
    ip = xf.split(',')[0].trim();
  } else {
    ip = String(req.socket?.remoteAddress || req.ip || '');
  }
  return normalizeClientIp(ip);
}

export async function logLogin(pool, row) {
  const p = pool || getPool();
  const {
    userId = null,
    username,
    ip = '',
    userAgent = null,
    deviceSummary = null,
    success,
    failReason = null
  } = row;
  await p.query(
    `INSERT INTO login_logs (user_id, username, ip, user_agent, device_summary, success, fail_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      String(username).slice(0, 64),
      String(ip).slice(0, 64),
      userAgent ? String(userAgent).slice(0, 512) : null,
      deviceSummary ? String(deviceSummary).slice(0, 256) : null,
      success ? 1 : 0,
      failReason ? String(failReason).slice(0, 128) : null
    ]
  );
}

export async function logOperation(pool, row) {
  const p = pool || getPool();
  const {
    userId = null,
    username = '',
    module,
    action,
    detail = null,
    success = true,
    ip = '',
    userAgent = null
  } = row;
  await p.query(
    `INSERT INTO operation_logs (user_id, username, module, action, detail_json, success, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      String(username).slice(0, 64),
      String(module).slice(0, 64),
      String(action).slice(0, 128),
      detail == null ? null : JSON.stringify(detail),
      success ? 1 : 0,
      String(ip).slice(0, 64),
      userAgent ? String(userAgent).slice(0, 512) : null
    ]
  );
}

export async function logOperationFromReq(req, { module, action, detail, success = true }) {
  return logOperation(getPool(), {
    userId: req.user?.userId ?? null,
    username: req.user?.username || '',
    module,
    action,
    detail,
    success,
    ip: clientIp(req),
    userAgent: req.headers['user-agent'] || ''
  });
}

export async function logErrorEntry(pool, { module = 'server', message, stack = null, code = null, meta = null }) {
  const p = pool || getPool();
  await p.query(
    `INSERT INTO error_logs (module, message, stack, code, meta_json) VALUES (?, ?, ?, ?, ?)`,
    [
      String(module).slice(0, 64),
      String(message),
      stack ? String(stack) : null,
      code ? String(code).slice(0, 64) : null,
      meta == null ? null : JSON.stringify(meta)
    ]
  );
}

export async function purgeExpiredErrorLogs(pool) {
  const p = pool || getPool();
  const settings = await getSecuritySettings(p);
  const days = settings.errorLogRetentionDays || 180;
  await p.query(`DELETE FROM error_logs WHERE created_at < DATE_SUB(NOW(3), INTERVAL ? DAY)`, [days]);
}
