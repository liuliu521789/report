/**
 * Display metadata for sales order / contract status chips (Element Plus button types + icon component names).
 */

/** 列表流程看板 / 状态下拉：与 GET /orders 的 flow_bucket 键一致 */
export const SALES_ORDER_FLOW_BUCKETS = [
  { key: 'pending_submit', label: '待提交', icon: 'Promotion', tone: 'slate' },
  { key: 'pending_finance', label: '待财务审核', icon: 'Wallet', tone: 'amber' },
  { key: 'finance_rejected', label: '财务驳回', icon: 'CircleClose', tone: 'rose' },
  { key: 'pending_qc', label: '待品管审核', icon: 'View', tone: 'orange' },
  { key: 'qc_rejected', label: '品管驳回', icon: 'CircleClose', tone: 'rose' },
  { key: 'pending_ship', label: '待备货发货', icon: 'Box', tone: 'emerald' },
  { key: 'shipped_open', label: '已发货', icon: 'Van', tone: 'sky' }
];

/** 状态下拉筛选项（含流程阶段；completed/cancelled 仍按库内 status） */
export const SALES_ORDER_STATUS_FILTER_OPTIONS = [
  ...SALES_ORDER_FLOW_BUCKETS.map((b) => ({ value: b.key, label: b.label, flowBucket: true })),
  { value: 'completed', label: '已完成', flowBucket: false },
  { value: 'cancelled', label: '已取消', flowBucket: false }
];

const FLOW_BUCKET_KEYS = new Set(SALES_ORDER_FLOW_BUCKETS.map((b) => b.key));

export function isSalesOrderFlowBucketKey(key) {
  return FLOW_BUCKET_KEYS.has(String(key || ''));
}

/** 订单在库内 status + 辅助字段 → 流程展示阶段 */
export function orderDisplayPhase(row) {
  const status = String(row?.status || '').trim();
  if (status === 'pending_review') {
    return row?.submitted_for_review_at ? 'pending_finance' : 'pending_submit';
  }
  if (status === 'pending_qc') return 'pending_qc';
  if (status === 'approved') return 'pending_ship';
  if (status === 'shipped') return 'shipped_open';
  if (status === 'rejected') {
    return row?.qc_reviewed_at != null ? 'qc_rejected' : 'finance_rejected';
  }
  return status;
}

const ORDER_PHASE_LABEL = {
  pending_submit: '待提交',
  pending_finance: '待财务审核',
  finance_rejected: '财务驳回',
  pending_qc: '待品管审核',
  qc_rejected: '品管驳回',
  pending_ship: '待备货发货',
  shipped_open: '已发货',
  completed: '已完成',
  cancelled: '已取消'
};

const ORDER_BASE_LABEL = {
  pending_review: '待提交',
  pending_qc: '待品管审核',
  approved: '待备货发货',
  rejected: '驳回',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消'
};

/**
 * 订单状态日志 `from_status` / `to_status` → 中文
 * @param {string | null | undefined} status
 * @param {{ fromStatus?: string | null, submittedAt?: string | null }} [opts]
 */
export function orderFlowStatusZh(status, opts = {}) {
  if (status == null || String(status).trim() === '') return '—';
  const s = String(status).trim();
  if (s === 'rejected') {
    if (opts.fromStatus === 'pending_qc') return '品管驳回';
    if (opts.fromStatus === 'pending_review') return '财务驳回';
    return '财务驳回';
  }
  if (s === 'pending_review') {
    if (opts.submittedAt) return '待财务审核';
    if (opts.fromStatus === 'rejected') return '待提交';
    return '待提交';
  }
  if (s === 'pending_qc') return '待品管审核';
  if (s === 'approved') return '待备货发货';
  return ORDER_BASE_LABEL[s] || ORDER_PHASE_LABEL[s] || s || '—';
}

/**
 * @param {{ status?: string, submitted_for_review_at?: string | null }} row
 */
function shipperNameOf(row) {
  return String(row?.shipped_by_name ?? row?.shippedByName ?? '').trim();
}

export function orderStatusDisplay(row) {
  const phase = orderDisplayPhase(row || {});
  const label = ORDER_PHASE_LABEL[phase] || ORDER_BASE_LABEL[row?.status] || row?.status || '—';

  const phaseStyle = {
    pending_submit: { type: 'info', icon: 'EditPen', tone: 'slate' },
    pending_finance: { type: 'warning', icon: 'Clock', tone: 'amber' },
    finance_rejected: { type: 'danger', icon: 'CircleClose', tone: 'rose' },
    pending_qc: { type: 'warning', icon: 'View', tone: 'orange' },
    qc_rejected: { type: 'danger', icon: 'CircleClose', tone: 'rose' },
    pending_ship: { type: 'success', icon: 'CircleCheck', tone: 'emerald' },
    shipped_open: { type: 'primary', icon: 'Van', tone: 'sky' },
    completed: { type: 'success', icon: 'Finished', tone: 'green' },
    cancelled: { type: 'info', icon: 'CloseBold', tone: 'muted' }
  };

  const m = phaseStyle[phase];
  if (m) {
    const rejectReason =
      phase === 'finance_rejected' || phase === 'qc_rejected'
        ? String(
            phase === 'qc_rejected'
              ? row.qc_comment || row.finance_comment || ''
              : row.finance_comment || row.qc_comment || ''
          ).trim()
        : '';
    const shipperName =
      phase === 'shipped_open' || phase === 'completed' ? shipperNameOf(row) : '';
    return {
      type: m.type,
      icon: m.icon,
      label,
      phase,
      tone: m.tone,
      shipperName,
      rejectReason
    };
  }
  return {
    type: 'info',
    icon: 'InfoFilled',
    label,
    phase: phase || 'unknown',
    tone: 'muted',
    shipperName: '',
    rejectReason: ''
  };
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

const INVOICE_LABEL = {
  draft: '草稿',
  pending_finance: '待开票',
  issued: '已开票',
  cancelled: '已取消',
  pending_review: '待开票',
  approved: '已开票',
  rejected: '草稿'
};

/**
 * 合同开票申请状态
 * @param {string} status
 */
export function invoiceStatusDisplay(status) {
  const s = status || 'draft';
  const label = INVOICE_LABEL[s] || s || '—';
  const map = {
    draft: { type: 'info', icon: 'EditPen' },
    pending_finance: { type: 'warning', icon: 'Clock' },
    pending_review: { type: 'warning', icon: 'Clock' },
    issued: { type: 'success', icon: 'CircleCheck' },
    approved: { type: 'success', icon: 'CircleCheck' },
    cancelled: { type: 'info', icon: 'CloseBold' }
  };
  const m = map[s];
  if (m) return { type: m.type, icon: m.icon, label, rejectReason: '' };
  return { type: 'info', icon: 'InfoFilled', label, rejectReason: '' };
}
