import { userDisplayLabel } from './userDisplayLabel.js';
import { notifyUser } from './salesInternalInbox.js';

/** 解析开票审批流配置（顺序多级，兼容单审批人） */
function parseInvoiceApprovalFlow(inv) {
  let flow = null;
  if (inv.approval_flow_json && typeof inv.approval_flow_json === 'object') {
    flow = inv.approval_flow_json;
  } else if (typeof inv.approval_flow_json === 'string' && inv.approval_flow_json.trim()) {
    try {
      flow = JSON.parse(inv.approval_flow_json);
    } catch {
      flow = null;
    }
  }
  const chain = Array.isArray(flow?.reviewer_user_ids)
    ? flow.reviewer_user_ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const currentIndex = Number(flow?.current_index);
  const activeIndex = Number.isFinite(currentIndex) && currentIndex >= 0 ? currentIndex : 0;
  const submittedBy = flow?.submitted_by != null ? Number(flow.submitted_by) : null;
  return { chain, activeIndex, submittedBy };
}

/**
 * 合同开票审核核心逻辑：顺序多级审批，最后一位通过则开票记录置为 approved（计入已开票金额）。
 * @param {number|null} reviewerUserIdForCheck 超级管理员代审时传当前 reviewer_user_id
 * @returns {{ ok: true, variant: 'progressed'|'final', nextReviewerUserId?: number } | { ok: false, code: string, httpStatus?: number }}
 */
export async function applyContractInvoiceReview(
  pool,
  { invoiceId, actorUserId, result, comment, reviewerUserIdForCheck = null }
) {
  const iid = Number(invoiceId);
  const aid = Number(actorUserId);
  if (!Number.isFinite(iid) || iid < 1 || !Number.isFinite(aid) || aid < 1) {
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
    `SELECT iv.*, c.contract_no, cu.customer_name AS linked_customer_name
     FROM sales_contract_invoices iv
     INNER JOIN sales_contracts c ON c.id = iv.contract_id
     INNER JOIN sales_customers cu ON cu.id = c.customer_id
     WHERE iv.id = ? LIMIT 1`,
    [iid]
  );
  const inv = rows[0];
  if (!inv) return { ok: false, code: 'NOT_FOUND', httpStatus: 404 };
  if (inv.status !== 'pending_review') return { ok: false, code: 'INVALID_STATUS', httpStatus: 400 };
  if (Number(inv.reviewer_user_id) !== expectedReviewer) {
    return { ok: false, code: 'FORBIDDEN', httpStatus: 403 };
  }

  const { chain, activeIndex, submittedBy } = parseInvoiceApprovalFlow(inv);
  const originalSubmitter = submittedBy || inv.created_by;
  const hasSequentialChain = chain.length > 1 && activeIndex < chain.length;

  const invoiceLabel = `合同 ${inv.contract_no || ''} 开票（${Number(inv.amount || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} 元）`;

  if (result === 'approved' && hasSequentialChain && activeIndex < chain.length - 1) {
    const nextIndex = activeIndex + 1;
    const nextReviewerId = chain[nextIndex];
    const nextFlow = {
      type: 'sequential',
      reviewer_user_ids: chain,
      current_index: nextIndex,
      submitted_by: originalSubmitter
    };
    await pool.query(
      `UPDATE sales_contract_invoices
       SET status = 'pending_review',
           reviewer_user_id = ?,
           approval_flow_json = CAST(? AS JSON),
           updated_at = NOW(3)
       WHERE id = ?`,
      [nextReviewerId, JSON.stringify(nextFlow), iid]
    );
    const nextReviewerLabel = await userDisplayLabel(pool, nextReviewerId);
    await pool.query(
      `INSERT INTO sales_contract_invoice_audit_logs (invoice_id, actor_id, action, result, comment_text)
       VALUES (?, ?, 'review', 'approved', ?)`,
      [iid, aid, `第 ${activeIndex + 1}/${chain.length} 位审批通过，流转至 ${nextReviewerLabel}`]
    );
    const fromId = Number(originalSubmitter) || aid;
    await notifyUser(pool, nextReviewerId, {
      title: `开票待审核（第 ${nextIndex + 1}/${chain.length} 位）`,
      bodyText: `${invoiceLabel} 待您审批。客户：${inv.linked_customer_name || ''}`,
      fromUserId: fromId,
      refType: 'contract_invoice',
      refId: iid,
      msgCategory: 'todo'
    });
    return { ok: true, variant: 'progressed', nextReviewerUserId: nextReviewerId };
  }

  const st = result === 'approved' ? 'approved' : 'rejected';
  await pool.query(
    `UPDATE sales_contract_invoices
     SET status = ?,
         reviewer_user_id = NULL,
         approval_flow_json = CASE WHEN ? = 'approved' THEN approval_flow_json ELSE NULL END,
         updated_at = NOW(3)
     WHERE id = ?`,
    [st, result, iid]
  );
  await pool.query(
    `INSERT INTO sales_contract_invoice_audit_logs (invoice_id, actor_id, action, result, comment_text)
     VALUES (?, ?, 'review', ?, ?)`,
    [iid, aid, result, comment || null]
  );

  if (inv.created_by && Number(inv.created_by) !== aid) {
    const intro =
      result === 'approved'
        ? `${invoiceLabel} 审核已通过。`
        : `${invoiceLabel} 审核已驳回。\n审核意见：${comment || ''}`;
    await notifyUser(pool, Number(inv.created_by), {
      title: `开票审核${result === 'approved' ? '通过' : '驳回'}`,
      bodyText: `${intro}\n客户：${inv.linked_customer_name || ''}`,
      fromUserId: aid,
      refType: 'contract_invoice',
      refId: iid,
      msgCategory: result === 'approved' ? 'notice' : 'todo'
    });
  }

  return { ok: true, variant: 'final' };
}
