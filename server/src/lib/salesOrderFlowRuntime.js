/**
 * 订单审核流程运行时：提交、通过、驳回的数据库更新与下一节点计算
 */

import {
  loadActiveOrderFlowDefinition,
  resolveCurrentReviewStep,
  reviewKindForStep,
  statusForStep,
  stepRequiresSubmitted,
  notifyStepAssignees,
  buildSubmitLogRemark,
  buildApproveLogRemark,
  buildRejectLogRemark,
  getNextStepAfter,
  flowDefinitionHasQcStep
} from './salesOrderFlowConfig.js';
import { buildOrderNotifyBody } from './salesOrderNotifyBody.js';
import {
  tryNotifyFinanceWecomOrderEvent,
  tryNotifyWarehouseWecomOrderApproved,
  tryNotifySalesWecomOrderRejected,
  tryNotifyQcWecomPendingQc
} from './wecomNotify.js';
import { notifyUser, notifyUsersByCategory } from './salesInternalInbox.js';

export { loadActiveOrderFlowDefinition };

export function assertOrderInReviewStep(row, definition, expectedKind) {
  const ctx = resolveCurrentReviewStep(row, definition);
  if (!ctx) {
    const err = new Error('NOT_IN_REVIEW_QUEUE');
    err.code = 'NOT_IN_REVIEW_QUEUE';
    throw err;
  }
  if (ctx.orphanedQc) {
    const err = new Error('QC_STEP_REMOVED');
    err.code = 'QC_STEP_REMOVED';
    throw err;
  }
  if (expectedKind && reviewKindForStep(ctx.step) !== expectedKind) {
    const err = new Error('NOT_IN_REVIEW_QUEUE');
    err.code = 'NOT_IN_REVIEW_QUEUE';
    throw err;
  }
  return ctx;
}

/** 流程已去掉品管节点、但订单仍停在 pending_qc 时，自动推进到待备货发货 */
export async function healOrphanPendingQc(conn, order, definition) {
  if (String(order?.status || '') !== 'pending_qc') return null;
  if (flowDefinitionHasQcStep(definition)) return null;
  if (!order?.finance_reviewed_at) return null;

  const [r] = await conn.query(
    `UPDATE sales_orders
     SET status = 'approved', flow_step_index = NULL, updated_by = updated_by, row_version = row_version + 1
     WHERE id = ? AND status = 'pending_qc'`,
    [order.id]
  );
  if (!r.affectedRows) return null;

  await conn.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, 'pending_qc', 'approved', ?, '流程已取消品管节点，自动进入待备货发货')`,
    [order.id, order.updated_by || order.finance_reviewed_by || null]
  );

  return { ...order, status: 'approved', flow_step_index: null };
}

/** 批量修复：流程已去掉品管但订单仍停在 pending_qc */
export async function healOrphanPendingQcBatch(pool, { limit = 200 } = {}) {
  const { definition } = await loadActiveOrderFlowDefinition(pool);
  if (flowDefinitionHasQcStep(definition)) return 0;

  const [rows] = await pool.query(
    `SELECT id, updated_by, finance_reviewed_by FROM sales_orders
     WHERE status = 'pending_qc' AND finance_reviewed_at IS NOT NULL
     ORDER BY id ASC LIMIT ?`,
    [Math.max(1, Math.min(500, Number(limit) || 200))]
  );
  if (!rows.length) return 0;

  const conn = await pool.getConnection();
  let count = 0;
  try {
    await conn.beginTransaction();
    for (const row of rows) {
      const healed = await healOrphanPendingQc(conn, row, definition);
      if (healed) count += 1;
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return count;
}

export async function applyOrderSubmit(conn, { orderId, actorUserId, row, flowVersion, definition }) {
  const steps = definition?.steps || [];
  if (!steps.length) {
    const err = new Error('FLOW_EMPTY');
    err.code = 'FLOW_EMPTY';
    throw err;
  }
  const first = steps[0];
  const isResubmit = row.status === 'rejected';
  const needsSubmitted = stepRequiresSubmitted(first);

  if (isResubmit) {
    const [r] = await conn.query(
      `UPDATE sales_orders
       SET status = ?,
           submitted_for_review_at = ${needsSubmitted ? 'NOW(3)' : 'NULL'},
           finance_reviewed_at = NULL, finance_reviewed_by = NULL, finance_comment = NULL,
           qc_reviewed_at = NULL, qc_reviewed_by = NULL, qc_comment = NULL,
           flow_config_version = ?, flow_step_index = 0,
           updated_by = ?, row_version = row_version + 1
       WHERE id = ? AND status = ? AND submitted_for_review_at IS NULL`,
      [statusForStep(first), flowVersion, actorUserId, orderId, row.status]
    );
    if (!r.affectedRows) {
      const err = new Error('ORDER_STATE_CHANGED');
      err.code = 'ORDER_STATE_CHANGED';
      throw err;
    }
  } else if (needsSubmitted) {
    const [r] = await conn.query(
      `UPDATE sales_orders
       SET submitted_for_review_at = NOW(3),
           flow_config_version = ?, flow_step_index = 0,
           updated_by = ?, row_version = row_version + 1
       WHERE id = ? AND status = ? AND submitted_for_review_at IS NULL`,
      [flowVersion, actorUserId, orderId, row.status]
    );
    if (!r.affectedRows) {
      const err = new Error('ORDER_STATE_CHANGED');
      err.code = 'ORDER_STATE_CHANGED';
      throw err;
    }
  } else {
    const [r] = await conn.query(
      `UPDATE sales_orders
       SET status = ?,
           flow_config_version = ?, flow_step_index = 0,
           updated_by = ?, row_version = row_version + 1
       WHERE id = ? AND status = ? AND submitted_for_review_at IS NULL`,
      [statusForStep(first), flowVersion, actorUserId, orderId, row.status]
    );
    if (!r.affectedRows) {
      const err = new Error('ORDER_STATE_CHANGED');
      err.code = 'ORDER_STATE_CHANGED';
      throw err;
    }
  }

  await conn.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, row.status, statusForStep(first), actorUserId, buildSubmitLogRemark(first)]
  );

  return { firstStep: first };
}

export async function applyStepApprove(conn, { orderId, row, ctx, actorUserId, comment }) {
  const { step, definition } = ctx;
  const nextStep = getNextStepAfter(definition, step);
  const kind = reviewKindForStep(step);
  const fromStatus = String(row.status || '');

  if (nextStep) {
    const nextStatus = statusForStep(nextStep);
    const nextIndex = definition.steps.findIndex((s) => s.node_type === nextStep.node_type);
    const setParts = [
      'status = ?',
      'flow_step_index = ?',
      'updated_by = ?',
      'row_version = row_version + 1'
    ];
    const args = [nextStatus, nextIndex >= 0 ? nextIndex : null, actorUserId];

    if (kind === 'finance') {
      setParts.push('finance_reviewed_at = NOW(3)', 'finance_reviewed_by = ?', 'finance_comment = ?');
      args.push(actorUserId, comment || null);
      setParts.push('qc_reviewed_at = NULL', 'qc_reviewed_by = NULL', 'qc_comment = NULL');
    } else if (kind === 'qc') {
      setParts.push('qc_reviewed_at = NOW(3)', 'qc_reviewed_by = ?', 'qc_comment = ?');
      args.push(actorUserId, comment || null);
    }

    if (stepRequiresSubmitted(nextStep)) {
      setParts.push('submitted_for_review_at = COALESCE(submitted_for_review_at, NOW(3))');
    }

    args.push(orderId, fromStatus);
    const [r] = await conn.query(
      `UPDATE sales_orders SET ${setParts.join(', ')} WHERE id = ? AND status = ?`,
      args
    );
    if (!r.affectedRows) {
      const err = new Error('ORDER_STATE_CHANGED');
      err.code = 'ORDER_STATE_CHANGED';
      throw err;
    }

    await conn.query(
      `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, fromStatus, nextStatus, actorUserId, buildApproveLogRemark(step, comment, true)]
    );

    return { outcome: 'next', nextStep, fromStatus, toStatus: nextStatus };
  }

  const setParts = [
    "status = 'approved'",
    'flow_step_index = NULL',
    'updated_by = ?',
    'row_version = row_version + 1'
  ];
  const args = [actorUserId];

  if (kind === 'finance') {
    setParts.push('finance_reviewed_at = NOW(3)', 'finance_reviewed_by = ?', 'finance_comment = ?');
    args.push(actorUserId, comment || null);
  } else if (kind === 'qc') {
    setParts.push('qc_reviewed_at = NOW(3)', 'qc_reviewed_by = ?', 'qc_comment = ?');
    args.push(actorUserId, comment || null);
  }

  args.push(orderId, fromStatus);
  const [r] = await conn.query(
    `UPDATE sales_orders SET ${setParts.join(', ')} WHERE id = ? AND status = ?`,
    args
  );
  if (!r.affectedRows) {
    const err = new Error('ORDER_STATE_CHANGED');
    err.code = 'ORDER_STATE_CHANGED';
    throw err;
  }

  await conn.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, ?, 'approved', ?, ?)`,
    [orderId, fromStatus, actorUserId, buildApproveLogRemark(step, comment, false)]
  );

  return { outcome: 'approved', fromStatus, toStatus: 'approved' };
}

export async function applyStepReject(conn, { orderId, row, ctx, actorUserId, comment }) {
  const { step } = ctx;
  const kind = reviewKindForStep(step);
  const fromStatus = String(row.status || '');

  const setParts = [
    "status = 'rejected'",
    'submitted_for_review_at = NULL',
    'flow_step_index = NULL',
    'updated_by = ?',
    'row_version = row_version + 1'
  ];
  const args = [actorUserId];

  if (kind === 'finance') {
    setParts.push('finance_reviewed_at = NOW(3)', 'finance_reviewed_by = ?', 'finance_comment = ?');
    args.push(actorUserId, comment);
  } else if (kind === 'qc') {
    setParts.push('qc_reviewed_at = NOW(3)', 'qc_reviewed_by = ?', 'qc_comment = ?');
    args.push(actorUserId, comment);
  }

  args.push(orderId, fromStatus);
  const [r] = await conn.query(
    `UPDATE sales_orders SET ${setParts.join(', ')} WHERE id = ? AND status = ?`,
    args
  );
  if (!r.affectedRows) {
    const err = new Error('ORDER_STATE_CHANGED');
    err.code = 'ORDER_STATE_CHANGED';
    throw err;
  }

  await conn.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, ?, 'rejected', ?, ?)`,
    [orderId, fromStatus, actorUserId, buildRejectLogRemark(step, comment)]
  );

  return { fromStatus, kind, step };
}

export async function notifyAfterSubmit(pool, { firstStep, orderRows, actorUserId }) {
  const intro = `有新的订单已提交「${firstStep.label}」，请及时处理。`;
  const submitBody = await buildOrderNotifyBody(pool, orderRows, { intro });
  await notifyStepAssignees(pool, firstStep, {
    title: '待审核订单',
    bodyText: submitBody,
    fromUserId: actorUserId,
    refType: 'order',
    refId: orderRows[0]?.id,
    msgCategory: 'todo'
  });
  if (firstStep.node_type === 'finance_review') {
    await tryNotifyFinanceWecomOrderEvent(pool, {
      event: 'submit',
      notifyBody: submitBody,
      orderRows,
      fromUserId: actorUserId
    });
  }
}

export async function notifyAfterApproveNext(pool, { nextStep, orderRows, actorUserId, prevStep }) {
  const intro = `订单已通过「${prevStep.label}」，请进行「${nextStep.label}」。`;
  const body = await buildOrderNotifyBody(pool, orderRows, { intro });
  await notifyStepAssignees(pool, nextStep, {
    title: `待${nextStep.label}订单`,
    bodyText: body,
    fromUserId: actorUserId,
    refType: orderRows.length > 1 ? 'order_batch_finance_pass' : 'order',
    refId: orderRows[0]?.id,
    msgCategory: 'todo'
  });
  if (nextStep.node_type === 'qc_review') {
    await tryNotifyQcWecomPendingQc(pool, {
      orderRows,
      fromUserId: actorUserId,
      notifyBody: body
    });
  }
}

export async function notifyAfterApproveFinal(pool, { orderRows, actorUserId, step }) {
  const label = step?.label || '审核';
  const intro =
    orderRows.length === 1
      ? `订单已通过「${label}」，请备货发货。`
      : `批量订单已通过「${label}」，请备货发货。请到订单管理查看详情。`;
  const body = await buildOrderNotifyBody(pool, orderRows, { intro });
  await notifyUsersByCategory(pool, 'warehouse', {
    title: '订单待发货',
    bodyText: body,
    fromUserId: actorUserId,
    refType: orderRows.length > 1 ? 'order_batch_approved' : 'order',
    refId: orderRows[0]?.id,
    msgCategory: 'todo'
  });
  await tryNotifyWarehouseWecomOrderApproved(pool, {
    orderRows,
    fromUserId: actorUserId,
    intro
  });
}

export async function notifyAfterReject(pool, { orderRows, actorUserId, step, comment }) {
  const byCreator = new Map();
  for (const row of orderRows) {
    if (!row.created_by) continue;
    if (!byCreator.has(row.created_by)) byCreator.set(row.created_by, []);
    byCreator.get(row.created_by).push(row);
  }
  for (const [uid, list] of byCreator) {
    const intro =
      list.length === 1
        ? `订单已被「${step.label}」驳回。\n驳回原因：${comment}`
        : `批量订单已被「${step.label}」驳回。\n驳回原因：${comment}\n请到订单管理查看详情。`;
    const rejectBody = await buildOrderNotifyBody(pool, list, { intro });
    await notifyUser(pool, uid, {
      title: '订单审核驳回',
      bodyText: rejectBody,
      fromUserId: actorUserId,
      refType: list.length > 1 ? 'order_batch_rejected' : 'order',
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

export async function notifyWithdraw(pool, { orderRows, actorUserId, firstStep }) {
  const withdrawBody = await buildOrderNotifyBody(pool, orderRows, {
    intro: '销售已撤回审核申请，该订单不再在待审队列中。'
  });
  await notifyStepAssignees(pool, firstStep, {
    title: '订单已撤回审核申请',
    bodyText: withdrawBody,
    fromUserId: actorUserId,
    refType: 'order_withdraw',
    refId: orderRows[0]?.id,
    msgCategory: 'notice'
  });
  if (firstStep?.node_type === 'finance_review') {
    await tryNotifyFinanceWecomOrderEvent(pool, {
      event: 'withdraw',
      notifyBody: withdrawBody,
      orderRows,
      fromUserId: actorUserId
    });
  }
}
