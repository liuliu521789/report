import crypto from 'crypto';

const PREFIX = 'enc:v1:';

export function isSecretEncryptionEnabled() {
  return String(process.env.APP_ENCRYPTION_KEY || '').trim().length > 0;
}

function loadKeyBuffer() {
  const b64 = String(process.env.APP_ENCRYPTION_KEY || '').trim();
  if (!b64) {
    const e = new Error('APP_ENCRYPTION_KEY_NOT_SET');
    e.code = 'APP_ENCRYPTION_KEY_NOT_SET';
    throw e;
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    const e = new Error('APP_ENCRYPTION_KEY_INVALID');
    e.code = 'APP_ENCRYPTION_KEY_INVALID';
    throw e;
  }
  return key;
}

/**
 * AES-256-GCM，格式 enc:v1:&lt;ivBase64url&gt;:&lt;tagBase64url&gt;:&lt;cipherBase64url&gt;
 * @param {string} plain
 */
export function encryptSecret(plain) {
  if (plain == null || plain === '') return '';
  const s = String(plain);
  if (!isSecretEncryptionEnabled()) return s;
  const key = loadKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const b64 = (buf) => buf.toString('base64url');
  return `${PREFIX}${b64(iv)}:${b64(tag)}:${b64(enc)}`;
}

/**
 * enc:v1: 前缀则解密；否则视为历史明文直接返回。
 * @param {string} stored
 */
export function decryptSecret(stored) {
  if (stored == null || stored === '') return '';
  const s = String(stored);
  if (!s.startsWith(PREFIX)) return s;
  const key = loadKeyBuffer();
  const rest = s.slice(PREFIX.length);
  const parts = rest.split(':');
  if (parts.length !== 3) return s;
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const ct = Buffer.from(ctB64, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
