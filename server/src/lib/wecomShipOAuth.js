import jwt from 'jsonwebtoken';

import { decryptSecret } from './secretCrypto.js';
import { fetchWecomAccessToken, fetchWecomOAuthUserId } from './wecomApi.js';

export const WECOM_SHIP_ACTOR_COOKIE = 'wecom_ship_actor';
export const WECOM_CONTRACT_REVIEW_ACTOR_COOKIE = 'wecom_contract_review_actor';

const P_STATE = 'wecom_ship_oauth_state';
const P_ACTOR = 'wecom_ship_actor';
const P_CONTRACT_STATE = 'wecom_contract_review_oauth_state';
const P_CONTRACT_ACTOR = 'wecom_contract_review_actor';

export function isWecomShipOAuthDisabled() {
  return String(process.env.WECOM_SHIP_OAUTH_DISABLED || '').toLowerCase() === 'true';
}

export function isWecomContractReviewOAuthDisabled() {
  return String(process.env.WECOM_CONTRACT_REVIEW_OAUTH_DISABLED || '').toLowerCase() === 'true';
}

export function signWecomShipOAuthState(shipToken) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  return jwt.sign({ purpose: P_STATE, t: String(shipToken || '') }, secret, { expiresIn: '10m' });
}

export function verifyWecomShipOAuthState(state) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  const p = jwt.verify(String(state || ''), secret);
  if (!p || p.purpose !== P_STATE || !String(p.t || '').trim()) {
    const e = new Error('INVALID_STATE');
    e.code = 'INVALID_STATE';
    throw e;
  }
  return { shipToken: String(p.t).trim() };
}

export function signWecomContractReviewOAuthState(reviewToken) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  return jwt.sign({ purpose: P_CONTRACT_STATE, t: String(reviewToken || '') }, secret, { expiresIn: '10m' });
}

export function verifyWecomContractReviewOAuthState(state) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  const p = jwt.verify(String(state || ''), secret);
  if (!p || p.purpose !== P_CONTRACT_STATE || !String(p.t || '').trim()) {
    const e = new Error('INVALID_STATE');
    e.code = 'INVALID_STATE';
    throw e;
  }
  return { reviewToken: String(p.t).trim() };
}

export function signWecomShipActorToken(userId, displayName) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    const e = new Error('BAD_USER');
    e.code = 'BAD_USER';
    throw e;
  }
  const nm = String(displayName || '').slice(0, 64);
  return jwt.sign({ purpose: P_ACTOR, uid, nm }, secret, { expiresIn: '15m' });
}

export function verifyWecomShipActorToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  const p = jwt.verify(String(token || ''), secret);
  if (!p || p.purpose !== P_ACTOR || !Number.isFinite(Number(p.uid)) || Number(p.uid) <= 0) {
    const e = new Error('INVALID_ACTOR');
    e.code = 'INVALID_ACTOR';
    throw e;
  }
  return { userId: Number(p.uid), displayName: String(p.nm || '') };
}

export function signWecomContractReviewActorToken(userId, displayName) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    const e = new Error('BAD_USER');
    e.code = 'BAD_USER';
    throw e;
  }
  const nm = String(displayName || '').slice(0, 64);
  return jwt.sign({ purpose: P_CONTRACT_ACTOR, uid, nm }, secret, { expiresIn: '15m' });
}

export function verifyWecomContractReviewActorToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  const p = jwt.verify(String(token || ''), secret);
  if (!p || p.purpose !== P_CONTRACT_ACTOR || !Number.isFinite(Number(p.uid)) || Number(p.uid) <= 0) {
    const e = new Error('INVALID_ACTOR');
    e.code = 'INVALID_ACTOR';
    throw e;
  }
  return { userId: Number(p.uid), displayName: String(p.nm || '') };
}

export async function loadWecomAppCredentials(pool) {
  const [rows] = await pool.query(
    'SELECT corp_id AS corpId, corp_secret AS corpSecret, agent_id AS agentId FROM wecom_config WHERE id=1 LIMIT 1'
  );
  const r = rows?.[0];
  const corpId = r?.corpId != null ? String(r.corpId).trim() : '';
  let corpSecret = '';
  try {
    corpSecret = r?.corpSecret ? decryptSecret(String(r.corpSecret).trim()) : '';
  } catch {
    corpSecret = '';
  }
  const agentId = r?.agentId != null ? Number(r.agentId) : 0;
  if (!corpId || !corpSecret || !agentId) {
    const e = new Error('WECOM_NOT_CONFIGURED');
    e.code = 'WECOM_NOT_CONFIGURED';
    throw e;
  }
  return { corpId, corpSecret, agentId };
}

/**
 * wecom_userid 允许重复时取 id 最小的一条活跃账号。
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} wecomUserid
 */
export async function resolveUserIdByWecomUserid(pool, wecomUserid) {
  const w = String(wecomUserid || '').trim();
  if (!w) return null;
  const [uRows] = await pool.query(
    'SELECT id, real_name, username FROM users WHERE wecom_userid = ? AND is_active = 1 ORDER BY id ASC LIMIT 1',
    [w]
  );
  const u = uRows?.[0];
  if (!u) return null;
  const id = Number(u.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const real = u.real_name != null ? String(u.real_name).trim() : '';
  const un = u.username != null ? String(u.username).trim() : '';
  const displayName = real || un || w;
  return { userId: id, displayName };
}

export async function exchangeWecomOAuthCodeForMappedUser(pool, code) {
  const { corpId, corpSecret } = await loadWecomAppCredentials(pool);
  const accessToken = await fetchWecomAccessToken(corpId, corpSecret);
  const wxUserId = await fetchWecomOAuthUserId(accessToken, code);
  const mapped = await resolveUserIdByWecomUserid(pool, wxUserId);
  return { wxUserId, mapped };
}

export function buildWecomShipOAuthAuthorizeUrl({ corpId, agentId, redirectUri, state }) {
  const params = new URLSearchParams({
    appid: corpId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'snsapi_base',
    state,
    agentid: String(agentId)
  });
  return `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}#wechat_redirect`;
}

function cookieFlagSecure() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

/** @param {import('express').Response} res */
export function appendWecomShipActorCookie(res, actorToken) {
  const maxAge = 15 * 60;
  const parts = [
    `${WECOM_SHIP_ACTOR_COOKIE}=${encodeURIComponent(actorToken)}`,
    'Path=/api/public',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (cookieFlagSecure()) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

/** @param {import('express').Response} res */
export function clearWecomShipActorCookie(res) {
  const parts = [`${WECOM_SHIP_ACTOR_COOKIE}=`, 'Path=/api/public', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (cookieFlagSecure()) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

/** @param {import('express').Response} res */
export function appendWecomContractReviewActorCookie(res, actorToken) {
  const maxAge = 15 * 60;
  const parts = [
    `${WECOM_CONTRACT_REVIEW_ACTOR_COOKIE}=${encodeURIComponent(actorToken)}`,
    'Path=/api/public',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (cookieFlagSecure()) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

/** @param {import('express').Response} res */
export function clearWecomContractReviewActorCookie(res) {
  const parts = [`${WECOM_CONTRACT_REVIEW_ACTOR_COOKIE}=`, 'Path=/api/public', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (cookieFlagSecure()) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

/** @param {import('express').Request} req */
export function readWecomShipActorCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const s = part.trim();
    if (!s.startsWith(`${WECOM_SHIP_ACTOR_COOKIE}=`)) continue;
    const v = s.slice(WECOM_SHIP_ACTOR_COOKIE.length + 1);
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return '';
}

/** @param {import('express').Request} req */
export function readWecomContractReviewActorCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const s = part.trim();
    if (!s.startsWith(`${WECOM_CONTRACT_REVIEW_ACTOR_COOKIE}=`)) continue;
    const v = s.slice(WECOM_CONTRACT_REVIEW_ACTOR_COOKIE.length + 1);
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return '';
}
