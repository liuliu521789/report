import { sendWecomPlainTextMessage } from './wecomNotify.js';

const REQUEST_COOLDOWN_MS = 2 * 60 * 1000;
const lastRequestAtByUser = new Map();

function formatNowCn() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function displayActorName(user) {
  const real = user?.realName != null ? String(user.realName).trim() : '';
  if (real) return real;
  const username = user?.username != null ? String(user.username).trim() : '';
  return username || '未知用户';
}

export async function loadSupportContactSettings(pool) {
  const [rows] = await pool.query(
    `SELECT engineer_wechat_id AS engineerWechatId,
            engineer_wecom_userid AS engineerWecomUserid,
            engineer_display_name AS engineerDisplayName
     FROM support_contact_settings WHERE id=1 LIMIT 1`
  );
  const row = rows?.[0] || {};
  const engineerWechatId = row.engineerWechatId == null ? '' : String(row.engineerWechatId).trim();
  const engineerWecomUserid =
    row.engineerWecomUserid == null ? '' : String(row.engineerWecomUserid).trim();
  const engineerDisplayName =
    row.engineerDisplayName == null ? '' : String(row.engineerDisplayName).trim();

  const [cfgRows] = await pool.query(
    'SELECT corp_id AS corpId, agent_id AS agentId, corp_secret AS corpSecret FROM wecom_config WHERE id=1 LIMIT 1'
  );
  const cfg = cfgRows?.[0];
  const wecomConfigured = !!(
    cfg?.corpId &&
    String(cfg.corpId).trim() &&
    cfg?.corpSecret &&
    String(cfg.corpSecret).trim() &&
    Number(cfg?.agentId) > 0
  );

  return {
    engineerWechatId,
    engineerWecomUserid,
    engineerDisplayName,
    wecomConfigured,
    supportReady: !!(engineerWecomUserid && wecomConfigured)
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ userId: number, username?: string, realName?: string, message?: string, pagePath?: string }} opts
 */
export async function sendSupportWecomRequest(pool, opts) {
  const userId = Number(opts.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    const e = new Error('UNAUTHORIZED');
    e.code = 'UNAUTHORIZED';
    throw e;
  }

  const now = Date.now();
  const lastAt = lastRequestAtByUser.get(userId) || 0;
  if (now - lastAt < REQUEST_COOLDOWN_MS) {
    const e = new Error('REQUEST_TOO_FREQUENT');
    e.code = 'REQUEST_TOO_FREQUENT';
    e.retryAfterSec = Math.ceil((REQUEST_COOLDOWN_MS - (now - lastAt)) / 1000);
    throw e;
  }

  const settings = await loadSupportContactSettings(pool);
  if (!settings.supportReady) {
    const e = new Error('SUPPORT_NOT_CONFIGURED');
    e.code = 'SUPPORT_NOT_CONFIGURED';
    throw e;
  }

  const actorName = displayActorName(opts);
  const username = opts.username != null ? String(opts.username).trim() : '';
  const message = opts.message != null ? String(opts.message).trim().slice(0, 500) : '';
  const pagePath = opts.pagePath != null ? String(opts.pagePath).trim().slice(0, 200) : '';

  const lines = [
    '【物源数智管控平台 · 技术支持求助】',
    `来自：${actorName}${username ? `（${username}）` : ''}`,
    `时间：${formatNowCn()}`
  ];
  if (pagePath) lines.push(`页面：${pagePath}`);
  if (message) lines.push(`说明：${message}`);
  lines.push('', '请在企业微信中回复该同事。');

  await sendWecomPlainTextMessage(pool, {
    toUser: settings.engineerWecomUserid,
    content: lines.join('\n')
  });

  lastRequestAtByUser.set(userId, now);

  return {
    engineerDisplayName: settings.engineerDisplayName || '技术工程师',
    sentAt: new Date().toISOString()
  };
}
