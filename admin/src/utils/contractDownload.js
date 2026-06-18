import {
  getSalesContract,
  downloadSalesContractDocx,
  downloadSalesContractDocument,
  downloadSalesContractPdf
} from '../api';
import { startDownload } from '../composables/useDownloadProgress.js';

function safeContractBaseName(contract) {
  return (contract?.contract_no || `contract-${contract?.id}`).replace(/[/\\?%*:|"<>]/g, '-');
}

function uploadPdfFilename(contract) {
  const orig = String(contract?.document_original_filename || '合同文件');
  if (/\.pdf$/i.test(orig)) return orig;
  const base = orig.replace(/\.[^.]+$/i, '') || '合同文件';
  return `${base}.pdf`;
}

/**
 * @param {number|string} contractId
 * @param {'word'|'pdf'} format
 */
export async function downloadContractFile(contractId, format) {
  const d = await getSalesContract(contractId);
  const c = d?.contract;
  if (!c) throw new Error('NOT_FOUND');

  if (format === 'word') {
    if (c.contract_source === 'upload') {
      const blob = await downloadSalesContractDocument(contractId);
      startDownload({ request: blob, filename: c.document_original_filename || '合同文件' });
      return;
    }
    const blob = await downloadSalesContractDocx(contractId);
    startDownload({ request: blob, filename: `${safeContractBaseName(c)}.docx` });
    return;
  }

  if (format === 'pdf') {
    const blob = await downloadSalesContractPdf(contractId);
    const filename =
      c.contract_source === 'upload'
        ? uploadPdfFilename(c)
        : `${safeContractBaseName(c)}.pdf`;
    startDownload({ request: blob, filename });
    return;
  }

  throw new Error('UNSUPPORTED_FORMAT');
}

export function contractDownloadErrorMessage(err, fallback = '下载失败') {
  const msg = err?.response?.data?.error || err?.message || '';
  if (msg === 'UNSUPPORTED_PDF_CONVERT') return '当前文件格式暂不支持转为 PDF，请下载 Word 或原文件';
  if (msg === 'PDF_GEN_FAILED') return 'PDF 生成失败，请稍后重试';
  if (msg === 'DOCX_GEN_FAILED') return 'Word 生成失败，请稍后重试';
  return fallback;
}
