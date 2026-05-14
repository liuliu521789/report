import {
  fetchWecomAccessToken,
  applyWecomTemplate,
  normalizeWecomPlaceholders,
  wecomSendMessage
} from './wecomApi.js';
import { signWecomContractReviewToken } from './wecomContractReviewToken.js';
import { buildContractReviewerNotifyMessages } from './salesOrderNotifyBody.js';
import {
  loadOrderFieldDefinitions,
  attachCustomerNamesToOrders,
  formatWarehouseWecomOrderDetail
} from './salesOrderFields.js';
import { signWecomShipToken } from './wecomShipToken.js';
import { signWecomFinanceReviewToken } from './wecomFinanceReviewToken.js';
import { enqueueWecomNotify } from './wecomNotifyOutbox.js';
import { decryptSecret } from './secretCrypto.js';

export const WECOM_TEMPLATE_SALES_ORDER_SUBMIT_FINANCE = 'sales_order_submit_finance';
export const WECOM_TEMPLATE_SALES_ORDER_WITHDRAW_FINANCE = 'sales_order_withdraw_finance';
export const WECOM_TEMPLATE_SALES_ORDER_APPROVED_WAREHOUSE = 'sales_order_approved_warehouse';
/** 财务通过后待品管质检：收件人为品管类别；模板未配置时静默跳过 */
export const WECOM_TEMPLATE_SALES_ORDER_PENDING_QC = 'sales_order_pending_qc';
export const WECOM_TEMPLATE_SALES_ORDER_REJECTED_SALES = 'sales_order_rejected_sales';

// 合同相关模板编码（需在「企业微信通知模板」配置中创建）
export const WECOM_TEMPLATE_CONTRACT_SUBMIT_REVIEWER = 'sales_contract_submit_reviewer';
export const WECOM_TEMPLATE_CONTRACT_REVIEW_RESULT = 'sales_contract_review_result';
export const WECOM_TEMPLATE_CODE_CATALOG = [
  {
    code: WECOM_TEMPLATE_SALES_ORDER_SUBMIT_FINANCE,
    meaning: '销售订单提交财务审核后通知财务（文本卡片链接可用 {{financeReviewUrl}}）',
    usedBy: ['销售订单提交审核', '销售订单批量提交审核']
  },
  {
    code: WECOM_TEMPLATE_SALES_ORDER_WITHDRAW_FINANCE,
    meaning: '销售订单撤回审核后通知财务（文本卡片链接可用 {{financeReviewUrl}}）',
    usedBy: ['销售订单撤回审核']
  },
  {
    code: WECOM_TEMPLATE_SALES_ORDER_APPROVED_WAREHOUSE,
    meaning: '品管审核通过后通知仓库发货（文本卡片）',
    usedBy: ['销售订单品管审核通过']
  },
  {
    code: WECOM_TEMPLATE_SALES_ORDER_PENDING_QC,
    meaning: '财务通过后通知品管质检审核（文本卡片；链接可用 {{financeReviewUrl}} 或固定 https 地址）',
    usedBy: ['销售订单财务审核通过（待品管）']
  },
  {
    code: WECOM_TEMPLATE_SALES_ORDER_REJECTED_SALES,
    meaning: '财务或品管驳回后通知订单创建销售',
    usedBy: ['销售订单财务审核驳回', '销售订单财务批量驳回', '销售订单品管驳回']
  },
  {
    code: WECOM_TEMPLATE_CONTRACT_SUBMIT_REVIEWER,
    meaning: '合同提交审核后通知审核人（可选用变量 reviewUrl 作为移动端审批链接）',
    usedBy: ['销售合同提交审核']
  },
  {
    code: WECOM_TEMPLATE_CONTRACT_REVIEW_RESULT,
    meaning: '合同审核结果通知合同提交人',
    usedBy: ['销售合同审核通过', '销售合同审核驳回']
  }
];

function decryptWecomCorpSecret(raw) {
  try {
    return raw ? decryptSecret(String(raw).trim()) : '';
  } catch {
    const e = new Error('WECOM_NOT_CONFIGURED');
    e.code = 'WECOM_NOT_CONFIGURED';
    throw e;
  }
}

function clampWecomText(str, maxLen = 1900) {
  const s = str == null ? '' : String(str);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 20)}\n…（已截断）`;
}

/** 企业微信文本卡片要求可跳转的 http(s) url；无协议时常被误判为空 */
function coerceToHttpUrl(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  // Path-only value (e.g. "/api/public/...") is not a valid external host.
  // Keep it empty so caller can fallback to absolute variables like shipConfirmUrl/reviewUrl.
  if (t.startsWith('/')) return '';
  if (t.startsWith('//')) return `https:${t}`;
  return `https://${t.replace(/^\/+/, '')}`;
}

/**
 * 文本卡片点击链接：模板替换 → 补全协议 → 再尝试常见 URL 变量。
 */
function resolveTextcardUrl(urlTemplate, strVars) {
  const tmpl = normalizeWecomPlaceholders(urlTemplate || '');
  const raw = applyWecomTemplate(tmpl, strVars).trim();
  const fromTemplate = coerceToHttpUrl(raw);
  if (fromTemplate && /^https?:\/\//i.test(fromTemplate)) return fromTemplate;
  for (const k of ['reviewUrl', 'shipConfirmUrl', 'shipUrl', 'financeReviewUrl']) {
    const u = coerceToHttpUrl(strVars[k]);
    if (u && /^https?:\/\//i.test(u)) return u;
  }
  return '';
}

function diagnoseTextcardUrlFailure(urlTemplate, strVars, substitutedTrimmed) {
  const hints = [];
  const t = normalizeWecomPlaceholders(urlTemplate || '');
  if (/\{\{\s*reviewUrl\s*\}\}/i.test(t) && !(String(strVars.reviewUrl || '').trim())) {
    hints.push(
      '模板链接含 {{reviewUrl}}，但变量 reviewUrl 为空：请在服务器配置 PUBLIC_BASE_URL（或 WECOM_PUBLIC_BASE_URL）与 JWT_SECRET；后台「测试发送」须在 JSON 里传入 reviewUrl（https 完整链接）。'
    );
  }
  if (/\{\{\s*financeReviewUrl\s*\}\}/i.test(t) && !(String(strVars.financeReviewUrl || '').trim())) {
    hints.push(
      '模板链接含 {{financeReviewUrl}}，但变量为空：请配置 PUBLIC_BASE_URL 与 JWT_SECRET；单测发送须在 JSON 里传入 https 完整 financeReviewUrl。'
    );
  }
  if (substitutedTrimmed && /\{\{/.test(substitutedTrimmed)) {
    hints.push('链接替换后仍含 {{…}}，占位符未生效：请用半角括号 {{reviewUrl}}，勿用全角｛｝。');
  }
  if (substitutedTrimmed && !/^https?:\/\//i.test(coerceToHttpUrl(substitutedTrimmed))) {
    hints.push(`替换后仍非合法链接：${substitutedTrimmed.slice(0, 120)}`);
  }
  if (!substitutedTrimmed && !/\{\{/.test(t)) {
    hints.push('链接地址未使用变量且为空，或内容未保存成功，请检查模板。');
  }
  return hints.filter(Boolean).join(' ');
}

/**
 * 不走模板，直接发纯文本（用于合同审批卡片因缺少链接失败时的兜底；worker 亦会调用）。
 */
export async function sendWecomPlainTextMessage(pool, { toUser, content }) {
  const toUserStr = toUser == null ? '' : String(toUser).trim();
  if (!toUserStr) {
    const e = new Error('MISSING_RECIPIENT');
    e.code = 'MISSING_RECIPIENT';
    throw e;
  }
  const [cfgRows] = await pool.query(
    'SELECT corp_id AS corpId, agent_id AS agentId, corp_secret AS corpSecret FROM wecom_config WHERE id=1 LIMIT 1'
  );
  const cfg = cfgRows?.[0];
  const corpId = cfg?.corpId ? String(cfg.corpId).trim() : '';
  const corpSecret = decryptWecomCorpSecret(cfg?.corpSecret);
  const agentId = cfg?.agentId != null ? Number(cfg.agentId) : 0;
  if (!corpId || !corpSecret || !agentId) {
    const e = new Error('WECOM_NOT_CONFIGURED');
    e.code = 'WECOM_NOT_CONFIGURED';
    throw e;
  }
  const token = await fetchWecomAccessToken(corpId, corpSecret);
  return wecomSendMessage(token, {
    touser: toUserStr,
    agentid: agentId,
    msgtype: 'text',
    text: { content: clampWecomText(content) }
  });
}

/** 拼企业微信里打开的绝对链接（合同审批、发货确认、OAuth 回调域名等） */
export function resolveWecomPublicBaseUrl() {
  const keys = ['PUBLIC_BASE_URL', 'WECOM_PUBLIC_BASE_URL', 'API_PUBLIC_URL'];
  for (const k of keys) {
    const raw = process.env[k];
    const b = String(raw || '')
      .trim()
      .replace(/\/+$/, '');
    if (b) return b;
  }
  return '';
}

async function resolveUserWecomUserid(pool, userId) {
  const uid = userId != null ? Number(userId) : NaN;
  if (!Number.isFinite(uid) || uid <= 0) return '';
  const [rows] = await pool.query(
    'SELECT wecom_userid FROM users WHERE id=? AND is_active=1 LIMIT 1',
    [uid]
  );
  const w = rows?.[0]?.wecom_userid != null ? String(rows[0].wecom_userid).trim() : '';
  return w || '';
}

/**
 * 财务收企业微信：优先 company_settings 的「快捷财务」账号；否则所有「财务」类别且填写了 wecom_userid 的员工。
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<string>} pipe 拼接的 touser，可能为空
 */
export async function resolveFinanceWecomTouser(pool) {
  const [comp] = await pool.query(
    'SELECT quick_role_finance_user_id AS uid FROM company_settings WHERE id=1 LIMIT 1'
  );
  const designated = comp?.[0]?.uid != null ? Number(comp[0].uid) : null;
  if (designated && Number.isFinite(designated) && designated > 0) {
    const [uRows] = await pool.query(
      'SELECT wecom_userid FROM users WHERE id=? AND is_active=1 LIMIT 1',
      [designated]
    );
    const w = uRows?.[0]?.wecom_userid != null ? String(uRows[0].wecom_userid).trim() : '';
    if (w) return w;
    return '';
  }
  const [rows] = await pool.query(
    `SELECT u.wecom_userid FROM users u
     INNER JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code = 'finance'
       AND u.wecom_userid IS NOT NULL AND TRIM(u.wecom_userid) <> ''`
  );
  const ids = (rows || []).map((r) => String(r.wecom_userid).trim()).filter(Boolean);
  return [...new Set(ids)].join('|');
}

/**
 * 仓库收企业微信：优先 company_settings「快捷仓库」账号；否则所有「仓库」类别且填写了 wecom_userid 的员工。
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<string>}
 */
export async function resolveWarehouseWecomTouser(pool) {
  const [comp] = await pool.query(
    'SELECT quick_role_warehouse_user_id AS uid FROM company_settings WHERE id=1 LIMIT 1'
  );
  const designated = comp?.[0]?.uid != null ? Number(comp[0].uid) : null;
  if (designated && Number.isFinite(designated) && designated > 0) {
    const [uRows] = await pool.query(
      'SELECT wecom_userid FROM users WHERE id=? AND is_active=1 LIMIT 1',
      [designated]
    );
    const w = uRows?.[0]?.wecom_userid != null ? String(uRows[0].wecom_userid).trim() : '';
    if (w) return w;
    return '';
  }
  const [rows] = await pool.query(
    `SELECT u.wecom_userid FROM users u
     INNER JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code = 'warehouse'
       AND u.wecom_userid IS NOT NULL AND TRIM(u.wecom_userid) <> ''`
  );
  const ids = (rows || []).map((r) => String(r.wecom_userid).trim()).filter(Boolean);
  return [...new Set(ids)].join('|');
}

/**
 * 品管收企业微信：所有「品管(qc)」类别且填写了 wecom_userid 的员工（pipe 拼接 touser）。
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<string>}
 */
export async function resolveQcWecomTouser(pool) {
  const [rows] = await pool.query(
    `SELECT u.wecom_userid FROM users u
     INNER JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code = 'qc'
       AND u.wecom_userid IS NOT NULL AND TRIM(u.wecom_userid) <> ''`
  );
  const ids = (rows || []).map((r) => String(r.wecom_userid).trim()).filter(Boolean);
  return [...new Set(ids)].join('|');
}

/**
 * 企业微信一键发货：操作者是否属于「财务通过后通知仓库」的收件人集合（与 resolveWarehouseWecomTouser 一致）。
 * 多人收同一卡片时链接相同，任一合格仓库同事 OAuth 后可发货；其他人 POST 会 403。
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} actorUserId users.id
 */
export async function isWarehouseWecomShipActor(pool, actorUserId) {
  const uid = Number(actorUserId);
  if (!Number.isFinite(uid) || uid <= 0) return false;
  const [rows] = await pool.query(
    'SELECT wecom_userid FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
    [uid]
  );
  const wx = rows?.[0]?.wecom_userid != null ? String(rows[0].wecom_userid).trim() : '';
  if (!wx) return false;
  const touser = await resolveWarehouseWecomTouser(pool);
  if (!touser || !String(touser).trim()) return false;
  const set = new Set(
    String(touser)
      .split('|')
      .map((x) => String(x || '').trim())
      .filter(Boolean)
  );
  return set.has(wx);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ templateCode: string, variables: Record<string, string|number|boolean|null|undefined>, toUser: string }} opts
 */
export async function sendWecomTemplateMessage(pool, { templateCode, variables, toUser }) {
  const toUserStr = toUser == null ? '' : String(toUser).trim();
  if (!toUserStr) {
    const e = new Error('MISSING_RECIPIENT');
    e.code = 'MISSING_RECIPIENT';
    throw e;
  }

  const [cfgRows] = await pool.query(
    'SELECT corp_id AS corpId, agent_id AS agentId, corp_secret AS corpSecret FROM wecom_config WHERE id=1 LIMIT 1'
  );
  const cfg = cfgRows?.[0];
  const corpId = cfg?.corpId ? String(cfg.corpId).trim() : '';
  const corpSecret = decryptWecomCorpSecret(cfg?.corpSecret);
  const agentId = cfg?.agentId != null ? Number(cfg.agentId) : 0;
  if (!corpId || !corpSecret || !agentId) {
    const e = new Error('WECOM_NOT_CONFIGURED');
    e.code = 'WECOM_NOT_CONFIGURED';
    throw e;
  }

  const [tr] = await pool.query(
    `SELECT code, msg_type AS msgType, title_template AS titleTemplate, body_template AS bodyTemplate,
            url_template AS urlTemplate, btntxt FROM wecom_notify_templates WHERE code=? LIMIT 1`,
    [templateCode]
  );
  const tpl = tr?.[0];
  if (!tpl) {
    const e = new Error('TEMPLATE_NOT_FOUND');
    e.code = 'TEMPLATE_NOT_FOUND';
    throw e;
  }

  const strVars = {};
  for (const [k, v] of Object.entries(variables || {})) {
    strVars[k] = v == null ? '' : String(v);
  }

  const msgType = String(tpl.msgType || '')
    .trim()
    .toLowerCase();
  let body = {
    touser: toUserStr,
    agentid: agentId
  };

  if (msgType === 'text') {
    body.msgtype = 'text';
    body.text = { content: applyWecomTemplate(tpl.bodyTemplate, strVars) };
  } else if (msgType === 'markdown') {
    body.msgtype = 'markdown';
    body.markdown = { content: applyWecomTemplate(tpl.bodyTemplate, strVars) };
  } else if (msgType === 'textcard') {
    const substitutedPreview = applyWecomTemplate(tpl.urlTemplate || '', strVars).trim();
    const cardUrl = resolveTextcardUrl(tpl.urlTemplate, strVars);
    if (!cardUrl) {
      const extra = diagnoseTextcardUrlFailure(tpl.urlTemplate, strVars, substitutedPreview);
      const e = new Error(
        `文本卡片跳转链接无效或为空（替换后：${substitutedPreview ? `"${substitutedPreview.slice(0, 160)}${substitutedPreview.length > 160 ? '…' : ''}"` : '空'}）。${extra || '须为 http(s) 完整地址。企业微信 errcode 41010: missing url。'}`
      );
      e.code = 'TEXTCARD_URL_EMPTY';
      e.detail = { substitutedUrl: substitutedPreview, templateUrl: tpl.urlTemplate };
      throw e;
    }
    body.msgtype = 'textcard';
    body.textcard = {
      title: applyWecomTemplate(tpl.titleTemplate || '', strVars),
      description: applyWecomTemplate(tpl.bodyTemplate, strVars),
      url: cardUrl,
      btntxt: (tpl.btntxt && String(tpl.btntxt)) || '详情'
    };
  } else {
    const e = new Error('UNSUPPORTED_MSG_TYPE');
    e.code = 'UNSUPPORTED_MSG_TYPE';
    throw e;
  }

  const token = await fetchWecomAccessToken(corpId, corpSecret);
  return wecomSendMessage(token, body);
}

/**
 * 销售订单事件：站内信后发企业微信（失败不影响业务流程；建议 await 以免进程收尾过早丢失发送）
 * @param {'submit'|'withdraw'|'batch_submit'|'cancel'} event — batch_submit/submit/cancel 使用提交类模板时由 templateCode 覆盖
 */
export async function tryNotifyFinanceWecomOrderEvent(
  pool,
  { event, notifyBody, orderRows, fromUserId, templateCode: templateOverride = null }
) {
  try {
    let templateCode = templateOverride;
    if (!templateCode) {
      templateCode =
        event === 'withdraw'
          ? WECOM_TEMPLATE_SALES_ORDER_WITHDRAW_FINANCE
          : WECOM_TEMPLATE_SALES_ORDER_SUBMIT_FINANCE;
    }
    const toUser = await resolveFinanceWecomTouser(pool);
    if (!toUser) return;

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) return;

    let fromUsername = '';
    if (fromUserId) {
      const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
      fromUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';
    }
    const first = orderRows?.[0] || {};
    const orderNo = first.order_no != null ? String(first.order_no) : '';
    const count = orderRows?.length != null ? String(orderRows.length) : '0';
    const detail = clampWecomText(notifyBody);
    const bizId =
      first.id != null && Number.isFinite(Number(first.id)) && Number(first.id) > 0
        ? Math.floor(Number(first.id))
        : null;

    let financeReviewUrl = '';
    try {
      const baseUrl = resolveWecomPublicBaseUrl();
      if (baseUrl && bizId) {
        const batchN = orderRows?.length != null ? Number(orderRows.length) : 1;
        const tok = signWecomFinanceReviewToken(bizId, Number.isFinite(batchN) && batchN >= 1 ? batchN : 1);
        financeReviewUrl = `${String(baseUrl).trim().replace(/\/+$/, '')}/api/public/wecom-finance-review?t=${encodeURIComponent(tok)}`;
      }
    } catch {
      financeReviewUrl = '';
    }

    await enqueueWecomNotify(pool, {
      eventType: templateCode,
      templateCode,
      toUser,
      variables: { detail, orderNo, count, fromUser: fromUsername, financeReviewUrl },
      bizType: 'sales_order',
      bizId
    });
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] finance order notify:', e?.message || e);
  }
}

/**
 * 财务通过后通知品管（企业微信）：与财务提交通知同一套变量（detail、orderNo、count、financeReviewUrl）。
 * 模板未配置、无收件人或链接变量无效时静默跳过。
 */
export async function tryNotifyQcWecomPendingQc(pool, { notifyBody, orderRows, fromUserId }) {
  try {
    const templateCode = WECOM_TEMPLATE_SALES_ORDER_PENDING_QC;
    const toUser = await resolveQcWecomTouser(pool);
    if (!toUser) return;

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) return;

    let fromUsername = '';
    if (fromUserId) {
      const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
      fromUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';
    }
    const first = orderRows?.[0] || {};
    const orderNo = first.order_no != null ? String(first.order_no) : '';
    const count = orderRows?.length != null ? String(orderRows.length) : '0';
    const detail = clampWecomText(notifyBody);
    const bizId =
      first.id != null && Number.isFinite(Number(first.id)) && Number(first.id) > 0
        ? Math.floor(Number(first.id))
        : null;

    let financeReviewUrl = '';
    try {
      const baseUrl = resolveWecomPublicBaseUrl();
      if (baseUrl && bizId) {
        const batchN = orderRows?.length != null ? Number(orderRows.length) : 1;
        const tok = signWecomFinanceReviewToken(bizId, Number.isFinite(batchN) && batchN >= 1 ? batchN : 1);
        financeReviewUrl = `${String(baseUrl).trim().replace(/\/+$/, '')}/api/public/wecom-finance-review?t=${encodeURIComponent(tok)}`;
      }
    } catch {
      financeReviewUrl = '';
    }

    await enqueueWecomNotify(pool, {
      eventType: templateCode,
      templateCode,
      toUser,
      variables: { detail, orderNo, count, fromUser: fromUsername, financeReviewUrl },
      bizType: 'sales_order',
      bizId
    });
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] qc pending notify:', e?.message || e);
  }
}

/**
 * 财务审核通过后通知仓库：每笔订单单独一条企业微信；文本卡片跳转确认页，仅在页内点击「完成发货」才更新状态。
 * （企业微信文本卡片的正文区域与底部按钮共用同一 url，无法做到「只按钮可点」；确认页规避误触发货。）
 * 依赖环境变量 PUBLIC_BASE_URL（绝对 HTTPS 根地址）、JWT_SECRET。
 */
export async function tryNotifyWarehouseWecomOrderApproved(pool, { orderRows, fromUserId }) {
  const list = orderRows?.length ? orderRows : [];
  if (!list.length) return;
  try {
    if (!process.env.JWT_SECRET) {
      // eslint-disable-next-line no-console
      console.warn('[wecom] warehouse approve notify skipped: JWT_SECRET not set');
      return;
    }
    const baseUrl = resolveWecomPublicBaseUrl();
    if (!baseUrl) {
      // eslint-disable-next-line no-console
      console.warn('[wecom] warehouse approve notify skipped: PUBLIC_BASE_URL empty (required for ship link)');
      return;
    }

    const templateCode = WECOM_TEMPLATE_SALES_ORDER_APPROVED_WAREHOUSE;
    const toUser = await resolveWarehouseWecomTouser(pool);
    if (!toUser) return;

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) return;

    let fromUsername = '';
    if (fromUserId) {
      const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
      fromUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';
    }

    const definitions = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    const enriched = await attachCustomerNamesToOrders(pool, list);

    const intro = '订单已通过品管（质检）审核，请备货发货。';
    for (const row of enriched) {
      try {
        const block = formatWarehouseWecomOrderDetail(row, definitions);
        const detail = clampWecomText(`${intro}\n\n${block}`);
        const orderNo = row.order_no != null ? String(row.order_no) : '';
        const shipToken = signWecomShipToken(row.id);
        const enc = encodeURIComponent(shipToken);
        const shipConfirmUrl = `${baseUrl}/api/public/wecom-order-ship-confirm?t=${enc}`;
        /** 与 shipConfirmUrl 同址：勿再在卡片 url 指向 GET /wecom-order-ship；执行发货仅在确认页内 POST */
        const shipUrl = shipConfirmUrl;

        const oid = row.id != null && Number.isFinite(Number(row.id)) && Number(row.id) > 0 ? Math.floor(Number(row.id)) : null;
        await enqueueWecomNotify(pool, {
          eventType: templateCode,
          templateCode,
          toUser,
          variables: {
            detail,
            orderNo,
            count: '1',
            fromUser: fromUsername,
            shipConfirmUrl,
            shipUrl
          },
          bizType: 'sales_order',
          bizId: oid
        });
      } catch (oneErr) {
        if (oneErr?.code === 'WECOM_NOT_CONFIGURED' || oneErr?.code === 'TEMPLATE_NOT_FOUND') return;
        // eslint-disable-next-line no-console
        console.warn('[wecom] warehouse order approved notify (single order):', row?.id, oneErr?.message || oneErr);
      }
    }
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] warehouse order approved notify:', e?.message || e);
  }
}

/**
 * 财务驳回订单后通知创建人（销售）的企业微信，正文与站内信摘要一致。
 */
export async function tryNotifySalesWecomOrderRejected(pool, { notifyBody, orderRows, fromUserId, toUserId }) {
  try {
    const uid = toUserId != null ? Number(toUserId) : NaN;
    if (!Number.isFinite(uid) || uid <= 0) return;

    const templateCode = WECOM_TEMPLATE_SALES_ORDER_REJECTED_SALES;
    const [uRows] = await pool.query(
      'SELECT wecom_userid FROM users WHERE id=? AND is_active=1 LIMIT 1',
      [uid]
    );
    const toUser = uRows?.[0]?.wecom_userid != null ? String(uRows[0].wecom_userid).trim() : '';
    if (!toUser) return;

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) return;

    let fromUsername = '';
    if (fromUserId) {
      const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
      fromUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';
    }
    const first = orderRows?.[0] || {};
    const orderNo = first.order_no != null ? String(first.order_no) : '';
    const count = orderRows?.length != null ? String(orderRows.length) : '0';
    const detail = clampWecomText(notifyBody);
    const bizId =
      first.id != null && Number.isFinite(Number(first.id)) && Number(first.id) > 0
        ? Math.floor(Number(first.id))
        : null;

    await enqueueWecomNotify(pool, {
      eventType: templateCode,
      templateCode,
      toUser,
      variables: { detail, orderNo, count, fromUser: fromUsername },
      bizType: 'sales_order',
      bizId
    });
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] sales order rejected notify:', e?.message || e);
  }
}

/**
 * 合同审批：企业微信通知审核人（文本卡片时链接变量一般为 {{reviewUrl}}）。
 * @param {{ chainStep?: { current: number, total: number } | null, urge?: { actorUsername?: string } | null }} opts
 */
export async function tryNotifyContractReviewerOnSubmit(
  pool,
  { contractRow, fromUserId, reviewerUserId, chainStep = null, urge = null }
) {
  let toUser = '';
  let wecomDetail = '';
  const templateCode = WECOM_TEMPLATE_CONTRACT_SUBMIT_REVIEWER;
  try {
    const toUid = reviewerUserId != null ? reviewerUserId : contractRow?.reviewer_user_id;
    const contractNo = contractRow?.contract_no != null ? String(contractRow.contract_no) : '';

    if (!toUid) {
      // eslint-disable-next-line no-console
      console.warn(`[wecom] contract submit notify skipped: contract ${contractNo} has no reviewer_user_id`);
      return;
    }

    toUser = await resolveUserWecomUserid(pool, toUid);
    if (!toUser) {
      const [userRows] = await pool.query(
        'SELECT username, wecom_userid, is_active FROM users WHERE id=? LIMIT 1',
        [toUid]
      );
      const user = userRows?.[0];
      // eslint-disable-next-line no-console
      console.warn(
        `[wecom] contract submit notify skipped: contract ${contractNo} reviewer userId=${toUid} ` +
        `(username=${user?.username || 'unknown'}) ` +
        `wecom_userid=${user?.wecom_userid || 'null'}, is_active=${user?.is_active}`
      );
      return;
    }

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) {
      // eslint-disable-next-line no-console
      console.warn(`[wecom] contract submit notify skipped: template ${templateCode} not found`);
      return;
    }

    let fromUsername = '';
    if (fromUserId) {
      const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
      fromUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';
    }

    const customerName =
      contractRow?.linked_customer_name != null
        ? String(contractRow.linked_customer_name)
        : contractRow?.customer_name != null
        ? String(contractRow.customer_name)
        : '';

    const urgeActor =
      urge && urge.actorUsername != null ? String(urge.actorUsername).trim() : '';
    const built = buildContractReviewerNotifyMessages({
      contractNo,
      customerName,
      chainStep,
      urge: !!urge,
      actorUsername: urgeActor
    });
    const notificationTitle = built.notificationTitle;
    wecomDetail = built.wecomDetail;

    let reviewUrl = '';
    try {
      const base = resolveWecomPublicBaseUrl();
      const cid = contractRow?.id != null ? Number(contractRow.id) : NaN;
      const tid = Number(toUid);
      if (base && process.env.JWT_SECRET && Number.isFinite(cid) && cid > 0 && Number.isFinite(tid) && tid > 0) {
        const tok = signWecomContractReviewToken(cid, tid);
        reviewUrl = `${base}/api/public/wecom-contract-review?t=${encodeURIComponent(tok)}`;
      } else if (!base || !process.env.JWT_SECRET) {
        // eslint-disable-next-line no-console
        console.warn(
          `[wecom] contract reviewUrl cannot be built for ${contractNo}: ` +
            `${!base ? 'PUBLIC_BASE_URL is empty' : ''}${!base && !process.env.JWT_SECRET ? '; ' : ''}` +
            `${!process.env.JWT_SECRET ? 'JWT_SECRET is empty' : ''}. Textcard requires https link.`
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[wecom] contract reviewUrl omitted:', e?.message || e);
    }

    const cid =
      contractRow?.id != null && Number.isFinite(Number(contractRow.id)) && Number(contractRow.id) > 0
        ? Math.floor(Number(contractRow.id))
        : null;
    await enqueueWecomNotify(pool, {
      eventType: templateCode,
      templateCode,
      toUser,
      variables: {
        detail: wecomDetail,
        notificationTitle,
        contractNo,
        customerName,
        fromUser: fromUsername,
        reviewUrl
      },
      bizType: 'sales_contract',
      bizId: cid
    });
    // eslint-disable-next-line no-console
    console.log(`[wecom] contract submit notify queued: contract ${contractNo} -> reviewer userId=${toUid}`);
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] contract submit notify error:', e?.message || e);
  }
}

/**
 * 合同审核后，将审核结果通过企业微信发给创建人。
 */
export async function tryNotifyContractCreatorOnReview(
  pool,
  { contractRow, notifyBody, fromUserId, result, reviewComment = '' }
) {
  try {
    const templateCode = WECOM_TEMPLATE_CONTRACT_REVIEW_RESULT;
    const creatorId = contractRow?.created_by;
    const contractNo = contractRow?.contract_no != null ? String(contractRow.contract_no) : '';

    if (!creatorId) {
      // eslint-disable-next-line no-console
      console.warn(`[wecom] contract review notify skipped: contract ${contractNo} has no created_by`);
      return;
    }

    const toUser = await resolveUserWecomUserid(pool, creatorId);
    if (!toUser) {
      // 检查是企业微信未配置还是用户未绑定
      const [userRows] = await pool.query(
        'SELECT username, wecom_userid, is_active FROM users WHERE id=? LIMIT 1',
        [creatorId]
      );
      const user = userRows?.[0];
      // eslint-disable-next-line no-console
      console.warn(
        `[wecom] contract review notify skipped: contract ${contractNo} creator userId=${creatorId} ` +
        `(username=${user?.username || 'unknown'}) ` +
        `wecom_userid=${user?.wecom_userid || 'null'}, is_active=${user?.is_active}`
      );
      return;
    }

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) {
      // eslint-disable-next-line no-console
      console.warn(`[wecom] contract review notify skipped: template ${templateCode} not found`);
      return;
    }

    let fromUsername = '';
    if (fromUserId) {
      const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
      fromUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';
    }

    const customerName =
      contractRow?.linked_customer_name != null
        ? String(contractRow.linked_customer_name)
        : contractRow?.customer_name != null
        ? String(contractRow.customer_name)
        : '';
    const detail = clampWecomText(notifyBody);
    const statusLabel = result === 'approved' ? '已通过' : '已驳回';
    const reviewCommentText = reviewComment == null ? '' : String(reviewComment);

    const cid =
      contractRow?.id != null && Number.isFinite(Number(contractRow.id)) && Number(contractRow.id) > 0
        ? Math.floor(Number(contractRow.id))
        : null;
    await enqueueWecomNotify(pool, {
      eventType: templateCode,
      templateCode,
      toUser,
      variables: {
        detail,
        contractNo,
        customerName,
        fromUser: fromUsername,
        statusLabel,
        contractReviewStatus: statusLabel,
        reviewComment: reviewCommentText
      },
      bizType: 'sales_contract',
      bizId: cid
    });
    // eslint-disable-next-line no-console
    console.log(`[wecom] contract review notify queued: contract ${contractNo} -> userId=${creatorId}, result=${result}`);
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] contract review notify error:', e?.message || e);
  }
}
