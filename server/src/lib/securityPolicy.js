import { getPool } from '../db/pool.js';

export const DEFAULT_SECURITY_SETTINGS = {
  minPasswordLength: 6,
  bannedPasswords: ['123456', 'admin', 'password', 'qwerty', '111111', '12345678', '888888', '666666'],
  idleTimeoutMinutes: 60,
  loginFailMaxAttempts: 5,
  loginLockMinutes: 60,
  confirmSensitiveOperations: true,
  errorLogRetentionDays: 180
};

export function mergeSettings(raw) {
  const base = { ...DEFAULT_SECURITY_SETTINGS };
  if (!raw || typeof raw !== 'object') return base;
  if (typeof raw.minPasswordLength === 'number' && raw.minPasswordLength >= 4 && raw.minPasswordLength <= 128) {
    base.minPasswordLength = raw.minPasswordLength;
  }
  if (Array.isArray(raw.bannedPasswords)) {
    base.bannedPasswords = raw.bannedPasswords
      .map((s) => String(s || '').toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 500);
  }
  if (typeof raw.idleTimeoutMinutes === 'number' && raw.idleTimeoutMinutes >= 5 && raw.idleTimeoutMinutes <= 24 * 60) {
    base.idleTimeoutMinutes = raw.idleTimeoutMinutes;
  }
  if (typeof raw.loginFailMaxAttempts === 'number' && raw.loginFailMaxAttempts >= 3 && raw.loginFailMaxAttempts <= 20) {
    base.loginFailMaxAttempts = raw.loginFailMaxAttempts;
  }
  if (typeof raw.loginLockMinutes === 'number' && raw.loginLockMinutes >= 5 && raw.loginLockMinutes <= 24 * 60) {
    base.loginLockMinutes = raw.loginLockMinutes;
  }
  if (typeof raw.confirmSensitiveOperations === 'boolean') {
    base.confirmSensitiveOperations = raw.confirmSensitiveOperations;
  }
  if (typeof raw.errorLogRetentionDays === 'number' && raw.errorLogRetentionDays >= 30 && raw.errorLogRetentionDays <= 3650) {
    base.errorLogRetentionDays = raw.errorLogRetentionDays;
  }
  return base;
}

export async function getSecuritySettings(pool) {
  const p = pool || getPool();
  const [rows] = await p.query('SELECT settings_json AS j FROM system_security_settings WHERE id=1 LIMIT 1');
  let raw = rows?.[0]?.j;
  if (raw && typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  return mergeSettings(raw);
}

/** @returns {{ ok: true } | { ok: false, code: string, message: string }} */
export function validatePasswordPlain(password, settings) {
  const s = settings || DEFAULT_SECURITY_SETTINGS;
  const pw = String(password ?? '');
  if (pw.length < s.minPasswordLength) {
    return { ok: false, code: 'PASSWORD_TOO_SHORT', message: `密码长度至少 ${s.minPasswordLength} 位` };
  }
  const lower = pw.toLowerCase();
  const banned = new Set((s.bannedPasswords || []).map((x) => String(x).toLowerCase()));
  if (banned.has(lower)) {
    return { ok: false, code: 'PASSWORD_TOO_SIMPLE', message: '密码过于简单，请避免使用常见弱密码' };
  }
  return { ok: true };
}

export function summarizeUserAgent(ua) {
  const s = String(ua || '').slice(0, 512);
  if (!s) return '';
  let browser = 'Unknown';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'Chrome';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s) && !/Chrome/i.test(s)) browser = 'Safari';
  let os = '';
  if (/Windows NT/i.test(s)) os = 'Windows';
  else if (/Mac OS X/i.test(s)) os = 'macOS';
  else if (/Linux/i.test(s)) os = 'Linux';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad/i.test(s)) os = 'iOS';
  return [browser, os].filter(Boolean).join(' / ') || s.slice(0, 120);
}
