import { zhMessageForApiError } from '../../../shared/apiErrorZh.js';

/** 批量操作按钮文案：全部可操作时显示默认文案，部分可操作显示「动词 N 条」 */
export function buildBatchActionButtonLabel({ total, ok, allLabel, partialVerb }) {
  if (!ok) return allLabel;
  if (ok === total) return allLabel;
  return `${partialVerb} ${ok} 条`;
}

/** 批量操作 tooltip：无选中 / 无可操作 / 部分可操作 */
export function buildBatchActionTooltip({ total, ok, noneTip, allTip, partialTip }) {
  if (!total) return '';
  if (ok === 0) return noneTip;
  if (ok === total) return allTip;
  return partialTip(total, ok);
}

export function batchSubmitConfirmMessage({ total, ok }) {
  if (ok < total) {
    return `已选 ${total} 条，其中 ${ok} 条可提交。是否仅提交这 ${ok} 条？财务将收到 1 条站内信汇总通知。`;
  }
  return `将 ${ok} 笔订单一并提交财务审核，财务将收到 1 条站内信汇总通知。是否继续？`;
}

export function batchWithdrawConfirmMessage({ total, ok }) {
  if (ok < total) {
    return `已选 ${total} 条，其中 ${ok} 条可撤回。是否仅撤回这 ${ok} 条？财务将收到 1 条站内信汇总通知。`;
  }
  return `将 ${ok} 笔订单一并撤回审核申请，财务将收到 1 条站内信汇总通知。是否继续？`;
}

export function batchDeleteConfirmMessage({ total, ok }) {
  if (ok < total) {
    return `已选 ${total} 条，其中 ${ok} 条可删除。是否仅删除这 ${ok} 条？删除后不可恢复。`;
  }
  return `确定永久删除已选的 ${ok} 条订单？删除后不可恢复。`;
}

const BATCH_SUBMIT_ERROR_LABELS = {
  FORBIDDEN: '非本人创建',
  NOT_FOUND: '不存在',
  INVALID_STATUS: '状态不符',
  ALREADY_SUBMITTED: '已提交过审核'
};

const BATCH_WITHDRAW_ERROR_LABELS = {
  FORBIDDEN: '非本人创建',
  NOT_FOUND: '不存在',
  NOT_SUBMITTED: '不在首节点待审',
  ORDER_STATE_CHANGED: '状态已变更'
};

export function batchSubmitErrorLabel(code) {
  return BATCH_SUBMIT_ERROR_LABELS[code] || zhMessageForApiError(code) || '未知原因';
}

export function batchWithdrawErrorLabel(code) {
  return BATCH_WITHDRAW_ERROR_LABELS[code] || zhMessageForApiError(code) || '未知原因';
}

export function formatBatchOperationFailures(failed, errorLabel, { maxShow = 5 } = {}) {
  const parts = (failed || []).slice(0, maxShow).map((f) => `订单#${f.id}：${errorLabel(f.error)}`);
  const more = (failed || []).length > maxShow ? ` 等共 ${failed.length} 笔` : '';
  return `${parts.join('；')}${more}`;
}

/** 批量 API 部分失败时的 warning 文案；全部成功返回 null */
export function summarizeBatchPartialFailure(r, errorLabel) {
  if (!r?.failed?.length) return null;
  return `成功 ${r.ok || 0} 笔，未处理 ${r.failed.length} 笔。${formatBatchOperationFailures(
    r.failed,
    errorLabel
  )}`;
}
