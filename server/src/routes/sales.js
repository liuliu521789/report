import { Router } from 'express';
import { createReadStream } from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import XLSX from 'xlsx';
import QRCode from 'qrcode';

import { getPool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { hasPermission } from '../lib/permissions.js';
import { logOperationFromReq } from '../lib/audit.js';
import {
  loadOrderFieldDefinitions,
  validateOrderDataInput,
  dataJsonToLegacyColumns,
  mergeRowDataJson,
  attachCustomerNamesToOrders,
  MAPS_TO_KEYS,
  normalizeOrderDateInput,
  importHeaderSynonymsForField,
  splitLabelWarehouseCell
} from '../lib/salesOrderFields.js';
import {
  tryNotifyFinanceWecomOrderEvent,
  tryNotifyWarehouseWecomOrderApproved,
  tryNotifySalesWecomOrderRejected,
  WECOM_TEMPLATE_SALES_ORDER_WITHDRAW_FINANCE,
  tryNotifyContractReviewerOnSubmit,
  tryNotifyContractCreatorOnReview
} from '../lib/wecomNotify.js';
import { fillContractTemplate, formatSigningDateZhShanghai, shanghaiYmdCompact } from '../lib/contractTemplateFill.js';
import { amountToRmbUppercase } from '../lib/chineseMoney.js';
import { buildContractOrderLinesHtml } from '../lib/contractOrderLines.js';

export const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const contractDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  /** 默认 latin1 会把 UTF-8 中文标题/文件名解成乱码 */
  defParamCharset: 'utf8'
});

const CONTRACT_DOCUMENT_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

/** 上传的文档合同在 body_html 中的占位说明（列表/详情提示用，正文以文件为准） */
const UPLOAD_CONTRACT_BODY_HTML = `<div style="font-family:SimSun,宋体;font-size:14px;color:#666;padding:16px;line-height:1.7">本合同正文为上传的电子文档（PDF / Word / 图片等），请在预览或详情中查看、下载文件。</div>`;

function contractDocumentMimeOk(mime) {
  const m = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return CONTRACT_DOCUMENT_MIMES.has(m);
}

function safeContractDocumentStoredBaseName(original) {
  const base = path
    .basename(String(original || 'file'))
    .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]+/g, '_')
    .slice(0, 160);
  return base || 'file';
}

function contentDispositionHeader(downloadName) {
  const name = String(downloadName || 'file');
  const ascii = name.replace(/[^\x20-\x7E]+/g, '_').slice(0, 180) || 'file';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function unlinkSalesContractUploadDocuments(pool, contractIds) {
  const ids = [...new Set(contractIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 1))];
  if (!ids.length) return;
  const ph = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT document_stored_rel_path FROM sales_contracts WHERE id IN (${ph}) AND contract_source = 'upload'`,
    ids
  );
  const root = path.resolve(process.cwd(), 'uploads');
  for (const r of rows) {
    const rel = String(r.document_stored_rel_path || '').replace(/\\/g, '/').replace(/^(\.\.\/)+/, '');
    if (!rel || rel.includes('..')) continue;
    const full = path.resolve(root, rel);
    if (!full.startsWith(root)) continue;
    await fsPromises.unlink(full).catch(() => {});
  }
}

function resolveContractUploadFilePath(row) {
  if (!row || row.contract_source !== 'upload') return null;
  const root = path.resolve(process.cwd(), 'uploads');
  const rel = String(row.document_stored_rel_path || '').replace(/\\/g, '/').replace(/^(\.\.\/)+/, '');
  if (!rel || rel.includes('..')) return null;
  const full = path.resolve(root, rel);
  if (!full.startsWith(root)) return null;
  return full;
}

/** 导入表头与模板对齐：去 BOM、空白、可选前导 *（截图常用）、全角斜杠等 */
function normalizeImportHeaderLabel(raw) {
  let s = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/^[\s\u3000]+|[\s\u3000]+$/g, '')
    .trim();
  s = s.replace(/^[\*＊※]\s*/, '').trim();
  s = s.replace(/\uFF0F/g, '/');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

function coerceImportCell(v, fieldType) {
  if (v === null || v === undefined || v === '') {
    return fieldType === 'number' || fieldType === 'positive_number' ? null : '';
  }
  if (fieldType === 'date') {
    const r = normalizeOrderDateInput(v);
    if (r.ok) return r.value;
    return String(v == null ? '' : v)
      .replace(/^[\s\u3000]+|[\s\u3000]+$/g, '')
      .trim();
  }
  if (fieldType === 'number' || fieldType === 'positive_number') {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : v;
  }
  return String(v);
}

function publicBaseUrl() {
  const b = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return b || '';
}

function isSuper(req) {
  return req.user?.accountType === 'super_admin';
}

/** 当前登录用户数字 ID；mysql2 禁止占位符为 undefined，缺 userId 时回退 JWT sub */
function authenticatedNumericUserId(req) {
  const raw = req.user?.userId ?? req.user?.sub;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** BIGINT 等可能无法被 res.json 序列化（如 BigInt） */
function jsonSafeSalesInternalMessageRow(r) {
  const n = (v) => (typeof v === 'bigint' ? Number(v) : v);
  return {
    id: n(r.id),
    category: r.category,
    title: r.title,
    body_text: r.body_text,
    ref_type: r.ref_type,
    ref_id: r.ref_id == null ? null : n(r.ref_id),
    read_at: r.read_at,
    created_at: r.created_at
  };
}

function perm(req, mod, key) {
  if (isSuper(req)) return true;
  return hasPermission(req.user?.permissions, mod, key);
}

/**
 * 是否不按 created_by 过滤订单列表。
 * order_query_all：显式查看全员订单。
 * 财务审单 / 仓库发货必须看到销售等他人录入的单据；若仅靠 order_query、未开 order_query_all，列表会只剩本人 created_by，待审核/待发货常为空。
 */
function canViewAllSalesOrders(req) {
  if (isSuper(req)) return true;
  if (perm(req, 'order_management', 'order_query_all')) return true;
  if (perm(req, 'order_management', 'order_status_finance')) return true;
  if (perm(req, 'order_management', 'order_status_warehouse')) return true;
  return false;
}

/** 确认发货：独立权限 order_ship；保留 order_status_warehouse 以兼容旧数据（原「仓库发货」勾选项） */
function canMarkOrderShipped(req) {
  if (isSuper(req)) return true;
  if (perm(req, 'order_management', 'order_ship')) return true;
  if (perm(req, 'order_management', 'order_status_warehouse')) return true;
  return false;
}

function isOrderCreatedByCurrentUser(row, req) {
  if (!row || req.user?.userId == null) return false;
  if (row.created_by == null) return false;
  return Number(row.created_by) === Number(req.user.userId);
}

async function fetchSalesContractRow(pool, id) {
  const nid = Number(id);
  if (!Number.isFinite(nid) || nid < 1) return null;
  const [rows] = await pool.query(
    `SELECT c.*, cu.customer_name FROM sales_contracts c
     INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ? LIMIT 1`,
    [nid]
  );
  return rows[0] || null;
}

/** 与 GET /contracts/:id 一致：能否查看该合同 */
async function assertSalesContractVisible(req, pool, c) {
  if (!c) return { ok: false, code: 'NOT_FOUND' };
  const seeAll = canViewAllSalesOrders(req);
  if (seeAll) return { ok: true, contract: c };
  if (isOrderCreatedByCurrentUser(c, req)) return { ok: true, contract: c };
  const [chk] = await pool.query(
    'SELECT 1 FROM sales_orders WHERE customer_id = ? AND created_by = ? LIMIT 1',
    [c.customer_id, req.user.userId]
  );
  if (!chk.length) return { ok: false, code: 'FORBIDDEN' };
  return { ok: true, contract: c };
}

/** 修改/删除：超级管理员任意；普通员工仅本人创建的合同 */
function canMutateSalesContractAsCreator(req, c) {
  if (isSuper(req)) return true;
  return isOrderCreatedByCurrentUser(c, req);
}

function contractStatusAllowsEdit(c, req) {
  if (isSuper(req)) return true;
  return c.status === 'draft' || c.status === 'rejected';
}

function contractStatusAllowsDelete(c, req) {
  if (isSuper(req)) return true;
  return c.status === 'draft' || c.status === 'rejected';
}

/**
 * 订单管理列表的「纯财务」视图：仅有财务审核权、且不能录入/导入订单的账号。
 * 只能看到销售已点击「提交审核」的订单（submitted_for_review_at 非空）；
 * Excel/手工录入后未提交的单据不会出现。避免误给财务开通 order_input 导致看到全量。
 * 超级管理员、有 order_input 的账号（销售/销售管理员等）仍看全量。
 */
function isPureFinanceOrderScope(req) {
  if (isSuper(req)) return false;
  if (!perm(req, 'order_management', 'order_status_finance')) return false;
  if (perm(req, 'order_management', 'order_input')) return false;
  return true;
}

function financeOrderListScopeSql(req) {
  if (!isPureFinanceOrderScope(req)) return { sql: '', args: [] };
  return {
    sql: ' AND o.submitted_for_review_at IS NOT NULL',
    args: []
  };
}

/**
 * 列表日期范围：默认按上传时间 created_at。
 * 勾选「仅待财务审核」：按提交审核时间 submitted_for_review_at。
 * 纯财务视图（仅有财务审单、无 order_input）：列表只含已提交过的订单，日期也按 submitted_for_review_at，
 * 避免「很久以前录入、今天才提交」的订单有通知但列表为空。
 */
function appendOrderListDateRange(sql, args, q, req) {
  const end = q.date_to ? new Date(q.date_to) : new Date();
  const start = q.date_from ? new Date(q.date_from) : new Date(end.getTime() - 30 * 86400000);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  if (q.pending_finance_only) {
    sql += " AND o.status = 'pending_review' AND o.submitted_for_review_at IS NOT NULL";
    sql += ' AND o.submitted_for_review_at >= ? AND o.submitted_for_review_at < DATE_ADD(?, INTERVAL 1 DAY)';
    args.push(startStr, endStr);
  } else if (isPureFinanceOrderScope(req)) {
    sql += ' AND o.submitted_for_review_at >= ? AND o.submitted_for_review_at < DATE_ADD(?, INTERVAL 1 DAY)';
    args.push(startStr, endStr);
  } else {
    sql += ' AND o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
    args.push(startStr, endStr);
  }
  return sql;
}

function assertFinanceOrderListScope(req, row) {
  if (!row) return;
  if (!isPureFinanceOrderScope(req)) return;
  if (row.submitted_for_review_at == null) {
    const e = new Error('FORBIDDEN');
    e.code = 'FORBIDDEN';
    throw e;
  }
}

/** DB 字段 body_text VARCHAR(2048)，统一截断避免写入失败 */
function clampInternalMessageBody(text, maxLen = 2000) {
  const s = text == null ? '' : String(text);
  if (s.length <= maxLen) return s || null;
  return `${s.slice(0, maxLen - 24)}\n…（正文过长已截断，请到订单管理查看）`;
}

/** 站内信类型：notice 普通通知、todo 待办、system 系统类（预留） */
function normalizeInternalMessageCategory(raw) {
  const s = raw == null ? '' : String(raw);
  if (s === 'todo' || s === 'system') return s;
  return 'notice';
}

async function notifyUsersByCategory(pool, categoryCode, { title, bodyText, fromUserId, refType, refId, msgCategory }) {
  const body = clampInternalMessageBody(bodyText);
  const kind = normalizeInternalMessageCategory(msgCategory);
  const [users] = await pool.query(
    `SELECT u.id FROM users u
     INNER JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code = ?`,
    [categoryCode]
  );
  for (const u of users) {
    await pool.query(
      `INSERT INTO sales_internal_messages (to_user_id, from_user_id, category, title, body_text, ref_type, ref_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [u.id, fromUserId || null, kind, title, body, refType || null, refId || null]
    );
  }
}

async function notifyUser(pool, toUserId, { title, bodyText, fromUserId, refType, refId, msgCategory }) {
  const body = clampInternalMessageBody(bodyText);
  const kind = normalizeInternalMessageCategory(msgCategory);
  await pool.query(
    `INSERT INTO sales_internal_messages (to_user_id, from_user_id, category, title, body_text, ref_type, ref_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [toUserId, fromUserId || null, kind, title, body, refType || null, refId || null]
  );
}

function uniquePositiveIds(ids) {
  return [...new Set((ids || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))].slice(
    0,
    200
  );
}

/** 某部门及其下级部门 id（含自身），用于按组织架构筛选审批人 */
async function departmentSubtreeIds(pool, rootId) {
  const out = [rootId];
  let frontier = [rootId];
  for (let i = 0; i < 64 && frontier.length; i += 1) {
    const [rows] = await pool.query(
      `SELECT id FROM departments WHERE parent_id IN (${frontier.map(() => '?').join(',')})`,
      frontier
    );
    frontier = rows.map((r) => r.id);
    for (const id of frontier) out.push(id);
  }
  return [...new Set(out)];
}

/** 单条订单摘要：发货日期（表单单据）、上传日期（入库时间）、厂家、型号、数量等 */
function formatOrderSummaryLine(row, definitions) {
  const { display_data } = mergeRowDataJson(row, definitions);
  const nameKey = definitions.find((d) => d.maps_to === 'customer_name')?.field_key;
  const modelKey = definitions.find((d) => d.maps_to === 'product_model')?.field_key;
  const whKey = definitions.find((d) => d.maps_to === 'warehouse_model')?.field_key;
  const qtyKey = definitions.find((d) => d.maps_to === 'quantity')?.field_key;
  const pick = (key, fallback) => {
    if (key != null && display_data[key] !== undefined && display_data[key] !== null) {
      const s = String(display_data[key]).trim();
      if (s !== '') return s;
    }
    if (fallback != null && fallback !== '') {
      const s = String(fallback).trim();
      if (s !== '') return s;
    }
    return '—';
  };
  const orderNo = row.order_no ? String(row.order_no) : '—';
  const vendor = pick(nameKey, row.customer_name);
  const model = pick(modelKey, row.product_model);
  const wh = pick(whKey, row.warehouse_model);
  const qty =
    qtyKey != null && display_data[qtyKey] !== undefined && display_data[qtyKey] !== null && String(display_data[qtyKey]).trim() !== ''
      ? String(display_data[qtyKey]).trim()
      : row.quantity != null && String(row.quantity) !== ''
        ? String(row.quantity)
        : '—';
  const orderDateKey = definitions.find((d) => d.field_key === 'order_date')?.field_key;
  const shipDate =
    orderDateKey != null && display_data[orderDateKey] !== undefined && display_data[orderDateKey] !== null
      ? String(display_data[orderDateKey]).trim() || '—'
      : '—';
  const uploadAt = formatOrderUploadTime(row.created_at);
  return `订单号：${orderNo}\n厂家：${vendor}\n发货日期：${shipDate}\n上传日期：${uploadAt}\n标签型号：${model}\n仓库型号：${wh}\n数量：${qty}`;
}

function formatOrderUploadTime(createdAt) {
  if (createdAt == null) return '—';
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(d.getTime())) return String(createdAt);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 多条订单站内信正文（intro + 逐条基础信息） */
function buildOrderMessageBody(definitions, rows, { intro = '', maxOrders = 15 } = {}) {
  const list = rows.slice(0, maxOrders);
  const blocks = list.map((r) => formatOrderSummaryLine(r, definitions));
  let body = '';
  if (intro) body += `${intro.trim()}\n\n`;
  body += blocks.join('\n\n');
  if (rows.length > maxOrders) {
    body += `\n\n… 另有 ${rows.length - maxOrders} 笔订单未逐条列出，请到订单管理查看。`;
  }
  return body;
}

async function buildOrderNotifyBody(pool, orderRows, options) {
  const definitions = await loadOrderFieldDefinitions(pool, { activeOnly: true });
  const enriched = await attachCustomerNamesToOrders(pool, orderRows);
  return buildOrderMessageBody(definitions, enriched, options);
}

/** 合同关联订单的站内信正文 */
async function buildContractOrdersNotifyBody(pool, contractId, { intro = '', customerName = '' } = {}) {
  const [ords] = await pool.query(
    `SELECT o.* FROM sales_orders o
     INNER JOIN sales_contract_orders sco ON sco.order_id = o.id
     WHERE sco.contract_id = ?
     ORDER BY o.id ASC`,
    [contractId]
  );
  let head = intro.trim();
  if (customerName) head += `${head ? '\n' : ''}客户/厂家：${customerName}`;
  return buildOrderNotifyBody(pool, ords || [], { intro: head, maxOrders: 15 });
}

async function generateUniqueOrderNo(conn) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const orderNo = `O${nanoid(16)}`;
    const [hit] = await conn.query('SELECT id FROM sales_orders WHERE order_no = ? LIMIT 1', [orderNo]);
    if (!hit.length) return orderNo;
  }
  const e = new Error('无法生成唯一订单号');
  e.code = 'ORDER_NO';
  throw e;
}

async function assertMapsToAvailable(pool, mapsTo, excludeId = null) {
  if (mapsTo == null || mapsTo === '') return;
  if (!MAPS_TO_KEYS.has(mapsTo)) {
    const e = new Error('无效的业务映射');
    e.code = 'BAD_MAPS_TO';
    throw e;
  }
  let sql = 'SELECT id FROM sales_order_field_definitions WHERE is_active = 1 AND maps_to = ?';
  const args = [mapsTo];
  if (excludeId != null) {
    sql += ' AND id <> ?';
    args.push(excludeId);
  }
  sql += ' LIMIT 1';
  const [r] = await pool.query(sql, args);
  if (r.length) {
    const e = new Error('该业务映射已被其他启用字段占用');
    e.code = 'MAPS_TO_CONFLICT';
    throw e;
  }
}

async function insertOrderWithData(conn, { userId, data, definitions, statusRemark = '新建订单' }) {
  const { errors, data: normalized } = validateOrderDataInput(definitions, data);
  if (errors.length) {
    const e = new Error('VALIDATION_FAILED');
    e.code = 'VALIDATION_FAILED';
    e.details = errors;
    throw e;
  }
  const leg = dataJsonToLegacyColumns(definitions, normalized);
  const codeKey = definitions.find((d) => d.maps_to === 'customer_code')?.field_key;
  const nameKey = definitions.find((d) => d.maps_to === 'customer_name')?.field_key;
  if (!codeKey && !nameKey) {
    const e = new Error('请至少配置「客户名称」映射字段');
    e.code = 'MISSING_CUSTOMER_FIELD';
    throw e;
  }
  const customerId = await getOrCreateCustomer(conn, {
    customer_code: codeKey ? normalized[codeKey] : '',
    customer_name: nameKey ? normalized[nameKey] : '',
    userId
  });
  const orderNo = await generateUniqueOrderNo(conn);
  const [ins] = await conn.query(
    `INSERT INTO sales_orders (order_no, customer_id, product_code, product_name, product_model, warehouse_model, quantity, unit_price, amount, remark, data_json, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), 'pending_review', ?)`,
    [
      orderNo,
      customerId,
      leg.product_code,
      leg.product_name,
      leg.product_model,
      leg.warehouse_model,
      leg.quantity,
      leg.unit_price,
      leg.amount,
      leg.remark,
      JSON.stringify(normalized),
      userId
    ]
  );
  await conn.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, NULL, 'pending_review', ?, ?)`,
    [ins.insertId, userId, statusRemark]
  );
  return { id: ins.insertId, order_no: orderNo };
}

async function generateCustomerCode(conn, baseName) {
  const head = 'C';
  const safe = String(baseName || '').replace(/\s+/g, '').slice(0, 6) || 'AUTO';
  for (let i = 0; i < 8; i++) {
    const code = `${head}${safe}-${nanoid(6).toUpperCase()}`;
    const [hit] = await conn.query('SELECT id FROM sales_customers WHERE customer_code = ? LIMIT 1', [code]);
    if (!hit.length) return code;
  }
  const fallback = `C${nanoid(10).toUpperCase()}`;
  return fallback;
}

async function getOrCreateCustomer(conn, { customer_code, customer_name, userId }) {
  const code = String(customer_code || '').trim();
  const name = String(customer_name || '').trim();
  if (!code && !name) {
    const e = new Error('客户名称必填');
    e.code = 'VALIDATION';
    throw e;
  }
  if (code) {
    const [exist] = await conn.query('SELECT id FROM sales_customers WHERE customer_code = ? LIMIT 1', [code]);
    if (exist.length) return exist[0].id;
    const [ins] = await conn.query(
      `INSERT INTO sales_customers (customer_code, customer_name, created_by) VALUES (?, ?, ?)`,
      [code, name || code, userId || null]
    );
    return ins.insertId;
  }
  // 无编号时，按名称找；没有则自动生成编号
  const [byName] = await conn.query('SELECT id FROM sales_customers WHERE customer_name = ? LIMIT 1', [name]);
  if (byName.length) return byName[0].id;
  const autoCode = await generateCustomerCode(conn, name);
  const [ins] = await conn.query(
    `INSERT INTO sales_customers (customer_code, customer_name, created_by) VALUES (?, ?, ?)`,
    [autoCode, name || autoCode, userId || null]
  );
  return ins.insertId;
}

async function loadQcMap(pool, productModels) {
  const keys = [...new Set(productModels.map((m) => String(m || '').trim().toLowerCase()).filter(Boolean))];
  const map = new Map();
  if (!keys.length) return map;
  const placeholders = keys.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT LOWER(TRIM(r.product_name)) AS pk, MIN(q.id) AS qrcode_id, MIN(q.token) AS token
     FROM reports r
     INNER JOIN qrcode_reports qr ON qr.report_id = r.id
     INNER JOIN qrcodes q ON q.id = qr.qrcode_id
     WHERE r.status = 'active' AND LOWER(TRIM(r.product_name)) IN (${placeholders})
     GROUP BY LOWER(TRIM(r.product_name))`,
    keys
  );
  for (const r of rows) {
    map.set(r.pk, { qrcodeId: r.qrcode_id, token: r.token });
  }
  return map;
}

/** 质检展示：手动绑定 qc_qrcode_id 优先；否则按标签型号匹配报告。生成列表用缩略图 data URL */
async function enrichOrdersQc(pool, rows, qcMap) {
  const manualIds = [
    ...new Set(rows.map((r) => Number(r.qc_qrcode_id)).filter((n) => Number.isFinite(n) && n > 0))
  ];
  const tokenByQrId = new Map();
  if (manualIds.length) {
    const ph = manualIds.map(() => '?').join(',');
    const [qrs] = await pool.query(`SELECT id, token FROM qrcodes WHERE id IN (${ph})`, manualIds);
    for (const q of qrs) tokenByQrId.set(Number(q.id), q.token);
  }
  const base = publicBaseUrl();
  const baseRows = rows.map((o) => {
    let qrcodeId = o.qc_qrcode_id != null && Number(o.qc_qrcode_id) > 0 ? Number(o.qc_qrcode_id) : null;
    let token = null;
    let qcBoundManual = false;

    if (qrcodeId) {
      token = tokenByQrId.get(qrcodeId) || null;
      qcBoundManual = true;
    } else {
      const pk = String(o.product_model || '').trim().toLowerCase();
      const qc = pk ? qcMap.get(pk) : null;
      if (qc?.token) {
        qrcodeId = Number(qc.qrcodeId);
        token = qc.token;
      }
    }

    let qcReportLabel = '无可用报告';
    let qcPublicUrl = null;
    if (token) {
      qcReportLabel = `二维码#${qrcodeId}`;
      qcPublicUrl = base
        ? `${base}/api/public/qr/${encodeURIComponent(token)}`
        : `/api/public/qr/${encodeURIComponent(token)}`;
    } else if (qcBoundManual && qrcodeId) {
      qcReportLabel = '绑定已失效';
    }

    return {
      ...o,
      qc_qrcode_id: qrcodeId,
      qc_token: token,
      qc_public_url: qcPublicUrl,
      qc_report_label: qcReportLabel,
      qc_bound_manual: qcBoundManual
    };
  });

  const thumbs = await Promise.all(
    baseRows.map((o) =>
      o.qc_public_url
        ? QRCode.toDataURL(o.qc_public_url, { margin: 1, width: 72, errorCorrectionLevel: 'M' })
        : Promise.resolve(null)
    )
  );
  return baseRows.map((o, i) => ({ ...o, qc_thumb_data_url: thumbs[i] }));
}

function orderEditable(row) {
  if (row.status === 'rejected') return true;
  if (row.status === 'pending_review' && !row.submitted_for_review_at) return true;
  return false;
}

/** 行级删除授权：销售本人可硬删除自己单据的任意状态；财务/超管不可删已完成/已取消；其他非财务账号仅在「待审且未提交」时可删本人草稿 */
function assertOrderDeleteAllowed(row, req) {
  const own = isOrderCreatedByCurrentUser(row, req);
  const finance = perm(req, 'order_management', 'order_status_finance');
  if (!isSuper(req) && !finance && own) {
    return;
  }
  if (['completed', 'cancelled'].includes(row.status)) {
    const e = new Error('INVALID_STATUS');
    e.code = 'INVALID_STATUS';
    throw e;
  }
  if (!isSuper(req) && !finance && !(own && row.status === 'pending_review' && !row.submitted_for_review_at)) {
    const e = new Error('FORBIDDEN');
    e.code = 'FORBIDDEN';
    throw e;
  }
}

router.use(requireAuth);

router.get('/order-fields', async (req, res, next) => {
  try {
    const can =
      perm(req, 'order_management', 'order_query') ||
      perm(req, 'order_management', 'order_input') ||
      perm(req, 'order_management', 'order_field_config');
    if (!can) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const all = perm(req, 'order_management', 'order_field_config') && String(req.query.all) === '1';
    const items = await loadOrderFieldDefinitions(pool, { activeOnly: !all });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});

const patchOrderQcSchema = z.object({
  qrcode_id: z.union([z.number().int().positive(), z.null()])
});

/** 订单绑定二维码：可选列表（仅需订单查询权限，无需 qrcodes.list） */
router.get('/qrcodes/bind-candidates', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_query')) return res.status(403).json({ error: 'FORBIDDEN' });
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit || 80), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const pool = getPool();
    const base = publicBaseUrl();
    const where = [];
    const params = [];
    if (q) {
      where.push(
        `EXISTS (
        SELECT 1
        FROM qrcode_reports qr
        JOIN reports r ON r.id = qr.report_id
        WHERE qr.qrcode_id = qrc.id
          AND (r.product_name LIKE ? OR r.batch_no LIKE ?)
      )`
      );
      params.push(`%${q}%`, `%${q}%`);
    }
    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM qrcodes qrc ${sqlWhere}`, params);
    const total = Number(countRows?.[0]?.total || 0);
    const [idRows] = await pool.query(
      `SELECT qrc.id, qrc.token, qrc.created_at AS createdAt
       FROM qrcodes qrc
       ${sqlWhere}
       ORDER BY qrc.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    if (!idRows.length) return res.json({ items: [], total, limit, offset });

    const ids = idRows.map((r) => r.id);
    const [joinRows] = await pool.query(
      `SELECT q.id, q.token, r.product_name AS productName, r.batch_no AS batchNo
       FROM qrcodes q
       LEFT JOIN qrcode_reports qr ON qr.qrcode_id = q.id
       LEFT JOIN reports r ON r.id = qr.report_id
       WHERE q.id IN (${ids.map(() => '?').join(',')})
       ORDER BY q.id DESC, r.id DESC`,
      ids
    );
    const byId = new Map();
    for (const row of joinRows) {
      if (!byId.has(row.id)) {
        byId.set(row.id, { id: row.id, token: row.token, reportTags: [] });
      }
      const item = byId.get(row.id);
      if (row.productName || row.batchNo) {
        item.reportTags.push({ productName: row.productName || '', batchNo: row.batchNo || '' });
      }
    }
    const items = idRows.map((r) => {
      const it = byId.get(r.id) || { id: r.id, token: r.token, reportTags: [] };
      return { id: it.id, token: it.token, createdAt: r.createdAt, reportTags: it.reportTags };
    });
    for (const item of items) {
      const scanUrl = base
        ? `${base}/api/public/qr/${encodeURIComponent(item.token)}`
        : `/api/public/qr/${encodeURIComponent(item.token)}`;
      item.qrThumbDataUrl = await QRCode.toDataURL(scanUrl, { margin: 1, width: 72, errorCorrectionLevel: 'M' });
    }
    res.json({ items, total, limit, offset });
  } catch (e) {
    next(e);
  }
});

router.patch('/orders/:id/qc-qrcode', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_edit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const body = patchOrderQcSchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!canViewAllSalesOrders(req) && !isOrderCreatedByCurrentUser(row, req)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const qid = body.qrcode_id;
    if (qid != null) {
      const [qr] = await pool.query('SELECT id FROM qrcodes WHERE id = ? LIMIT 1', [qid]);
      if (!qr.length) return res.status(400).json({ error: 'QRCODE_NOT_FOUND' });
    }
    await pool.query('UPDATE sales_orders SET qc_qrcode_id = ?, updated_by = ? WHERE id = ?', [
      qid,
      req.user.userId,
      id
    ]);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: qid == null ? '解除质检二维码绑定' : '绑定质检二维码',
      detail: { orderId: id, qrcodeId: qid }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const bindOrderContractSchema = z.object({
  contract_id: z.coerce.number().int().positive()
});

/** 将已有合同与订单关联（不生成新合同；客户须一致，且订单当前未关联任何合同） */
router.post('/orders/:id/bind-contract', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_generate')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const body = bindOrderContractSchema.parse(req.body || {});
    const pool = getPool();
    const [orderRows] = await pool.query(
      `SELECT o.*, c.customer_name FROM sales_orders o
       INNER JOIN sales_customers c ON c.id = o.customer_id WHERE o.id = ? LIMIT 1`,
      [id]
    );
    const order = orderRows[0];
    if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(order, req)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const [existing] = await pool.query(
      'SELECT contract_id FROM sales_contract_orders WHERE order_id = ? LIMIT 1',
      [id]
    );
    if (existing.length) return res.status(400).json({ error: 'ORDER_ALREADY_LINKED' });

    const c = await fetchSalesContractRow(pool, body.contract_id);
    const vis = await assertSalesContractVisible(req, pool, c);
    if (vis.code === 'NOT_FOUND') return res.status(404).json({ error: 'CONTRACT_NOT_FOUND' });
    if (!vis.ok) return res.status(403).json({ error: 'FORBIDDEN' });
    if (Number(order.customer_id) !== Number(c.customer_id)) {
      return res.status(400).json({ error: 'CUSTOMER_MISMATCH' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('INSERT INTO sales_contract_orders (contract_id, order_id) VALUES (?, ?)', [
        body.contract_id,
        id
      ]);
      const ordNo = order.order_no != null ? String(order.order_no) : '';
      await conn.query(
        `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
         VALUES (?, ?, 'link_order', NULL, ?)`,
        [body.contract_id, req.user.userId, `绑定销售订单 #${id}${ordNo ? `（${ordNo}）` : ''}`]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '绑定已有合同',
      detail: { orderId: id, contractId: body.contract_id }
    });
    res.json({ ok: true, contract_id: body.contract_id });
  } catch (e) {
    next(e);
  }
});

const orderFieldCreateSchema = z.object({
  field_key: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
  label_zh: z.string().min(1).max(128),
  field_type: z.enum(['text', 'textarea', 'number', 'positive_number', 'date']),
  required: z.coerce.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
  maps_to: z
    .union([z.string().max(32), z.null()])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v))
});

router.post('/order-fields', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = orderFieldCreateSchema.parse(req.body || {});
    const pool = getPool();
    await assertMapsToAvailable(pool, body.maps_to, null);
    const [dup] = await pool.query('SELECT id FROM sales_order_field_definitions WHERE field_key = ?', [body.field_key]);
    if (dup.length) return res.status(400).json({ error: 'FIELD_KEY_EXISTS' });
    const [r] = await pool.query(
      `INSERT INTO sales_order_field_definitions (field_key, label_zh, field_type, required, sort_order, maps_to, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        body.field_key,
        body.label_zh,
        body.field_type,
        body.required ? 1 : 0,
        body.sort_order ?? 999,
        body.maps_to || null
      ]
    );
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '新增订单字段',
      detail: { id: r.insertId }
    });
    res.json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'MAPS_TO_CONFLICT' || e.code === 'BAD_MAPS_TO') {
      return res.status(400).json({ error: e.code, message: e.message });
    }
    next(e);
  }
});

const orderFieldPatchSchema = z.object({
  label_zh: z.string().min(1).max(128).optional(),
  field_type: z.enum(['text', 'textarea', 'number', 'positive_number', 'date']).optional(),
  required: z.coerce.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
  maps_to: z
    .union([z.string().max(32), z.null()])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  is_active: z.coerce.boolean().optional()
});

router.patch('/order-fields/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const body = orderFieldPatchSchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_order_field_definitions WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    const willActive = body.is_active === false ? false : !!rows[0].is_active || body.is_active === true;
    const effMaps =
      body.maps_to !== undefined ? (body.maps_to === null ? null : body.maps_to) : rows[0].maps_to || null;
    if (willActive && effMaps) {
      await assertMapsToAvailable(pool, effMaps, id);
    }
    const updates = [];
    const args = [];
    if (body.label_zh != null) {
      updates.push('label_zh = ?');
      args.push(body.label_zh);
    }
    if (body.field_type != null) {
      updates.push('field_type = ?');
      args.push(body.field_type);
    }
    if (body.required != null) {
      updates.push('required = ?');
      args.push(body.required ? 1 : 0);
    }
    if (body.sort_order != null) {
      updates.push('sort_order = ?');
      args.push(body.sort_order);
    }
    if (body.maps_to !== undefined) {
      updates.push('maps_to = ?');
      args.push(body.maps_to || null);
    }
    if (body.is_active != null) {
      updates.push('is_active = ?');
      args.push(body.is_active ? 1 : 0);
    }
    if (!updates.length) return res.json({ ok: true });
    args.push(id);
    await pool.query(`UPDATE sales_order_field_definitions SET ${updates.join(', ')} WHERE id = ?`, args);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '修改订单字段',
      detail: { id }
    });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'MAPS_TO_CONFLICT' || e.code === 'BAD_MAPS_TO') {
      return res.status(400).json({ error: e.code, message: e.message });
    }
    next(e);
  }
});

router.delete('/order-fields/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const pool = getPool();
    await pool.query('UPDATE sales_order_field_definitions SET is_active = 0 WHERE id = ?', [id]);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '停用订单字段',
      detail: { id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** 订单号前缀（系统管理员或 data_export_all）；新订单号已不再使用此前缀 */
router.get('/settings', async (req, res, next) => {
  try {
    if (!perm(req, 'data_management', 'data_export_all') && !isSuper(req)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const pool = getPool();
    const [rows] = await pool.query('SELECT order_no_prefix, last_order_seq FROM sales_settings WHERE id = 1');
    res.json({ settings: rows[0] || { order_no_prefix: 'SO', last_order_seq: 0 } });
  } catch (e) {
    next(e);
  }
});

router.patch('/settings', async (req, res, next) => {
  try {
    if (!perm(req, 'data_management', 'data_export_all') && !isSuper(req)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const schema = z.object({
      order_no_prefix: z.string().min(1).max(32).optional()
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    if (body.order_no_prefix != null) {
      await pool.query('UPDATE sales_settings SET order_no_prefix = ? WHERE id = 1', [body.order_no_prefix]);
    }
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '修改销售设置',
      detail: body
    });
    const [rows] = await pool.query('SELECT order_no_prefix, last_order_seq FROM sales_settings WHERE id = 1');
    res.json({ settings: rows[0] });
  } catch (e) {
    next(e);
  }
});

router.get('/customers', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_query') && !perm(req, 'contract_management', 'contract_view')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const q = String(req.query.q || '').trim();
    const pool = getPool();
    let sql = 'SELECT id, customer_code, customer_name FROM sales_customers WHERE 1=1';
    const args = [];
    if (q) {
      sql += ' AND (customer_code LIKE ? OR customer_name LIKE ?)';
      const p = `%${q}%`;
      args.push(p, p);
    }
    sql += ' ORDER BY customer_name ASC LIMIT 200';
    const [rows] = await pool.query(sql, args);
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/customers', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_input')) return res.status(403).json({ error: 'FORBIDDEN' });
    const schema = z.object({
      customer_code: z.string().min(1).max(64),
      customer_name: z.string().min(1).max(256),
      contact_name: z.string().max(128).optional().nullable(),
      phone: z.string().max(64).optional().nullable(),
      address: z.string().max(512).optional().nullable()
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const [dup] = await pool.query('SELECT id FROM sales_customers WHERE customer_code = ?', [body.customer_code]);
    if (dup.length) return res.status(400).json({ error: 'DUPLICATE_CUSTOMER_CODE' });
    const [r] = await pool.query(
      `INSERT INTO sales_customers (customer_code, customer_name, contact_name, phone, address, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        body.customer_code,
        body.customer_name,
        body.contact_name || null,
        body.phone || null,
        body.address || null,
        req.user.userId
      ]
    );
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '新增客户',
      detail: { id: r.insertId }
    });
    res.json({ id: r.insertId });
  } catch (e) {
    next(e);
  }
});

router.get('/messages', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const pool = getPool();
    const unreadOnly = String(req.query.unread || '') === '1';
    let sql = `SELECT id, category, title, body_text, ref_type, ref_id, read_at, created_at FROM sales_internal_messages WHERE to_user_id = ?`;
    const args = [uid];
    if (unreadOnly) sql += ' AND read_at IS NULL';
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const [rows] = await pool.query(sql, args);
    res.json({ items: (rows || []).map(jsonSafeSalesInternalMessageRow) });
  } catch (e) {
    next(e);
  }
});

/** 清空当前用户全部站内信（仅本人收件箱） */
router.post('/messages/clear', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const pool = getPool();
    await pool.query('DELETE FROM sales_internal_messages WHERE to_user_id = ?', [uid]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/messages/:id/read', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const id = Number(req.params.id);
    const pool = getPool();
    await pool.query('UPDATE sales_internal_messages SET read_at = NOW(3) WHERE id = ? AND to_user_id = ?', [
      id,
      uid
    ]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const listQuerySchema = z.object({
  customer_name: z.string().optional(),
  customer_code: z.string().optional(),
  product_name: z.string().optional(),
  product_code: z.string().optional(),
  product_model: z.string().optional(),
  warehouse_model: z.string().optional(),
  order_no: z.string().optional(),
  status: z.string().optional(),
  sales_user_id: z.coerce.number().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  page_size: z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? 20 : v),
    z.coerce.number().refine((n) => [10, 20, 50, 100].includes(n), { message: 'page_size' })
  ),
  sort: z.enum(['created_at_desc', 'created_at_asc', 'customer_name_desc', 'customer_name_asc']).default('created_at_desc'),
  pending_finance_only: z.preprocess((v) => v === true || v === '1' || v === 'true', z.boolean().optional())
});

router.get('/orders', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_query')) return res.status(403).json({ error: 'FORBIDDEN' });
    const q = listQuerySchema.parse(req.query);
    const pool = getPool();
    const uid = req.user.userId;
    const seeAll = canViewAllSalesOrders(req);

    let sql = `SELECT o.*, c.customer_code, c.customer_name, u.username AS created_by_username
               FROM sales_orders o
               INNER JOIN sales_customers c ON c.id = o.customer_id
               LEFT JOIN users u ON u.id = o.created_by
               WHERE 1=1`;
    const args = [];

    if (!seeAll) {
      sql += ' AND o.created_by = ?';
      args.push(uid);
    }
    if (q.customer_name) {
      sql += ' AND c.customer_name LIKE ?';
      args.push(`%${q.customer_name}%`);
    }
    if (q.customer_code) {
      sql += ' AND c.customer_code LIKE ?';
      args.push(`%${q.customer_code}%`);
    }
    if (q.product_name) {
      sql += ' AND o.product_name LIKE ?';
      args.push(`%${q.product_name}%`);
    }
    if (q.product_code) {
      sql += ' AND o.product_code LIKE ?';
      args.push(`%${q.product_code}%`);
    }
    if (q.product_model) {
      sql += ' AND o.product_model LIKE ?';
      args.push(`%${q.product_model}%`);
    }
    if (q.warehouse_model) {
      sql += ' AND o.warehouse_model LIKE ?';
      args.push(`%${q.warehouse_model}%`);
    }
    if (q.order_no) {
      sql += ' AND o.order_no LIKE ?';
      args.push(`%${q.order_no}%`);
    }
    if (q.status) {
      sql += ' AND o.status = ?';
      args.push(q.status);
    }
    if (q.sales_user_id && seeAll) {
      sql += ' AND o.created_by = ?';
      args.push(q.sales_user_id);
    }
    sql = appendOrderListDateRange(sql, args, q, req);

    const finScopeSql = financeOrderListScopeSql(req);
    sql += finScopeSql.sql;
    args.push(...finScopeSql.args);

    const orderBy =
      q.sort === 'created_at_asc'
        ? 'o.created_at ASC'
        : q.sort === 'customer_name_asc'
          ? 'c.customer_name ASC, o.created_at DESC'
          : q.sort === 'customer_name_desc'
            ? 'c.customer_name DESC, o.created_at DESC'
            : 'o.created_at DESC';

    const [countRows] = await pool.query(`SELECT COUNT(*) AS c FROM (${sql}) t`, args);
    const total = Number(countRows[0]?.c || 0);

    sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    args.push(q.page_size, (q.page - 1) * q.page_size);

    const [rows] = await pool.query(sql, args);

    // 关联合同摘要：按订单找最近一份合同及其审核状态
    let contractByOrderId = new Map();
    if (rows.length) {
      const orderIds = [...new Set(rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0))];
      if (orderIds.length) {
        const ph = orderIds.map(() => '?').join(',');
        const [cRows] = await pool.query(
          `SELECT sco.order_id,
                  c.id AS contract_id,
                  c.status AS contract_status,
                  (
                    SELECT a.comment_text
                    FROM sales_contract_audit_logs a
                    WHERE a.contract_id = c.id AND a.result = 'rejected'
                    ORDER BY a.id DESC
                    LIMIT 1
                  ) AS contract_last_reject_comment,
                  c.created_at AS contract_created_at
           FROM sales_contract_orders sco
           INNER JOIN sales_contracts c ON c.id = sco.contract_id
           WHERE sco.order_id IN (${ph})
           ORDER BY sco.order_id ASC, c.created_at DESC, c.id DESC`,
          orderIds
        );
        contractByOrderId = new Map();
        for (const r of cRows) {
          const oid = Number(r.order_id);
          if (!Number.isFinite(oid) || oid <= 0) continue;
          if (!contractByOrderId.has(oid)) {
            contractByOrderId.set(oid, {
              contract_id: r.contract_id,
              contract_status: r.contract_status,
              contract_last_reject_comment: r.contract_last_reject_comment || null
            });
          }
        }
      }
    }

    const fieldDefs = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    const enriched = rows.map((r) => {
      const { display_data, dataJson } = mergeRowDataJson(r, fieldDefs);
      const c = contractByOrderId.get(Number(r.id)) || null;
      return {
        ...r,
        display_data,
        data_json: dataJson,
        contract_id: c ? c.contract_id : null,
        contract_status: c ? c.contract_status : null,
        contract_last_reject_comment: c ? c.contract_last_reject_comment : null
      };
    });
    const models = enriched.map((r) => r.product_model);
    const qcMap = await loadQcMap(pool, models);
    const items = await enrichOrdersQc(pool, enriched, qcMap);
    res.json({ items, total, page: q.page, page_size: q.page_size, field_definitions: fieldDefs });
  } catch (e) {
    next(e);
  }
});

const orderDataBodySchema = z.object({
  data: z.record(z.string(), z.any())
});

router.post('/orders', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_input')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = orderDataBodySchema.parse(req.body || {});
    const pool = getPool();
    const definitions = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const r = await insertOrderWithData(conn, {
        userId: req.user.userId,
        data: body.data || {},
        definitions
      });
      await conn.commit();
      await logOperationFromReq(req, {
        module: '销售订单',
        action: '创建订单',
        detail: { id: r.id, order_no: r.order_no }
      });
      res.json({ id: r.id, order_no: r.order_no });
    } catch (e) {
      await conn.rollback();
      if (e.code === 'VALIDATION_FAILED') {
        return res.status(400).json({ error: 'VALIDATION_FAILED', details: e.details });
      }
      if (e.code === 'MISSING_CUSTOMER_FIELD') {
        return res.status(400).json({ error: e.code, message: e.message });
      }
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    if (e.code === 'VALIDATION') return res.status(400).json({ error: e.message });
    next(e);
  }
});

router.patch('/orders/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_edit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const body = orderDataBodySchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT o.*, c.customer_code, c.customer_name
       FROM sales_orders o
       INNER JOIN sales_customers c ON c.id = o.customer_id
       WHERE o.id = ?`,
      [id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(row, req)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!orderEditable(row)) return res.status(400).json({ error: 'ORDER_NOT_EDITABLE' });

    const allDefs = await loadOrderFieldDefinitions(pool, { activeOnly: false });
    const activeDefs = allDefs.filter((d) => d.is_active);
    const prev = mergeRowDataJson(row, allDefs).dataJson;
    const merged = { ...prev, ...(body.data || {}) };
    const { errors, data } = validateOrderDataInput(activeDefs, merged);
    if (errors.length) {
      return res.status(400).json({ error: 'VALIDATION_FAILED', details: errors });
    }
    const codeKey = activeDefs.find((d) => d.maps_to === 'customer_code')?.field_key;
    const nameKey = activeDefs.find((d) => d.maps_to === 'customer_name')?.field_key;
    if (!codeKey && !nameKey) {
      return res.status(400).json({ error: 'MISSING_CUSTOMER_FIELD', message: '请配置「客户编号」或「客户名称」映射字段' });
    }
    const before = { ...row };
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const customerId = await getOrCreateCustomer(conn, {
        customer_code: codeKey ? data[codeKey] : '',
        customer_name: nameKey ? data[nameKey] : '',
        userId: req.user.userId
      });
      const leg = dataJsonToLegacyColumns(activeDefs, data);
      await conn.query(
        `UPDATE sales_orders SET customer_id = ?, product_code = ?, product_name = ?, product_model = ?, warehouse_model = ?, quantity = ?, unit_price = ?, amount = ?, remark = ?, data_json = CAST(? AS JSON), updated_by = ? WHERE id = ?`,
        [
          customerId,
          leg.product_code,
          leg.product_name,
          leg.product_model,
          leg.warehouse_model,
          leg.quantity,
          leg.unit_price,
          leg.amount,
          leg.remark,
          JSON.stringify(data),
          req.user.userId,
          id
        ]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    const [afterRows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    await pool.query(
      `INSERT INTO sales_order_edit_logs (order_id, actor_id, before_json, after_json) VALUES (?, ?, ?, ?)`,
      [id, req.user.userId, JSON.stringify(before), JSON.stringify(afterRows[0])]
    );
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '编辑订单',
      detail: { id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/:id/submit', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_submit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(row, req)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!['pending_review', 'rejected'].includes(row.status)) return res.status(400).json({ error: 'INVALID_STATUS' });
    if (row.submitted_for_review_at) return res.status(400).json({ error: 'ALREADY_SUBMITTED' });

    await pool.query(
      `UPDATE sales_orders SET submitted_for_review_at = NOW(3), updated_by = ? WHERE id = ?`,
      [req.user.userId, id]
    );
    await pool.query(
      `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
       VALUES (?, 'pending_review', 'pending_review', ?, '提交财务审核')`,
      [id, req.user.userId]
    );
    const submitBody = await buildOrderNotifyBody(pool, [row], {
      intro: '有新的订单已提交财务审核，请及时处理。'
    });
    await notifyUsersByCategory(pool, 'finance', {
      title: '待审核订单',
      bodyText: submitBody,
      fromUserId: req.user.userId,
      refType: 'order',
      refId: id,
      msgCategory: 'todo'
    });
    await tryNotifyFinanceWecomOrderEvent(pool, {
      event: 'submit',
      notifyBody: submitBody,
      orderRows: [row],
      fromUserId: req.user.userId
    });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '提交订单财务审核',
      detail: { id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/:id/withdraw', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_withdraw')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(row, req)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (row.status !== 'pending_review' || !row.submitted_for_review_at) {
      return res.status(400).json({ error: 'NOT_SUBMITTED' });
    }
    await pool.query(
      `UPDATE sales_orders SET submitted_for_review_at = NULL, updated_by = ? WHERE id = ?`,
      [req.user.userId, id]
    );
    await pool.query(
      `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
       VALUES (?, 'pending_review', 'pending_review', ?, '撤回审核申请')`,
      [id, req.user.userId]
    );
    const withdrawBody = await buildOrderNotifyBody(pool, [row], {
      intro: '销售已撤回财务审核申请，该订单不再在待审队列中。'
    });
    await notifyUsersByCategory(pool, 'finance', {
      title: '订单已撤回审核申请',
      bodyText: withdrawBody,
      fromUserId: req.user.userId,
      refType: 'order_withdraw',
      refId: id,
      msgCategory: 'notice'
    });
    await tryNotifyFinanceWecomOrderEvent(pool, {
      event: 'withdraw',
      notifyBody: withdrawBody,
      orderRows: [row],
      fromUserId: req.user.userId
    });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '撤回订单财务审核',
      detail: { id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const batchOrderIdsBodySchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(200)
});

router.post('/orders/batch-submit', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_submit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = batchOrderIdsBodySchema.parse(req.body || {});
    const wanted = uniquePositiveIds(body.ids);
    if (!wanted.length) return res.status(400).json({ error: 'NO_IDS' });

    const pool = getPool();
    const conn = await pool.getConnection();
    const failed = [];
    let okRows = [];
    try {
      await conn.beginTransaction();
      const ph = wanted.map(() => '?').join(',');
      const [rows] = await conn.query(`SELECT * FROM sales_orders WHERE id IN (${ph}) FOR UPDATE`, wanted);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const okIds = [];
      for (const id of wanted) {
        const row = byId.get(id);
        if (!row) {
          failed.push({ id, error: 'NOT_FOUND' });
          continue;
        }
        if (!isSuper(req) && !isOrderCreatedByCurrentUser(row, req)) {
          failed.push({ id, error: 'FORBIDDEN' });
          continue;
        }
        if (!['pending_review', 'rejected'].includes(row.status)) {
          failed.push({ id, error: 'INVALID_STATUS' });
          continue;
        }
        if (row.submitted_for_review_at) {
          failed.push({ id, error: 'ALREADY_SUBMITTED' });
          continue;
        }
        okIds.push(id);
      }
      if (okIds.length) {
        const ph2 = okIds.map(() => '?').join(',');
        await conn.query(
          `UPDATE sales_orders SET submitted_for_review_at = NOW(3), updated_by = ? WHERE id IN (${ph2})`,
          [req.user.userId, ...okIds]
        );
        for (const id of okIds) {
          await conn.query(
            `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
             VALUES (?, 'pending_review', 'pending_review', ?, '提交财务审核')`,
            [id, req.user.userId]
          );
        }
      }
      okRows = okIds.map((id) => byId.get(id));
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    if (okRows.length) {
      const batchSubmitBody =
        okRows.length === 1
          ? await buildOrderNotifyBody(pool, okRows, {
              intro: '有新的订单已提交财务审核，请及时处理。'
            })
          : '有批量订单已提交财务审核，请到订单管理查看详情。';
      await notifyUsersByCategory(pool, 'finance', {
        title: '待审核订单',
        bodyText: batchSubmitBody,
        fromUserId: req.user.userId,
        refType: 'order_batch_submit',
        refId: okRows[0].id,
        msgCategory: 'todo'
      });
      await tryNotifyFinanceWecomOrderEvent(pool, {
        event: 'batch_submit',
        notifyBody: batchSubmitBody,
        orderRows: okRows,
        fromUserId: req.user.userId
      });
    }
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '批量提交订单财务审核',
      detail: { ok: okRows.length, failed: failed.length, ids: okRows.map((r) => r.id) }
    });
    res.json({ ok: okRows.length, failed });
  } catch (e) {
    next(e);
  }
});

const batchFinanceReviewBodySchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(200),
  result: z.enum(['approved', 'rejected']),
  comment: z.string().max(1024).optional()
});

router.post('/orders/batch-finance-review', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_status_finance')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = batchFinanceReviewBodySchema.parse(req.body || {});
    if (body.result === 'rejected' && !String(body.comment || '').trim()) {
      return res.status(400).json({ error: 'COMMENT_REQUIRED' });
    }
    const wanted = uniquePositiveIds(body.ids);
    if (!wanted.length) return res.status(400).json({ error: 'NO_IDS' });

    const pool = getPool();
    const conn = await pool.getConnection();
    const failed = [];
    let okRows = [];
    try {
      await conn.beginTransaction();
      const ph = wanted.map(() => '?').join(',');
      const [rows] = await conn.query(`SELECT * FROM sales_orders WHERE id IN (${ph}) FOR UPDATE`, wanted);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const okIds = [];
      for (const id of wanted) {
        const row = byId.get(id);
        if (!row) {
          failed.push({ id, error: 'NOT_FOUND' });
          continue;
        }
        if (row.status !== 'pending_review' || !row.submitted_for_review_at) {
          failed.push({ id, error: 'NOT_IN_REVIEW_QUEUE' });
          continue;
        }
        okIds.push(id);
      }

      if (okIds.length) {
        const ph2 = okIds.map(() => '?').join(',');
        if (body.result === 'approved') {
          await conn.query(
            `UPDATE sales_orders SET status = 'approved', finance_reviewed_at = NOW(3), finance_reviewed_by = ?, finance_comment = ?, updated_by = ?
             WHERE id IN (${ph2})`,
            [req.user.userId, body.comment || null, req.user.userId, ...okIds]
          );
          for (const id of okIds) {
            await conn.query(
              `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
               VALUES (?, 'pending_review', 'approved', ?, ?)`,
              [id, req.user.userId, body.comment || '通过']
            );
          }
        } else {
          await conn.query(
            `UPDATE sales_orders SET status = 'rejected', finance_reviewed_at = NOW(3), finance_reviewed_by = ?, finance_comment = ?, submitted_for_review_at = NULL, updated_by = ?
             WHERE id IN (${ph2})`,
            [req.user.userId, body.comment, req.user.userId, ...okIds]
          );
          for (const id of okIds) {
            await conn.query(
              `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
               VALUES (?, 'pending_review', 'rejected', ?, ?)`,
              [id, req.user.userId, body.comment]
            );
          }
        }
      }
      okRows = okIds.map((id) => byId.get(id));
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    if (okRows.length && body.result === 'approved') {
      const approvedBody =
        okRows.length === 1
          ? await buildOrderNotifyBody(pool, okRows, {
              intro: '订单已通过财务审核，请备货发货。'
            })
          : '批量订单已通过财务审核，请备货发货。请到订单管理查看详情。';
      await notifyUsersByCategory(pool, 'warehouse', {
        title: '订单已审核通过',
        bodyText: approvedBody,
        fromUserId: req.user.userId,
        refType: 'order_batch_approved',
        refId: okRows[0].id,
        msgCategory: 'todo'
      });
      await tryNotifyWarehouseWecomOrderApproved(pool, {
        orderRows: okRows,
        fromUserId: req.user.userId
      });
    }

    if (okRows.length && body.result === 'rejected') {
      const byCreator = new Map();
      for (const row of okRows) {
        if (!row.created_by) continue;
        if (!byCreator.has(row.created_by)) byCreator.set(row.created_by, []);
        byCreator.get(row.created_by).push(row);
      }
      const comment = body.comment;
      for (const [uid, list] of byCreator) {
        const rejectBody =
          list.length === 1
            ? await buildOrderNotifyBody(pool, list, {
                intro: `订单已被财务驳回。\n驳回原因：${comment}`
              })
            : `批量订单已被财务驳回。\n驳回原因：${comment}\n请到订单管理查看详情。`;
        await notifyUser(pool, uid, {
          title: '订单审核驳回',
          bodyText: rejectBody,
          fromUserId: req.user.userId,
          refType: 'order_batch_rejected',
          refId: list[0].id,
          msgCategory: 'notice'
        });
        await tryNotifySalesWecomOrderRejected(pool, {
          notifyBody: rejectBody,
          orderRows: list,
          fromUserId: req.user.userId,
          toUserId: uid
        });
      }
    }

    await logOperationFromReq(req, {
      module: '销售订单',
      action: '批量财务审核订单',
      detail: { result: body.result, ok: okRows.length, failed: failed.length }
    });
    res.json({ ok: okRows.length, failed });
  } catch (e) {
    next(e);
  }
});

const financeReviewSchema = z.object({
  result: z.enum(['approved', 'rejected']),
  comment: z.string().max(1024).optional()
});

router.post('/orders/:id/finance-review', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_status_finance')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const body = financeReviewSchema.parse(req.body || {});
    if (body.result === 'rejected' && !String(body.comment || '').trim()) {
      return res.status(400).json({ error: 'COMMENT_REQUIRED' });
    }
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (row.status !== 'pending_review' || !row.submitted_for_review_at) {
      return res.status(400).json({ error: 'NOT_IN_REVIEW_QUEUE' });
    }

    if (body.result === 'approved') {
      await pool.query(
        `UPDATE sales_orders SET status = 'approved', finance_reviewed_at = NOW(3), finance_reviewed_by = ?, finance_comment = ?, updated_by = ?
         WHERE id = ?`,
        [req.user.userId, body.comment || null, req.user.userId, id]
      );
      await pool.query(
        `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
         VALUES (?, 'pending_review', 'approved', ?, ?)`,
        [id, req.user.userId, body.comment || '通过']
      );
      const approveOneBody = await buildOrderNotifyBody(pool, [row], {
        intro: '订单已通过财务审核，请备货发货。'
      });
      await notifyUsersByCategory(pool, 'warehouse', {
        title: '订单已审核通过',
        bodyText: approveOneBody,
        fromUserId: req.user.userId,
        refType: 'order',
        refId: id,
        msgCategory: 'todo'
      });
      await tryNotifyWarehouseWecomOrderApproved(pool, {
        orderRows: [row],
        fromUserId: req.user.userId
      });
    } else {
      await pool.query(
        `UPDATE sales_orders SET status = 'rejected', finance_reviewed_at = NOW(3), finance_reviewed_by = ?, finance_comment = ?, submitted_for_review_at = NULL, updated_by = ?
         WHERE id = ?`,
        [req.user.userId, body.comment, req.user.userId, id]
      );
      await pool.query(
        `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
         VALUES (?, 'pending_review', 'rejected', ?, ?)`,
        [id, req.user.userId, body.comment]
      );
      if (row.created_by) {
        const rejectOneBody = await buildOrderNotifyBody(pool, [row], {
          intro: `订单已被财务驳回。\n驳回原因：${body.comment}`
        });
        await notifyUser(pool, row.created_by, {
          title: '订单审核驳回',
          bodyText: rejectOneBody,
          fromUserId: req.user.userId,
          refType: 'order',
          refId: id,
          msgCategory: 'notice'
        });
        await tryNotifySalesWecomOrderRejected(pool, {
          notifyBody: rejectOneBody,
          orderRows: [row],
          fromUserId: req.user.userId,
          toUserId: row.created_by
        });
      }
    }
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '财务审核订单',
      detail: { id, result: body.result }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const shipSchema = z.object({
  shipping_instruction: z.string().max(1024).optional()
});

const batchShipBodySchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(200),
  shipping_instruction: z.string().max(1024).optional()
});

router.post('/orders/batch-ship', async (req, res, next) => {
  try {
    if (!canMarkOrderShipped(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = batchShipBodySchema.parse(req.body || {});
    const wanted = uniquePositiveIds(body.ids);
    if (!wanted.length) return res.status(400).json({ error: 'NO_IDS' });

    const pool = getPool();
    const conn = await pool.getConnection();
    const failed = [];
    let okRows = [];
    const shipVal = body.shipping_instruction || null;
    const remarkLog = body.shipping_instruction || '发货';
    try {
      await conn.beginTransaction();
      const ph = wanted.map(() => '?').join(',');
      const [rows] = await conn.query(`SELECT * FROM sales_orders WHERE id IN (${ph}) FOR UPDATE`, wanted);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const okIds = [];
      for (const id of wanted) {
        const row = byId.get(id);
        if (!row) {
          failed.push({ id, error: 'NOT_FOUND' });
          continue;
        }
        if (row.status !== 'approved') {
          failed.push({ id, error: 'INVALID_STATUS' });
          continue;
        }
        okIds.push(id);
      }
      if (okIds.length) {
        const ph2 = okIds.map(() => '?').join(',');
        await conn.query(
          `UPDATE sales_orders SET status = 'shipped', shipped_at = NOW(3), shipped_by = ?, shipping_instruction = ?, updated_by = ? WHERE id IN (${ph2})`,
          [req.user.userId, shipVal, req.user.userId, ...okIds]
        );
        for (const id of okIds) {
          await conn.query(
            `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
             VALUES (?, 'approved', 'shipped', ?, ?)`,
            [id, req.user.userId, remarkLog]
          );
        }
      }
      okRows = okIds.map((id) => byId.get(id));
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const [fin] = await pool.query(
      `SELECT u.id FROM users u INNER JOIN employee_categories c ON c.id = u.employee_category_id
       WHERE u.is_active = 1 AND u.account_type IN ('employee', 'manager') AND c.code = 'finance'`
    );
    const financeIds = fin.map((f) => f.id);
    const shipNoteTrim = body.shipping_instruction && String(body.shipping_instruction).trim();
    const shipIntro = shipNoteTrim ? `订单已发货。发货说明：${shipNoteTrim}` : '订单已发货。';
    for (const row of okRows) {
      const targets = new Set();
      if (row.created_by) targets.add(row.created_by);
      for (const uid of financeIds) targets.add(uid);
      const shipBody = await buildOrderNotifyBody(pool, [row], { intro: shipIntro });
      for (const uid of targets) {
        await notifyUser(pool, uid, {
          title: '订单已发货',
          bodyText: shipBody,
          fromUserId: req.user.userId,
          refType: 'order',
          refId: row.id,
          msgCategory: 'notice'
        });
      }
    }

    await logOperationFromReq(req, {
      module: '销售订单',
      action: '批量订单发货',
      detail: { ok: okRows.length, failed: failed.length, ids: okRows.map((r) => r.id) }
    });
    res.json({ ok: okRows.length, failed });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/:id/ship', async (req, res, next) => {
  try {
    if (!canMarkOrderShipped(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const body = shipSchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (row.status !== 'approved') return res.status(400).json({ error: 'INVALID_STATUS' });
    await pool.query(
      `UPDATE sales_orders SET status = 'shipped', shipped_at = NOW(3), shipped_by = ?, shipping_instruction = ?, updated_by = ? WHERE id = ?`,
      [req.user.userId, body.shipping_instruction || null, req.user.userId, id]
    );
    await pool.query(
      `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
       VALUES (?, 'approved', 'shipped', ?, ?)`,
      [id, req.user.userId, body.shipping_instruction || '发货']
    );
    const targets = new Set();
    if (row.created_by) targets.add(row.created_by);
    const [fin] = await pool.query(
      `SELECT u.id FROM users u INNER JOIN employee_categories c ON c.id = u.employee_category_id
       WHERE u.is_active = 1 AND u.account_type IN ('employee', 'manager') AND c.code = 'finance'`
    );
    for (const f of fin) targets.add(f.id);
    const shipNote = body.shipping_instruction && String(body.shipping_instruction).trim();
    const shipIntro = shipNote ? `订单已发货。发货说明：${shipNote}` : '订单已发货。';
    const shipBody = await buildOrderNotifyBody(pool, [row], { intro: shipIntro });
    for (const uid of targets) {
      await notifyUser(pool, uid, {
        title: '订单已发货',
        bodyText: shipBody,
        fromUserId: req.user.userId,
        refType: 'order',
        refId: id,
        msgCategory: 'notice'
      });
    }
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '订单发货',
      detail: { id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/:id/complete', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_status_finance')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    if (row.status !== 'shipped') return res.status(400).json({ error: 'INVALID_STATUS' });
    await pool.query(
      `UPDATE sales_orders SET status = 'completed', updated_by = ? WHERE id = ?`,
      [req.user.userId, id]
    );
    await pool.query(
      `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
       VALUES (?, 'shipped', 'completed', ?, '完结')`,
      [id, req.user.userId]
    );
    if (row.created_by) {
      const completeBody = await buildOrderNotifyBody(pool, [row], {
        intro: '财务已确认该订单完结。'
      });
      await notifyUser(pool, row.created_by, {
        title: '订单已完结',
        bodyText: completeBody,
        fromUserId: req.user.userId,
        refType: 'order_complete',
        refId: id,
        msgCategory: 'notice'
      });
    }
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '完结订单',
      detail: { id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/:id/cancel', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_cancel')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    try {
      assertFinanceOrderListScope(req, row);
    } catch (e) {
      if (e.code === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' });
      throw e;
    }
    const own = isOrderCreatedByCurrentUser(row, req);
    const finance = perm(req, 'order_management', 'order_status_finance');
    if (!isSuper(req) && !finance && !(own && row.status === 'pending_review' && !row.submitted_for_review_at)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (['shipped', 'completed', 'cancelled'].includes(row.status)) {
      return res.status(400).json({ error: 'INVALID_STATUS' });
    }
    await pool.query(
      `UPDATE sales_orders SET status = 'cancelled', updated_by = ? WHERE id = ?`,
      [req.user.userId, id]
    );
    await pool.query(
      `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
       VALUES (?, ?, 'cancelled', ?, '取消订单')`,
      [id, row.status, req.user.userId]
    );
    const cancelBody = await buildOrderNotifyBody(pool, [row], { intro: '本订单已被取消。' });
    if (row.submitted_for_review_at) {
      await notifyUsersByCategory(pool, 'finance', {
        title: '订单已取消',
        bodyText: cancelBody,
        fromUserId: req.user.userId,
        refType: 'order_cancel',
        refId: id,
        msgCategory: 'notice'
      });
      await tryNotifyFinanceWecomOrderEvent(pool, {
        event: 'cancel',
        notifyBody: cancelBody,
        orderRows: [row],
        fromUserId: req.user.userId,
        templateCode: WECOM_TEMPLATE_SALES_ORDER_WITHDRAW_FINANCE
      });
    }
    if (row.created_by && Number(row.created_by) !== Number(req.user.userId)) {
      await notifyUser(pool, row.created_by, {
        title: '订单已取消',
        bodyText: cancelBody,
        fromUserId: req.user.userId,
        refType: 'order_cancel',
        refId: id,
        msgCategory: 'notice'
      });
    }
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '取消订单',
      detail: { id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/orders/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_delete')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    try {
      assertFinanceOrderListScope(req, row);
      assertOrderDeleteAllowed(row, req);
    } catch (e) {
      if (e.code === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' });
      if (e.code === 'INVALID_STATUS') return res.status(400).json({ error: 'INVALID_STATUS' });
      throw e;
    }
    await pool.query('DELETE FROM sales_orders WHERE id = ?', [id]);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '删除订单',
      detail: { id, order_no: row.order_no }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/batch-delete', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_delete')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = batchOrderIdsBodySchema.parse(req.body || {});
    const wanted = uniquePositiveIds(body.ids);
    if (!wanted.length) return res.status(400).json({ error: 'NO_IDS' });

    const pool = getPool();
    const conn = await pool.getConnection();
    const failed = [];
    let deleted = 0;
    try {
      await conn.beginTransaction();
      const ph = wanted.map(() => '?').join(',');
      const [rows] = await conn.query(`SELECT * FROM sales_orders WHERE id IN (${ph}) FOR UPDATE`, wanted);
      const byId = new Map(rows.map((r) => [r.id, r]));
      const okIds = [];
      for (const id of wanted) {
        const row = byId.get(id);
        if (!row) {
          failed.push({ id, error: 'NOT_FOUND' });
          continue;
        }
        try {
          assertFinanceOrderListScope(req, row);
          assertOrderDeleteAllowed(row, req);
        } catch (e) {
          failed.push({ id, error: e.code || 'FORBIDDEN' });
          continue;
        }
        okIds.push(id);
      }
      if (okIds.length) {
        const ph2 = okIds.map(() => '?').join(',');
        await conn.query(`DELETE FROM sales_orders WHERE id IN (${ph2})`, okIds);
        deleted = okIds.length;
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await logOperationFromReq(req, {
      module: '销售订单',
      action: '批量删除订单',
      detail: { deleted, failed: failed.length, ids: wanted }
    });
    res.json({ ok: deleted, failed });
  } catch (e) {
    next(e);
  }
});

router.get('/orders/:id/status-logs', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_view_status_logs')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    try {
      assertFinanceOrderListScope(req, rows[0]);
    } catch (e) {
      if (e.code === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' });
      throw e;
    }
    const seeAll = canViewAllSalesOrders(req);
    if (!seeAll && !isOrderCreatedByCurrentUser(rows[0], req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const [logs] = await pool.query(
      `SELECT l.*, u.username AS actor_username FROM sales_order_status_logs l
       LEFT JOIN users u ON u.id = l.actor_id WHERE l.order_id = ? ORDER BY l.created_at ASC`,
      [id]
    );
    res.json({ items: logs });
  } catch (e) {
    next(e);
  }
});

router.get('/orders/:id/edit-logs', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_view_status_logs')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    try {
      assertFinanceOrderListScope(req, rows[0]);
    } catch (e) {
      if (e.code === 'FORBIDDEN') return res.status(403).json({ error: 'FORBIDDEN' });
      throw e;
    }
    const seeAll = canViewAllSalesOrders(req);
    if (!seeAll && !isOrderCreatedByCurrentUser(rows[0], req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const [logs] = await pool.query(
      `SELECT l.*, u.username AS actor_username FROM sales_order_edit_logs l
       LEFT JOIN users u ON u.id = l.actor_id WHERE l.order_id = ? ORDER BY l.created_at ASC`,
      [id]
    );
    res.json({ items: logs });
  } catch (e) {
    next(e);
  }
});

router.get('/customers/:customerId/contracts', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_view')) return res.status(403).json({ error: 'FORBIDDEN' });
    const customerId = Number(req.params.customerId);
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT c.*, u.username AS created_by_username, ru.username AS reviewer_username,
              (SELECT a.comment_text FROM sales_contract_audit_logs a
               WHERE a.contract_id = c.id AND a.result = 'rejected'
               ORDER BY a.id DESC LIMIT 1) AS last_reject_comment
       FROM sales_contracts c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN users ru ON ru.id = c.reviewer_user_id
       WHERE c.customer_id = ?
       ORDER BY c.created_at DESC`,
      [customerId]
    );
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/orders/export/xlsx', async (req, res, next) => {
  try {
    const canExport =
      isSuper(req) ||
      perm(req, 'data_management', 'data_export_all') ||
      perm(req, 'data_management', 'data_export');
    if (!canExport) return res.status(403).json({ error: 'FORBIDDEN' });
    const q = listQuerySchema.parse(req.query);
    const pool = getPool();
    const uid = req.user.userId;
    const seeAll =
      perm(req, 'data_management', 'data_export_all') || canViewAllSalesOrders(req);

    let sql = `SELECT o.order_no, o.data_json, o.qc_qrcode_id, c.customer_code, c.customer_name, o.product_code, o.product_name, o.product_model, o.warehouse_model,
                      o.quantity, o.unit_price, o.amount, o.remark, o.status, o.created_at, u.username AS sales_username
               FROM sales_orders o
               INNER JOIN sales_customers c ON c.id = o.customer_id
               LEFT JOIN users u ON u.id = o.created_by
               WHERE 1=1`;
    const args = [];
    if (!seeAll) {
      sql += ' AND o.created_by = ?';
      args.push(uid);
    }
    if (q.customer_name) {
      sql += ' AND c.customer_name LIKE ?';
      args.push(`%${q.customer_name}%`);
    }
    if (q.customer_code) {
      sql += ' AND c.customer_code LIKE ?';
      args.push(`%${q.customer_code}%`);
    }
    if (q.product_name) sql += ' AND o.product_name LIKE ?', args.push(`%${q.product_name}%`);
    if (q.product_code) sql += ' AND o.product_code LIKE ?', args.push(`%${q.product_code}%`);
    if (q.product_model) sql += ' AND o.product_model LIKE ?', args.push(`%${q.product_model}%`);
    if (q.warehouse_model) sql += ' AND o.warehouse_model LIKE ?', args.push(`%${q.warehouse_model}%`);
    if (q.order_no) sql += ' AND o.order_no LIKE ?', args.push(`%${q.order_no}%`);
    if (q.status) sql += ' AND o.status = ?', args.push(q.status);
    if (q.sales_user_id && seeAll) sql += ' AND o.created_by = ?', args.push(q.sales_user_id);
    sql = appendOrderListDateRange(sql, args, q, req);
    const finScopeEx = financeOrderListScopeSql(req);
    sql += finScopeEx.sql;
    args.push(...finScopeEx.args);
    sql += ` ORDER BY o.created_at DESC LIMIT 5000`;

    const [rows] = await pool.query(sql, args);
    const fieldDefs = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    const labelRow = ['订单号', ...fieldDefs.map((d) => d.label_zh), '状态', '销售人员', '上传日期', '质检报告二维码'];
    const models = rows.map((r) => r.product_model);
    const qcMap = await loadQcMap(pool, models);
    const rowsWithQc = await enrichOrdersQc(pool, rows, qcMap);
    const wsData = [
      labelRow,
      ...rowsWithQc.map((o) => {
        const { dataJson } = mergeRowDataJson(o, fieldDefs);
        const qcLabel = o.qc_public_url || '无可用报告';
        const cells = fieldDefs.map((d) => dataJson[d.field_key] ?? '');
        return [o.order_no, ...cells, o.status, o.sales_username, formatOrderUploadTime(o.created_at), qcLabel];
      })
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'orders');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-orders.xlsx"');
    res.send(buf);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '导出订单',
      detail: { count: rows.length }
    });
  } catch (e) {
    next(e);
  }
});

/** 导入模板内 10 行测试数据（列随 fieldDefs 顺序与类型生成） */
function buildSalesImportSampleRows(fieldDefs) {
  const materialPool = ['原厂直供', '授权分销', '备货仓', '集采渠道', '临时调拨'];
  const kangPool = ['是', '否', '待确认', '是', '否', '是', '否', '待确认', '是', '否'];
  const rows = [];
  for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
    const i = rowIdx + 1;
    const day = Math.min(28, 4 + rowIdx);
    const productModel = `KM-${2200 + rowIdx}`;
    const warehouseModel = `${2200 + rowIdx}-WH`;
    rows.push(
      fieldDefs.map((d) => {
        if (d.field_type === 'date') {
          return `2026-01-${String(day).padStart(2, '0')}`;
        }
        if (d.field_key === 'customer_code') return `TC${String(100 + rowIdx).slice(-3)}`;
        if (d.field_key === 'customer_name') return `测试厂家${String.fromCharCode(64 + i)}`;
        if (d.field_key === 'product_code') return `PH-2026${String(i).padStart(2, '0')}`;
        if (d.field_key === 'product_name') return `PVC线槽 ${10 + rowIdx * 3}×${6 + rowIdx}mm`;
        if (d.field_key === 'product_model') return `${productModel}/${warehouseModel}`;
        if (d.field_key === 'warehouse_model') return '';
        if (d.field_key === 'quantity') {
          const units = ['桶', '吨桶', '箱', '托', '件', '桶', '吨桶', '箱', '托', '件'];
          return `${18 + rowIdx * 4}${units[rowIdx]}`;
        }
        if (d.field_key === 'unit_price') return Number((11.8 + rowIdx * 0.35).toFixed(2));
        if (d.field_key === 'remark') return rowIdx % 4 === 0 ? '' : `测试备注-${i}`;
        if (d.field_key === 'material_source') return materialPool[rowIdx % materialPool.length];
        if (d.field_key === 'kangming') return kangPool[rowIdx];
        if (d.field_key === 'remaining') return rowIdx % 3 === 0 ? '' : String(120 - rowIdx * 8);
        if (d.field_key === 'order_date') {
          return `2026-01-${String(day).padStart(2, '0')}`;
        }
        if (d.field_type === 'number' || d.field_type === 'positive_number') return 1 + rowIdx;
        return `测试${i}`;
      })
    );
  }
  return rows;
}

router.get('/orders/template/xlsx', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_input')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    let fieldDefs = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    // 合并标签型号和仓库型号为一列
    const productModelDef = fieldDefs.find(d => d.field_key === 'product_model');
    const warehouseModelDef = fieldDefs.find(d => d.field_key === 'warehouse_model');
    if (productModelDef && warehouseModelDef) {
      // 保留标签型号列，移除仓库型号列
      fieldDefs = fieldDefs.filter(d => d.field_key !== 'warehouse_model');
      // 修改标签型号列的标题为"标签型号/仓库型号"
      productModelDef.label_zh = '标签型号/仓库型号';
    }
    const headers = fieldDefs.map((d) => d.label_zh);
    const sampleRows = buildSalesImportSampleRows(fieldDefs);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    XLSX.utils.book_append_sheet(wb, ws, 'template');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-import-template.xlsx"');
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

router.post('/orders/import/xlsx', upload.single('file'), async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_input')) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!req.file?.buffer) return res.status(400).json({ error: 'FILE_REQUIRED' });
    const pool = getPool();
    const definitions = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    if (!definitions.length) return res.status(400).json({ error: 'NO_FIELDS_DEFINED' });
    const labels = definitions.map((d) => d.label_zh);
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return res.status(400).json({ error: 'EMPTY_SHEET' });
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    if (!data.length) return res.status(400).json({ error: 'EMPTY_SHEET' });
    const rawHeader = (data[0] || []).map((c) => c);
    const colIndexByNorm = new Map();
    for (let j = 0; j < rawHeader.length; j++) {
      const norm = normalizeImportHeaderLabel(rawHeader[j]);
      if (!norm) continue;
      if (colIndexByNorm.has(norm)) {
        return res.status(400).json({
          error: 'DUPLICATE_HEADER',
          message: `表头「${norm}」重复，请删除重复列后重试`,
          label: norm
        });
      }
      colIndexByNorm.set(norm, j);
    }
    const columnIndexes = [];
    const productDefI = definitions.findIndex((d) => d.field_key === 'product_model');
    for (let i = 0; i < definitions.length; i++) {
      const def = definitions[i];
      let idx;
      for (const syn of importHeaderSynonymsForField(def)) {
        const norm = normalizeImportHeaderLabel(syn);
        if (!norm) continue;
        const hit = colIndexByNorm.get(norm);
        if (hit !== undefined) {
          idx = hit;
          break;
        }
      }
      if (idx === undefined && def.field_key === 'warehouse_model' && productDefI >= 0) {
        const pIdx = columnIndexes[productDefI];
        if (pIdx !== undefined) idx = pIdx;
      }
      if (idx === undefined) {
        let hint = '';
        if (def.field_key === 'order_date') {
          hint = '；上传表中的「日期」列即为发货日期，无需改名';
        } else if (def.field_key === 'warehouse_model') {
          hint = '；若只有「标签型号/仓库型号」一列或仅有「标签型号」列，请将两值写在同一列（用 / 分隔）';
        }
        return res.status(400).json({
          error: 'HEADER_MISMATCH',
          message: `未找到与「${def.label_zh}」对应的表头列${hint}。请与模板列名一致或包含同义表头（可带 * 前缀，列顺序可任意）`,
          expected: labels,
          got: rawHeader.map((c) => String(c ?? '').trim())
        });
      }
      columnIndexes.push(idx);
    }
    const warehouseDefI = definitions.findIndex((d) => d.field_key === 'warehouse_model');
    const errors = [];
    let ok = 0;
    for (let ri = 1; ri < data.length; ri++) {
      const line = data[ri];
      if (!line || !line.some((c) => String(c || '').trim())) continue;
      const rowNum = ri + 1;
      const obj = {};
      definitions.forEach((d, j) => {
        const cell = line[columnIndexes[j]];
        obj[d.field_key] = coerceImportCell(cell, d.field_type);
      });
      if (
        productDefI >= 0 &&
        warehouseDefI >= 0 &&
        columnIndexes[productDefI] === columnIndexes[warehouseDefI]
      ) {
        const raw = line[columnIndexes[productDefI]];
        const { label, warehouse } = splitLabelWarehouseCell(raw);
        obj.product_model = coerceImportCell(label, 'text');
        obj.warehouse_model = coerceImportCell(warehouse, 'text');
      }
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await insertOrderWithData(conn, {
          userId: req.user.userId,
          data: obj,
          definitions,
          statusRemark: 'Excel导入'
        });
        await conn.commit();
        ok++;
      } catch (err) {
        await conn.rollback();
        if (Array.isArray(err.details) && err.details.length) {
          errors.push({
            row: rowNum,
            reason: err.details.map((d) => `${d.label_zh}: ${d.message}`).join('；')
          });
        } else {
          errors.push({ row: rowNum, reason: err.message || String(err) });
        }
      } finally {
        conn.release();
      }
    }
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '导入订单',
      detail: { ok, errors: errors.length }
    });
    res.json({ ok, errors });
  } catch (e) {
    next(e);
  }
});

/** ---------- 合同模板 ---------- */
router.get('/contract-templates', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'template_manage') && !perm(req, 'contract_management', 'contract_generate')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, name, created_at, updated_at FROM sales_contract_templates ORDER BY updated_at DESC'
    );
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/contract-templates/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'template_manage') && !perm(req, 'contract_management', 'contract_generate')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_contract_templates WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ template: rows[0] });
  } catch (e) {
    next(e);
  }
});

router.post('/contract-templates', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'template_manage')) return res.status(403).json({ error: 'FORBIDDEN' });
    const schema = z.object({
      name: z.string().min(1).max(128),
      body_html: z.string().min(1)
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const [r] = await pool.query(
      `INSERT INTO sales_contract_templates (name, body_html, created_by) VALUES (?, ?, ?)`,
      [body.name, body.body_html, req.user.userId]
    );
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '创建合同模板',
      detail: { id: r.insertId }
    });
    res.json({ id: r.insertId });
  } catch (e) {
    next(e);
  }
});

router.patch('/contract-templates/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'template_manage')) return res.status(403).json({ error: 'FORBIDDEN' });
    const schema = z.object({
      name: z.string().min(1).max(128).optional(),
      body_html: z.string().min(1).optional()
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const updates = [];
    const args = [];
    if (body.name != null) {
      updates.push('name = ?');
      args.push(body.name);
    }
    if (body.body_html != null) {
      updates.push('body_html = ?');
      args.push(body.body_html);
    }
    if (!updates.length) return res.json({ ok: true });
    args.push(req.params.id);
    await pool.query(`UPDATE sales_contract_templates SET ${updates.join(', ')} WHERE id = ?`, args);
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '修改合同模板',
      detail: { id: req.params.id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/contract-templates/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'template_manage')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    await pool.query('DELETE FROM sales_contract_templates WHERE id = ?', [req.params.id]);
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '删除合同模板',
      detail: { id: req.params.id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const generateContractSchema = z.object({
  template_id: z.coerce.number().int().positive(),
  order_ids: z.array(z.coerce.number().int().positive()).min(1),
  title: z.string().max(256).optional()
});

router.post('/contracts/generate', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_generate')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = generateContractSchema.parse(req.body || {});
    const pool = getPool();
    const placeholders = body.order_ids.map(() => '?').join(',');
    const [orders] = await pool.query(
      `SELECT o.*, c.customer_name, c.customer_code,
              c.address AS customer_address, c.contact_name AS customer_contact, c.phone AS customer_phone
       FROM sales_orders o
       INNER JOIN sales_customers c ON c.id = o.customer_id
       WHERE o.id IN (${placeholders})`,
      body.order_ids
    );
    if (orders.length !== body.order_ids.length) return res.status(400).json({ error: 'ORDER_NOT_FOUND' });
    const cid = orders[0].customer_id;
    if (!orders.every((o) => o.customer_id === cid)) return res.status(400).json({ error: 'CUSTOMER_MISMATCH' });
    if (!isSuper(req)) {
      for (const o of orders) {
        if (!isOrderCreatedByCurrentUser(o, req)) return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }
    const [[tplRows], [companyRows]] = await Promise.all([
      pool.query('SELECT * FROM sales_contract_templates WHERE id = ?', [body.template_id]),
      pool.query('SELECT company_name_zh FROM company_settings WHERE id = 1 LIMIT 1')
    ]);
    const tpl = tplRows[0];
    if (!tpl) return res.status(404).json({ error: 'TEMPLATE_NOT_FOUND' });
    const companyNameZh = companyRows[0]?.company_name_zh || '';

    const linesHtml = buildContractOrderLinesHtml(orders);
    const contractNo = `HT${shanghaiYmdCompact()}${nanoid(6).toUpperCase()}`;
    /** 明细金额由用户在合同内填写；占位总金额用 0 */
    const amountTotal = 0;
    const first = orders[0];
    const filledRaw = fillContractTemplate(tpl.body_html, {
      CUSTOMER_NAME: first.customer_name || '',
      ORDER_LINES: linesHtml,
      AMOUNT_TOTAL: amountTotal,
      AMOUNT_TOTAL_CN: amountToRmbUppercase(amountTotal),
      CONTRACT_NO: contractNo,
      SIGN_DATE_ZH: formatSigningDateZhShanghai(),
      COMPANY_NAME_ZH: companyNameZh,
      CUSTOMER_ADDRESS: first.customer_address || '',
      CUSTOMER_CONTACT: first.customer_contact || '',
      CUSTOMER_PHONE: first.customer_phone || ''
    });

    /**
     * 兜底：历史模板可能缺少统一外层 div（或字体声明），导致前端无法将正文反解析回可视化表单。
     * 这里不改变模板正文内容，只补一个标准外壳，保证后续可视化识别的基础条件更一致。
     */
    function ensureStandardContractOuterWrap(html) {
      const s = String(html || '').trim();
      if (!s) return s;
      // 已包含常用字体/外层：不重复包裹
      if (s.includes('SimSun') || s.includes('宋体')) return s;
      return `<div style="font-family:SimSun,宋体;line-height:1.8;font-size:14px;color:#000">${s}</div>`;
    }

    const filled = ensureStandardContractOuterWrap(filledRaw);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [ins] = await conn.query(
        `INSERT INTO sales_contracts (contract_no, template_id, customer_id, title, body_html, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
        [
          contractNo,
          tpl.id,
          cid,
          body.title || `销售合同-${orders[0].customer_name}`,
          filled,
          req.user.userId
        ]
      );
      const contractId = ins.insertId;
      for (const oid of body.order_ids) {
        await conn.query('INSERT INTO sales_contract_orders (contract_id, order_id) VALUES (?, ?)', [contractId, oid]);
      }
      await conn.query(
        `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
         VALUES (?, ?, 'create', NULL, '生成合同草稿')`,
        [contractId, req.user.userId]
      );
      await conn.commit();
      await logOperationFromReq(req, {
        module: '销售合同',
        action: '生成合同草稿',
        detail: { id: contractId }
      });
      res.json({ id: contractId, contract_no: contractNo });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

router.post('/contracts/upload-document', contractDocumentUpload.single('file'), async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_generate')) return res.status(403).json({ error: 'FORBIDDEN' });
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'NO_FILE' });
    if (!contractDocumentMimeOk(f.mimetype)) return res.status(400).json({ error: 'UNSUPPORTED_TYPE' });
    const customerId = Number(req.body?.customer_id);
    if (!Number.isFinite(customerId) || customerId < 1) return res.status(400).json({ error: 'BAD_CUSTOMER' });
    const titleRaw = req.body?.title != null ? String(req.body.title).trim() : '';
    const pool = getPool();
    const [cu] = await pool.query('SELECT id FROM sales_customers WHERE id = ? LIMIT 1', [customerId]);
    if (!cu.length) return res.status(400).json({ error: 'CUSTOMER_NOT_FOUND' });
    if (!isSuper(req)) {
      const [chk] = await pool.query(
        'SELECT 1 FROM sales_orders WHERE customer_id = ? AND created_by = ? LIMIT 1',
        [customerId, req.user.userId]
      );
      if (!chk.length) return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const contractNo = `HT${shanghaiYmdCompact()}${nanoid(6).toUpperCase()}`;
    const origName = String(f.originalname || 'contract');
    const title = titleRaw || origName.replace(/\.[^/.]+$/, '') || `文档合同-${contractNo}`;
    const conn = await pool.getConnection();
    let contractId;
    try {
      await conn.beginTransaction();
      const [ins] = await conn.query(
        `INSERT INTO sales_contracts (contract_no, template_id, customer_id, title, body_html, contract_source, status, created_by)
         VALUES (?, NULL, ?, ?, ?, 'upload', 'draft', ?)`,
        [contractNo, customerId, title, UPLOAD_CONTRACT_BODY_HTML, req.user.userId]
      );
      contractId = ins.insertId;
      const relDir = path.join('sales_contract_documents', String(contractId));
      const absDir = path.resolve(process.cwd(), 'uploads', relDir);
      await fsPromises.mkdir(absDir, { recursive: true });
      const stored = `${nanoid(14)}_${safeContractDocumentStoredBaseName(f.originalname)}`;
      const storedRel = path.join(relDir, stored).replace(/\\/g, '/');
      await fsPromises.writeFile(path.join(absDir, stored), f.buffer);
      const mime = String(f.mimetype || '').split(';')[0].trim().toLowerCase();
      await conn.query(
        `UPDATE sales_contracts SET document_stored_rel_path = ?, document_mime_type = ?, document_original_filename = ?, document_size_bytes = ?, updated_at = NOW(3) WHERE id = ?`,
        [storedRel, mime, origName.slice(0, 512), f.size || 0, contractId]
      );
      await conn.query(
        `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
         VALUES (?, ?, 'create', NULL, '上传文档合同草稿')`,
        [contractId, req.user.userId]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '上传文档合同',
      detail: { id: contractId }
    });
    res.json({ id: contractId, contract_no: contractNo });
  } catch (e) {
    next(e);
  }
});

router.get('/contracts', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_view')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const seeAll = canViewAllSalesOrders(req);
    const qRaw = req.query.q != null ? String(req.query.q).trim() : '';
    const statusRaw = req.query.status != null ? String(req.query.status).trim() : '';
    const allowedStatus = new Set(['draft', 'pending_review', 'approved', 'rejected']);
    const statusFilter = allowedStatus.has(statusRaw) ? statusRaw : '';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

    let where = ' WHERE 1=1';
    const args = [];
    if (!seeAll) {
      where += ` AND (c.created_by = ? OR c.customer_id IN (
        SELECT DISTINCT customer_id FROM sales_orders WHERE created_by = ?
      ))`;
      args.push(req.user.userId, req.user.userId);
    }
    if (qRaw) {
      where += ` AND (c.contract_no LIKE ? OR cu.customer_name LIKE ? OR IFNULL(c.title,'') LIKE ?)`;
      const p = `%${qRaw}%`;
      args.push(p, p, p);
    }
    if (statusFilter) {
      where += ' AND c.status = ?';
      args.push(statusFilter);
    }
    const customerFilterRaw = req.query.customer_id != null ? String(req.query.customer_id).trim() : '';
    if (customerFilterRaw !== '') {
      const cid = Number(customerFilterRaw);
      if (Number.isFinite(cid) && cid >= 1) {
        where += ' AND c.customer_id = ?';
        args.push(cid);
      }
    }

    const from = `FROM sales_contracts c
       INNER JOIN sales_customers cu ON cu.id = c.customer_id
       LEFT JOIN users u ON u.id = c.created_by${where}`;

    const [countRows] = await pool.query(`SELECT COUNT(*) AS n ${from}`, args);
    const total = Number(countRows[0]?.n || 0);

    const sql = `SELECT c.*, cu.customer_name, u.username AS created_by_username,
                      (SELECT a.comment_text FROM sales_contract_audit_logs a
                       WHERE a.contract_id = c.id AND a.result = 'rejected'
                       ORDER BY a.id DESC LIMIT 1) AS last_reject_comment
               ${from}
               ORDER BY c.created_at DESC
               LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(sql, [...args, limit, offset]);
    res.json({ items: rows, total });
  } catch (e) {
    next(e);
  }
});

const bulkDeleteContractsSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(100)
});

router.post('/contracts/bulk-delete', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_delete')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = bulkDeleteContractsSchema.parse(req.body || {});
    const uniqueIds = [...new Set(body.ids)];
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const id of uniqueIds) {
        const c = await fetchSalesContractRow(conn, id);
        const vis = await assertSalesContractVisible(req, conn, c);
        if (vis.code === 'NOT_FOUND') {
          await conn.rollback();
          return res.status(400).json({ error: 'NOT_FOUND', id });
        }
        if (!vis.ok) {
          await conn.rollback();
          return res.status(403).json({ error: 'FORBIDDEN', id });
        }
        if (!canMutateSalesContractAsCreator(req, c)) {
          await conn.rollback();
          return res.status(403).json({ error: 'FORBIDDEN', id });
        }
        if (!contractStatusAllowsDelete(c, req)) {
          await conn.rollback();
          return res.status(400).json({ error: 'INVALID_STATUS', id });
        }
      }
      await unlinkSalesContractUploadDocuments(conn, uniqueIds);
      const ph = uniqueIds.map(() => '?').join(',');
      await conn.query(`DELETE FROM sales_contracts WHERE id IN (${ph})`, uniqueIds);
      await conn.commit();
      await logOperationFromReq(req, {
        module: '销售合同',
        action: '批量删除合同',
        detail: { ids: uniqueIds, count: uniqueIds.length },
        success: true
      });
      res.json({ ok: true, deleted: uniqueIds.length });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

router.get('/contracts/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_view')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT c.*, cu.customer_name,
              cu.address AS customer_address, cu.contact_name AS customer_contact, cu.phone AS customer_phone,
              (SELECT company_name_zh FROM company_settings WHERE id = 1 LIMIT 1) AS company_name_zh
       FROM sales_contracts c
       INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    const seeAll = canViewAllSalesOrders(req);
    const c = rows[0];
    if (!seeAll && !isOrderCreatedByCurrentUser(c, req)) {
      const [chk] = await pool.query(
        'SELECT 1 FROM sales_orders WHERE customer_id = ? AND created_by = ? LIMIT 1',
        [c.customer_id, req.user.userId]
      );
      if (!chk.length) return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const [orders] = await pool.query(
      `SELECT o.id, o.order_no, o.product_name, o.product_model, o.amount FROM sales_orders o
       INNER JOIN sales_contract_orders sco ON sco.order_id = o.id WHERE sco.contract_id = ?`,
      [req.params.id]
    );
    const [audits] = await pool.query(
      `SELECT a.*, u.username AS actor_username FROM sales_contract_audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id WHERE a.contract_id = ? ORDER BY a.created_at ASC`,
      [req.params.id]
    );
    res.json({ contract: c, orders, audits });
  } catch (e) {
    next(e);
  }
});

router.get('/contracts/:id/document', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_view')) return res.status(403).json({ error: 'FORBIDDEN' });
    const cid = Number(req.params.id);
    if (!Number.isFinite(cid) || cid < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, cid);
    if (!c) return res.status(404).json({ error: 'NOT_FOUND' });
    const vis = await assertSalesContractVisible(req, pool, c);
    if (!vis.ok) return res.status(vis.code === 'NOT_FOUND' ? 404 : 403).json({ error: vis.code || 'FORBIDDEN' });
    if (c.contract_source !== 'upload') return res.status(400).json({ error: 'NOT_UPLOAD_CONTRACT' });
    const full = resolveContractUploadFilePath(c);
    if (!full) return res.status(404).json({ error: 'NOT_FOUND' });
    try {
      await fsPromises.access(full);
    } catch {
      return res.status(404).json({ error: 'FILE_MISSING' });
    }
    const mime =
      String(c.document_mime_type || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', contentDispositionHeader(c.document_original_filename || 'contract'));
    const stream = createReadStream(full);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (e) {
    next(e);
  }
});

router.post('/contracts/:id/replace-document', contractDocumentUpload.single('file'), async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_edit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'NO_FILE' });
    if (!contractDocumentMimeOk(f.mimetype)) return res.status(400).json({ error: 'UNSUPPORTED_TYPE' });
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, id);
    const vis = await assertSalesContractVisible(req, pool, c);
    if (vis.code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (!vis.ok) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!canMutateSalesContractAsCreator(req, c)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!contractStatusAllowsEdit(c, req)) return res.status(400).json({ error: 'INVALID_STATUS' });
    if (c.contract_source !== 'upload') return res.status(400).json({ error: 'NOT_UPLOAD_CONTRACT' });
    const oldFull = resolveContractUploadFilePath(c);
    if (oldFull) await fsPromises.unlink(oldFull).catch(() => {});
    const relDir = path.join('sales_contract_documents', String(id));
    const absDir = path.resolve(process.cwd(), 'uploads', relDir);
    await fsPromises.mkdir(absDir, { recursive: true });
    const stored = `${nanoid(14)}_${safeContractDocumentStoredBaseName(f.originalname)}`;
    const storedRel = path.join(relDir, stored).replace(/\\/g, '/');
    await fsPromises.writeFile(path.join(absDir, stored), f.buffer);
    const mime = String(f.mimetype || '').split(';')[0].trim().toLowerCase();
    const origName = String(f.originalname || stored).slice(0, 512);
    await pool.query(
      `UPDATE sales_contracts SET document_stored_rel_path = ?, document_mime_type = ?, document_original_filename = ?, document_size_bytes = ?, updated_at = NOW(3) WHERE id = ?`,
      [storedRel, mime, origName, f.size || 0, id]
    );
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '更换文档合同文件',
      detail: { id },
      success: true
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const patchContractSchema = z
  .object({
    title: z.string().max(256).optional(),
    body_html: z.string().min(1).optional()
  })
  .refine((d) => d.title !== undefined || d.body_html !== undefined, { message: 'EMPTY_PATCH' });

router.patch('/contracts/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_edit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const body = patchContractSchema.parse(req.body || {});
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, id);
    const vis = await assertSalesContractVisible(req, pool, c);
    if (vis.code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (!vis.ok) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!canMutateSalesContractAsCreator(req, c)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!contractStatusAllowsEdit(c, req)) return res.status(400).json({ error: 'INVALID_STATUS' });
    if (c.contract_source === 'upload' && body.body_html !== undefined) {
      return res.status(400).json({ error: 'UPLOAD_CONTRACT_NO_BODY_EDIT' });
    }
    const updates = [];
    const args = [];
    if (body.title !== undefined) {
      updates.push('title = ?');
      args.push(String(body.title).trim());
    }
    if (body.body_html !== undefined) {
      updates.push('body_html = ?');
      args.push(body.body_html);
    }
    updates.push('updated_at = NOW(3)');
    args.push(id);
    await pool.query(`UPDATE sales_contracts SET ${updates.join(', ')} WHERE id = ?`, args);
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '修改合同',
      detail: { id },
      success: true
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/contracts/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_delete')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, id);
    const vis = await assertSalesContractVisible(req, pool, c);
    if (vis.code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (!vis.ok) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!canMutateSalesContractAsCreator(req, c)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!contractStatusAllowsDelete(c, req)) return res.status(400).json({ error: 'INVALID_STATUS' });
    await unlinkSalesContractUploadDocuments(pool, [id]);
    await pool.query('DELETE FROM sales_contracts WHERE id = ?', [id]);
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '删除合同',
      detail: { id },
      success: true
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const submitContractSchema = z.object({
  reviewer_user_id: z.coerce.number().int().positive()
});

router.post('/contracts/:id/submit', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_submit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = submitContractSchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT c.*, cu.customer_name AS linked_customer_name FROM sales_contracts c
       INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ?`,
      [req.params.id]
    );
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(c, req)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (c.status !== 'draft') return res.status(400).json({ error: 'INVALID_STATUS' });
    const [rev] = await pool.query(
      `SELECT u.id FROM users u
       INNER JOIN employee_categories cat ON cat.id = u.employee_category_id
       WHERE u.id = ? AND u.is_active = 1 AND u.account_type IN ('employee', 'manager')
         AND (cat.code = 'finance' OR cat.code = 'sales_admin')`,
      [body.reviewer_user_id]
    );
    if (!rev.length) return res.status(400).json({ error: 'INVALID_REVIEWER' });
    await pool.query(
      `UPDATE sales_contracts SET status = 'pending_review', reviewer_user_id = ?, updated_at = NOW(3) WHERE id = ?`,
      [body.reviewer_user_id, req.params.id]
    );
    await pool.query(
      `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
       VALUES (?, ?, 'submit', NULL, ?)`,
      [req.params.id, req.user.userId, `提交审核，审核人用户ID ${body.reviewer_user_id}`]
    );
    const contractSubmitBody = await buildContractOrdersNotifyBody(pool, Number(req.params.id), {
      intro: `合同 ${c.contract_no} 待您审核。`,
      customerName: c.linked_customer_name || ''
    });
    await notifyUser(pool, body.reviewer_user_id, {
      title: '合同待审核',
      bodyText: contractSubmitBody,
      fromUserId: req.user.userId,
      refType: 'contract',
      refId: Number(req.params.id),
      msgCategory: 'todo'
    });
    await tryNotifyContractReviewerOnSubmit(pool, {
      contractRow: c,
      notifyBody: contractSubmitBody,
      fromUserId: req.user.userId,
      reviewerUserId: body.reviewer_user_id
    });
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '提交合同审核',
      detail: { id: req.params.id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const reviewContractSchema = z.object({
  result: z.enum(['approved', 'rejected']),
  comment: z.string().max(2048).optional()
});

router.post('/contracts/:id/review', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_review')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = reviewContractSchema.parse(req.body || {});
    if (body.result === 'rejected' && !String(body.comment || '').trim()) {
      return res.status(400).json({ error: 'COMMENT_REQUIRED' });
    }
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT c.*, cu.customer_name AS linked_customer_name FROM sales_contracts c
       INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ?`,
      [req.params.id]
    );
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'NOT_FOUND' });
    if (c.status !== 'pending_review') return res.status(400).json({ error: 'INVALID_STATUS' });
    if (!isSuper(req) && c.reviewer_user_id !== req.user.userId) return res.status(403).json({ error: 'FORBIDDEN' });
    const st = body.result === 'approved' ? 'approved' : 'rejected';
    await pool.query(`UPDATE sales_contracts SET status = ?, updated_at = NOW(3) WHERE id = ?`, [st, req.params.id]);
    await pool.query(
      `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
       VALUES (?, ?, 'review', ?, ?)`,
      [req.params.id, req.user.userId, body.result, body.comment || null]
    );
    if (c.created_by) {
      const reviewIntro =
        body.result === 'approved'
          ? `合同 ${c.contract_no} 审核已通过。`
          : `合同 ${c.contract_no} 审核已驳回。\n审核意见：${body.comment || ''}`;
      const contractReviewBody = await buildContractOrdersNotifyBody(pool, Number(req.params.id), {
        intro: reviewIntro,
        customerName: c.linked_customer_name || ''
      });
      await notifyUser(pool, c.created_by, {
        title: `合同审核${body.result === 'approved' ? '通过' : '驳回'}`,
        bodyText: contractReviewBody,
        fromUserId: req.user.userId,
        refType: 'contract',
        refId: Number(req.params.id),
        msgCategory: body.result === 'approved' ? 'notice' : 'todo'
      });
      await tryNotifyContractCreatorOnReview(pool, {
        contractRow: c,
        notifyBody: contractReviewBody,
        fromUserId: req.user.userId,
        result: body.result,
        reviewComment: body.comment || ''
      });
    }
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '审核合同',
      detail: { id: req.params.id, result: body.result }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** 流程追溯：订单状态日志汇总（需流程权限或订单全量查询） */
router.get('/process/order-logs', async (req, res, next) => {
  try {
    if (!perm(req, 'process_management', 'view_flow')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const orderNo = req.query.order_no;
    const seeAll = canViewAllSalesOrders(req);
    let sql = `SELECT l.*, o.order_no, u.username AS actor_username
               FROM sales_order_status_logs l
               INNER JOIN sales_orders o ON o.id = l.order_id
               LEFT JOIN users u ON u.id = l.actor_id
               WHERE 1=1`;
    const args = [];
    if (!seeAll) {
      sql += ' AND o.created_by = ?';
      args.push(req.user.userId);
    }
    if (orderNo && orderNo.trim() !== '') {
      sql += ' AND o.order_no LIKE ?';
      args.push(`%${orderNo}%`);
    }
    const finScopeP = financeOrderListScopeSql(req);
    sql += finScopeP.sql;
    args.push(...finScopeP.args);
    sql += ' ORDER BY l.created_at DESC LIMIT ?';
    args.push(limit);
    const [rows] = await pool.query(sql, args);
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

/** 财务审核员列表（提交合同时选人）；可选 departmentId= 部门树筛选（含子部门） */
router.get('/finance-reviewers', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_submit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const rawDept = req.query.departmentId;
    let deptIds = null;
    if (rawDept != null && String(rawDept).trim() !== '') {
      const rootId = Number(rawDept);
      if (!Number.isFinite(rootId) || rootId < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
      const [chk] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [rootId]);
      if (!chk?.[0]) return res.status(400).json({ error: 'BAD_DEPARTMENT' });
      deptIds = await departmentSubtreeIds(pool, rootId);
    }
    let sql = `SELECT u.id, u.username, u.department_id AS departmentId, d.name_zh AS departmentNameZh
       FROM users u
       INNER JOIN employee_categories c ON c.id = u.employee_category_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code IN ('finance', 'sales_admin')`;
    const args = [];
    if (deptIds?.length) {
      sql += ` AND u.department_id IN (${deptIds.map(() => '?').join(',')})`;
      args.push(...deptIds);
    }
    const [rows] = await pool.query(sql, args);
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/sales-users', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_query')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id, u.username FROM users u
       INNER JOIN employee_categories c ON c.id = u.employee_category_id
       WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code = 'sales'`
    );
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});
