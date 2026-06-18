import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../../db/pool.js';
import { logOperationFromReq } from '../../lib/audit.js';
import {
  SalesOrderFlowError,
  submitSalesOrderForFinanceReview,
  withdrawSalesOrderFinanceReview,
  batchWithdrawSalesOrdersFinanceReview,
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
import { uniquePositiveIds } from '../../lib/idList.js';

import {
  perm,
  isSuper,
  isOrderCreatedByCurrentUser,
  canMarkOrderShipped,
  assertFinanceOrderListScope,
  assertOrderDeleteAllowed
} from './salesShared.js';
import { sendUnifiedError, sendUnifiedSuccess, sendSalesOrderFlowError } from './salesOrderRouterHelpers.js';

const router = Router();

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

router.post('/orders/batch-withdraw', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_withdraw')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const body = batchOrderIdsBodySchema.parse(req.body || {});
    const pool = getPool();
    const { okCount, failed, okItems } = await batchWithdrawSalesOrdersFinanceReview(pool, {
      rawIds: body.ids,
      actorUserId: req.user.userId,
      mayActOnOrder: (row) => isSuper(req) || isOrderCreatedByCurrentUser(row, req)
    });
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '批量撤回订单财务审核',
      detail: {
        ok: okCount,
        failed: failed.length,
        ids: okItems.map((x) => x.id),
        ok_items: okItems,
        failed_items: failed.slice(0, 200)
      }
    });
    sendUnifiedSuccess(res, { ok: okCount, failed }, '批量撤回完成');
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
    sendUnifiedSuccess(res, { ok: okCount, failed, ok_items: okItems }, '批量财务审核完成');
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

export { router };
