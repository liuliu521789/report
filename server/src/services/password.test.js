import crypto from 'crypto';

import { describe, it, expect } from 'vitest';

import { hashPassword, passwordNeedsRehash, verifyPassword } from './password.js';

function legacyPbkdf2(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iter = 120000;
  const hash = crypto.pbkdf2Sync(password, salt, iter, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iter}$${salt}$${hash}`;
}

describe('password service (argon2id + PBKDF2 兼容)', () => {
  it('hashPassword 输出 argon2id 格式且能 verify', async () => {
    const h = await hashPassword('CorrectHorse!42');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword('CorrectHorse!42', h)).toBe(true);
    expect(await verifyPassword('WrongPassword', h)).toBe(false);
  });

  it('verifyPassword 兼容历史 PBKDF2 哈希', async () => {
    const stored = legacyPbkdf2('LegacyPwd_2025');
    expect(await verifyPassword('LegacyPwd_2025', stored)).toBe(true);
    expect(await verifyPassword('LegacyPwd_2026', stored)).toBe(false);
  });

  it('passwordNeedsRehash 仅对历史/未知格式返回 true', async () => {
    expect(passwordNeedsRehash(legacyPbkdf2('x'))).toBe(true);
    expect(passwordNeedsRehash('')).toBe(true);
    expect(passwordNeedsRehash('plaintext-not-hashed')).toBe(true);
    const fresh = await hashPassword('whatever');
    expect(passwordNeedsRehash(fresh)).toBe(false);
  });
});
