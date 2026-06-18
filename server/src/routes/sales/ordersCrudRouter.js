import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../../db/pool.js';
import { logOperationFromReq } from '../../lib/audit.js';
import { listQuerySchema } from '../../lib/salesOrderListQuerySchema.js';
import {
  loadOrderFieldDefinitions,
  mergeRowDataJson
} from '../../lib/salesOrderFields.js';
import {
  createSalesOrderWithData,
  patchSalesOrderWithData
} from '../../services/salesOrderCrudService.js';

import {
  perm,
  isSuper,
  isOrderCreatedByCurrentUser,
  canViewAllSalesOrders,
  appendSalesOrderListFilters,
  filterOrderFieldDefsForList,
  redactOrderListRowForViewer,
  loadQcMap,
  enrichOrdersQc,
  canSeeOrderListContract,
  canSeeOrderListQcQrcode,
  orderEditable
} from './salesShared.js';
import { sendUnifiedError, sendUnifiedSuccess, sendSalesOrderCrudError } from './salesOrderRouterHelpers.js';
import { healOrphanPendingQcBatch } from '../../lib/salesOrderFlowRuntime.js';
import { buildOrderReportPrefill } from '../../lib/orderReportPrefill.js';
import { lookupQcYearbookForReport } from '../../lib/qcYearbookReportLookup.js';

const router = Router();

router.get('/orders/flow-summary', async (req, res, next) => {
  try {
    const canOrderQuery = perm(req, 'order_management', 'order_query') || perm(req, 'order_management', 'order_status_qc');
    if (!canOrderQuery) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const pool = getPool();
    const uid = req.user.userId;
    const seeAll = canViewAllSalesOrders(req);
    const raw = { ...req.query };
    const applyDate = raw.apply_date_range === '1' || raw.apply_date_range === 'true';
    if (!applyDate) {
      delete raw.date_from;
      delete raw.date_to;
      delete raw.pending_finance_only;
      delete raw.pending_qc_only;
    }
    const q = listQuerySchema.parse(raw);
    let sql = `SELECT
      SUM(CASE WHEN o.status = 'pending_review' AND o.submitted_for_review_at IS NULL THEN 1 ELSE 0 END) AS pending_submit,
      SUM(CASE WHEN o.status = 'pending_review' AND o.submitted_for_review_at IS NOT NULL THEN 1 ELSE 0 END) AS pending_finance,
      SUM(CASE WHEN o.status = 'pending_qc' THEN 1 ELSE 0 END) AS pending_qc,
      SUM(CASE WHEN o.status = 'approved' THEN 1 ELSE 0 END) AS pending_ship,
      SUM(CASE WHEN o.status = 'shipped' THEN 1 ELSE 0 END) AS shipped_open,
      SUM(CASE WHEN o.status = 'rejected' AND o.qc_reviewed_at IS NULL THEN 1 ELSE 0 END) AS finance_rejected,
      SUM(CASE WHEN o.status = 'rejected' AND o.qc_reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS qc_rejected
      FROM sales_orders o
      INNER JOIN sales_customers c ON c.id = o.customer_id
      WHERE o.status <> 'cancelled'`;
    const args = [];
    const scoped = appendSalesOrderListFilters(sql, args, req, q, { uid, seeAll }, { skipDateRange: !applyDate });
    sql = scoped.sql;
    const [rows] = await pool.query(sql, args);
    const r = rows[0] || {};
    sendUnifiedSuccess(res, {
      pending_submit: Number(r.pending_submit || 0),
      pending_finance: Number(r.pending_finance || 0),
      pending_qc: Number(r.pending_qc || 0),
      pending_ship: Number(r.pending_ship || 0),
      shipped_open: Number(r.shipped_open || 0),
      finance_rejected: Number(r.finance_rejected || 0),
      qc_rejected: Number(r.qc_rejected || 0),
      apply_date_range: applyDate
    });
  } catch (e) {
    next(e);
  }
});

router.get('/orders/sla-summary', async (req, res, next) => {
  try {
    const canOrderQuery = perm(req, 'order_management', 'order_query') || perm(req, 'order_management', 'order_status_qc');
    if (!canOrderQuery) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const pool = getPool();
    const uid = req.user.userId;
    const seeAll = canViewAllSalesOrders(req);
    const raw = { ...req.query };
    const applyDate = raw.apply_date_range === '1' || raw.apply_date_range === 'true';
    if (!applyDate) {
      delete raw.date_from;
      delete raw.date_to;
      delete raw.pending_finance_only;
      delete raw.pending_qc_only;
    }
    const q = listQuerySchema.parse(raw);
    const financeH = Math.min(720, Math.max(1, Number(process.env.SALES_SLA_FINANCE_HOURS || 48)));
    const qcH = Math.min(720, Math.max(1, Number(process.env.SALES_SLA_QC_HOURS || 48)));
    const shipH = Math.min(720, Math.max(1, Number(process.env.SALES_SLA_SHIP_HOURS || 72)));
    const completeH = Math.min(1440, Math.max(1, Number(process.env.SALES_SLA_COMPLETE_HOURS || 168)));
    let sql = `SELECT
      SUM(CASE WHEN o.status = 'pending_review' AND o.submitted_for_review_at IS NOT NULL
        AND o.submitted_for_review_at < DATE_SUB(NOW(3), INTERVAL ? HOUR) THEN 1 ELSE 0 END) AS overdue_finance,
      SUM(CASE WHEN o.status = 'pending_qc' AND o.finance_reviewed_at IS NOT NULL
        AND o.finance_reviewed_at < DATE_SUB(NOW(3), INTERVAL ? HOUR) THEN 1 ELSE 0 END) AS overdue_qc,
      SUM(CASE WHEN o.status = 'approved' AND COALESCE(o.qc_reviewed_at, o.finance_reviewed_at) IS NOT NULL
        AND COALESCE(o.qc_reviewed_at, o.finance_reviewed_at) < DATE_SUB(NOW(3), INTERVAL ? HOUR) THEN 1 ELSE 0 END) AS overdue_ship,
      SUM(CASE WHEN o.status = 'shipped' AND o.shipped_at IS NOT NULL
        AND o.shipped_at < DATE_SUB(NOW(3), INTERVAL ? HOUR) THEN 1 ELSE 0 END) AS overdue_complete
      FROM sales_orders o
      INNER JOIN sales_customers c ON c.id = o.customer_id
      WHERE o.status <> 'cancelled'`;
    const args = [financeH, qcH, shipH, completeH];
    const scoped = appendSalesOrderListFilters(sql, args, req, q, { uid, seeAll }, { skipDateRange: !applyDate });
    sql = scoped.sql;
    const [rows] = await pool.query(sql, args);
    const r = rows[0] || {};
    sendUnifiedSuccess(res, {
      overdue_finance: Number(r.overdue_finance || 0),
      overdue_qc: Number(r.overdue_qc || 0),
      overdue_ship: Number(r.overdue_ship || 0),
      overdue_complete: Number(r.overdue_complete || 0),
      thresholds_hours: { finance: financeH, qc: qcH, ship: shipH, complete: completeH },
      apply_date_range: applyDate
    });
  } catch (e) {
    next(e);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    const canOrderQuery = perm(req, 'order_management', 'order_query') || perm(req, 'order_management', 'order_status_qc');
    if (!canOrderQuery) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const q = listQuerySchema.parse(req.query);
    const pool = getPool();
    try {
      await healOrphanPendingQcBatch(pool);
    } catch (healErr) {
      // eslint-disable-next-line no-console
      console.warn('[orders] heal orphan pending_qc failed:', healErr?.message || healErr);
    }
    const uid = req.user.userId;
    const seeAll = canViewAllSalesOrders(req);

    const fromJoinWhere = `FROM sales_orders o
               INNER JOIN sales_customers c ON c.id = o.customer_id
               LEFT JOIN users u ON u.id = o.created_by
               LEFT JOIN users u_ship ON u_ship.id = o.shipped_by
               WHERE 1=1`;

    let sql = `SELECT o.id, o.order_no, o.customer_id, o.data_json,
                      o.field_schema_version,
                      o.product_code, o.product_name, o.product_model, o.warehouse_model,
                      o.quantity, o.unit_price, o.amount, o.remark,
                      o.status, o.submitted_for_review_at, o.finance_reviewed_at, o.qc_reviewed_at,
                      o.finance_comment, o.qc_comment,
                      o.created_by, o.created_at, o.row_version,
                      o.qc_qrcode_id,
                      c.customer_code, c.customer_name, c.contact_name, u.username AS created_by_username,
                      COALESCE(NULLIF(TRIM(u_ship.real_name), ''), NULLIF(TRIM(u_ship.username), ''), '') AS shipped_by_name
               ${fromJoinWhere}`;
    const args = [];
    const scoped = appendSalesOrderListFilters(sql, args, req, q, { uid, seeAll });
    sql = scoped.sql;
    // 注意：scoped.args 与上面的 args 为同一数组引用，已在 appendSalesOrderListFilters 内填好，勿先 clear 再 push(scoped.args)

    /** 独立 COUNT，避免 `SELECT COUNT(*) FROM (长列表 SELECT …) t` 在部分 MySQL 下派生表优化报语法错 */
    let countSql = `SELECT COUNT(*) AS c ${fromJoinWhere}`;
    const countArgs = [];
    const scopedCount = appendSalesOrderListFilters(countSql, countArgs, req, q, { uid, seeAll });
    countSql = scopedCount.sql;
    const [countRows] = await pool.query(countSql, countArgs);
    const total = Number(countRows[0]?.c || 0);

    const orderBy =
      q.sort === 'created_at_asc'
        ? 'o.created_at ASC'
        : q.sort === 'customer_name_asc'
          ? 'c.customer_name ASC, o.created_at DESC'
          : q.sort === 'customer_name_desc'
            ? 'c.customer_name DESC, o.created_at DESC'
            : 'o.created_at DESC';

    sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    args.push(q.page_size, (q.page - 1) * q.page_size);

    const [rows] = await pool.query(sql, args);

    // 关联合同摘要：按订单找最近一份合同及其审核状态
    let contractByOrderId = new Map();
    if (rows.length && canSeeOrderListContract(req)) {
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

    const listFieldDefs = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    const listFieldDefsForViewer = filterOrderFieldDefsForList(req, listFieldDefs);
    const enriched = rows.map((r) => {
      const { display_data, dataJson } = mergeRowDataJson(r, listFieldDefs);
      const c = contractByOrderId.get(Number(r.id)) || null;
      return redactOrderListRowForViewer(
        req,
        {
          ...r,
          display_data,
          data_json: dataJson,
          contract_id: c ? c.contract_id : null,
          contract_status: c ? c.contract_status : null,
          contract_last_reject_comment: c ? c.contract_last_reject_comment : null
        },
        listFieldDefs
      );
    });
    let items = enriched;
    if (canSeeOrderListQcQrcode(req)) {
      const qcMap = await loadQcMap(pool, enriched);
      items = await enrichOrdersQc(pool, enriched, qcMap);
    }
    const payload = { items, total, page: q.page, page_size: q.page_size };
    if (q.include_field_definitions) payload.field_definitions = listFieldDefsForViewer;
    sendUnifiedSuccess(res, payload);
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

/** 从订单生成报告时的字段预填（支持页面刷新后按 fromOrder 恢复） */
router.get('/orders/:id/report-prefill', async (req, res, next) => {
  try {
    const canReportsCreate = perm(req, 'reports', 'create');
    const canOrderQuery = perm(req, 'order_management', 'order_query');
    if (!canReportsCreate && !canOrderQuery) return sendUnifiedError(res, 403, 'FORBIDDEN');

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return sendUnifiedError(res, 400, 'BAD_REQUEST');

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT o.id, o.order_no, o.customer_id, o.data_json, o.field_schema_version,
              o.product_code, o.product_name, o.product_model, o.warehouse_model, o.quantity,
              c.customer_name, c.contact_name AS customer_contact
       FROM sales_orders o
       INNER JOIN sales_customers c ON c.id = o.customer_id
       WHERE o.id = ?
       LIMIT 1`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');

    const fieldDefs = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    const { display_data } = mergeRowDataJson(row, fieldDefs);
    const prefill = buildOrderReportPrefill({ ...row, display_data }, fieldDefs);
    if (!prefill.product_name?.zh) {
      return sendUnifiedError(res, 422, '订单缺少标签型号，无法生成报告预填');
    }

    const qcYearbook = await lookupQcYearbookForReport(pool, {
      orderId: id,
      productModel: prefill.product_name.zh,
      batchNo: prefill.batch_no?.zh || ''
    });
    prefill.qcYearbook = qcYearbook;

    sendUnifiedSuccess(res, { prefill });
  } catch (e) {
    next(e);
  }
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

export { router };
