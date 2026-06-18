import { enqueueWecomNotify } from './wecomNotifyOutbox.js';
import { resolveFinanceWecomTouser } from './wecomFinanceRecipients.js';
import { resolveAdminPublicRoot, resolveWecomPublicBaseUrl } from './wecomPublicUrl.js';

function clampWecomText(str, maxLen = 1900) {
  const s = str == null ? '' : String(str);
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 20)}\n…（已截断）`;
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

export const WECOM_TEMPLATE_INVOICE_SUBMIT_FINANCE = 'sales_invoice_submit_finance';
export const WECOM_TEMPLATE_INVOICE_WITHDRAW_FINANCE = 'sales_invoice_withdraw_finance';
export const WECOM_TEMPLATE_INVOICE_FULFILLED_APPLICANT = 'sales_invoice_fulfilled_applicant';
export const WECOM_TEMPLATE_INVOICE_DELETED_FINANCE = 'sales_invoice_deleted_finance';
export const WECOM_TEMPLATE_INVOICE_DELETED_APPLICANT = 'sales_invoice_deleted_applicant';

/** 与站内信、企业微信共用：开票金额格式化 */
export function formatInvoiceAmountZh(inv) {
  return Number(inv?.amount || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/** 财务/站内信摘要正文 */
export function buildFinanceInvoiceNotifyBody(actionLabel, inv) {
  const amount = formatInvoiceAmountZh(inv);
  return `${actionLabel}：合同 ${inv?.contract_no || ''}，客户 ${inv?.customer_name || ''}，开票金额 ${amount} 元。请在开票中心回填发票号码、发票代码与发票链接。`;
}

export { resolveAdminPublicRoot, resolveWecomPublicBaseUrl } from './wecomPublicUrl.js';

/** 管理后台开票中心 Hash 路由（引导页「打开开票中心」按钮用） */
export function resolveAdminInvoiceCenterHref(invoiceId) {
  const root = resolveAdminPublicRoot();
  if (!root) return '';
  const id = invoiceId != null ? Number(invoiceId) : NaN;
  const focus =
    Number.isFinite(id) && id >= 1 ? `?status=pending_finance&focus_invoice_id=${Math.floor(id)}` : '';
  return `${root}/#/sales/invoices${focus}`;
}

/**
 * 企业微信文本卡片链接：须走 API 域引导页（与 wecom-finance-review 一致）。
 * PUBLIC_BASE_URL 指向 Node API；勿直接填 #/sales/invoices，否则企微内常「无法打开页面」。
 */
export function resolveWecomInvoiceCenterPublicUrl(invoiceId) {
  const apiBase = String(resolveWecomPublicBaseUrl() || '').trim().replace(/\/+$/, '');
  if (!apiBase) return '';
  const id = invoiceId != null ? Number(invoiceId) : NaN;
  const q = Number.isFinite(id) && id >= 1 ? `?invoice_id=${Math.floor(id)}` : '';
  return `${apiBase}/api/public/wecom-invoice-center${q}`;
}

/** @deprecated 请用 resolveWecomInvoiceCenterPublicUrl（企微卡片）或 resolveAdminInvoiceCenterHref（后台直链） */
export function resolveInvoiceCenterUrl(invoiceId) {
  return resolveWecomInvoiceCenterPublicUrl(invoiceId);
}

async function resolveFromUsername(pool, fromUserId) {
  if (!fromUserId) return '';
  const [ur] = await pool.query('SELECT username FROM users WHERE id=? LIMIT 1', [fromUserId]);
  return ur?.[0]?.username != null ? String(ur[0].username) : '';
}

function invoiceWecomVariables(inv, { detail, fromUser, invoiceCenterUrl, invoiceNo, invoiceCode }) {
  return {
    detail: clampWecomText(detail),
    contractNo: inv?.contract_no != null ? String(inv.contract_no) : '',
    customerName: inv?.customer_name != null ? String(inv.customer_name) : '',
    amount: formatInvoiceAmountZh(inv),
    fromUser: fromUser != null ? String(fromUser) : '',
    invoiceCenterUrl: invoiceCenterUrl != null ? String(invoiceCenterUrl) : '',
    invoiceNo: invoiceNo != null ? String(invoiceNo) : '',
    invoiceCode: invoiceCode != null ? String(invoiceCode) : ''
  };
}

/**
 * 开票事件 → 财务（提交/撤销/删除待开票）
 * @param {'submit'|'withdraw'|'delete'} event
 */
export async function tryNotifyFinanceWecomInvoiceEvent(
  pool,
  { event, inv, notifyBody, fromUserId, templateCode: templateOverride = null }
) {
  try {
    const templateCode =
      templateOverride ||
      (event === 'withdraw'
        ? WECOM_TEMPLATE_INVOICE_WITHDRAW_FINANCE
        : event === 'delete'
          ? WECOM_TEMPLATE_INVOICE_DELETED_FINANCE
          : WECOM_TEMPLATE_INVOICE_SUBMIT_FINANCE);
    const toUser = await resolveFinanceWecomTouser(pool);
    if (!toUser) return;

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) return;

    const fromUsername = await resolveFromUsername(pool, fromUserId);
    const invoiceId =
      inv?.id != null && Number.isFinite(Number(inv.id)) && Number(inv.id) > 0
        ? Math.floor(Number(inv.id))
        : null;
    const invoiceCenterUrl = resolveWecomInvoiceCenterPublicUrl(invoiceId);

    await enqueueWecomNotify(pool, {
      eventType: templateCode,
      templateCode,
      toUser,
      variables: invoiceWecomVariables(inv, {
        detail: notifyBody,
        fromUser: fromUsername,
        invoiceCenterUrl
      }),
      bizType: 'contract_invoice',
      bizId: invoiceId
    });
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] finance invoice notify:', e?.message || e);
  }
}

/**
 * 开票完成或删除已开票 → 申请人
 * @param {'fulfilled'|'delete'} event
 */
export async function tryNotifyApplicantWecomInvoiceEvent(
  pool,
  { event, inv, notifyBody, fromUserId, invoiceNo = '', invoiceCode = '' }
) {
  try {
    const templateCode =
      event === 'delete'
        ? WECOM_TEMPLATE_INVOICE_DELETED_APPLICANT
        : WECOM_TEMPLATE_INVOICE_FULFILLED_APPLICANT;
    const applicantId = inv?.created_by != null ? Number(inv.created_by) : NaN;
    if (!Number.isFinite(applicantId) || applicantId < 1) return;
    if (fromUserId != null && Number(fromUserId) === applicantId) return;

    const toUser = await resolveUserWecomUserid(pool, applicantId);
    if (!toUser) return;

    const [tplCheck] = await pool.query('SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1', [
      templateCode
    ]);
    if (!tplCheck?.length) return;

    const fromUsername = await resolveFromUsername(pool, fromUserId);
    const invoiceId =
      inv?.id != null && Number.isFinite(Number(inv.id)) && Number(inv.id) > 0
        ? Math.floor(Number(inv.id))
        : null;

    await enqueueWecomNotify(pool, {
      eventType: templateCode,
      templateCode,
      toUser,
      variables: invoiceWecomVariables(inv, {
        detail: notifyBody,
        fromUser: fromUsername,
        invoiceCenterUrl: resolveWecomInvoiceCenterPublicUrl(invoiceId),
        invoiceNo,
        invoiceCode
      }),
      bizType: 'contract_invoice',
      bizId: invoiceId
    });
  } catch (e) {
    if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'TEMPLATE_NOT_FOUND') return;
    // eslint-disable-next-line no-console
    console.warn('[wecom] applicant invoice notify:', e?.message || e);
  }
}
