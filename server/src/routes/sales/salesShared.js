import QRCode from 'qrcode';
import { hasPermission } from '../../lib/permissions.js';
import {
  MAPS_TO_KEYS,
  normalizeOrderDateInput,
  roundOrderDecimal4
} from '../../lib/salesOrderFields.js';
export {
  generateUniqueOrderNo,
  insertOrderWithData,
  randomWyCustomerCode,
  allocateUniqueCustomerCode,
  generateCustomerCode,
  getOrCreateCustomer
} from '../../lib/salesOrderCrudShared.js';

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
  const b = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return b || '';
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
    `SELECT c.*, cu.customer_name FROM sales_contracts c
     INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ? LIMIT 1`,
    [nid]
  );
  return rows[0] || null;
}

/** 与 GET /contracts/:id 一致：能否查看该合同 */
export async function assertSalesContractVisible(req, pool, c) {
  if (!c) return { ok: false, code: 'NOT_FOUND' };
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
  'pending_qc',
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

export async function loadQcMap(pool, productModels) {
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
export async function enrichOrdersQc(pool, rows, qcMap) {
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
      qcQrcodeId: qrcodeId,
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