import {
  buildContractOrdersNotifyBody,
  buildContractReviewerNotifyMessages
} from './salesOrderNotifyBody.js';
import {
  tryNotifyContractReviewerOnSubmit,
  tryNotifyContractCreatorOnReview
} from './wecomNotify.js';
import { userDisplayLabel } from './userDisplayLabel.js';
import { notifyUser } from './salesInternalInbox.js';

function parseApprovalFlow(c) {
  let flow = null;
  if (Array.isArray(c.approval_flow_json)) {
    flow = c.approval_flow_json;
  } else if (c.approval_flow_json && typeof c.approval_flow_json === 'object') {
    flow = c.approval_flow_json;
  } else if (typeof c.approval_flow_json === 'string' && c.approval_flow_json.trim()) {
    try {
      flow = JSON.parse(c.approval_flow_json);
    } catch {
      flow = null;
    }
  }
  const chain = Array.isArray(flow?.reviewer_user_ids)
    ? flow.reviewer_user_ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const currentIndex = Number(flow?.current_index);
  const activeIndex = Number.isFinite(currentIndex) && currentIndex >= 0 ? currentIndex : 0;
  return { chain, activeIndex };
}

/**
 * 合同审核核心逻辑（管理端与企业微信公开页共用）
 * @param {number|null} reviewerUserIdForCheck — 超级管理员代审时传当前 `reviewer_user_id`，校验仍按审批责任人匹配；`audit_logs.actor_id` 始终为 actorUserId
 * @returns {{ ok: true, variant: 'progressed'|'final', nextReviewerUserId?: number } | { ok: false, code: string, httpStatus?: number }}
 */
export async function applyContractReview(pool, { contractId, actorUserId, result, comment, reviewerUserIdForCheck = null }) {
  const cid = Number(contractId);
  const aid = Number(actorUserId);
  if (!Number.isFinite(cid) || cid < 1 || !Number.isFinite(aid) || aid < 1) {
    return { ok: false, code: 'BAD_REQUEST', httpStatus: 400 };
  }
  if (result === 'rejected' && !String(comment || '').trim()) {
    return { ok: false, code: 'COMMENT_REQUIRED', httpStatus: 400 };
  }
  const expectedReviewer =
    reviewerUserIdForCheck != null &&
    Number.isFinite(Number(reviewerUserIdForCheck)) &&
    Number(reviewerUserIdForCheck) > 0
      ? Number(reviewerUserIdForCheck)
      : aid;

  const [rows] = await pool.query(
    `SELECT c.*, cu.customer_name AS linked_customer_name FROM sales_contracts c
     INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ?`,
    [cid]
  );
  const c = rows[0];
  if (!c) return { ok: false, code: 'NOT_FOUND', httpStatus: 404 };
  if (c.status !== 'pending_review') return { ok: false, code: 'INVALID_STATUS', httpStatus: 400 };
  if (Number(c.reviewer_user_id) !== expectedReviewer) return { ok: false, code: 'FORBIDDEN', httpStatus: 403 };

  const { chain, activeIndex } = parseApprovalFlow(c);
  const hasSequentialChain = chain.length > 1 && activeIndex < chain.length;

  if (result === 'approved' && hasSequentialChain && activeIndex < chain.length - 1) {
    const nextIndex = activeIndex + 1;
    const nextReviewerId = chain[nextIndex];
    const nextFlow = {
      type: 'sequential',
      reviewer_user_ids: chain,
      current_index: nextIndex
    };
    await pool.query(
      `UPDATE sales_contracts
       SET status = 'pending_review',
           reviewer_user_id = ?,
           approval_flow_json = CAST(? AS JSON),
           updated_at = NOW(3)
       WHERE id = ?`,
      [nextReviewerId, JSON.stringify(nextFlow), cid]
    );
    const nextReviewerLabel = await userDisplayLabel(pool, nextReviewerId);
    await pool.query(
      `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
       VALUES (?, ?, 'review', 'approved', ?)`,
      [cid, aid, `第 ${activeIndex + 1}/${chain.length} 位审批通过，流转至 ${nextReviewerLabel}`]
    );

    const chainStep =
      chain.length > 1 ? { current: nextIndex + 1, total: chain.length } : null;
    const { inboxBody } = buildContractReviewerNotifyMessages({
      contractNo: c.contract_no,
      customerName: c.linked_customer_name || '',
      chainStep,
      urge: false,
      actorUsername: ''
    });
    await notifyUser(pool, nextReviewerId, {
      title:
        chain.length > 1
          ? `合同待审核（第 ${nextIndex + 1}/${chain.length} 位）`
          : '合同待审核',
      bodyText: inboxBody,
      fromUserId: aid,
      refType: 'contract',
      refId: cid,
      msgCategory: 'todo'
    });
    await tryNotifyContractReviewerOnSubmit(pool, {
      contractRow: c,
      fromUserId: aid,
      reviewerUserId: nextReviewerId,
      chainStep
    });

    return { ok: true, variant: 'progressed', nextReviewerUserId: nextReviewerId };
  }

  const st = result === 'approved' ? 'approved' : 'rejected';
  await pool.query(
    `UPDATE sales_contracts
     SET status = ?,
         reviewer_user_id = NULL,
         approval_flow_json = CASE WHEN ? = 'approved' THEN approval_flow_json ELSE NULL END,
         updated_at = NOW(3)
     WHERE id = ?`,
    [st, result, cid]
  );
  await pool.query(
    `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
     VALUES (?, ?, 'review', ?, ?)`,
    [cid, aid, result, comment || null]
  );

  if (c.created_by) {
    const reviewIntro =
      result === 'approved'
        ? `合同 ${c.contract_no} 审核已通过。`
        : `合同 ${c.contract_no} 审核已驳回。\n审核意见：${comment || ''}`;
    const contractReviewBody = await buildContractOrdersNotifyBody(pool, cid, {
      intro: reviewIntro,
      customerName: c.linked_customer_name || ''
    });
    await notifyUser(pool, c.created_by, {
      title: `合同审核${result === 'approved' ? '通过' : '驳回'}`,
      bodyText: contractReviewBody,
      fromUserId: aid,
      refType: 'contract',
      refId: cid,
      msgCategory: result === 'approved' ? 'notice' : 'todo'
    });
    await tryNotifyContractCreatorOnReview(pool, {
      contractRow: c,
      notifyBody: contractReviewBody,
      fromUserId: aid,
      result,
      reviewComment: comment || ''
    });
  }

  return { ok: true, variant: 'final' };
}
