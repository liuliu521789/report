/**
 * 会话即时失效守卫：
 * - 用户被停用、修改权限/账号类型、改密码、超管手动踢线时，token_version + 1
 * - requireAuth 在每次请求时校验 payload.tv === db.token_version 且 is_active=1
 * - 通过短期 LRU 缓存（默认 15s）避免每个请求都打数据库
 */

import { getPool } from '../db/pool.js';

const TTL_MS = Number(process.env.SESSION_GUARD_TTL_MS || 15_000);
const MAX_ENTRIES = 5_000;

/** @type {Map<number, { expiresAt: number, isActive: boolean, tokenVersion: number, accountType: string, forceChangePassword: boolean }>} */
const cache = new Map();

function trimIfNeeded() {
  if (cache.size <= MAX_ENTRIES) return;
  /** 简易 LRU：直接清空，下个请求重新填 */
  cache.clear();
}

export function invalidateUserGuard(userId) {
  cache.delete(Number(userId));
}

export function invalidateAllGuards() {
  cache.clear();
}

/**
 * @param {number} userId
 * @returns {Promise<null | { isActive:boolean, tokenVersion:number, accountType:string, forceChangePassword:boolean }>}
 */
export async function loadUserGuard(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const now = Date.now();
  const cached = cache.get(id);
  if (cached && cached.expiresAt > now) return cached;
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT is_active AS isActive,
            IFNULL(token_version, 0) AS tokenVersion,
            account_type AS accountType,
            IFNULL(force_change_password, 0) AS forceChangePassword,
            deleted_at AS deletedAt
     FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  const row = rows?.[0];
  if (!row || row.deletedAt) {
    cache.set(id, { expiresAt: now + TTL_MS, isActive: false, tokenVersion: 0, accountType: '', forceChangePassword: false });
    trimIfNeeded();
    return null;
  }
  const entry = {
    expiresAt: now + TTL_MS,
    isActive: !!row.isActive,
    tokenVersion: Number(row.tokenVersion || 0),
    accountType: String(row.accountType || ''),
    forceChangePassword: !!row.forceChangePassword
  };
  cache.set(id, entry);
  trimIfNeeded();
  return entry;
}

/** 在用户被改密/停用/改权限/手动踢线时调用 */
export async function bumpTokenVersion(pool, userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return;
  await (pool || getPool()).query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [id]);
  invalidateUserGuard(id);
}
