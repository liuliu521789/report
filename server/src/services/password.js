import crypto from 'crypto';

// Simplified password hashing (PBKDF2). For higher security, switch to argon2/bcrypt.
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iter = 120000;
  const hash = crypto.pbkdf2Sync(password, salt, iter, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iter}$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 4) return false;
  const [algo, iterStr, salt, hash] = parts;
  if (algo !== 'pbkdf2_sha256') return false;
  const iter = Number(iterStr);
  if (!Number.isFinite(iter) || iter <= 0) return false;
  if (!salt || !hash) return false;
  const calc = crypto.pbkdf2Sync(password, salt, iter, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(hash, 'hex'));
}

