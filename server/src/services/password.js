import crypto from 'crypto';

import argon2 from '@node-rs/argon2';

/**
 * 密码哈希策略：
 * - 新建/重置：argon2id（OWASP 2023 推荐）；参数：m=64MB, t=3, p=1
 * - 校验：自动识别历史 PBKDF2 ($pbkdf2_sha256$...) 与新 argon2 ($argon2id$...)
 * - 历史哈希在登录成功后由 auth.js 统一调用 needsRehash() 决定是否升级
 */

const ARGON2_OPTIONS = {
  /** memoryCost in KiB；64MiB 对单机 Web 适中 */
  memoryCost: 1 << 16,
  timeCost: 3,
  parallelism: 1,
  algorithm: argon2.Algorithm.Argon2id
};

const PBKDF2_PREFIX = 'pbkdf2_sha256$';
const ARGON2_PREFIX = '$argon2';

export async function hashPassword(password) {
  return argon2.hash(String(password), ARGON2_OPTIONS);
}

/** 同步 PBKDF2 校验，兼容旧库存哈希 */
function verifyPbkdf2(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 4) return false;
  const [algo, iterStr, salt, hash] = parts;
  if (algo !== 'pbkdf2_sha256') return false;
  const iter = Number(iterStr);
  if (!Number.isFinite(iter) || iter <= 0) return false;
  if (!salt || !hash) return false;
  const calc = crypto.pbkdf2Sync(password, salt, iter, 32, 'sha256').toString('hex');
  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** @param {string} password 明文 @param {string} stored 库存哈希 */
export async function verifyPassword(password, stored) {
  const s = String(stored || '');
  if (!s) return false;
  if (s.startsWith(ARGON2_PREFIX)) {
    try {
      return await argon2.verify(s, String(password));
    } catch {
      return false;
    }
  }
  if (s.startsWith(PBKDF2_PREFIX)) {
    return verifyPbkdf2(String(password), s);
  }
  return false;
}

/** 旧库存哈希 / 参数过弱时返回 true，提示登录路由透明升级 */
export function passwordNeedsRehash(stored) {
  const s = String(stored || '');
  if (!s) return true;
  if (s.startsWith(PBKDF2_PREFIX)) return true;
  if (!s.startsWith(ARGON2_PREFIX)) return true;
  /** TODO: 解析 argon2 参数判断是否低于当前 ARGON2_OPTIONS；目前同算法即视为最新 */
  return false;
}
