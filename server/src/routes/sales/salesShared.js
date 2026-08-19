import { hasPermission } from '../../lib/permissions.js';
import { resolveQrcodeUid } from '../../lib/qrcodeUid.js';
import { resolveConfiguredPublicBaseUrl } from '../../lib/publicBaseUrl.js';
import {
  MAPS_TO_KEYS,
  normalizeOrderDateInput,
  roundOrderDecimal4
} from '../../lib/salesOrderFields.js';
export {
  generateUniqueOrderNo,
  insertOrderWithData,
  lookupCustomerUnitPriceTon,
  lookupCustomerUnitPriceTonByCustomerName,
  applyLegUnitPriceAndAmount,
  extractUserImportUnitPriceTon,
  randomWyCustomerCode,
  allocateUniqueCustomerCode,
  generateCustomerCode,
  getOrCreateCustomer
} from '../../lib/salesOrderCrudShared.js';

/** Excel 导入：单价列表头同义词（字段未启用时也识别） */
export const IMPORT_UNIT_PRICE_HEADER_LABELS = [
  '单价',
  '价格',
  '含税单价',
  '不含税单价',
  '销售单价'
];

/**
 * @param {Map<string, number>} colIndexByNorm normalizeImportHeaderLabel 后的表头 → 列下标
 * @param {number[]} [excludeIndexes] 已由其它字段占用的列（避免重复读取）
 */
export function resolveImportUnitPriceColumnIndex(colIndexByNorm, excludeIndexes = []) {
  const exclude = new Set(excludeIndexes.filter((i) => typeof i === 'number'));
  for (const label of IMPORT_UNIT_PRICE_HEADER_LABELS) {
    const norm = normalizeImportHeaderLabel(label);
    const idx = colIndexByNorm.get(norm);
    if (typeof idx === 'number' && !exclude.has(idx)) return idx;
  }
  return null;
}

/** 导入表内单价为元/kg，订单物理列存元/吨 */
export function parseImportUnitPriceKgToTon(cell) {
  if (cell == null || cell === '') return null;
  const n = typeof cell === 'number' ? cell : Number(String(cell).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return roundOrderDecimal4(n * 1000);
}

/** 导入表头与模板对齐：去 BOM、空白、可选前导 *（截图常用）、全角斜杠等 */
export function normalizeImportHeaderLabel(raw) {
  let s = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/^[\s\u3000]+|[\s\u3000]+$/g, '')
    .trim();
  s = s.replace(/^[\*＊※]\s*/, '').trim();
  s = s.replace(/\uFF0F/g, '/');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

export function coerceImportCell(v, fieldType) {
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

export function publicBaseUrl() {
  return resolveConfiguredPublicBaseUrl() || '';
}

export function isSuper(req) {
  return req.user?.accountType === 'super_admin';
}

/** 当前登录用户数字 ID；mysql2 禁止占位符为 undefined，缺 userId 时回退 JWT sub */
export function authenticatedNumericUserId(req) {
  const raw = req.user?.userId ?? req.user?.sub;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** BIGINT 等可能无法被 res.json 序列化（如 BigInt） */
export function jsonSafeSalesInternalMessageRow(r) {
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

export function perm(req, mod, key) {
  if (isSuper(req)) return true;
  return hasPermission(req.user?.permissions, mod, key);
}

/**
 * 是否不按 created_by 过滤订单列表。
 * order_query_all：显式查看全员订单。
 * 财务审单 / 仓库发货必须看到销售等他人录入的单据；若仅靠 order_query、未开 order_query_all，列表会只剩本人 created_by，待审核/待发货常为空。
 */
export function canViewAllSalesOrders(req) {
  if (isSuper(req)) return true;
  if (perm(req, 'order_management', 'order_query_all')) return true;
  if (perm(req, 'order_management', 'order_status_finance')) return true;
  if (perm(req, 'order_management', 'order_status_qc')) return true;
  if (perm(req, 'order_management', 'order_status_warehouse')) return true;
  return false;
}

/**
 * 列表「纯品管」视图：仅有品管审单权、且无订单录入权时，只展示待品管队列（财务已通过），日期按 finance_reviewed_at。
 */
export function isPureQcOrderScope(req) {
  if (isSuper(req)) return false;
  if (!perm(req, 'order_management', 'order_status_qc')) return false;
  if (perm(req, 'order_management', 'order_input')) return false;
  return true;
}

/**
 * 进入「合同列表/合同详情/合同文件」等读接口：除 contract_view 外，能生成/改/审/删的账号也应看到与自己相关的数据，
 * 避免只勾了「生成合同」却永远 403、列表页空白。
 * （template_manage 仅维护模板，不因此开放全量合同 SQL。）
 */
export function canAccessSalesContractWorkspace(req) {
  if (isSuper(req)) return true;
  return (
    perm(req, 'contract_management', 'contract_view') ||
    perm(req, 'contract_management', 'contract_generate') ||
    perm(req, 'contract_management', 'contract_submit') ||
    perm(req, 'contract_management', 'contract_edit') ||
    perm(req, 'contract_management', 'contract_delete') ||
    perm(req, 'contract_management', 'contract_review')
  );
}

/** 确认发货：独立权限 order_ship；保留 order_status_warehouse 以兼容旧数据（原「仓库发货」勾选项） */
export function canMarkOrderShipped(req) {
  if (isSuper(req)) return true;
  if (perm(req, 'order_management', 'order_ship')) return true;
  if (perm(req, 'order_management', 'order_status_warehouse')) return true;
  return false;
}

export function isOrderCreatedByCurrentUser(row, req) {
  if (!row || req.user?.userId == null) return false;
  if (row.created_by == null) return false;
  return Number(row.created_by) === Number(req.user.userId);
}

export async function fetchSalesContractRow(pool, id) {
  const nid = Number(id);
  if (!Number.isFinite(nid) || nid < 1) return null;
  const [rows] = await pool.query(
    `SELECT c.*, cu.customer_name,
            cu.address AS customer_address, cu.contact_person AS customer_contact, cu.phone AS customer_phone,
            cu.fax AS customer_fax, cu.bank_name AS customer_bank, cu.bank_account AS customer_account, cu.tax_id AS customer_tax_id
     FROM sales_contracts c
     INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ? LIMIT 1`,
    [nid]
  );
  return rows[0] || null;
}

/** 与 GET /contracts/:id 一致：能否查看该合同 */
export async function assertSalesContractVisible(req, pool, c) {
  if (!c) return { ok: false, code: 'NOT_FOUND' };
  if (
    isPureFinanceOrderScope(req) &&
    String(c.status || '') === 'draft' &&
    !isOrderCreatedByCurrentUser(c, req)
  ) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const seeAll = canViewAllSalesOrders(req);
  if (seeAll) return { ok: true, contract: c };
  if (isOrderCreatedByCurrentUser(c, req)) return { ok: true, contract: c };
  const ru = c.reviewer_user_id != null ? Number(c.reviewer_user_id) : NaN;
  if (Number.isFinite(ru) && ru >= 1 && ru === Number(req.user.userId)) return { ok: true, contract: c };
  if (perm(req, 'contract_management', 'contract_review') && String(c.status || '') === 'pending_review') {
    return { ok: true, contract: c };
  }
  const [chk] = await pool.query(
    'SELECT 1 FROM sales_orders WHERE customer_id = ? AND created_by = ? LIMIT 1',
    [c.customer_id, req.user.userId]
  );
  if (!chk.length) return { ok: false, code: 'FORBIDDEN' };
  return { ok: true, contract: c };
}

/** 修改/删除：超级管理员任意；普通员工仅本人创建的合同 */
export function canMutateSalesContractAsCreator(req, c) {
  if (isSuper(req)) return true;
  return isOrderCreatedByCurrentUser(c, req);
}

export function contractStatusAllowsEdit(c, req) {
  if (isSuper(req)) return true;
  if (c.status === 'draft' || c.status === 'rejected') return true;
  if (c.status === 'approved' && perm(req, 'contract_management', 'contract_edit_approved')) return true;
  return false;
}

export function contractStatusAllowsDelete(c, req) {
  if (isSuper(req)) return true;
  if (c.status === 'draft' || c.status === 'rejected') return true;
  if (c.status === 'approved' && perm(req, 'contract_management', 'contract_delete_approved')) return true;
  return false;
}

/**
 * 订单管理列表的「纯财务」视图：仅有财务审核权、且不能录入/导入订单的账号。
 * 只能看到销售已点击「提交审核」的订单（submitted_for_review_at 非空）；
 * Excel/手工录入后未提交的单据不会出现。避免误给财务开通 order_input 导致看到全量。
 * 超级管理员、有 order_input 的账号（销售/销售管理员等）仍看全量。
 */
export function isPureFinanceOrderScope(req) {
  if (isSuper(req)) return false;
  if (!perm(req, 'order_management', 'order_status_finance')) return false;
  if (perm(req, 'order_management', 'order_input')) return false;
  return true;
}

export function financeOrderListScopeSql(req) {
  if (!isPureFinanceOrderScope(req)) return { sql: '', args: [] };
  return {
    sql: ' AND o.submitted_for_review_at IS NOT NULL',
    args: []
  };
}

/** 纯财务合同列表：不展示销售未提交审核的草稿（与订单 submitted_for_review_at 过滤一致） */
export function financeContractListScopeSql(req) {
  if (!isPureFinanceOrderScope(req)) return { sql: '', args: [] };
  return {
    sql: " AND c.status <> 'draft'",
    args: []
  };
}

/**
 * 下一自然日 YYYY-MM-DD（与 `DATE_ADD(ymd, INTERVAL 1 DAY)` 在日期边界语义上等价）。
 * 避免部分 MySQL/代理在预处理语句中对 `DATE_ADD(?, …)` 报 ER_PARSE_ERROR。
 */
function nextCalendarDayYmd(ymd) {
  const s = String(ymd || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

/**
 * 列表日期范围：默认按上传时间 created_at。
 * 勾选「仅待财务审核」：按提交审核时间 submitted_for_review_at。
 * 纯财务视图（仅有财务审单、无 order_input）：列表只含已提交过的订单，日期也按 submitted_for_review_at，
 * 避免「很久以前录入、今天才提交」的订单有通知但列表为空。
 */
export function appendOrderListDateRange(sql, args, q, req, opts = {}) {
  if (opts.skipAll) return sql;
  const hasDateFrom = Boolean(q.date_from);
  const hasDateTo = Boolean(q.date_to);
  const shouldApplyDefaultRange =
    q.pending_finance_only || q.pending_qc_only || isPureFinanceOrderScope(req) || isPureQcOrderScope(req);
  if (!hasDateFrom && !hasDateTo && !shouldApplyDefaultRange) {
    return sql;
  }
  const end = hasDateTo ? new Date(q.date_to) : new Date();
  const start = hasDateFrom ? new Date(q.date_from) : new Date(end.getTime() - 30 * 86400000);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const endExclusive = nextCalendarDayYmd(endStr);
  if (q.pending_finance_only) {
    sql += " AND o.status = 'pending_review' AND o.submitted_for_review_at IS NOT NULL";
    sql += ' AND o.submitted_for_review_at >= ? AND o.submitted_for_review_at < ?';
    args.push(startStr, endExclusive);
  } else if (q.pending_qc_only) {
    sql += " AND o.status = 'pending_qc'";
    sql += ' AND o.finance_reviewed_at >= ? AND o.finance_reviewed_at < ?';
    args.push(startStr, endExclusive);
  } else if (isPureFinanceOrderScope(req)) {
    sql += ' AND o.submitted_for_review_at >= ? AND o.submitted_for_review_at < ?';
    args.push(startStr, endExclusive);
  } else if (isPureQcOrderScope(req)) {
    sql += " AND o.status = 'pending_qc'";
    sql += ' AND o.finance_reviewed_at >= ? AND o.finance_reviewed_at < ?';
    args.push(startStr, endExclusive);
  } else {
    sql += ' AND o.created_at >= ? AND o.created_at < ?';
    args.push(startStr, endExclusive);
  }
  return sql;
}

const FLOW_BUCKETS = new Set([
  'pending_submit',
  'pending_finance',
  'finance_rejected',
  'pending_qc',
  'qc_rejected',
  'pending_ship',
  'shipped_open',
  'rejected'
]);

/**
 * 与 GET /orders 列表一致：可见范围 + 文本筛选 + 日期 + 财务范围 + 流程看板快捷筛（flow_bucket）。
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} q 已 parse 的 listQuery
 * @param {{ uid: number, seeAll: boolean }} scope
 * @param {{ skipDateRange?: boolean }} [opts] skipDateRange：统计看板不按列表默认 30 天等日期收窄
 * @returns {{ sql: string, args: unknown[] }} **args 与入参为同一数组**，已就地 push 占位值，调用方勿 `args.length = 0` 后再 `push(...scoped.args)`。
 */
export function appendSalesOrderListFilters(sql, args, req, q, { uid, seeAll }, opts = {}) {
  if (!seeAll) {
    sql += ' AND o.created_by = ?';
    args.push(uid);
  }
  if (q.id) {
    sql += ' AND o.id = ?';
    args.push(q.id);
  }
  if (q.customer_name) {
    sql += ' AND c.customer_name LIKE ?';
    args.push(`%${q.customer_name}%`);
  }
  if (q.customer_code) {
    sql += ' AND c.customer_code LIKE ?';
    args.push(`%${q.customer_code}%`);
  }
  if (q.contact_name) {
    sql += ' AND c.contact_name LIKE ?';
    args.push(`%${q.contact_name}%`);
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

  const fb = q.flow_bucket && FLOW_BUCKETS.has(String(q.flow_bucket)) ? String(q.flow_bucket) : '';
  if (fb) {
    if (fb === 'pending_submit') {
      sql += " AND o.status = 'pending_review' AND o.submitted_for_review_at IS NULL";
    } else if (fb === 'pending_finance') {
      sql += " AND o.status = 'pending_review' AND o.submitted_for_review_at IS NOT NULL";
    } else if (fb === 'pending_qc') {
      sql += " AND o.status = 'pending_qc'";
    } else if (fb === 'pending_ship') {
      sql += " AND o.status = 'approved'";
    } else if (fb === 'shipped_open') {
      sql += " AND o.status = 'shipped'";
    } else if (fb === 'finance_rejected') {
      sql += " AND o.status = 'rejected' AND o.qc_reviewed_at IS NULL";
    } else if (fb === 'qc_rejected') {
      sql += " AND o.status = 'rejected' AND o.qc_reviewed_at IS NOT NULL";
    } else if (fb === 'rejected') {
      sql += " AND o.status = 'rejected'";
    }
  } else if (q.status) {
    sql += ' AND o.status = ?';
    args.push(q.status);
  }

  if (q.sales_user_id && seeAll) {
    sql += ' AND o.created_by = ?';
    args.push(q.sales_user_id);
  }
  sql = appendOrderListDateRange(sql, args, q, req, { skipAll: opts.skipDateRange === true });
  const finScopeSql = financeOrderListScopeSql(req);
  sql += finScopeSql.sql;
  args.push(...finScopeSql.args);
  return { sql, args };
}

export function assertFinanceOrderListScope(req, row) {
  if (!row) return;
  if (!isPureFinanceOrderScope(req)) return;
  if (row.submitted_for_review_at == null) {
    const e = new Error('FORBIDDEN');
    e.code = 'FORBIDDEN';
    throw e;
  }
}

export {
  clampInternalMessageBody,
  normalizeInternalMessageCategory,
  notifyUsersByCategory,
  notifyUser
} from '../../lib/salesInternalInbox.js';

/** 某部门及其下级部门 id（含自身），用于按组织架构筛选审批人 */
export async function departmentSubtreeIds(pool, rootId) {
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

export async function assertMapsToAvailable(pool, mapsTo, excludeId = null) {
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

/** Excel 导入：全字段内容一致视为重复行（用于强提醒） */
export function orderImportRowFingerprint(definitions, obj) {
  const parts = definitions.map((d) => {
    const v = obj[d.field_key];
    if (v === null || v === undefined) return '';
    if (typeof v === 'number' && Number.isFinite(v)) return String(roundOrderDecimal4(v));
    return String(v).trim().replace(/\s+/g, ' ');
  });
  return parts.join('\x1f');
}

/** 质检自动匹配键：客户 + 标签型号 + 批号（均 trim、小写），缺型号或批号则无法自动匹配 */
export function qcAutoMatchKey(customerId, productModel, batchNo) {
  const cid =
    customerId != null && Number.isFinite(Number(customerId)) && Number(customerId) > 0
      ? String(Number(customerId))
      : '';
  const model = String(productModel || '').trim().toLowerCase();
  const batch = String(batchNo || '').trim().toLowerCase();
  if (!model || !batch) return null;
  return `${cid}\x00${model}\x00${batch}`;
}

/** 订单自动匹配时使用的 map 键（有客户时仅客户维度，无客户时才走通用键） */
export function qcLookupKeysForOrder(customerId, productModel, batchNo) {
  const hasCustomer =
    customerId != null && Number.isFinite(Number(customerId)) && Number(customerId) > 0;
  if (hasCustomer) {
    const k = qcAutoMatchKey(customerId, productModel, batchNo);
    return k ? [k] : [];
  }
  const k = qcAutoMatchKey(null, productModel, batchNo);
  return k ? [k] : [];
}

export async function loadQcMap(pool, orderRows) {
  const keys = [
    ...new Set(
      orderRows.flatMap((r) => qcLookupKeysForOrder(r.customer_id, r.product_model, r.product_code))
    )
  ];
  const map = new Map();
  if (!keys.length) return map;

  const modelBatchPairs = new Set();
  for (const key of keys) {
    const [, model, batch] = key.split('\x00');
    modelBatchPairs.add(`${model}\x00${batch}`);
  }

  const pairArgs = [];
  const pairTuples = [];
  for (const pair of modelBatchPairs) {
    const [model, batch] = pair.split('\x00');
    pairTuples.push('(?, ?)');
    pairArgs.push(model, batch);
  }

  const [rows] = await pool.query(
    `SELECT LOWER(TRIM(r.product_name)) AS pk_model, LOWER(TRIM(r.batch_no)) AS pk_batch,
            r.customer_id AS pk_customer_id,
            MIN(q.id) AS qrcode_id, MIN(q.token) AS token, MIN(q.qrcode_uid) AS qrcode_uid
     FROM reports r
     INNER JOIN qrcode_reports qr ON qr.report_id = r.id
     INNER JOIN qrcodes q ON q.id = qr.qrcode_id
     WHERE r.status = 'active'
       AND r.batch_no IS NOT NULL AND TRIM(r.batch_no) <> ''
       AND (LOWER(TRIM(r.product_name)), LOWER(TRIM(r.batch_no))) IN (${pairTuples.join(', ')})
     GROUP BY LOWER(TRIM(r.product_name)), LOWER(TRIM(r.batch_no)), r.customer_id`,
    pairArgs
  );
  for (const r of rows) {
    const cid =
      r.pk_customer_id != null && Number(r.pk_customer_id) > 0 ? String(Number(r.pk_customer_id)) : '';
    map.set(`${cid}\x00${r.pk_model}\x00${r.pk_batch}`, {
      qrcodeId: r.qrcode_id,
      token: r.token,
      qrcodeUid: r.qrcode_uid
    });
  }
  return map;
}

/** 质检展示：手动绑定 qc_qrcode_id 优先；否则按客户+标签型号+批号严格匹配（不同客户互不串绑） */
export async function enrichOrdersQc(pool, rows, qcMap) {
  const manualIds = [
    ...new Set(rows.map((r) => Number(r.qc_qrcode_id)).filter((n) => Number.isFinite(n) && n > 0))
  ];
  const tokenByQrId = new Map();
  const uidByQrId = new Map();
  if (manualIds.length) {
    const ph = manualIds.map(() => '?').join(',');
    const [qrs] = await pool.query(
      `SELECT id, token, qrcode_uid AS qrcodeUid FROM qrcodes WHERE id IN (${ph})`,
      manualIds
    );
    for (const q of qrs) {
      tokenByQrId.set(Number(q.id), q.token);
      uidByQrId.set(Number(q.id), q.qrcodeUid);
    }
  }
  const base = publicBaseUrl();
  const baseRows = rows.map((o) => {
    let qrcodeId = o.qc_qrcode_id != null && Number(o.qc_qrcode_id) > 0 ? Number(o.qc_qrcode_id) : null;
    let token = null;
    let qcBoundManual = false;

    let qrcodeUid = null;
    if (qrcodeId) {
      token = tokenByQrId.get(qrcodeId) || null;
      qrcodeUid = uidByQrId.get(qrcodeId) || null;
      qcBoundManual = true;
    } else {
      let qc = null;
      for (const pk of qcLookupKeysForOrder(o.customer_id, o.product_model, o.product_code)) {
        const hit = qcMap.get(pk);
        if (hit?.token) {
          qc = hit;
          break;
        }
      }
      if (qc?.token) {
        qrcodeId = Number(qc.qrcodeId);
        token = qc.token;
        qrcodeUid = qc.qrcodeUid || null;
      }
    }

    let qcReportLabel = '无可用报告';
    let qcPublicUrl = null;
    if (token) {
      qcReportLabel = resolveQrcodeUid({ qrcodeUid }) || `二维码#${qrcodeId}`;
      qcPublicUrl = base
        ? `${base}/api/public/qr/${encodeURIComponent(token)}`
        : `/api/public/qr/${encodeURIComponent(token)}`;
    } else if (qcBoundManual && qrcodeId) {
      qcReportLabel = '绑定已失效';
    }

    return {
      ...o,
      qc_qrcode_id: qrcodeId,
      qcQrcodeId: qrcodeId,
      qc_token: token,
      qc_public_url: qcPublicUrl,
      qc_report_label: qcReportLabel,
      qc_qrcode_uid: token ? resolveQrcodeUid({ qrcodeUid }) : null,
      qc_bound_manual: qcBoundManual
    };
  });

  // 列表缩略图改由前端按 qc_public_url 生成，避免每行服务端 QRCode.toDataURL
  return baseRows.map((o) => ({ ...o, qc_thumb_data_url: null }));
}

export function canSeeOrderListUnitPrice(req) {
  return perm(req, 'order_management', 'order_list_unit_price');
}

export function canSeeOrderListContract(req) {
  return perm(req, 'order_management', 'order_list_contract');
}

export function canSeeOrderListQcQrcode(req) {
  return perm(req, 'order_management', 'order_list_qc_qrcode');
}

/** 列表/导出：无「列表显示单价」权限时去掉 maps_to=unit_price 的字段列 */
export function filterOrderFieldDefsForList(req, fieldDefs) {
  if (canSeeOrderListUnitPrice(req)) return fieldDefs;
  return fieldDefs.filter((d) => d.maps_to !== 'unit_price');
}

/** 列表 API 响应：按权限脱敏单价、合同摘要、质检二维码 */
export function redactOrderListRowForViewer(req, row, fieldDefs) {
  const showUnit = canSeeOrderListUnitPrice(req);
  const showContract = canSeeOrderListContract(req);
  const showQc = canSeeOrderListQcQrcode(req);
  if (showUnit && showContract && showQc) return row;

  const out = { ...row };
  if (!showUnit) {
    out.unit_price = null;
    if (out.display_data && fieldDefs?.length) {
      const dd = { ...out.display_data };
      for (const d of fieldDefs) {
        if (d.maps_to === 'unit_price') delete dd[d.field_key];
      }
      out.display_data = dd;
    }
    if (out.data_json && typeof out.data_json === 'object' && fieldDefs?.length) {
      const dj = { ...out.data_json };
      for (const d of fieldDefs) {
        if (d.maps_to === 'unit_price') delete dj[d.field_key];
      }
      out.data_json = dj;
    }
  }
  if (!showContract) {
    out.contract_id = null;
    out.contract_status = null;
    out.contract_last_reject_comment = null;
  }
  if (!showQc) {
    out.qc_qrcode_id = null;
    out.qcQrcodeId = null;
    out.qc_token = null;
    out.qc_public_url = null;
    out.qc_report_label = null;
    out.qc_bound_manual = false;
    out.qc_thumb_data_url = null;
  }
  return out;
}

export function orderEditable(row) {
  if (row.status === 'rejected') return true;
  if (row.status === 'pending_review' && !row.submitted_for_review_at) return true;
  return false;
}

/** 行级删除授权：销售本人可硬删除自己单据的任意状态；财务/超管不可删已完成/已取消；其他非财务账号仅在「待审且未提交」时可删本人草稿 */
export function assertOrderDeleteAllowed(row, req) {
  if (isSuper(req)) return;
  const own = isOrderCreatedByCurrentUser(row, req);
  const finance = perm(req, 'order_management', 'order_status_finance');
  if (['completed', 'cancelled'].includes(row.status)) {
    const e = new Error('INVALID_STATUS');
    e.code = 'INVALID_STATUS';
    throw e;
  }
  if (finance) return;
  if (!(own && row.status === 'pending_review' && !row.submitted_for_review_at)) {
    const e = new Error('FORBIDDEN');
    e.code = 'FORBIDDEN';
    throw e;
  }
}