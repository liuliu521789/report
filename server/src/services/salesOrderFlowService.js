/**
 * 销售订单状态流转：数据库更新、状态日志、站内信与企业微信通知。
 * 权限与 HTTP 状态码映射由路由层负责；本模块通过 SalesOrderFlowError 抛出业务错误码。
 */

import { buildOrderNotifyBody } from '../lib/salesOrderNotifyBody.js';
import {
  tryNotifyFinanceWecomOrderEvent,
  WECOM_TEMPLATE_SALES_ORDER_WITHDRAW_FINANCE
} from '../lib/wecomNotify.js';
import { notifyUsersByCategory, notifyUser } from '../lib/salesInternalInbox.js';
import { uniquePositiveIds } from '../lib/idList.js';
import { resolveCurrentReviewStep, notifyStepAssignees, statusForStep } from '../lib/salesOrderFlowConfig.js';
import {
  loadActiveOrderFlowDefinition,
  assertOrderInReviewStep,
  applyOrderSubmit,
  applyStepApprove,
  applyStepReject,
  notifyAfterSubmit,
  notifyAfterApproveNext,
  notifyAfterApproveFinal,
  notifyAfterReject,
  notifyWithdraw,
  healOrphanPendingQc
} from '../lib/salesOrderFlowRuntime.js';

function throwFlowError(code, httpStatus = 400, payload = {}) {
  throw new SalesOrderFlowError(code, httpStatus, payload);
}

function mapRuntimeError(e) {
  if (e?.code) throw new SalesOrderFlowError(e.code, e.code === 'ORDER_STATE_CHANGED' ? 409 : 400);
  throw e;
}

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

/** 提交审核（单条，按流程配置进入首节点） */
export async function submitSalesOrderForFinanceReview(pool, { orderId, actorUserId, row }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) throwFlowError('BAD_REQUEST');
  if (!row) throwFlowError('NOT_FOUND', 404);
  if (!['pending_review', 'rejected'].includes(row.status)) throwFlowError('INVALID_STATUS');
  if (row.submitted_for_review_at) throwFlowError('ALREADY_SUBMITTED');

  const { definition, version } = await loadActiveOrderFlowDefinition(pool);
  if (!definition.steps.length) throwFlowError('FLOW_EMPTY');

  const conn = await pool.getConnection();
  let firstStep;
  try {
    await conn.beginTransaction();
    ({ firstStep } = await applyOrderSubmit(conn, {
      orderId: id,
      actorUserId,
      row,
      flowVersion: version,
      definition
    }));
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    mapRuntimeError(e);
  } finally {
    conn.release();
  }

  await notifyAfterSubmit(pool, { firstStep, orderRows: [row], actorUserId });
}

/** 撤回审核申请（单条，仅首节点待审时可撤回） */
export async function withdrawSalesOrderFinanceReview(pool, { orderId, actorUserId, row }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) throwFlowError('BAD_REQUEST');
  if (!row) throwFlowError('NOT_FOUND', 404);

  const { definition } = await loadActiveOrderFlowDefinition(pool);
  const firstStep = definition.steps[0];
  if (!firstStep) throwFlowError('FLOW_EMPTY');
  const ctx = resolveCurrentReviewStep(row, definition);
  if (!ctx || ctx.index !== 0) throwFlowError('NOT_SUBMITTED');

  const [withdrawResult] = await pool.query(
    `UPDATE sales_orders
     SET submitted_for_review_at = NULL,
         status = CASE WHEN status = 'pending_qc' THEN 'pending_review' ELSE status END,
         flow_step_index = NULL,
         updated_by = ?,
         row_version = row_version + 1
     WHERE id = ? AND (flow_step_index = 0 OR (flow_step_index IS NULL AND submitted_for_review_at IS NOT NULL))`,
    [actorUserId, id]
  );
  if (!withdrawResult.affectedRows) throwFlowError('ORDER_STATE_CHANGED', 409);

  await pool.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, ?, ?, ?, '撤回审核申请')`,
    [id, row.status, row.status, actorUserId]
  );

  await notifyWithdraw(pool, { orderRows: [row], actorUserId, firstStep });
}

/**
 * 批量撤回审核申请（仅首节点待审时可撤回）
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ rawIds: unknown[], actorUserId: number, mayActOnOrder: (row: object) => boolean }} ctx
 */
export async function batchWithdrawSalesOrdersFinanceReview(pool, { rawIds, actorUserId, mayActOnOrder }) {
  const wanted = uniquePositiveIds(rawIds);
  if (!wanted.length) throw new SalesOrderFlowError('NO_IDS', 400);

  const { definition } = await loadActiveOrderFlowDefinition(pool);
  const firstStep = definition.steps[0];
  if (!firstStep) throwFlowError('FLOW_EMPTY');

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
      const ctx = resolveCurrentReviewStep(row, definition);
      if (!ctx || ctx.index !== 0) {
        failed.push({ id, error: 'NOT_SUBMITTED' });
        continue;
      }
      const [withdrawResult] = await conn.query(
        `UPDATE sales_orders
         SET submitted_for_review_at = NULL,
             status = CASE WHEN status = 'pending_qc' THEN 'pending_review' ELSE status END,
             flow_step_index = NULL,
             updated_by = ?,
             row_version = row_version + 1
         WHERE id = ? AND (flow_step_index = 0 OR (flow_step_index IS NULL AND submitted_for_review_at IS NOT NULL))`,
        [actorUserId, id]
      );
      if (!withdrawResult.affectedRows) {
        failed.push({ id, error: 'ORDER_STATE_CHANGED' });
        continue;
      }
      await conn.query(
        `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
         VALUES (?, ?, ?, ?, '撤回审核申请')`,
        [id, row.status, row.status, actorUserId]
      );
      okIds.push(id);
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
    await notifyWithdraw(pool, { orderRows: okRows, actorUserId, firstStep });
  }

  const okItems = okRows.map((r) => ({
    id: r.id,
    order_no: r.order_no || null,
    from_status: r.status,
    to_status: r.status
  }));
  return { okCount: okRows.length, failed, okItems };
}

/**
 * 批量提交财务审核
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ rawIds: unknown[], actorUserId: number, mayActOnOrder: (row: object) => boolean }} ctx
 */
export async function batchSubmitSalesOrdersForFinanceReview(pool, { rawIds, actorUserId, mayActOnOrder }) {
  const wanted = uniquePositiveIds(rawIds);
  if (!wanted.length) throw new SalesOrderFlowError('NO_IDS', 400);

  const { definition, version } = await loadActiveOrderFlowDefinition(pool);
  if (!definition.steps.length) throwFlowError('FLOW_EMPTY');
  const firstStep = definition.steps[0];

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
      try {
        await applyOrderSubmit(conn, {
          orderId: id,
          actorUserId,
          row,
          flowVersion: version,
          definition
        });
        okIds.push(id);
      } catch (e) {
        failed.push({ id, error: e.code || 'FAILED' });
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
    await notifyAfterSubmit(pool, { firstStep, orderRows: okRows, actorUserId });
  }

  const okItems = okRows.map((r) => ({
    id: r.id,
    order_no: r.order_no || null,
    from_status: r.status,
    to_status: statusForStep(firstStep)
  }));
  return { okCount: okRows.length, failed, okItems };
}

/**
 * 批量财务审核
 */
export async function batchFinanceReviewSalesOrders(pool, { rawIds, result, comment, actorUserId }) {
  return batchReviewSalesOrdersByKind(pool, { rawIds, result, comment, actorUserId, expectedKind: 'finance' });
}

async function batchReviewSalesOrdersByKind(pool, { rawIds, result, comment, actorUserId, expectedKind }) {
  if (result === 'rejected' && !String(comment || '').trim()) {
    throw new SalesOrderFlowError('COMMENT_REQUIRED', 400);
  }
  const wanted = uniquePositiveIds(rawIds);
  if (!wanted.length) throw new SalesOrderFlowError('NO_IDS', 400);

  const ph = wanted.map(() => '?').join(',');
  const [rows] = await pool.query(`SELECT * FROM sales_orders WHERE id IN (${ph})`, wanted);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const failed = [];
  const okRows = [];

  for (const id of wanted) {
    const row = byId.get(id);
    if (!row) {
      failed.push({ id, error: 'NOT_FOUND' });
      continue;
    }
    try {
      const stepResult = await reviewSingleOrderStep(pool, {
        orderId: id,
        row,
        result,
        comment,
        actorUserId,
        expectedKind
      });
      okRows.push({ row, result: stepResult });
    } catch (e) {
      failed.push({ id, error: e instanceof SalesOrderFlowError ? e.code : 'FAILED' });
    }
  }

  const okItems = okRows.map(({ row: r, result: stepResult }) => ({
    id: r.id,
    order_no: r.order_no || null,
    from_status: r.status,
    to_status: stepResult?.toStatus || (result === 'approved' ? 'approved' : 'rejected')
  }));
  return { okCount: okRows.length, failed, okItems };
}

async function reviewSingleOrderStep(pool, { orderId, row, result, comment, actorUserId, expectedKind }) {
  if (result === 'rejected' && !String(comment || '').trim()) throwFlowError('COMMENT_REQUIRED');
  if (!row) throwFlowError('NOT_FOUND', 404);

  const { definition } = await loadActiveOrderFlowDefinition(pool);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const healed = await healOrphanPendingQc(conn, row, definition);
    const workingRow = healed || row;

    if (healed) {
      await conn.commit();
      return { outcome: 'approved', toStatus: 'approved', healedOrphan: true };
    }

    let ctx;
    try {
      ctx = assertOrderInReviewStep(workingRow, definition, expectedKind);
    } catch (e) {
      mapRuntimeError(e);
    }

    if (result === 'approved') {
      const out = await applyStepApprove(conn, { orderId, row: workingRow, ctx, actorUserId, comment });
      await conn.commit();
      if (out.outcome === 'next') {
        await notifyAfterApproveNext(pool, {
          nextStep: out.nextStep,
          orderRows: [workingRow],
          actorUserId,
          prevStep: ctx.step
        });
      } else {
        await notifyAfterApproveFinal(pool, { orderRows: [workingRow], actorUserId, step: ctx.step });
      }
      return out;
    }
    await applyStepReject(conn, { orderId, row: workingRow, ctx, actorUserId, comment });
    await conn.commit();
    await notifyAfterReject(pool, { orderRows: [workingRow], actorUserId, step: ctx.step, comment });
    return { outcome: 'rejected', toStatus: 'rejected' };
  } catch (e) {
    await conn.rollback();
    mapRuntimeError(e);
  } finally {
    conn.release();
  }
}

/** 单条财务审核 */
export async function financeReviewSalesOrder(pool, { orderId, result, comment, actorUserId, row }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) throwFlowError('BAD_REQUEST');
  await reviewSingleOrderStep(pool, {
    orderId: id,
    row,
    result,
    comment,
    actorUserId,
    expectedKind: 'finance'
  });
}

/**
 * 批量品管（质检）审核
 */
export async function batchQcReviewSalesOrders(pool, { rawIds, result, comment, actorUserId }) {
  return batchReviewSalesOrdersByKind(pool, { rawIds, result, comment, actorUserId, expectedKind: 'qc' });
}

/** 单品管审核 */
export async function qcReviewSalesOrder(pool, { orderId, result, comment, actorUserId, row }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) throwFlowError('BAD_REQUEST');
  await reviewSingleOrderStep(pool, {
    orderId: id,
    row,
    result,
    comment,
    actorUserId,
    expectedKind: 'qc'
  });
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
