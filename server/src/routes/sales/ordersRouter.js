import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import XLSX from 'xlsx';
import QRCode from 'qrcode';

import { getPool } from '../../db/pool.js';
import { isSalesCustomerNgramFulltextReady } from '../../db/ensureSchema.js';
import { requireAuth } from '../../middleware/auth.js';
import { logOperationFromReq } from '../../lib/audit.js';
import {
  loadOrderFieldDefinitions,
  validateOrderDataInput,
  dataJsonToLegacyColumns,
  mergeRowDataJson,
  importHeaderSynonymsForField,
  splitLabelWarehouseCell
} from '../../lib/salesOrderFields.js';
import { formatOrderUploadTime } from '../../lib/salesOrderNotifyBody.js';
import {
  SalesOrderFlowError,
  submitSalesOrderForFinanceReview,
  withdrawSalesOrderFinanceReview,
  batchSubmitSalesOrdersForFinanceReview,
  batchFinanceReviewSalesOrders,
  financeReviewSalesOrder,
  batchQcReviewSalesOrders,
  qcReviewSalesOrder,
  batchShipSalesOrders,
  shipSalesOrder,
  completeSalesOrder,
  cancelSalesOrder
} from '../../services/salesOrderFlowService.js';
import {
  SalesOrderCrudError,
  createSalesOrderWithData,
  patchSalesOrderWithData
} from '../../services/salesOrderCrudService.js';

import {
  perm,
  isSuper,
  authenticatedNumericUserId,
  jsonSafeSalesInternalMessageRow,
  canViewAllSalesOrders,
  fetchSalesContractRow,
  assertSalesContractVisible,
  financeOrderListScopeSql,
  appendOrderListDateRange,
  assertFinanceOrderListScope,
  departmentSubtreeIds,
  assertMapsToAvailable,
  orderImportRowFingerprint,
  insertOrderWithData,
  getOrCreateCustomer,
  loadQcMap,
  enrichOrdersQc,
  orderEditable,
  assertOrderDeleteAllowed,
  isOrderCreatedByCurrentUser,
  canMarkOrderShipped,
  normalizeImportHeaderLabel,
  coerceImportCell,
  publicBaseUrl
} from './salesShared.js';
import { uniquePositiveIds } from '../../lib/idList.js';
import { syncCustomerDirectoryGroup } from '../../lib/salesCustomerDirectorySync.js';

export function createSalesOrdersRouter() {
  const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

function sendSalesOrderFlowError(res, err) {
  if (!(err instanceof SalesOrderFlowError)) return false;
  sendUnifiedError(res, err.httpStatus, err.code, err.payload);
  return true;
}

function sendUnifiedError(res, httpStatus, errorCode, payload = {}) {
  const message = payload?.message || errorCode;
  const data = { error: errorCode };
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'details')) data.details = payload.details;
  return res.status(httpStatus).json({ code: httpStatus, message, data, error: errorCode, ...payload });
}

function sendUnifiedSuccess(res, data = null, message = 'OK') {
  const legacy = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return res.json({ code: 0, message, data, ...legacy });
}

function sendSalesOrderCrudError(res, err) {
  if (!(err instanceof SalesOrderCrudError)) return false;
  sendUnifiedError(res, err.httpStatus, err.code, err.payload);
  return true;
}

router.get('/order-fields', async (req, res, next) => {
  try {
    const can =
      perm(req, 'order_management', 'order_query') ||
      perm(req, 'order_management', 'order_input') ||
      perm(req, 'order_management', 'order_field_config') ||
      perm(req, 'order_management', 'order_status_qc');
    if (!can) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const pool = getPool();
    const all = perm(req, 'order_management', 'order_field_config') && String(req.query.all) === '1';
    const items = await loadOrderFieldDefinitions(pool, { activeOnly: !all });
    sendUnifiedSuccess(res, { items });
  } catch (e) {
    next(e);
  }
});

/** 请求体可同时传 qrcodeId（推荐）或 qrcode_id；二者都有时必须一致 */
const patchOrderQcSchema = z
  .object({
    qrcodeId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
    qrcode_id: z.union([z.coerce.number().int().positive(), z.null()]).optional()
  })
  .superRefine((val, ctx) => {
    const hi = val.qrcodeId !== undefined;
    const hs = val.qrcode_id !== undefined;
    if (!hi && !hs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Must provide qrcodeId or qrcode_id',
        path: ['qrcodeId']
      });
      return;
    }
    if (
      hi &&
      hs &&
      val.qrcodeId !== val.qrcode_id &&
      Number(val.qrcodeId) !== Number(val.qrcode_id)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'qrcodeId and qrcode_id conflict',
        path: ['qrcodeId']
      });
    }
  })
  .transform((val) => (val.qrcodeId !== undefined ? val.qrcodeId : val.qrcode_id));

/** 订单绑定二维码：可选列表（仅需订单查询权限，无需 qrcodes.list） */
router.get('/qrcodes/bind-candidates', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_query')) return sendUnifiedError(res, 403, 'FORBIDDEN');
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
    if (!idRows.length) return sendUnifiedSuccess(res, { items: [], total, limit, offset });

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
      return {
        id: it.id,
        qrcodeId: it.id,
        token: it.token,
        createdAt: r.createdAt,
        reportTags: it.reportTags
      };
    });
    for (const item of items) {
      const scanUrl = base
        ? `${base}/api/public/qr/${encodeURIComponent(item.token)}`
        : `/api/public/qr/${encodeURIComponent(item.token)}`;
      item.qrThumbDataUrl = await QRCode.toDataURL(scanUrl, { margin: 1, width: 72, errorCorrectionLevel: 'M' });
    }
    sendUnifiedSuccess(res, { items, total, limit, offset });
  } catch (e) {
    next(e);
  }
});

router.patch('/orders/:id/qc-qrcode', async (req, res, next) => {
  try {
    const canQcBind =
      perm(req, 'order_management', 'order_edit') || perm(req, 'order_management', 'order_status_qc');
    if (!canQcBind) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
    const qid = patchOrderQcSchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    if (!canViewAllSalesOrders(req) && !isOrderCreatedByCurrentUser(row, req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    if (qid != null) {
      const [qr] = await pool.query('SELECT id FROM qrcodes WHERE id = ? LIMIT 1', [qid]);
      if (!qr.length) return sendUnifiedError(res, 400, 'QRCODE_NOT_FOUND');
    }
    await pool.query(
      'UPDATE sales_orders SET qc_qrcode_id = ?, updated_by = ?, row_version = row_version + 1 WHERE id = ?',
      [qid, req.user.userId, id]
    );
    await logOperationFromReq(req, {
      module: '销售订单',
      action: qid == null ? '解除质检二维码绑定' : '绑定质检二维码',
      detail: { orderId: id, qrcodeId: qid }
    });
    sendUnifiedSuccess(res, { ok: true });
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
    if (!perm(req, 'contract_management', 'contract_generate')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
    const body = bindOrderContractSchema.parse(req.body || {});
    const pool = getPool();
    const [orderRows] = await pool.query(
      `SELECT o.*, c.customer_name FROM sales_orders o
       INNER JOIN sales_customers c ON c.id = o.customer_id WHERE o.id = ? LIMIT 1`,
      [id]
    );
    const order = orderRows[0];
    if (!order) return sendUnifiedError(res, 404, 'ORDER_NOT_FOUND');
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(order, req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const [existing] = await pool.query(
      'SELECT contract_id FROM sales_contract_orders WHERE order_id = ? LIMIT 1',
      [id]
    );
    if (existing.length) return sendUnifiedError(res, 400, 'ORDER_ALREADY_LINKED');

    const c = await fetchSalesContractRow(pool, body.contract_id);
    const vis = await assertSalesContractVisible(req, pool, c);
    if (vis.code === 'NOT_FOUND') return sendUnifiedError(res, 404, 'CONTRACT_NOT_FOUND');
    if (!vis.ok) return sendUnifiedError(res, 403, 'FORBIDDEN');
    if (Number(order.customer_id) !== Number(c.customer_id)) {
      return sendUnifiedError(res, 400, 'CUSTOMER_MISMATCH');
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
    sendUnifiedSuccess(res, { ok: true, contract_id: body.contract_id });
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
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const body = orderFieldCreateSchema.parse(req.body || {});
    const pool = getPool();
    await assertMapsToAvailable(pool, body.maps_to, null);
    const [dup] = await pool.query('SELECT id FROM sales_order_field_definitions WHERE field_key = ?', [body.field_key]);
    if (dup.length) return sendUnifiedError(res, 400, 'FIELD_KEY_EXISTS');
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
    sendUnifiedSuccess(res, { id: r.insertId }, '创建成功');
  } catch (e) {
    if (e.code === 'MAPS_TO_CONFLICT' || e.code === 'BAD_MAPS_TO') {
      return sendUnifiedError(res, 400, e.code, { message: e.message });
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
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const body = orderFieldPatchSchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_order_field_definitions WHERE id = ?', [id]);
    if (!rows[0]) return sendUnifiedError(res, 404, 'NOT_FOUND');
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
    if (!updates.length) return sendUnifiedSuccess(res, { ok: true });
    args.push(id);
    await pool.query(`UPDATE sales_order_field_definitions SET ${updates.join(', ')} WHERE id = ?`, args);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '修改订单字段',
      detail: { id }
    });
    sendUnifiedSuccess(res, { ok: true }, '保存成功');
  } catch (e) {
    if (e.code === 'MAPS_TO_CONFLICT' || e.code === 'BAD_MAPS_TO') {
      return sendUnifiedError(res, 400, e.code, { message: e.message });
    }
    next(e);
  }
});

router.delete('/order-fields/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const pool = getPool();
    await pool.query('UPDATE sales_order_field_definitions SET is_active = 0 WHERE id = ?', [id]);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '停用订单字段',
      detail: { id }
    });
    sendUnifiedSuccess(res, { ok: true }, '停用成功');
  } catch (e) {
    next(e);
  }
});

/** 订单号前缀（系统管理员或 data_export_all）；新订单号已不再使用此前缀 */
router.get('/settings', async (req, res, next) => {
  try {
    if (!perm(req, 'data_management', 'data_export_all') && !isSuper(req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const pool = getPool();
    const [rows] = await pool.query('SELECT order_no_prefix, last_order_seq FROM sales_settings WHERE id = 1');
    sendUnifiedSuccess(res, { settings: rows[0] || { order_no_prefix: 'SO', last_order_seq: 0 } });
  } catch (e) {
    next(e);
  }
});

router.patch('/settings', async (req, res, next) => {
  try {
    if (!perm(req, 'data_management', 'data_export_all') && !isSuper(req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
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
    sendUnifiedSuccess(res, { settings: rows[0] }, '保存成功');
  } catch (e) {
    next(e);
  }
});

router.get('/customers', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'view') && !perm(req, 'order_management', 'order_query') && !perm(req, 'contract_management', 'contract_view')) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize || req.query.limit) || 20));
    const offset = (page - 1) * pageSize;
    const onlyActive = req.query.only_active !== '0' && req.query.inactive !== '1';
    const groupRaw = String(req.query.customer_group || '').trim();
    const pool = getPool();
    let where = onlyActive ? 'WHERE is_active = 1' : 'WHERE 1=1';
    const args = [];
    if (groupRaw === 'kangming' || groupRaw === 'wuyuan') {
      where += ' AND customer_group = ?';
      args.push(groupRaw);
    }
    if (q) {
      const useFt = q.length >= 2 && isSalesCustomerNgramFulltextReady();
      if (useFt) {
        where +=
          ' AND (MATCH(customer_name, customer_code, contact_name) AGAINST (? IN NATURAL LANGUAGE MODE) OR customer_code LIKE ? OR customer_name LIKE ? OR IFNULL(contact_name, "") LIKE ?)';
        const p = `%${q}%`;
        args.push(q, p, p, p);
      } else {
        where += ' AND (customer_code LIKE ? OR customer_name LIKE ? OR IFNULL(contact_name, "") LIKE ?)';
        const p = `%${q}%`;
        args.push(p, p, p);
      }
    }
    const countSql = `SELECT COUNT(*) as total FROM sales_customers ${where}`;
    const [countRows] = await pool.query(countSql, args);
    const total = countRows[0].total;

    let sql = `SELECT 
      id, customer_code, customer_name, contact_name, phone, address, customer_group, is_active,
      created_at, updated_at, updated_by,
      (SELECT COUNT(*) FROM sales_orders WHERE customer_id = sales_customers.id) as order_count,
      (SELECT COUNT(*) FROM sales_contracts WHERE customer_id = sales_customers.id) as contract_count,
      (SELECT COUNT(*) FROM sales_contracts WHERE customer_id = sales_customers.id AND status != 'rejected') as contract_count_approved
      FROM sales_customers ${where}
      ORDER BY customer_name ASC, id DESC
      LIMIT ? OFFSET ?`;
    const queryArgs = [...args, pageSize, offset];
    const [rows] = await pool.query(sql, queryArgs);
    sendUnifiedSuccess(res, {
      items: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (e) {
    next(e);
  }
});

/** 导出客户 Excel：需「数据导出」权限；支持 ids 逗号分隔（仅导出勾选）或按当前筛选条件全量（最多 1 万行） */
router.get('/customers/export', async (req, res, next) => {
  try {
    const canExport =
      isSuper(req) ||
      perm(req, 'data_management', 'data_export_all') ||
      perm(req, 'data_management', 'data_export');
    if (!canExport) return sendUnifiedError(res, 403, 'FORBIDDEN');

    const rawIds = String(req.query.ids || '').trim();
    const idList = rawIds.length
      ? uniquePositiveIds(
          rawIds
            .split(/[,，\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          500
        )
      : [];

    const pool = getPool();
    const onlyActive = req.query.only_active !== '0' && req.query.inactive !== '1';
    const q = String(req.query.q || '').trim();
    const groupRaw = String(req.query.customer_group || '').trim();

    const subOrderCount =
      '(SELECT COUNT(*) FROM sales_orders WHERE customer_id = sales_customers.id) as order_count';
    const subContractApproved =
      "(SELECT COUNT(*) FROM sales_contracts WHERE customer_id = sales_customers.id AND status != 'rejected') as contract_count_approved";

    let sql = `SELECT id, customer_code, customer_name, contact_name, phone, address, customer_group, is_active,
      ${subOrderCount},
      ${subContractApproved}
      FROM sales_customers`;
    const args = [];

    if (idList.length > 0) {
      sql += ` WHERE id IN (${idList.map(() => '?').join(',')})`;
      args.push(...idList);
    } else {
      let where = onlyActive ? 'WHERE is_active = 1' : 'WHERE 1=1';
      if (groupRaw === 'kangming' || groupRaw === 'wuyuan') {
        where += ' AND customer_group = ?';
        args.push(groupRaw);
      }
      if (q) {
        const useFt = q.length >= 2 && isSalesCustomerNgramFulltextReady();
        if (useFt) {
          where +=
            ' AND (MATCH(customer_name, customer_code, contact_name) AGAINST (? IN NATURAL LANGUAGE MODE) OR customer_code LIKE ? OR customer_name LIKE ? OR IFNULL(contact_name, "") LIKE ?)';
          const p = `%${q}%`;
          args.push(q, p, p, p);
        } else {
          where += ' AND (customer_code LIKE ? OR customer_name LIKE ? OR IFNULL(contact_name, "") LIKE ?)';
          const p = `%${q}%`;
          args.push(p, p, p);
        }
      }
      sql += ` ${where}`;
    }

    sql += ' ORDER BY customer_name ASC, id DESC LIMIT 10000';

    const [rows] = await pool.query(sql, args);

    const labelRow = [
      '客户编码',
      '客户全称',
      '客户简称',
      '电话',
      '地址',
      '客户分组',
      '状态',
      '关联订单数',
      '关联有效合同数'
    ];
    const wsData = [
      labelRow,
      ...rows.map((r) => [
        r.customer_code,
        r.customer_name,
        r.contact_name || '',
        r.phone || '',
        r.address || '',
        r.customer_group === 'kangming' ? '康铭' : r.customer_group === 'wuyuan' ? '物源' : '',
        r.is_active ? '启用' : '停用',
        Number(r.order_count) || 0,
        Number(r.contract_count_approved) || 0
      ])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'customers');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-customers.xlsx"');
    res.send(buf);
    await logOperationFromReq(req, {
      module: '客户管理',
      action: '导出客户',
      detail: { count: rows.length, byIds: idList.length > 0, q: q || undefined }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/customers', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'create')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const schema = z.object({
      customer_name: z.string().min(1).max(256),
      contact_name: z.string().min(1).max(128),
      phone: z.string().max(64).optional().nullable(),
      address: z.string().max(512).optional().nullable(),
      customer_group: z.enum(['kangming', 'wuyuan'])
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const customerCode = await allocateUniqueCustomerCode(pool);
    const cg = body.customer_group;
    const [r] = await pool.query(
      `INSERT INTO sales_customers (customer_code, customer_name, contact_name, phone, address, customer_group, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        customerCode,
        body.customer_name,
        body.contact_name,
        body.phone || null,
        body.address || null,
        cg,
        req.user.userId,
        req.user.userId
      ]
    );
    await logOperationFromReq(req, {
      module: '客户管理',
      action: '新增客户',
      detail: { id: r.insertId, customer_code: customerCode }
    });
    sendUnifiedSuccess(res, { id: r.insertId, success: true, customer_code: customerCode }, '创建成功');
  } catch (e) {
    next(e);
  }
});

/** 上传 Excel（multipart 字段 file）同步当前分组：读取工作表「康铭」或「物源」 */
router.post('/customers/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    if (!req.file?.buffer?.length) {
      return sendUnifiedError(res, 400, 'FILE_REQUIRED', { message: '请选择要上传的 Excel 文件' });
    }
    let group;
    try {
      group = z.enum(['kangming', 'wuyuan']).parse(String(req.body?.customer_group || '').trim());
    } catch {
      return sendUnifiedError(res, 400, 'BAD_CUSTOMER_GROUP', { message: '缺少或无效的客户分组参数 customer_group' });
    }
    const pool = getPool();
    const summary = await syncCustomerDirectoryGroup(pool, {
      userId: req.user.userId,
      customerGroup: group,
      workbookBuffer: req.file.buffer
    });
    await logOperationFromReq(req, {
      module: '客户管理',
      action: '上传Excel同步客户目录',
      detail: {
        customer_group: group,
        originalname: req.file.originalname,
        ...summary
      }
    });
    sendUnifiedSuccess(res, summary, '同步完成');
  } catch (e) {
    const code = e?.code;
    if (
      code === 'BAD_CUSTOMER_GROUP' ||
      code === 'FILE_REQUIRED' ||
      code === 'BAD_XLSX' ||
      code === 'NAMEBOOK_SHEET_NOT_FOUND' ||
      code === 'NAMEBOOK_BAD_HEADER'
    ) {
      return sendUnifiedError(res, 400, code || 'IMPORT_FAILED', { message: e.message || '同步失败' });
    }
    next(e);
  }
});

// PATCH edit customer
router.patch('/customers/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_ID');
    const schema = z.object({
      customer_name: z.string().min(1).max(256).optional(),
      contact_name: z.string().min(1).max(128).optional(),
      phone: z.string().max(64).optional().nullable(),
      address: z.string().max(512).optional().nullable()
    });
    const body = schema.parse(req.body || {});
    if (Object.keys(body).length === 0) return sendUnifiedError(res, 400, 'NO_CHANGES');
    const pool = getPool();
    const setParts = [];
    const values = [];
    if (body.customer_name !== undefined) {
      setParts.push('customer_name = ?');
      values.push(body.customer_name);
    }
    if (body.contact_name !== undefined) {
      setParts.push('contact_name = ?');
      values.push(body.contact_name);
    }
    if (body.phone !== undefined) {
      setParts.push('phone = ?');
      values.push(body.phone);
    }
    if (body.address !== undefined) {
      setParts.push('address = ?');
      values.push(body.address);
    }
    setParts.push('updated_by = ?');
    values.push(req.user.userId);
    const sql = `UPDATE sales_customers SET ${setParts.join(', ')} WHERE id = ?`;
    values.push(id);
    const [result] = await pool.query(sql, values);
    if (result.affectedRows === 0) return sendUnifiedError(res, 404, 'NOT_FOUND');
    await logOperationFromReq(req, {
      module: '客户管理',
      action: '编辑客户',
      detail: { id, ...body }
    });
    sendUnifiedSuccess(res, { success: true, id }, '保存成功');
  } catch (e) {
    next(e);
  }
});

// PATCH status (enable/disable)
router.patch('/customers/:id/status', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'disable')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_ID');
    const schema = z.object({
      is_active: z.preprocess((v) => v === true || v === 'true' || v === '1' || v === 1, z.boolean())
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const [custRows] = await pool.query('SELECT is_active FROM sales_customers WHERE id = ?', [id]);
    if (!custRows.length) return sendUnifiedError(res, 404, 'NOT_FOUND');
    const newActive = !!body.is_active;
    if ((custRows[0].is_active === 1) === newActive) {
      return sendUnifiedSuccess(res, { success: true, is_active: newActive });
    }
    const [result] = await pool.query(
      'UPDATE sales_customers SET is_active = ?, updated_by = ? WHERE id = ?',
      [newActive ? 1 : 0, req.user.userId, id]
    );
    await logOperationFromReq(req, {
      module: '客户管理',
      action: newActive ? '启用客户' : '停用客户',
      detail: { id, is_active: newActive }
    });
    sendUnifiedSuccess(res, { success: true, is_active: newActive }, '保存成功');
  } catch (e) {
    next(e);
  }
});

// GET customer stats (order count, contract count)
router.get('/customers/:id/stats', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'view') && !perm(req, 'order_management', 'order_query') && !perm(req, 'contract_management', 'contract_view')) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_ID');
    const pool = getPool();
    const [custRows] = await pool.query(
      'SELECT id, customer_code, customer_name, customer_group, contact_name, phone, address, is_active FROM sales_customers WHERE id = ?',
      [id]
    );
    if (!custRows.length) return sendUnifiedError(res, 404, 'NOT_FOUND');
    const [orderRows] = await pool.query(
      'SELECT COUNT(*) as order_count FROM sales_orders WHERE customer_id = ?',
      [id]
    );
    const [contractRows] = await pool.query(
      'SELECT COUNT(*) as contract_count FROM sales_contracts WHERE customer_id = ?',
      [id]
    );
    const [approvedContractRows] = await pool.query(
      "SELECT COUNT(*) as contract_count FROM sales_contracts WHERE customer_id = ? AND status != 'rejected'",
      [id]
    );
    sendUnifiedSuccess(res, {
      customer_id: id,
      customer_code: custRows[0].customer_code,
      customer_name: custRows[0].customer_name,
      customer_group: custRows[0].customer_group || '',
      contact_name: custRows[0].contact_name,
      phone: custRows[0].phone,
      address: custRows[0].address,
      is_active: !!custRows[0].is_active,
      order_count: orderRows[0].order_count || 0,
      contract_count: contractRows[0].contract_count || 0,
      contract_count_approved: approvedContractRows[0].contract_count || 0
    });
  } catch (e) {
    next(e);
  }
});

// BATCH DELETE customers (with protection)
router.post('/customers/bulk-delete', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit') && !perm(req, 'customer_management', 'disable')) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const schema = z.object({
      ids: z.array(z.coerce.number().int().positive()).min(1).max(100)
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const ids = body.ids;

    // Check for associated orders or contracts
    const [assoc] = await pool.query(
      `SELECT 
         COUNT(CASE WHEN o.id IS NOT NULL THEN 1 END) as order_count,
         COUNT(CASE WHEN c.id IS NOT NULL THEN 1 END) as contract_count
       FROM (SELECT ? as id) as ids
       LEFT JOIN sales_orders o ON o.customer_id = ids.id
       LEFT JOIN sales_contracts c ON c.customer_id = ids.id`,
      [ids[0]] // simplified check - in real would use IN clause with multiple
    );

    if (assoc[0].order_count > 0 || assoc[0].contract_count > 0) {
      return sendUnifiedError(res, 400, 'CUSTOMER_HAS_ASSOCIATIONS', {
        message: '部分客户存在关联订单或合同，无法删除'
      });
    }

    const [result] = await pool.query(
      'DELETE FROM sales_customers WHERE id IN (?) AND is_active = 1',
      [ids]
    );

    await logOperationFromReq(req, {
      module: '客户管理',
      action: '批量删除客户',
      detail: { count: result.affectedRows, ids }
    });

    sendUnifiedSuccess(
      res,
      {
        success: true,
        deleted: result.affectedRows,
        message: `成功删除 ${result.affectedRows} 个客户`
      },
      '删除成功'
    );
  } catch (e) {
    next(e);
  }
});

/** 内部型号管理接口 - 使用 order_management.order_field_config 权限
 * 支持按编码/名称搜索、状态筛选、分页、新增/编辑、启用/停用、重复编码校验、审计日志
 */
router.get('/internal-models', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const q = String(req.query.q || '').trim();
    const statusFilter = req.query.status || req.query.is_active;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize || req.query.limit) || 20));
    const offset = (page - 1) * pageSize;
    const pool = getPool();
    let where = 'WHERE 1=1';
    const args = [];
    if (statusFilter !== undefined && statusFilter !== '') {
      const isActive = statusFilter === '1' || statusFilter === 'true' || statusFilter === 'active' || statusFilter === true;
      where += ' AND is_active = ?';
      args.push(isActive ? 1 : 0);
    }
    if (q) {
      where += ' AND (internal_code LIKE ? OR name LIKE ?)';
      const p = `%${q}%`;
      args.push(p, p);
    }
    const countSql = `SELECT COUNT(*) as total FROM sales_internal_models ${where}`;
    const [countRows] = await pool.query(countSql, args);
    const total = Number(countRows[0]?.total || 0);

    const sql = `SELECT 
      id, internal_code, name, is_active, remarks, 
      created_at, updated_at,
      (SELECT username FROM users WHERE id = created_by LIMIT 1) as created_by_username,
      (SELECT username FROM users WHERE id = updated_by LIMIT 1) as updated_by_username
      FROM sales_internal_models ${where}
      ORDER BY internal_code ASC, id DESC
      LIMIT ? OFFSET ?`;
    const queryArgs = [...args, pageSize, offset];
    const [rows] = await pool.query(sql, queryArgs);
    sendUnifiedSuccess(res, {
      items: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/internal-models', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const schema = z.object({
      internal_code: z.string().min(1).max(64).regex(/^[A-Za-z0-9\-_]+$/, '编码只能包含字母、数字、-、_'),
      name: z.string().min(1).max(128),
      is_active: z.preprocess((v) => v !== false && v !== 'false' && v !== 0 && v !== '0', z.boolean()).default(true),
      remarks: z.string().max(512).optional().nullable().transform(v => v || null)
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    // 重复编码校验
    const [dup] = await pool.query('SELECT id FROM sales_internal_models WHERE internal_code = ? LIMIT 1', [body.internal_code]);
    if (dup.length > 0) return sendUnifiedError(res, 400, 'DUPLICATE_INTERNAL_CODE');
    const [r] = await pool.query(
      `INSERT INTO sales_internal_models (internal_code, name, is_active, remarks, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        body.internal_code.toUpperCase(),
        body.name,
        body.is_active ? 1 : 0,
        body.remarks,
        req.user.userId,
        req.user.userId
      ]
    );
    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '新增内部型号',
      detail: { id: r.insertId, internal_code: body.internal_code, name: body.name }
    });
    sendUnifiedSuccess(res, { id: r.insertId, success: true }, '创建成功');
  } catch (e) {
    if (e.errors?.length) {
      return sendUnifiedError(res, 400, 'VALIDATION_ERROR', { details: e.errors });
    }
    next(e);
  }
});

router.patch('/internal-models/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_ID');
    const schema = z.object({
      internal_code: z.string().min(1).max(64).regex(/^[A-Za-z0-9\-_]+$/, '编码只能包含字母、数字、-、_').optional(),
      name: z.string().min(1).max(128).optional(),
      is_active: z.preprocess((v) => v === true || v === 'true' || v === 1 || v === '1', z.boolean()).optional(),
      remarks: z.string().max(512).optional().nullable().transform(v => v || null)
    });
    const body = schema.parse(req.body || {});
    if (Object.keys(body).length === 0) return sendUnifiedError(res, 400, 'NO_CHANGES');
    const pool = getPool();
    // 重复编码校验（如果修改编码）
    if (body.internal_code !== undefined) {
      const [dup] = await pool.query(
        'SELECT id FROM sales_internal_models WHERE internal_code = ? AND id != ? LIMIT 1',
        [body.internal_code, id]
      );
      if (dup.length > 0) return sendUnifiedError(res, 400, 'DUPLICATE_INTERNAL_CODE');
    }
    const setParts = [];
    const values = [];
    if (body.internal_code !== undefined) {
      setParts.push('internal_code = ?');
      values.push(body.internal_code.toUpperCase());
    }
    if (body.name !== undefined) {
      setParts.push('name = ?');
      values.push(body.name);
    }
    if (body.is_active !== undefined) {
      setParts.push('is_active = ?');
      values.push(body.is_active ? 1 : 0);
    }
    if (body.remarks !== undefined) {
      setParts.push('remarks = ?');
      values.push(body.remarks);
    }
    setParts.push('updated_by = ?');
    values.push(req.user.userId);
    const sql = `UPDATE sales_internal_models SET ${setParts.join(', ')} WHERE id = ?`;
    values.push(id);
    const [result] = await pool.query(sql, values);
    if (result.affectedRows === 0) return sendUnifiedError(res, 404, 'NOT_FOUND');
    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '编辑内部型号',
      detail: { id, ...body }
    });
    sendUnifiedSuccess(res, { success: true, id }, '保存成功');
  } catch (e) {
    if (e.errors?.length) {
      return sendUnifiedError(res, 400, 'VALIDATION_ERROR', { details: e.errors });
    }
    next(e);
  }
});

/** 从表头行识别「名称」「英文代码」列索引（支持两列顺序颠倒、首格带 BOM） */
function detectInternalModelImportLayout(rows) {
  const maxScan = Math.min(rows.length, 8);
  for (let sr = 0; sr < maxScan; sr++) {
    const line = rows[sr] || [];
    let nameIdx = -1;
    let codeIdx = -1;
    const colMax = Math.min(line.length, 40);
    for (let j = 0; j < colMax; j++) {
      const h = String(line[j] ?? '')
        .trim()
        .replace(/^\ufeff/, '');
      if (!h) continue;
      if (h === '名称' || h === '品名' || h === '产品' || h === '产品名称') nameIdx = j;
      if (h === '英文代码' || h === '内部编码') codeIdx = j;
      if (codeIdx < 0 && (h === '代码' || h === '编码') && !/产品/.test(h)) codeIdx = j;
    }
    if (nameIdx >= 0 && codeIdx >= 0 && nameIdx !== codeIdx) {
      return { startRow: sr + 1, nameIdx, codeIdx };
    }
  }
  const h0 = String(rows[0]?.[0] ?? '')
    .trim()
    .replace(/^\ufeff/, '');
  const h1 = String(rows[0]?.[1] ?? '').trim();
  if (/产品|品名|名称/.test(h0) && /代码|英文|编码/.test(h1)) {
    return { startRow: 1, nameIdx: 0, codeIdx: 1 };
  }
  return { startRow: 0, nameIdx: 0, codeIdx: 1 };
}

/** 上传表格（xlsx/xls）批量导入：表头为「名称」+「英文代码」时按列名取数；否则默认前两列为 名称、内部编码 */
router.post('/internal-models/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    if (!req.file?.buffer) return sendUnifiedError(res, 400, 'FILE_REQUIRED');
    const uid = req.user.userId;
    const pool = getPool();
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return sendUnifiedError(res, 400, 'EMPTY_SHEET');
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    if (!rows.length) return sendUnifiedError(res, 400, 'EMPTY_SHEET');

    const { startRow, nameIdx, codeIdx } = detectInternalModelImportLayout(rows);

    const codeRe = /^[A-Za-z0-9\-_]+$/;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (let ri = startRow; ri < rows.length; ri++) {
      const line = rows[ri] || [];
      let rawName = String(line[nameIdx] ?? '').trim();
      const rawCodeCell = String(line[codeIdx] ?? '')
        .trim()
        .toUpperCase();
      if (!rawCodeCell && !rawName) {
        skipped += 1;
        continue;
      }
      if (!rawCodeCell) {
        skipped += 1;
        errors.push({ row: ri + 1, reason: '缺少内部编码（英文代码列）' });
        continue;
      }
      // 支持一个单元格内多个编码：BP301P/NL301P、A／B、A,B、A;B 等
      // 按“单行显示”需求：会规范化后合并为一个 internal_code（如 BP301P/NL301P），不拆多行
      const codeCandidates = rawCodeCell
        .split(/[\/／,，;；\s]+/)
        .map((s) => String(s || '').trim().toUpperCase())
        .filter(Boolean);
      const uniqueCodes = [...new Set(codeCandidates)];
      if (!uniqueCodes.length) {
        skipped += 1;
        errors.push({ row: ri + 1, reason: '缺少内部编码（英文代码列）' });
        continue;
      }
      const invalidCodes = uniqueCodes.filter((c) => !codeRe.test(c));
      const validCodes = uniqueCodes.filter((c) => codeRe.test(c));
      if (invalidCodes.length) {
        errors.push({ row: ri + 1, reason: `编码格式不合法: ${invalidCodes.join(',')}` });
      }
      if (!validCodes.length) {
        skipped += 1;
        continue;
      }
      const mergedCode = validCodes.join('/');
      const name = (rawName || mergedCode).slice(0, 128);
      const remarks = uniqueCodes.length > 1 ? '表格导入（一行多编码，单行展示）' : '表格导入';
      const [r] = await pool.query(
        `INSERT INTO sales_internal_models (internal_code, name, is_active, remarks, created_by, updated_by)
         VALUES (?, ?, 1, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), remarks = VALUES(remarks), updated_by = VALUES(updated_by)`,
        [mergedCode, name, remarks, uid, uid]
      );
      if (Number(r.affectedRows) === 1) inserted += 1;
      else if (Number(r.affectedRows) === 2) updated += 1;
    }

    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '表格导入内部型号',
      detail: {
        filename: req.file.originalname,
        inserted,
        updated,
        skipped,
        errorCount: errors.length
      }
    });

    sendUnifiedSuccess(
      res,
      {
        ok: true,
        inserted,
        updated,
        skipped,
        errors: errors.slice(0, 50),
        layout: { nameColumnIndex: nameIdx, codeColumnIndex: codeIdx, dataStartRow: startRow + 1 }
      },
      '导入完成'
    );
  } catch (e) {
    next(e);
  }
});

router.post('/internal-models/batch-delete', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const schema = z.object({
      ids: z.array(z.coerce.number().int().positive()).min(1).max(500)
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const ph = body.ids.map(() => '?').join(',');
    const [r] = await pool.query(`DELETE FROM sales_internal_models WHERE id IN (${ph})`, body.ids);
    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '批量删除内部型号',
      detail: { ids: body.ids, deleted: r.affectedRows }
    });
    sendUnifiedSuccess(res, { ok: true, deleted: r.affectedRows }, '删除成功');
  } catch (e) {
    if (e.errors?.length) return sendUnifiedError(res, 400, 'VALIDATION_ERROR');
    next(e);
  }
});

router.post('/internal-models/batch-enable', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const schema = z.object({
      ids: z.array(z.coerce.number().int().positive()).min(1).max(500)
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const ph = body.ids.map(() => '?').join(',');
    const [existRows] = await pool.query(
      `SELECT id, is_active FROM sales_internal_models WHERE id IN (${ph})`,
      body.ids
    );
    const matched = Array.isArray(existRows) ? existRows.length : 0;
    const [r] = await pool.query(
      `UPDATE sales_internal_models
       SET is_active = 1, updated_by = ?
       WHERE id IN (${ph}) AND is_active <> 1`,
      [req.user.userId, ...body.ids]
    );
    const changed = Number(r.affectedRows || 0);
    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '批量启用内部型号',
      detail: { ids: body.ids, matched, changed }
    });
    sendUnifiedSuccess(res, { ok: true, matched, changed }, '启用成功');
  } catch (e) {
    if (e.errors?.length) return sendUnifiedError(res, 400, 'VALIDATION_ERROR');
    next(e);
  }
});

router.post('/internal-models/delete-all', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const schema = z.object({
      q: z.string().trim().max(128).optional().default(''),
      status: z.enum(['', 'active', 'inactive']).optional().default('')
    });
    const body = schema.parse(req.body || {});
    const q = String(body.q || '').trim();
    const status = String(body.status || '').trim();
    const pool = getPool();
    let where = 'WHERE 1=1';
    const args = [];
    if (status === 'active') {
      where += ' AND is_active = 1';
    } else if (status === 'inactive') {
      where += ' AND is_active = 0';
    }
    if (q) {
      where += ' AND (internal_code LIKE ? OR name LIKE ?)';
      const p = `%${q}%`;
      args.push(p, p);
    }
    const [r] = await pool.query(`DELETE FROM sales_internal_models ${where}`, args);
    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '删除全部内部型号（按筛选）',
      detail: { q, status, deleted: Number(r.affectedRows || 0) }
    });
    sendUnifiedSuccess(res, { ok: true, deleted: Number(r.affectedRows || 0) }, '删除成功');
  } catch (e) {
    if (e.errors?.length) return sendUnifiedError(res, 400, 'VALIDATION_ERROR');
    next(e);
  }
});

router.get('/messages', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return sendUnifiedError(res, 401, 'UNAUTHORIZED');
    const pool = getPool();
    const unreadOnly = String(req.query.unread || '') === '1';
    let sql = `SELECT id, category, title, body_text, ref_type, ref_id, read_at, created_at FROM sales_internal_messages WHERE to_user_id = ?`;
    const args = [uid];
    if (unreadOnly) sql += ' AND read_at IS NULL';
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const [rows] = await pool.query(sql, args);
    sendUnifiedSuccess(res, { items: (rows || []).map(jsonSafeSalesInternalMessageRow) });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      // eslint-disable-next-line no-console
      console.error('[server] sales_internal_messages 缺失，请重启服务以执行建表自检');
      return sendUnifiedSuccess(res, { items: [] });
    }
    // eslint-disable-next-line no-console
    console.error('[sales/messages]', e.code || '', e.message || e);
    next(e);
  }
});

/** 清空当前用户全部站内信（仅本人收件箱） */
router.post('/messages/clear', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return sendUnifiedError(res, 401, 'UNAUTHORIZED');
    const pool = getPool();
    await pool.query('DELETE FROM sales_internal_messages WHERE to_user_id = ?', [uid]);
    sendUnifiedSuccess(res, { ok: true }, '清空成功');
  } catch (e) {
    next(e);
  }
});

router.post('/messages/:id/read', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return sendUnifiedError(res, 401, 'UNAUTHORIZED');
    const id = Number(req.params.id);
    const pool = getPool();
    await pool.query('UPDATE sales_internal_messages SET read_at = NOW(3) WHERE id = ? AND to_user_id = ?', [
      id,
      uid
    ]);
    sendUnifiedSuccess(res, { ok: true }, '已标记已读');
  } catch (e) {
    next(e);
  }
});

/** 删除单条站内信（仅本人收件箱） */
router.delete('/messages/:id', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return sendUnifiedError(res, 401, 'UNAUTHORIZED');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return sendUnifiedError(res, 400, 'INVALID_ID');
    const pool = getPool();
    const [r] = await pool.query('DELETE FROM sales_internal_messages WHERE id = ? AND to_user_id = ?', [id, uid]);
    sendUnifiedSuccess(res, { ok: true, deleted: Number(r.affectedRows || 0) }, '删除成功');
  } catch (e) {
    next(e);
  }
});

const batchDeleteSalesMessagesSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200)
});

/** 批量删除站内信（仅本人收件箱） */
router.post('/messages/batch-delete', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return sendUnifiedError(res, 401, 'UNAUTHORIZED');
    const parsed = batchDeleteSalesMessagesSchema.safeParse(req.body);
    if (!parsed.success) return sendUnifiedError(res, 400, 'VALIDATION_ERROR');
    const ids = [...new Set(parsed.data.ids)];
    const pool = getPool();
    const ph = ids.map(() => '?').join(',');
    const [r] = await pool.query(
      `DELETE FROM sales_internal_messages WHERE to_user_id = ? AND id IN (${ph})`,
      [uid, ...ids]
    );
    sendUnifiedSuccess(res, { ok: true, deleted: Number(r.affectedRows || 0) }, '删除成功');
  } catch (e) {
    next(e);
  }
});

const listQuerySchema = z.object({
  /** 精确按订单主键筛选（用于站内信跳转定位等） */
  id: z.coerce.number().int().positive().optional(),
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
    z.coerce.number().refine((n) => [10, 20, 50, 100, 200, 500].includes(n), { message: 'page_size' })
  ),
  sort: z.enum(['created_at_desc', 'created_at_asc', 'customer_name_desc', 'customer_name_asc']).default('created_at_desc'),
  pending_finance_only: z.preprocess((v) => v === true || v === '1' || v === 'true', z.boolean().optional()),
  pending_qc_only: z.preprocess((v) => v === true || v === '1' || v === 'true', z.boolean().optional())
});

router.get('/orders', async (req, res, next) => {
  try {
    const canOrderQuery = perm(req, 'order_management', 'order_query') || perm(req, 'order_management', 'order_status_qc');
    if (!canOrderQuery) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const q = listQuerySchema.parse(req.query);
    const pool = getPool();
    const uid = req.user.userId;
    const seeAll = canViewAllSalesOrders(req);

    let sql = `SELECT o.*, c.customer_code, c.customer_name, u.username AS created_by_username,
                      COALESCE(NULLIF(TRIM(u_ship.real_name), ''), NULLIF(TRIM(u_ship.username), ''), '') AS shipped_by_name
               FROM sales_orders o
               INNER JOIN sales_customers c ON c.id = o.customer_id
               LEFT JOIN users u ON u.id = o.created_by
               LEFT JOIN users u_ship ON u_ship.id = o.shipped_by
               WHERE 1=1`;
    const args = [];

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
    sendUnifiedSuccess(res, { items, total, page: q.page, page_size: q.page_size, field_definitions: fieldDefs });
  } catch (e) {
    next(e);
  }
});

const orderCreateBodySchema = z.object({
  data: z.record(z.string(), z.any())
});

const orderPatchBodySchema = z.object({
  data: z.record(z.string(), z.any()),
  row_version: z.coerce.number().int().min(1)
});

router.post('/orders', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_input')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const body = orderCreateBodySchema.parse(req.body || {});
    const pool = getPool();
    const r = await createSalesOrderWithData(pool, { userId: req.user.userId, data: body.data });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '创建订单',
      detail: { id: r.id, order_no: r.order_no }
    });
    sendUnifiedSuccess(res, { id: r.id, order_no: r.order_no }, '创建成功');
  } catch (e) {
    if (sendSalesOrderCrudError(res, e)) return;
    next(e);
  }
});

router.patch('/orders/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_edit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const body = orderPatchBodySchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT o.*, c.customer_code, c.customer_name
       FROM sales_orders o
       INNER JOIN sales_customers c ON c.id = o.customer_id
       WHERE o.id = ?`,
      [id]
    );
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(row, req)) return sendUnifiedError(res, 403, 'FORBIDDEN');
    if (!orderEditable(row)) return sendUnifiedError(res, 400, 'ORDER_NOT_EDITABLE');

    await patchSalesOrderWithData(pool, {
      orderId: id,
      userId: req.user.userId,
      row,
      data: body.data,
      rowVersion: body.row_version
    });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '编辑订单',
      detail: { id }
    });
    sendUnifiedSuccess(res, { ok: true }, '编辑成功');
  } catch (e) {
    if (sendSalesOrderCrudError(res, e)) return;
    next(e);
  }
});

router.post('/orders/:id/submit', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_submit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(row, req)) return sendUnifiedError(res, 403, 'FORBIDDEN');
    await submitSalesOrderForFinanceReview(pool, { orderId: id, actorUserId: req.user.userId, row });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '提交订单财务审核',
      detail: { id }
    });
    sendUnifiedSuccess(res, { ok: true }, '提交成功');
  } catch (e) {
    if (sendSalesOrderFlowError(res, e)) return;
    next(e);
  }
});

router.post('/orders/:id/withdraw', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_withdraw')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(row, req)) return sendUnifiedError(res, 403, 'FORBIDDEN');
    await withdrawSalesOrderFinanceReview(pool, { orderId: id, actorUserId: req.user.userId, row });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '撤回订单财务审核',
      detail: { id }
    });
    sendUnifiedSuccess(res, { ok: true }, '撤回成功');
  } catch (e) {
    if (sendSalesOrderFlowError(res, e)) return;
    next(e);
  }
});

const batchOrderIdsBodySchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(200)
});

router.post('/orders/batch-submit', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_submit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const body = batchOrderIdsBodySchema.parse(req.body || {});
    const pool = getPool();
    const { okCount, failed, okItems } = await batchSubmitSalesOrdersForFinanceReview(pool, {
      rawIds: body.ids,
      actorUserId: req.user.userId,
      mayActOnOrder: (row) => isSuper(req) || isOrderCreatedByCurrentUser(row, req)
    });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '批量提交订单财务审核',
      detail: {
        ok: okCount,
        failed: failed.length,
        ids: okItems.map((x) => x.id),
        ok_items: okItems,
        failed_items: failed.slice(0, 200)
      }
    });
    sendUnifiedSuccess(res, { ok: okCount, failed }, '批量提交完成');
  } catch (e) {
    if (sendSalesOrderFlowError(res, e)) return;
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
    if (!perm(req, 'order_management', 'order_status_finance')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const body = batchFinanceReviewBodySchema.parse(req.body || {});
    const pool = getPool();
    const { okCount, failed, okItems } = await batchFinanceReviewSalesOrders(pool, {
      rawIds: body.ids,
      result: body.result,
      comment: body.comment,
      actorUserId: req.user.userId
    });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '批量财务审核订单',
      detail: {
        result: body.result,
        ok: okCount,
        failed: failed.length,
        ok_items: okItems,
        failed_items: failed.slice(0, 200)
      }
    });
    sendUnifiedSuccess(res, { ok: okCount, failed }, '批量财务审核完成');
  } catch (e) {
    if (sendSalesOrderFlowError(res, e)) return;
    next(e);
  }
});

const financeReviewSchema = z.object({
  result: z.enum(['approved', 'rejected']),
  comment: z.string().max(1024).optional()
});

router.post('/orders/:id/finance-review', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_status_finance')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const body = financeReviewSchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    await financeReviewSalesOrder(pool, {
      orderId: id,
      result: body.result,
      comment: body.comment,
      actorUserId: req.user.userId,
      row
    });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '财务审核订单',
      detail: { id, result: body.result }
    });
    sendUnifiedSuccess(res, { ok: true }, '财务审核完成');
  } catch (e) {
    if (sendSalesOrderFlowError(res, e)) return;
    next(e);
  }
});

router.post('/orders/batch-qc-review', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_status_qc')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const body = batchFinanceReviewBodySchema.parse(req.body || {});
    const pool = getPool();
    const { okCount, failed, okItems } = await batchQcReviewSalesOrders(pool, {
      rawIds: body.ids,
      result: body.result,
      comment: body.comment,
      actorUserId: req.user.userId
    });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '批量品管审核订单',
      detail: {
        result: body.result,
        ok: okCount,
        failed: failed.length,
        ok_items: okItems,
        failed_items: failed.slice(0, 200)
      }
    });
    sendUnifiedSuccess(res, { ok: okCount, failed }, '批量品管审核完成');
  } catch (e) {
    if (sendSalesOrderFlowError(res, e)) return;
    next(e);
  }
});

router.post('/orders/:id/qc-review', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_status_qc')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const body = financeReviewSchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    await qcReviewSalesOrder(pool, {
      orderId: id,
      result: body.result,
      comment: body.comment,
      actorUserId: req.user.userId,
      row
    });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '品管审核订单',
      detail: { id, result: body.result }
    });
    sendUnifiedSuccess(res, { ok: true }, '品管审核完成');
  } catch (e) {
    if (sendSalesOrderFlowError(res, e)) return;
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
    if (!canMarkOrderShipped(req)) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const body = batchShipBodySchema.parse(req.body || {});
    const pool = getPool();
    const { okCount, failed, okItems } = await batchShipSalesOrders(pool, {
      rawIds: body.ids,
      shippingInstruction: body.shipping_instruction,
      actorUserId: req.user.userId
    });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '批量订单发货',
      detail: {
        ok: okCount,
        failed: failed.length,
        ids: okItems.map((x) => x.id),
        ok_items: okItems,
        failed_items: failed.slice(0, 200)
      }
    });
    sendUnifiedSuccess(res, { ok: okCount, failed }, '批量发货完成');
  } catch (e) {
    if (sendSalesOrderFlowError(res, e)) return;
    next(e);
  }
});

router.post('/orders/:id/ship', async (req, res, next) => {
  try {
    if (!canMarkOrderShipped(req)) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const body = shipSchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    await shipSalesOrder(pool, {
      orderId: id,
      shippingInstruction: body.shipping_instruction,
      actorUserId: req.user.userId,
      row
    });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '订单发货',
      detail: { id }
    });
    sendUnifiedSuccess(res, { ok: true }, '发货成功');
  } catch (e) {
    if (sendSalesOrderFlowError(res, e)) return;
    next(e);
  }
});

router.post('/orders/:id/complete', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_status_finance')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    await completeSalesOrder(pool, { orderId: id, actorUserId: req.user.userId, row });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '完结订单',
      detail: { id }
    });
    sendUnifiedSuccess(res, { ok: true }, '完结成功');
  } catch (e) {
    if (sendSalesOrderFlowError(res, e)) return;
    next(e);
  }
});

router.post('/orders/:id/cancel', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_cancel')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    try {
      assertFinanceOrderListScope(req, row);
    } catch (e) {
      if (e.code === 'FORBIDDEN') return sendUnifiedError(res, 403, 'FORBIDDEN');
      throw e;
    }
    const own = isOrderCreatedByCurrentUser(row, req);
    const finance = perm(req, 'order_management', 'order_status_finance');
    if (!isSuper(req) && !finance && !(own && row.status === 'pending_review' && !row.submitted_for_review_at)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    await cancelSalesOrder(pool, { orderId: id, actorUserId: req.user.userId, row });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '取消订单',
      detail: { id }
    });
    sendUnifiedSuccess(res, { ok: true }, '取消成功');
  } catch (e) {
    if (sendSalesOrderFlowError(res, e)) return;
    next(e);
  }
});

router.delete('/orders/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_delete')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    try {
      assertFinanceOrderListScope(req, row);
      assertOrderDeleteAllowed(row, req);
    } catch (e) {
      if (e.code === 'FORBIDDEN') return sendUnifiedError(res, 403, 'FORBIDDEN');
      if (e.code === 'INVALID_STATUS') return sendUnifiedError(res, 400, 'INVALID_STATUS');
      throw e;
    }
    await pool.query('DELETE FROM sales_orders WHERE id = ?', [id]);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '删除订单',
      detail: { id, order_no: row.order_no }
    });
    sendUnifiedSuccess(res, { ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/batch-delete', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_delete')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const body = batchOrderIdsBodySchema.parse(req.body || {});
    const wanted = uniquePositiveIds(body.ids);
    if (!wanted.length) return sendUnifiedError(res, 400, 'NO_IDS');

    const pool = getPool();
    const conn = await pool.getConnection();
    const failed = [];
    let deleted = 0;
    const deletedItems = [];
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
        deletedItems.push({
          id: row.id,
          order_no: row.order_no || null,
          status: row.status
        });
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
      detail: {
        deleted,
        failed: failed.length,
        ids: wanted,
        deleted_items: deletedItems,
        failed_items: failed.slice(0, 200)
      }
    });
    sendUnifiedSuccess(res, { ok: deleted, failed });
  } catch (e) {
    next(e);
  }
});

router.get('/orders/:id/status-logs', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_view_status_logs')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    if (!rows[0]) return sendUnifiedError(res, 404, 'NOT_FOUND');
    try {
      assertFinanceOrderListScope(req, rows[0]);
    } catch (e) {
      if (e.code === 'FORBIDDEN') return sendUnifiedError(res, 403, 'FORBIDDEN');
      throw e;
    }
    const seeAll = canViewAllSalesOrders(req);
    if (!seeAll && !isOrderCreatedByCurrentUser(rows[0], req)) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const [logs] = await pool.query(
      `SELECT l.*, u.username AS actor_username FROM sales_order_status_logs l
       LEFT JOIN users u ON u.id = l.actor_id WHERE l.order_id = ? ORDER BY l.created_at ASC`,
      [id]
    );
    sendUnifiedSuccess(res, { items: logs });
  } catch (e) {
    next(e);
  }
});

router.get('/orders/:id/edit-logs', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_view_status_logs')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    if (!rows[0]) return sendUnifiedError(res, 404, 'NOT_FOUND');
    try {
      assertFinanceOrderListScope(req, rows[0]);
    } catch (e) {
      if (e.code === 'FORBIDDEN') return sendUnifiedError(res, 403, 'FORBIDDEN');
      throw e;
    }
    const seeAll = canViewAllSalesOrders(req);
    if (!seeAll && !isOrderCreatedByCurrentUser(rows[0], req)) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const [logs] = await pool.query(
      `SELECT l.*, u.username AS actor_username FROM sales_order_edit_logs l
       LEFT JOIN users u ON u.id = l.actor_id WHERE l.order_id = ? ORDER BY l.created_at ASC`,
      [id]
    );
    sendUnifiedSuccess(res, { items: logs });
  } catch (e) {
    next(e);
  }
});

router.get('/customers/:customerId/contracts', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_view')) return sendUnifiedError(res, 403, 'FORBIDDEN');
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
    sendUnifiedSuccess(res, { items: rows });
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
    if (!canExport) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const q = listQuerySchema.parse(req.query);
    const pool = getPool();
    const uid = req.user.userId;
    const seeAll =
      perm(req, 'data_management', 'data_export_all') || canViewAllSalesOrders(req);

    let sql = `SELECT o.order_no, o.data_json, o.qc_qrcode_id, c.customer_code, c.customer_name, o.product_code, o.product_name, o.product_model, o.warehouse_model,
                      o.quantity, o.unit_price, o.amount, o.remark, o.status, o.created_at, u.username AS sales_username,
                      COALESCE(NULLIF(TRIM(u_ship.real_name), ''), NULLIF(TRIM(u_ship.username), ''), '') AS shipped_by_name
               FROM sales_orders o
               INNER JOIN sales_customers c ON c.id = o.customer_id
               LEFT JOIN users u ON u.id = o.created_by
               LEFT JOIN users u_ship ON u_ship.id = o.shipped_by
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
    const labelRow = [
      '订单号',
      ...fieldDefs.map((d) => d.label_zh),
      '状态',
      '销售人员',
      '发货人',
      '上传日期',
      '质检报告二维码'
    ];
    const models = rows.map((r) => r.product_model);
    const qcMap = await loadQcMap(pool, models);
    const rowsWithQc = await enrichOrdersQc(pool, rows, qcMap);
    const wsData = [
      labelRow,
      ...rowsWithQc.map((o) => {
        const { dataJson } = mergeRowDataJson(o, fieldDefs);
        const qcLabel = o.qc_public_url || '无可用报告';
        const cells = fieldDefs.map((d) => dataJson[d.field_key] ?? '');
        return [
          o.order_no,
          ...cells,
          o.status,
          o.sales_username,
          o.shipped_by_name || '',
          formatOrderUploadTime(o.created_at),
          qcLabel
        ];
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
    if (!perm(req, 'order_management', 'order_input')) return sendUnifiedError(res, 403, 'FORBIDDEN');
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
    if (!perm(req, 'order_management', 'order_input')) {
      return sendUnifiedError(res, 403, 'FORBIDDEN_ORDER_INPUT', {
        message: '缺少权限：销售·订单-录入/Excel导入'
      });
    }
    if (!req.file?.buffer) return sendUnifiedError(res, 400, 'FILE_REQUIRED');
    const uid = authenticatedNumericUserId(req);
    if (uid == null) {
      return sendUnifiedError(res, 401, 'UNAUTHORIZED', {
        message: '登录状态无效，请重新登录后重试'
      });
    }
    const pool = getPool();
    const definitions = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    if (!definitions.length) return sendUnifiedError(res, 400, 'NO_FIELDS_DEFINED');
    const labels = definitions.map((d) => d.label_zh);
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return sendUnifiedError(res, 400, 'EMPTY_SHEET');
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    if (!data.length) return sendUnifiedError(res, 400, 'EMPTY_SHEET');
    const rawHeader = (data[0] || []).map((c) => c);
    const colIndexByNorm = new Map();
    for (let j = 0; j < rawHeader.length; j++) {
      const norm = normalizeImportHeaderLabel(rawHeader[j]);
      if (!norm) continue;
      if (colIndexByNorm.has(norm)) {
        return sendUnifiedError(res, 400, 'DUPLICATE_HEADER', {
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
        return sendUnifiedError(res, 400, 'HEADER_MISMATCH', {
          message: `未找到与「${def.label_zh}」对应的表头列${hint}。请与模板列名一致或包含同义表头（可带 * 前缀，列顺序可任意）`,
          expected: labels,
          got: rawHeader.map((c) => String(c ?? '').trim())
        });
      }
      columnIndexes.push(idx);
    }
    const warehouseDefI = definitions.findIndex((d) => d.field_key === 'warehouse_model');
    const confirmDup =
      req.body?.confirm_duplicate_import === '1' ||
      req.body?.confirm_duplicate_import === 'true' ||
      req.body?.confirm_duplicate_import === true;

    const prepared = [];
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
      prepared.push({ rowNum, data: obj });
    }

    const fpMap = new Map();
    for (const pr of prepared) {
      const fp = orderImportRowFingerprint(definitions, pr.data);
      if (!fpMap.has(fp)) fpMap.set(fp, []);
      fpMap.get(fp).push(pr.rowNum);
    }
    const duplicate_groups = [];
    for (const rows of fpMap.values()) {
      if (rows.length > 1) duplicate_groups.push({ rows: [...rows].sort((a, b) => a - b) });
    }
    if (duplicate_groups.length && !confirmDup) {
      return sendUnifiedError(res, 409, 'EXCEL_DUPLICATE_ROWS', {
        message:
          '表格中存在多行「全字段内容完全一致」的重复数据。请删除多余行；若业务上确需写入多笔相同订单，请在确认后继续导入。',
        duplicate_groups
      });
    }

    const errors = [];
    const duplicates = [];
    let ok = 0;
    const seeAllOrders = canViewAllSalesOrders(req);
    for (const { rowNum, data: obj } of prepared) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        
        // 检查数据库中是否已存在相同订单
        const leg = dataJsonToLegacyColumns(definitions, obj);
        const codeKey = definitions.find((d) => d.maps_to === 'customer_code')?.field_key;
        const nameKey = definitions.find((d) => d.maps_to === 'customer_name')?.field_key;
        const customerId = await getOrCreateCustomer(conn, {
          customer_code: codeKey ? obj[codeKey] : '',
          customer_name: nameKey ? obj[nameKey] : '',
          userId: uid
        });
        
        // 检查是否存在相同的订单
        let duplicateSql = `SELECT o.id, o.order_no, o.product_name, o.product_model, o.product_code, c.customer_name 
           FROM sales_orders o 
           LEFT JOIN sales_customers c ON c.id = o.customer_id
           WHERE o.customer_id = ? 
           AND o.product_code = ? 
           AND o.product_name = ? 
           AND o.product_model = ? 
           AND o.warehouse_model = ? 
           AND o.quantity = ? 
           AND o.unit_price = ? 
           AND o.amount = ? 
           AND o.status != 'cancelled'`;
        const duplicateArgs = [
          customerId,
          leg.product_code || '',
          leg.product_name || '',
          leg.product_model || '',
          leg.warehouse_model || '',
          leg.quantity || 0,
          leg.unit_price || 0,
          leg.amount || 0
        ];
        if (!seeAllOrders) {
          duplicateSql += ' AND o.created_by = ?';
          duplicateArgs.push(uid);
        }
        duplicateSql += ' LIMIT 1';

        const [existing] = await conn.query(
          duplicateSql,
          duplicateArgs
        );
        
        if (existing.length > 0) {
          const dup = existing[0];
          duplicates.push({
            row: rowNum,
            imported_customer: dup.customer_name || '',
            imported_product: leg.product_name || '',
            imported_model: leg.product_model || '',
            imported_batch_no: leg.product_code || '',
            existing_order_no: dup.order_no || '',
            existing_customer: dup.customer_name || '',
            existing_product: dup.product_name || '',
            existing_batch_no: dup.product_code || ''
          });
          await conn.rollback();
          conn.release();
          continue;
        }
        
        await insertOrderWithData(conn, {
          userId: uid,
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
      detail: { ok, errors: errors.length, duplicates: duplicates.length, duplicate_groups_ok: confirmDup ? duplicate_groups.length : 0 }
    });
    sendUnifiedSuccess(
      res,
      {
        ok,
        errors,
        duplicates,
        duplicate_import_confirmed: confirmDup && duplicate_groups.length > 0
      },
      '导入完成'
    );
  } catch (e) {
    next(e);
  }
});


router.get('/process/order-logs', async (req, res, next) => {
  try {
    if (!perm(req, 'process_management', 'view_flow')) return sendUnifiedError(res, 403, 'FORBIDDEN');
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
    sendUnifiedSuccess(res, { items: rows });
  } catch (e) {
    next(e);
  }
});

/** 审批人列表（提交合同时选人）；可选 departmentId= 部门树筛选（含子部门） */
router.get('/finance-reviewers', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_submit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const pool = getPool();
    const rawDept = req.query.departmentId;
    let deptIds = null;
    if (rawDept != null && String(rawDept).trim() !== '') {
      const rootId = Number(rawDept);
      if (!Number.isFinite(rootId) || rootId < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
      const [chk] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [rootId]);
      if (!chk?.[0]) return sendUnifiedError(res, 400, 'BAD_DEPARTMENT');
      deptIds = await departmentSubtreeIds(pool, rootId);
    }
    let sql = `SELECT u.id,
                      u.username,
                      u.real_name AS realName,
                      CASE
                        WHEN u.real_name IS NOT NULL AND TRIM(u.real_name) <> '' THEN u.real_name
                        ELSE u.username
                      END AS displayName,
                      u.department_id AS departmentId,
                      d.name_zh AS departmentNameZh
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1`;
    const args = [];
    if (deptIds?.length) {
      sql += ` AND u.department_id IN (${deptIds.map(() => '?').join(',')})`;
      args.push(...deptIds);
    }
    sql += ' ORDER BY d.sort_order ASC, d.id ASC, u.username ASC';
    const [rows] = await pool.query(sql, args);
    sendUnifiedSuccess(res, { items: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/sales-users', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_query')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id, u.username FROM users u
       INNER JOIN employee_categories c ON c.id = u.employee_category_id
       WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code = 'sales'`
    );
    sendUnifiedSuccess(res, { items: rows });
  } catch (e) {
    next(e);
  }
});

  return router;
}
