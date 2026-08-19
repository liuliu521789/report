import {
  createSalesOrderExportJob,
  downloadSalesImportTemplate,
  downloadSalesOrderExportJobFile,
  getSalesOrderExportJob,
  importSalesOrdersXlsx
} from '../api';
import { SALES_ORDER_EXPORT_LIMIT } from '../utils/salesOrderListPrefs.js';
import { startDownload } from './useDownloadProgress.js';

export function parseSalesOrderImportError(e) {
  const d = e?.response?.data;
  return {
    duplicateGroups:
      d?.error === 'EXCEL_DUPLICATE_ROWS' && Array.isArray(d?.duplicate_groups)
        ? d.duplicate_groups
        : null,
    message:
      (typeof d?.message === 'string' && d.message) ||
      (d?.error === 'FORBIDDEN_ORDER_INPUT'
        ? '缺少权限：销售·订单-录入/Excel导入'
        : '') ||
      (d?.error === 'HEADER_MISMATCH'
        ? '表头与模板不一致，请下载「导入模板」对照表头（或去掉 * 后仍须与列名一致）'
        : '') ||
      d?.error ||
      '导入失败',
    headerDebug: d?.expected && d?.got ? { expected: d.expected, got: d.got } : null
  };
}

export function buildExcelDuplicateConfirmMessage(duplicateGroups) {
  const lines = duplicateGroups
    .slice(0, 8)
    .map((g) => `第 ${(g.rows || []).join('、')} 行内容完全一致`);
  const more =
    duplicateGroups.length > 8 ? `\n… 另有 ${duplicateGroups.length - 8} 组重复` : '';
  return `检测到 ${duplicateGroups.length} 组「全字段完全相同」的重复行（示例）：\n${lines.join('\n')}${more}\n\n是否仍要全部导入？`;
}

export async function downloadSalesOrderImportTemplateFile() {
  const blob = await downloadSalesImportTemplate();
  startDownload({ request: blob, filename: 'sales-import-template.xlsx' });
}

export async function importSalesOrderXlsxFile(file, { confirmDuplicate = false } = {}) {
  return importSalesOrdersXlsx(file, { confirmDuplicate });
}

/** 解析导入 API 返回，供页面展示消息与对话框 */
export function summarizeImportResult(r) {
  const summary = {
    messages: [],
    showDupDialog: false,
    dupRows: [],
    showErrorsDialog: false,
    errorRows: [],
    shouldReload: false,
    createdIds: []
  };
  if (r.duplicates?.length) {
    summary.showDupDialog = true;
    summary.dupRows = r.duplicates;
  }
  if (r.errors?.length) {
    summary.showErrorsDialog = true;
    summary.errorRows = r.errors;
    summary.messages.push({
      type: 'warning',
      text: `成功 ${r.ok} 条，失败 ${r.errors.length} 条，详见失败明细`
    });
  } else if (r.ok > 0 && Array.isArray(r.created_ids) && r.created_ids.length) {
    /* 成功提示由 focusImportedOrders 统一展示 */
  } else if (!r.duplicates?.length) {
    summary.messages.push({ type: 'success', text: `导入成功 ${r.ok} 条` });
  } else if (r.ok > 0) {
    summary.messages.push({
      type: 'success',
      text: `导入成功 ${r.ok} 条（${r.duplicates.length} 条与已有订单重复已跳过）`
    });
  }
  if (r.ok > 0) {
    summary.shouldReload = true;
    if (Array.isArray(r.created_ids) && r.created_ids.length) {
      summary.createdIds = r.created_ids;
    }
  }
  return summary;
}

export async function exportSalesOrdersXlsx({
  total,
  queryParams,
  confirmOverLimit,
  onExportingChange,
  onSuccess,
  onError,
  onWarning
}) {
  if (!total) {
    onWarning?.('没有可导出的数据');
    return;
  }
  if (total > SALES_ORDER_EXPORT_LIMIT) {
    const confirmed = await confirmOverLimit?.({
      total,
      limit: SALES_ORDER_EXPORT_LIMIT
    });
    if (!confirmed) return;
  }
  onExportingChange?.(true);
  try {
    const params = queryParams();
    const created = await createSalesOrderExportJob(params, { silent: true });
    const jobId = created?.id ?? created?.data?.id;
    if (!jobId) {
      onError?.('创建导出任务失败');
      return;
    }
    const pollMs = 1500;
    const maxWait = 300000;
    let waited = 0;
    while (waited < maxWait) {
      const st = await getSalesOrderExportJob(jobId, { silent: true });
      const status = st?.status ?? st?.data?.status;
      if (status === 'done') break;
      if (status === 'failed') {
        onError?.(st?.last_error || st?.data?.last_error || '导出失败');
        return;
      }
      await new Promise((r) => setTimeout(r, pollMs));
      waited += pollMs;
    }
    const finalSt = await getSalesOrderExportJob(jobId, { silent: true });
    if ((finalSt?.status ?? finalSt?.data?.status) !== 'done') {
      onWarning?.('导出任务处理较慢，请稍后刷新页面或重试导出');
      return;
    }
    const blob = await downloadSalesOrderExportJobFile(jobId);
    const hit = finalSt?.total_hit ?? finalSt?.data?.total_hit;
    const n = finalSt?.row_count_exported ?? finalSt?.data?.row_count_exported;
    let msg;
    if (hit != null && n != null && Number(hit) > Number(n)) {
      msg = `已下载 ${n} 条（命中 ${hit} 条，已按单次上限截取）`;
    } else {
      msg = `已下载 ${n != null ? n : ''} 条`.trim() || '导出完成';
    }
    startDownload({
      request: blob,
      filename: `sales-orders-${Date.now()}.xlsx`,
      onSuccess: () => {
        onSuccess?.(msg);
      }
    });
  } catch (e) {
    onError?.(e);
  } finally {
    onExportingChange?.(false);
  }
}

export function buildImportDupDialogSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.length > 0
    ? '以下数据来自系统检测结果，仅作文本展示；若内容含特殊字符亦为纯文本，不会作为网页代码执行。'
    : '';
}
