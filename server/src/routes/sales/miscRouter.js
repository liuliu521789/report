import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';

import { getPool } from '../../db/pool.js';
import { logOperationFromReq } from '../../lib/audit.js';

import {
  perm,
  isSuper,
  canViewAllSalesOrders,
  isOrderCreatedByCurrentUser,
  fetchSalesContractRow,
  assertSalesContractVisible,
  financeOrderListScopeSql,
  departmentSubtreeIds,
  publicBaseUrl
} from './salesShared.js';
import { sendUnifiedError, sendUnifiedSuccess } from './salesOrderRouterHelpers.js';

const router = Router();

/** 请求体可同时传 qrcodeId（推荐）或 qrcode_id；二者都有时必须一致 */
const patchOrderQcSchemaLocal = z
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
        LEFT JOIN sales_customers c ON c.id = r.customer_id
        WHERE qr.qrcode_id = qrc.id
          AND (r.product_name LIKE ? OR r.batch_no LIKE ? OR c.customer_name LIKE ? OR c.contact_name LIKE ?)
      )`
      );
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
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
      `SELECT q.id, q.token, r.product_name AS productName, r.batch_no AS batchNo,
              c.customer_name AS customerName, c.contact_name AS customerContact
       FROM qrcodes q
       LEFT JOIN qrcode_reports qr ON qr.qrcode_id = q.id
       LEFT JOIN reports r ON r.id = qr.report_id
       LEFT JOIN sales_customers c ON c.id = r.customer_id
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
        item.reportTags.push({
          productName: row.productName || '',
          batchNo: row.batchNo || '',
          customerName: row.customerName || '',
          customerContact: row.customerContact || ''
        });
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
    const qid = patchOrderQcSchemaLocal.parse(req.body || {});
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

router.get('/process/order-logs', async (req, res, next) => {
  try {
    if (!perm(req, 'process_management', 'view_flow')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const pool = getPool();
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const orderNo = req.query.order_no;
    const seeAll = canViewAllSalesOrders(req);
    let sql = `SELECT l.*, o.order_no, u.username AS actor_username, u.real_name AS actor_real_name
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
    if (
      !perm(req, 'contract_management', 'contract_submit') &&
      !perm(req, 'contract_management', 'contract_generate')
    ) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
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

export { router };
