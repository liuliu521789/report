/**
 * Display metadata for sales order / contract status chips (Element Plus button types + icon component names).
 */

const ORDER_BASE_LABEL = {
  pending_review: '待审核',
  approved: '已审核',
  rejected: '驳回',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消'
};

/**
 * 订单状态日志 `from_status` / `to_status` 等枚举 → 简短中文（与状态角标一致）
 * @param {string | null | undefined} status
 */
export function orderFlowStatusZh(status) {
  if (status == null || String(status).trim() === '') return '—';
  const s = String(status).trim();
  return ORDER_BASE_LABEL[s] || s || '—';
}

/**
 * @param {{ status?: string, submitted_for_review_at?: string | null }} row
 */
export function orderStatusDisplay(row) {
  const status = row?.status || '';
  const base = ORDER_BASE_LABEL[status] || status || '—';

  if (status === 'pending_review') {
    if (!row.submitted_for_review_at) {
      return { type: 'info', icon: 'EditPen', label: `${base}（未提交）`, rejectReason: '' };
    }
    return { type: 'warning', icon: 'Clock', label: `${base}（审核中）`, rejectReason: '' };
  }

  const map = {
    approved: { type: 'success', icon: 'CircleCheck' },
    rejected: { type: 'danger', icon: 'CircleClose' },
    shipped: { type: 'primary', icon: 'Van' },
    /** 与「已审核」同色区分：已完成用勾选完成图标 */
    completed: { type: 'success', icon: 'Finished' },
    cancelled: { type: 'info', icon: 'CloseBold' }
  };

  const m = map[status];
  if (m) {
    const rejectReason =
      status === 'rejected' ? String(row.finance_comment || '').trim() : '';
    return { type: m.type, icon: m.icon, label: base, rejectReason };
  }
  return { type: 'info', icon: 'InfoFilled', label: base, rejectReason: '' };
}

const CONTRACT_LABEL = {
  draft: '草稿',
  pending_review: '待审核',
  approved: '已通过',
  rejected: '已驳回'
};

/** 订单表格「合同」缩略角标用短文案 */
const CONTRACT_SHORT_LABEL = {
  draft: '草稿',
  pending_review: '待审',
  approved: '通过',
  rejected: '驳回'
};

/**
 * @param {string} [status]
 */
export function contractStatusShortLabel(status) {
  const s = status || 'draft';
  return CONTRACT_SHORT_LABEL[s] || CONTRACT_LABEL[s] || '—';
}

/**
 * @param {string} status
 * @param {string} [rejectReasonExtra] 驳回意见（列表接口 `last_reject_comment` 或详情页从审核记录解析）
 */
export function contractStatusDisplay(status, rejectReasonExtra = '') {
  const s = status || '';
  const label = CONTRACT_LABEL[s] || s || '—';
  const map = {
    draft: { type: 'info', icon: 'EditPen' },
    pending_review: { type: 'warning', icon: 'Clock' },
    approved: { type: 'success', icon: 'CircleCheck' },
    rejected: { type: 'danger', icon: 'CircleClose' }
  };
  const m = map[s];
  const rejectReason = s === 'rejected' ? String(rejectReasonExtra || '').trim() : '';
  if (m) return { type: m.type, icon: m.icon, label, rejectReason };
  return { type: 'info', icon: 'InfoFilled', label, rejectReason: '' };
}
