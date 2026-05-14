/**
 * 销售订单状态流转：数据库更新、状态日志、站内信与企业微信通知。
 * 权限与 HTTP 状态码映射由路由层负责；本模块通过 SalesOrderFlowError 抛出业务错误码。
 */

import { buildOrderNotifyBody } from '../lib/salesOrderNotifyBody.js';
import {
  tryNotifyFinanceWecomOrderEvent,
  tryNotifyWarehouseWecomOrderApproved,
  tryNotifySalesWecomOrderRejected,
  tryNotifyQcWecomPendingQc,
  WECOM_TEMPLATE_SALES_ORDER_WITHDRAW_FINANCE
} from '../lib/wecomNotify.js';
import { notifyUsersByCategory, notifyUser } from '../lib/salesInternalInbox.js';
import { uniquePositiveIds } from '../lib/idList.js';

export class SalesOrderFlowError extends Error {
  /**
   * @param {string} code 与路由历史一致的 error 码（如 NOT_FOUND）
   * @param {number} [httpStatus=400]
   * @param {Record<string, unknown>} [payload] 可选附加字段（如 details）
   */
  constructor(code, httpStatus = 400, payload = {}) {
    super(code);
    this.name = 'SalesOrderFlowError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.payload = payload;
  }
}

async function loadFinanceStaffUserIds(pool) {
  const [fin] = await pool.query(
    `SELECT u.id FROM users u INNER JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.is_active = 1 AND u.account_type IN ('employee', 'manager') AND c.code = 'finance'`
  );
  return fin.map((f) => f.id);
}

/** 提交财务审核（单条） */
export async function submitSalesOrderForFinanceReview(pool, { orderId, actorUserId, row }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) throw new SalesOrderFlowError('BAD_REQUEST', 400);
  if (!row) throw new SalesOrderFlowError('NOT_FOUND', 404);
  if (!['pending_review', 'rejected'].includes(row.status)) {
    throw new SalesOrderFlowError('INVALID_STATUS', 400);
  }
  if (row.submitted_for_review_at) throw new SalesOrderFlowError('ALREADY_SUBMITTED', 400);

  const isResubmit = row.status === 'rejected';
  const [submitResult] = isResubmit
    ? await pool.query(
        `UPDATE sales_orders
         SET status = ?, finance_reviewed_at = NULL, finance_reviewed_by = NULL, finance_comment = NULL,
             qc_reviewed_at = NULL, qc_reviewed_by = NULL, qc_comment = NULL,
             submitted_for_review_at = NOW(3), updated_by = ?, row_version = row_version + 1
         WHERE id = ? AND status = ? AND submitted_for_review_at IS NULL`,
        ['pending_review', actorUserId, id, row.status]
      )
    : await pool.query(
        `UPDATE sales_orders
         SET submitted_for_review_at = NOW(3), updated_by = ?, row_version = row_version + 1
         WHERE id = ? AND status = ? AND submitted_for_review_at IS NULL`,
        [actorUserId, id, row.status]
      );
  if (!submitResult.affectedRows) throw new SalesOrderFlowError('ORDER_STATE_CHANGED', 409);

  await pool.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, ?, 'pending_review', ?, '提交财务审核')`,
    [id, row.status, actorUserId]
  );

  const submitBody = await buildOrderNotifyBody(pool, [row], {
    intro: '有新的订单已提交财务审核，请及时处理。'
  });
  await notifyUsersByCategory(pool, 'finance', {
    title: '待审核订单',
    bodyText: submitBody,
    fromUserId: actorUserId,
    refType: 'order',
    refId: id,
    msgCategory: 'todo'
  });
  await tryNotifyFinanceWecomOrderEvent(pool, {
    event: 'submit',
    notifyBody: submitBody,
    orderRows: [row],
    fromUserId: actorUserId
  });
}

/** 撤回财务审核申请（单条） */
export async function withdrawSalesOrderFinanceReview(pool, { orderId, actorUserId, row }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) throw new SalesOrderFlowError('BAD_REQUEST', 400);
  if (!row) throw new SalesOrderFlowError('NOT_FOUND', 404);
  if (row.status !== 'pending_review' || !row.submitted_for_review_at) {
    throw new SalesOrderFlowError('NOT_SUBMITTED', 400);
  }

  const [withdrawResult] = await pool.query(
    `UPDATE sales_orders
     SET submitted_for_review_at = NULL, updated_by = ?, row_version = row_version + 1
     WHERE id = ? AND status = 'pending_review' AND submitted_for_review_at IS NOT NULL`,
    [actorUserId, id]
  );
  if (!withdrawResult.affectedRows) throw new SalesOrderFlowError('ORDER_STATE_CHANGED', 409);

  await pool.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, 'pending_review', 'pending_review', ?, '撤回审核申请')`,
    [id, actorUserId]
  );

  const withdrawBody = await buildOrderNotifyBody(pool, [row], {
    intro: '销售已撤回财务审核申请，该订单不再在待审队列中。'
  });
  await notifyUsersByCategory(pool, 'finance', {
    title: '订单已撤回审核申请',
    bodyText: withdrawBody,
    fromUserId: actorUserId,
    refType: 'order_withdraw',
    refId: id,
    msgCategory: 'notice'
  });
  await tryNotifyFinanceWecomOrderEvent(pool, {
    event: 'withdraw',
    notifyBody: withdrawBody,
    orderRows: [row],
    fromUserId: actorUserId
  });
}

/**
 * 批量提交财务审核
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ rawIds: unknown[], actorUserId: number, mayActOnOrder: (row: object) => boolean }} ctx
 */
export async function batchSubmitSalesOrdersForFinanceReview(pool, { rawIds, actorUserId, mayActOnOrder }) {
  const wanted = uniquePositiveIds(rawIds);
  if (!wanted.length) throw new SalesOrderFlowError('NO_IDS', 400);

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
      if (!mayActOnOrder(row)) {
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
      const rejectedIds = okIds.filter((oid) => byId.get(oid)?.status === 'rejected');
      const pendingIds = okIds.filter((oid) => byId.get(oid)?.status === 'pending_review');
      if (pendingIds.length) {
        const pendingPh = pendingIds.map(() => '?').join(',');
        await conn.query(
          `UPDATE sales_orders
           SET submitted_for_review_at = NOW(3), updated_by = ?, row_version = row_version + 1
           WHERE id IN (${pendingPh})`,
          [actorUserId, ...pendingIds]
        );
      }
      if (rejectedIds.length) {
        const rejectedPh = rejectedIds.map(() => '?').join(',');
        await conn.query(
          `UPDATE sales_orders
           SET status = 'pending_review',
               submitted_for_review_at = NOW(3),
               finance_reviewed_at = NULL,
               finance_reviewed_by = NULL,
               finance_comment = NULL,
               qc_reviewed_at = NULL,
               qc_reviewed_by = NULL,
               qc_comment = NULL,
               updated_by = ?,
               row_version = row_version + 1
           WHERE id IN (${rejectedPh})`,
          [actorUserId, ...rejectedIds]
        );
      }
      for (const oid of okIds) {
        const r = byId.get(oid);
        await conn.query(
          `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
           VALUES (?, ?, 'pending_review', ?, '提交财务审核')`,
          [oid, r?.status || 'pending_review', actorUserId]
        );
      }
    }
    okRows = okIds.map((oid) => byId.get(oid));
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
      fromUserId: actorUserId,
      refType: 'order_batch_submit',
      refId: okRows[0].id,
      msgCategory: 'todo'
    });
    await tryNotifyFinanceWecomOrderEvent(pool, {
      event: 'batch_submit',
      notifyBody: batchSubmitBody,
      orderRows: okRows,
      fromUserId: actorUserId
    });
  }

  const okItems = okRows.map((r) => ({
    id: r.id,
    order_no: r.order_no || null,
    from_status: r.status,
    to_status: 'pending_review'
  }));
  return { okCount: okRows.length, failed, okItems };
}

/**
 * 批量财务审核
 */
export async function batchFinanceReviewSalesOrders(pool, { rawIds, result, comment, actorUserId }) {
  if (result === 'rejected' && !String(comment || '').trim()) {
    throw new SalesOrderFlowError('COMMENT_REQUIRED', 400);
  }
  const wanted = uniquePositiveIds(rawIds);
  if (!wanted.length) throw new SalesOrderFlowError('NO_IDS', 400);

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
      if (result === 'approved') {
        await conn.query(
          `UPDATE sales_orders SET status = 'pending_qc', finance_reviewed_at = NOW(3), finance_reviewed_by = ?, finance_comment = ?,
             qc_reviewed_at = NULL, qc_reviewed_by = NULL, qc_comment = NULL, updated_by = ?, row_version = row_version + 1
           WHERE id IN (${ph2})`,
          [actorUserId, comment || null, actorUserId, ...okIds]
        );
        for (const oid of okIds) {
          await conn.query(
            `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
             VALUES (?, 'pending_review', 'pending_qc', ?, ?)`,
            [oid, actorUserId, comment || '财务通过']
          );
        }
      } else {
        await conn.query(
          `UPDATE sales_orders SET status = 'rejected', finance_reviewed_at = NOW(3), finance_reviewed_by = ?, finance_comment = ?, submitted_for_review_at = NULL, updated_by = ?, row_version = row_version + 1
           WHERE id IN (${ph2})`,
          [actorUserId, comment, actorUserId, ...okIds]
        );
        for (const oid of okIds) {
          await conn.query(
            `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
             VALUES (?, 'pending_review', 'rejected', ?, ?)`,
            [oid, actorUserId, comment]
          );
        }
      }
    }
    okRows = okIds.map((oid) => byId.get(oid));
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  if (okRows.length && result === 'approved') {
    const pendingQcBody =
      okRows.length === 1
        ? await buildOrderNotifyBody(pool, okRows, {
            intro: '订单已通过财务审核，请进行品管（质检）审核；通过后仓库方可发货。'
          })
        : '批量订单已通过财务审核，请品管进行质检审核。请到订单管理查看详情。';
    await notifyUsersByCategory(pool, 'qc', {
      title: '待品管审核订单',
      bodyText: pendingQcBody,
      fromUserId: actorUserId,
      refType: 'order_batch_finance_pass',
      refId: okRows[0].id,
      msgCategory: 'todo'
    });
    await tryNotifyQcWecomPendingQc(pool, {
      orderRows: okRows,
      fromUserId: actorUserId,
      notifyBody: pendingQcBody
    });
  }

  if (okRows.length && result === 'rejected') {
    const byCreator = new Map();
    for (const row of okRows) {
      if (!row.created_by) continue;
      if (!byCreator.has(row.created_by)) byCreator.set(row.created_by, []);
      byCreator.get(row.created_by).push(row);
    }
    const c = comment;
    for (const [uid, list] of byCreator) {
      const rejectBody =
        list.length === 1
          ? await buildOrderNotifyBody(pool, list, {
              intro: `订单已被财务驳回。\n驳回原因：${c}`
            })
          : `批量订单已被财务驳回。\n驳回原因：${c}\n请到订单管理查看详情。`;
      await notifyUser(pool, uid, {
        title: '订单审核驳回',
        bodyText: rejectBody,
        fromUserId: actorUserId,
        refType: 'order_batch_rejected',
        refId: list[0].id,
        msgCategory: 'notice'
      });
      await tryNotifySalesWecomOrderRejected(pool, {
        notifyBody: rejectBody,
        orderRows: list,
        fromUserId: actorUserId,
        toUserId: uid
      });
    }
  }

  const okItems = okRows.map((r) => ({
    id: r.id,
    order_no: r.order_no || null,
    from_status: 'pending_review',
    to_status: result === 'approved' ? 'pending_qc' : 'rejected'
  }));
  return { okCount: okRows.length, failed, okItems };
}

/** 单条财务审核 */
export async function financeReviewSalesOrder(pool, { orderId, result, comment, actorUserId, row }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) throw new SalesOrderFlowError('BAD_REQUEST', 400);
  if (result === 'rejected' && !String(comment || '').trim()) {
    throw new SalesOrderFlowError('COMMENT_REQUIRED', 400);
  }
  if (!row) throw new SalesOrderFlowError('NOT_FOUND', 404);
  if (row.status !== 'pending_review' || !row.submitted_for_review_at) {
    throw new SalesOrderFlowError('NOT_IN_REVIEW_QUEUE', 400);
  }

  if (result === 'approved') {
    const [approveResult] = await pool.query(
      `UPDATE sales_orders SET status = 'pending_qc', finance_reviewed_at = NOW(3), finance_reviewed_by = ?, finance_comment = ?,
           qc_reviewed_at = NULL, qc_reviewed_by = NULL, qc_comment = NULL, updated_by = ?, row_version = row_version + 1
       WHERE id = ? AND status = 'pending_review' AND submitted_for_review_at IS NOT NULL`,
      [actorUserId, comment || null, actorUserId, id]
    );
    if (!approveResult.affectedRows) throw new SalesOrderFlowError('ORDER_STATE_CHANGED', 409);
    await pool.query(
      `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
       VALUES (?, 'pending_review', 'pending_qc', ?, ?)`,
      [id, actorUserId, comment || '财务通过']
    );
    const pendingQcBody = await buildOrderNotifyBody(pool, [row], {
      intro: '订单已通过财务审核，请进行品管（质检）审核；通过后仓库方可发货。'
    });
    await notifyUsersByCategory(pool, 'qc', {
      title: '待品管审核订单',
      bodyText: pendingQcBody,
      fromUserId: actorUserId,
      refType: 'order',
      refId: id,
      msgCategory: 'todo'
    });
    await tryNotifyQcWecomPendingQc(pool, {
      orderRows: [row],
      fromUserId: actorUserId,
      notifyBody: pendingQcBody
    });
  } else {
    const [rejectResult] = await pool.query(
      `UPDATE sales_orders SET status = 'rejected', finance_reviewed_at = NOW(3), finance_reviewed_by = ?, finance_comment = ?, submitted_for_review_at = NULL, updated_by = ?, row_version = row_version + 1
       WHERE id = ? AND status = 'pending_review' AND submitted_for_review_at IS NOT NULL`,
      [actorUserId, comment, actorUserId, id]
    );
    if (!rejectResult.affectedRows) throw new SalesOrderFlowError('ORDER_STATE_CHANGED', 409);
    await pool.query(
      `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
       VALUES (?, 'pending_review', 'rejected', ?, ?)`,
      [id, actorUserId, comment]
    );
    if (row.created_by) {
      const rejectOneBody = await buildOrderNotifyBody(pool, [row], {
        intro: `订单已被财务驳回。\n驳回原因：${comment}`
      });
      await notifyUser(pool, row.created_by, {
        title: '订单审核驳回',
        bodyText: rejectOneBody,
        fromUserId: actorUserId,
        refType: 'order',
        refId: id,
        msgCategory: 'notice'
      });
      await tryNotifySalesWecomOrderRejected(pool, {
        notifyBody: rejectOneBody,
        orderRows: [row],
        fromUserId: actorUserId,
        toUserId: row.created_by
      });
    }
  }
}

/**
 * 批量品管（质检）审核：仅 `pending_qc`；通过后进入 `approved` 并通知仓库。
 */
export async function batchQcReviewSalesOrders(pool, { rawIds, result, comment, actorUserId }) {
  if (result === 'rejected' && !String(comment || '').trim()) {
    throw new SalesOrderFlowError('COMMENT_REQUIRED', 400);
  }
  const wanted = uniquePositiveIds(rawIds);
  if (!wanted.length) throw new SalesOrderFlowError('NO_IDS', 400);

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
      if (row.status !== 'pending_qc') {
        failed.push({ id, error: 'NOT_IN_QC_QUEUE' });
        continue;
      }
      okIds.push(id);
    }

    if (okIds.length) {
      const ph2 = okIds.map(() => '?').join(',');
      if (result === 'approved') {
        await conn.query(
          `UPDATE sales_orders SET status = 'approved', qc_reviewed_at = NOW(3), qc_reviewed_by = ?, qc_comment = ?, updated_by = ?, row_version = row_version + 1
           WHERE id IN (${ph2})`,
          [actorUserId, comment || null, actorUserId, ...okIds]
        );
        for (const oid of okIds) {
          await conn.query(
            `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
             VALUES (?, 'pending_qc', 'approved', ?, ?)`,
            [oid, actorUserId, comment || '品管通过']
          );
        }
      } else {
        await conn.query(
          `UPDATE sales_orders SET status = 'rejected', qc_reviewed_at = NOW(3), qc_reviewed_by = ?, qc_comment = ?, submitted_for_review_at = NULL, updated_by = ?, row_version = row_version + 1
           WHERE id IN (${ph2})`,
          [actorUserId, comment, actorUserId, ...okIds]
        );
        for (const oid of okIds) {
          await conn.query(
            `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
             VALUES (?, 'pending_qc', 'rejected', ?, ?)`,
            [oid, actorUserId, comment]
          );
        }
      }
    }
    okRows = okIds.map((oid) => byId.get(oid));
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  if (okRows.length && result === 'approved') {
    const approvedBody =
      okRows.length === 1
        ? await buildOrderNotifyBody(pool, okRows, {
            intro: '订单已通过品管（质检）审核，请备货发货。'
          })
        : '批量订单已通过品管审核，请备货发货。请到订单管理查看详情。';
    await notifyUsersByCategory(pool, 'warehouse', {
      title: '订单待发货',
      bodyText: approvedBody,
      fromUserId: actorUserId,
      refType: 'order_batch_approved',
      refId: okRows[0].id,
      msgCategory: 'todo'
    });
    await tryNotifyWarehouseWecomOrderApproved(pool, {
      orderRows: okRows,
      fromUserId: actorUserId
    });
  }

  if (okRows.length && result === 'rejected') {
    const byCreator = new Map();
    for (const row of okRows) {
      if (!row.created_by) continue;
      if (!byCreator.has(row.created_by)) byCreator.set(row.created_by, []);
      byCreator.get(row.created_by).push(row);
    }
    const c = comment;
    for (const [uid, list] of byCreator) {
      const rejectBody =
        list.length === 1
          ? await buildOrderNotifyBody(pool, list, {
              intro: `订单已被品管（质检）驳回。\n驳回原因：${c}`
            })
          : `批量订单已被品管驳回。\n驳回原因：${c}\n请到订单管理查看详情。`;
      await notifyUser(pool, uid, {
        title: '订单审核驳回',
        bodyText: rejectBody,
        fromUserId: actorUserId,
        refType: 'order_batch_qc_rejected',
        refId: list[0].id,
        msgCategory: 'notice'
      });
      await tryNotifySalesWecomOrderRejected(pool, {
        notifyBody: rejectBody,
        orderRows: list,
        fromUserId: actorUserId,
        toUserId: uid
      });
    }
  }

  const okItems = okRows.map((r) => ({
    id: r.id,
    order_no: r.order_no || null,
    from_status: 'pending_qc',
    to_status: result === 'approved' ? 'approved' : 'rejected'
  }));
  return { okCount: okRows.length, failed, okItems };
}

/** 单品管审核 */
export async function qcReviewSalesOrder(pool, { orderId, result, comment, actorUserId, row }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) throw new SalesOrderFlowError('BAD_REQUEST', 400);
  if (result === 'rejected' && !String(comment || '').trim()) {
    throw new SalesOrderFlowError('COMMENT_REQUIRED', 400);
  }
  if (!row) throw new SalesOrderFlowError('NOT_FOUND', 404);
  if (row.status !== 'pending_qc') {
    throw new SalesOrderFlowError('NOT_IN_QC_QUEUE', 400);
  }

  if (result === 'approved') {
    const [approveResult] = await pool.query(
      `UPDATE sales_orders SET status = 'approved', qc_reviewed_at = NOW(3), qc_reviewed_by = ?, qc_comment = ?, updated_by = ?, row_version = row_version + 1
       WHERE id = ? AND status = 'pending_qc'`,
      [actorUserId, comment || null, actorUserId, id]
    );
    if (!approveResult.affectedRows) throw new SalesOrderFlowError('ORDER_STATE_CHANGED', 409);
    await pool.query(
      `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
       VALUES (?, 'pending_qc', 'approved', ?, ?)`,
      [id, actorUserId, comment || '品管通过']
    );
    const approveOneBody = await buildOrderNotifyBody(pool, [row], {
      intro: '订单已通过品管（质检）审核，请备货发货。'
    });
    await notifyUsersByCategory(pool, 'warehouse', {
      title: '订单待发货',
      bodyText: approveOneBody,
      fromUserId: actorUserId,
      refType: 'order',
      refId: id,
      msgCategory: 'todo'
    });
    await tryNotifyWarehouseWecomOrderApproved(pool, {
      orderRows: [row],
      fromUserId: actorUserId
    });
  } else {
    const [rejectResult] = await pool.query(
      `UPDATE sales_orders SET status = 'rejected', qc_reviewed_at = NOW(3), qc_reviewed_by = ?, qc_comment = ?, submitted_for_review_at = NULL, updated_by = ?, row_version = row_version + 1
       WHERE id = ? AND status = 'pending_qc'`,
      [actorUserId, comment, actorUserId, id]
    );
    if (!rejectResult.affectedRows) throw new SalesOrderFlowError('ORDER_STATE_CHANGED', 409);
    await pool.query(
      `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
       VALUES (?, 'pending_qc', 'rejected', ?, ?)`,
      [id, actorUserId, comment]
    );
    if (row.created_by) {
      const rejectOneBody = await buildOrderNotifyBody(pool, [row], {
        intro: `订单已被品管（质检）驳回。\n驳回原因：${comment}`
      });
      await notifyUser(pool, row.created_by, {
        title: '订单审核驳回',
        bodyText: rejectOneBody,
        fromUserId: actorUserId,
        refType: 'order',
        refId: id,
        msgCategory: 'notice'
      });
      await tryNotifySalesWecomOrderRejected(pool, {
        notifyBody: rejectOneBody,
        orderRows: [row],
        fromUserId: actorUserId,
        toUserId: row.created_by
      });
    }
  }
}

/** 批量发货 */
export async function batchShipSalesOrders(pool, { rawIds, shippingInstruction, actorUserId }) {
  const wanted = uniquePositiveIds(rawIds);
  if (!wanted.length) throw new SalesOrderFlowError('NO_IDS', 400);

  const shipVal = shippingInstruction || null;
  const remarkLog = shippingInstruction || '发货';

  const conn = await pool.getConnection();
  const failed = [];
  let okRows = [];
  try {
    await conn.beginTransaction();
    const ph = wanted.map(() => '?').join(',');
    const [rows] = await conn.query(`SELECT * FROM sales_orders WHERE id IN (${ph}) FOR UPDATE`, wanted);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const okIds = [];
    for (const oid of wanted) {
      const row = byId.get(oid);
      if (!row) {
        failed.push({ id: oid, error: 'NOT_FOUND' });
        continue;
      }
      if (row.status !== 'approved') {
        failed.push({ id: oid, error: 'INVALID_STATUS' });
        continue;
      }
      okIds.push(oid);
    }
    if (okIds.length) {
      const ph2 = okIds.map(() => '?').join(',');
      await conn.query(
        `UPDATE sales_orders SET status = 'shipped', shipped_at = NOW(3), shipped_by = ?, shipping_instruction = ?, updated_by = ?, row_version = row_version + 1 WHERE id IN (${ph2})`,
        [actorUserId, shipVal, actorUserId, ...okIds]
      );
      for (const oid of okIds) {
        await conn.query(
          `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
           VALUES (?, 'approved', 'shipped', ?, ?)`,
          [oid, actorUserId, remarkLog]
        );
      }
    }
    okRows = okIds.map((oid) => byId.get(oid));
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  const financeIds = await loadFinanceStaffUserIds(pool);
  const shipNoteTrim = shippingInstruction && String(shippingInstruction).trim();
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
        fromUserId: actorUserId,
        refType: 'order',
        refId: row.id,
        msgCategory: 'notice'
      });
    }
  }

  const okItems = okRows.map((r) => ({
    id: r.id,
    order_no: r.order_no || null,
    from_status: r.status,
    to_status: 'shipped'
  }));
  return { okCount: okRows.length, failed, okItems };
}

/** 单条发货 */
export async function shipSalesOrder(pool, { orderId, shippingInstruction, actorUserId, row }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) throw new SalesOrderFlowError('BAD_REQUEST', 400);
  if (!row) throw new SalesOrderFlowError('NOT_FOUND', 404);
  if (row.status !== 'approved') throw new SalesOrderFlowError('INVALID_STATUS', 400);

  const [shipResult] = await pool.query(
    `UPDATE sales_orders SET status = 'shipped', shipped_at = NOW(3), shipped_by = ?, shipping_instruction = ?, updated_by = ?, row_version = row_version + 1 WHERE id = ? AND status = 'approved'`,
    [actorUserId, shippingInstruction || null, actorUserId, id]
  );
  if (!shipResult.affectedRows) throw new SalesOrderFlowError('ORDER_STATE_CHANGED', 409);

  await pool.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, 'approved', 'shipped', ?, ?)`,
    [id, actorUserId, shippingInstruction || '发货']
  );

  const targets = new Set();
  if (row.created_by) targets.add(row.created_by);
  const financeIds = await loadFinanceStaffUserIds(pool);
  for (const fid of financeIds) targets.add(fid);
  const shipNote = shippingInstruction && String(shippingInstruction).trim();
  const shipIntro = shipNote ? `订单已发货。发货说明：${shipNote}` : '订单已发货。';
  const shipBody = await buildOrderNotifyBody(pool, [row], { intro: shipIntro });
  for (const uid of targets) {
    await notifyUser(pool, uid, {
      title: '订单已发货',
      bodyText: shipBody,
      fromUserId: actorUserId,
      refType: 'order',
      refId: id,
      msgCategory: 'notice'
    });
  }
}

/** 财务完结 */
export async function completeSalesOrder(pool, { orderId, actorUserId, row }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) throw new SalesOrderFlowError('BAD_REQUEST', 400);
  if (!row) throw new SalesOrderFlowError('NOT_FOUND', 404);
  if (row.status !== 'shipped') throw new SalesOrderFlowError('INVALID_STATUS', 400);

  const [completeResult] = await pool.query(
    `UPDATE sales_orders SET status = 'completed', updated_by = ?, row_version = row_version + 1 WHERE id = ? AND status = 'shipped'`,
    [actorUserId, id]
  );
  if (!completeResult.affectedRows) throw new SalesOrderFlowError('ORDER_STATE_CHANGED', 409);

  await pool.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, 'shipped', 'completed', ?, '完结')`,
    [id, actorUserId]
  );

  if (row.created_by) {
    const completeBody = await buildOrderNotifyBody(pool, [row], {
      intro: '财务已确认该订单完结。'
    });
    await notifyUser(pool, row.created_by, {
      title: '订单已完结',
      bodyText: completeBody,
      fromUserId: actorUserId,
      refType: 'order_complete',
      refId: id,
      msgCategory: 'notice'
    });
  }
}

/** 取消订单（路由层需先校验 finance scope 与取消权限） */
export async function cancelSalesOrder(pool, { orderId, actorUserId, row }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) throw new SalesOrderFlowError('BAD_REQUEST', 400);
  if (!row) throw new SalesOrderFlowError('NOT_FOUND', 404);
  if (['shipped', 'completed', 'cancelled'].includes(row.status)) {
    throw new SalesOrderFlowError('INVALID_STATUS', 400);
  }

  const [cancelResult] = await pool.query(
    `UPDATE sales_orders SET status = 'cancelled', updated_by = ?, row_version = row_version + 1 WHERE id = ? AND status = ?`,
    [actorUserId, id, row.status]
  );
  if (!cancelResult.affectedRows) throw new SalesOrderFlowError('ORDER_STATE_CHANGED', 409);

  await pool.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, ?, 'cancelled', ?, '取消订单')`,
    [id, row.status, actorUserId]
  );

  const cancelBody = await buildOrderNotifyBody(pool, [row], { intro: '本订单已被取消。' });
  if (row.submitted_for_review_at) {
    await notifyUsersByCategory(pool, 'finance', {
      title: '订单已取消',
      bodyText: cancelBody,
      fromUserId: actorUserId,
      refType: 'order_cancel',
      refId: id,
      msgCategory: 'notice'
    });
    await tryNotifyFinanceWecomOrderEvent(pool, {
      event: 'cancel',
      notifyBody: cancelBody,
      orderRows: [row],
      fromUserId: actorUserId,
      templateCode: WECOM_TEMPLATE_SALES_ORDER_WITHDRAW_FINANCE
    });
  }
  if (row.status === 'pending_qc') {
    await notifyUsersByCategory(pool, 'qc', {
      title: '订单已取消',
      bodyText: cancelBody,
      fromUserId: actorUserId,
      refType: 'order_cancel',
      refId: id,
      msgCategory: 'notice'
    });
  }
  if (row.created_by && Number(row.created_by) !== Number(actorUserId)) {
    await notifyUser(pool, row.created_by, {
      title: '订单已取消',
      bodyText: cancelBody,
      fromUserId: actorUserId,
      refType: 'order_cancel',
      refId: id,
      msgCategory: 'notice'
    });
  }
}
