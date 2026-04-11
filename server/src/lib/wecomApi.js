/** 企业微信服务端 API（access_token、应用消息发送） */

const tokenCache = new Map();

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
  const res = await fetch(url);
  const data = await res.json();
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
export async function wecomSendMessage(accessToken, messageBody) {
  const url =
    'https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' + encodeURIComponent(accessToken);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messageBody)
  });
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) {
    const e = new Error(data?.errmsg || 'WECOM_SEND_ERROR');
    e.code = 'WECOM_SEND_ERROR';
    e.wecom = data;
    throw e;
  }
  return data;
}

export function applyWecomTemplate(str, variables) {
  if (str == null) return '';
  const vars = variables && typeof variables === 'object' ? variables : {};
  return String(str).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    if (v == null) return '';
    return String(v);
  });
}
