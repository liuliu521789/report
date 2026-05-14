/** 企业微信服务端 API（access_token、应用消息发送） */

const WECOM_HTTP_TIMEOUT_MS = 5000;

const tokenCache = new Map();

function throwWecomTimeout() {
  const e = new Error('WECOM_TIMEOUT');
  e.code = 'WECOM_TIMEOUT';
  throw e;
}

function throwWecomNetworkError() {
  const e = new Error('WECOM_NETWORK_ERROR');
  e.code = 'WECOM_NETWORK_ERROR';
  throw e;
}

function isAbortFromTimeout(err) {
  return err?.name === 'AbortError' || err?.code === 'ABORT_ERR';
}

/** @param {Response} res */
async function readWecomJsonBody(res) {
  try {
    return await res.json();
  } catch {
    throwWecomNetworkError();
  }
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
async function wecomFetch(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WECOM_HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (isAbortFromTimeout(err)) throwWecomTimeout();
    throwWecomNetworkError();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} corpId
 * @param {string} corpSecret
 * @returns {Promise<string>}
 */
export async function fetchWecomAccessToken(corpId, corpSecret) {
  const key = `${corpId}\0${corpSecret}`;
  const now = Date.now();
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt > now + 30_000) return hit.token;

  const url =
    'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=' +
    encodeURIComponent(corpId) +
    '&corpsecret=' +
    encodeURIComponent(corpSecret);
  const res = await wecomFetch(url);
  const data = await readWecomJsonBody(res);
  if (!res.ok || data.errcode !== 0) {
    const e = new Error(data?.errmsg || 'WECOM_TOKEN_ERROR');
    e.code = 'WECOM_TOKEN_ERROR';
    e.wecom = data;
    throw e;
  }
  const expiresIn = Number(data.expires_in) || 7200;
  tokenCache.set(key, {
    token: data.access_token,
    expiresAt: now + expiresIn * 1000 - 120_000
  });
  return data.access_token;
}

/**
 * @param {string} accessToken
 * @param {Record<string, unknown>} messageBody 企业微信 message/send 完整 JSON（含 touser、msgtype、agentid）
 */
/**
 * 网页授权：用 oauth2 回调里的 code 换取成员 UserId（须 snsapi_base + 自建应用 agent）。
 * @see https://developer.work.weixin.qq.com/document/path/91023
 * @param {string} accessToken
 * @param {string} code
 * @returns {Promise<string>} 企业微信成员 userid
 */
export async function fetchWecomOAuthUserId(accessToken, code) {
  const url =
    'https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=' +
    encodeURIComponent(accessToken) +
    '&code=' +
    encodeURIComponent(String(code || '').trim());
  const res = await wecomFetch(url);
  const data = await readWecomJsonBody(res);
  if (!res.ok || data.errcode !== 0) {
    const e = new Error(data?.errmsg || 'WECOM_OAUTH_USERINFO_FAILED');
    e.code = 'WECOM_OAUTH_USERINFO_FAILED';
    e.wecom = data;
    throw e;
  }
  const uid = data.userid ?? data.UserId ?? data.userId;
  const s = uid != null ? String(uid).trim() : '';
  if (!s) {
    const e = new Error('WECOM_OAUTH_USERID_EMPTY');
    e.code = 'WECOM_OAUTH_USERID_EMPTY';
    e.wecom = data;
    throw e;
  }
  return s;
}

export async function wecomSendMessage(accessToken, messageBody) {
  const url =
    'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + encodeURIComponent(accessToken);
  const res = await wecomFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messageBody)
  });
  const data = await readWecomJsonBody(res);
  if (!res.ok || data.errcode !== 0) {
    const e = new Error(data?.errmsg || 'WECOM_SEND_ERROR');
    e.code = 'WECOM_SEND_ERROR';
    e.wecom = data;
    throw e;
  }
  return data;
}

/** 全角「｛｝」等会导致占位符无法替换，链接变为字面量或空 */
export function normalizeWecomPlaceholders(str) {
  return String(str ?? '')
    .replace(/\uff5b/g, '{')
    .replace(/\uff5d/g, '}');
}

export function applyWecomTemplate(str, variables) {
  const vars = variables && typeof variables === 'object' ? variables : {};
  const normalized = normalizeWecomPlaceholders(str == null ? '' : String(str));
  return normalized.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    if (v == null) return '';
    return String(v);
  });
}
