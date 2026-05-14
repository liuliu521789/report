/**
 * 站内信关联业务跳转：与后端 sales_internal_messages.ref_type / ref_id 对齐。
 * @param {object} m 站内信对象（含 ref_type、ref_id）
 * @returns {{ path: string, query?: Record<string, string> } | null}
 */
export function resolveInternalMessageRoute(m) {
  if (!m || m.ref_id == null) return null;
  const refId = Number(m.ref_id);
  if (!Number.isFinite(refId) || refId <= 0) return null;
  const rt = String(m.ref_type || '').trim();

  if (rt === 'contract') {
    const title = String(m.title || '');
    const cat = m.category;
    /** 审批人收到的待办：打开合同页的「审核」对话框，而非编辑器 */
    const isReviewerTodo =
      cat === 'todo' && (/合同待审核/.test(title) || /合同审批催办/.test(title));
    if (isReviewerTodo) {
      return {
        path: '/sales/contracts',
        query: { tab: 'list', review_contract_id: String(refId) }
      };
    }
    /** 纯通知类：进合同工作台列表即可 */
    if (/合同审核通过/.test(title) || /合同已撤销审核申请/.test(title)) {
      return { path: '/sales/contracts', query: { tab: 'list' } };
    }
    /** 含驳回待办、及其它需改合同的场景：进编辑器 */
    return { path: `/sales/contracts/editor/${refId}` };
  }

  const knownOrderRefs = new Set([
    'order',
    'order_withdraw',
    'order_batch_submit',
    'order_batch_approved',
    'order_batch_rejected',
    'order_complete',
    'order_cancel'
  ]);
  if (knownOrderRefs.has(rt) || rt.startsWith('order')) {
    return { path: '/sales/orders', query: { focus_order_id: String(refId) } };
  }

  return null;
}
