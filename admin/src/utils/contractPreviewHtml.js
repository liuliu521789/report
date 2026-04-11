import { previewFillContractTemplate } from './contractTemplateDefaults';
import { buildContractOrderLinesHtml } from './contractOrderLinesBuild';

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureSalesContractTitleBelowCompany(html, contractVars = null) {
  let s = String(html || '');
  if (!s) return s;
  const companyName = contractVars?.COMPANY_NAME_ZH ? String(contractVars.COMPANY_NAME_ZH) : '';
  const companyKeys = [companyName, '{{COMPANY_NAME_ZH}}'].filter(Boolean);
  const titleHtml =
    '<span style="display:block;text-align:center;font-size:14px;letter-spacing:2px;line-height:1.6;margin-top:6px;font-family:SimSun,宋体">销售合同</span>';
  for (const key of companyKeys) {
    const escapedKey = escapeRegExp(key);
    const inlineTitleRe = new RegExp(`${escapedKey}(?:\\s|&nbsp;|　)*销售合同`, 'g');
    if (inlineTitleRe.test(s)) {
      s = s.replace(inlineTitleRe, `${key}<br/>${titleHtml}`);
      return s;
    }
    if (!s.includes('销售合同')) {
      const re = new RegExp(escapedKey);
      if (re.test(s)) {
        s = s.replace(re, (m) => `${m}<br/>${titleHtml}`);
        return s;
      }
    } else {
      return s;
    }
  }
  return s;
}

/**
 * 合同正文用于界面预览：先用关联订单渲染订单明细表占位符；
 * 若提供 contractVars（来自合同+客户+企业的真实字段），则先替换对应 {{KEY}}，最后仅对仍保留的占位符套示例值。
 * @param {Record<string, string|number>} [contractVars] 例如 CUSTOMER_NAME、CONTRACT_NO、COMPANY_NAME_ZH
 */
export function finalizeContractBodyForPreview(bodyHtml, orders = [], contractVars = null) {
  let s = String(bodyHtml || '');
  s = s.split('{{ORDER_LINES}}').join(buildContractOrderLinesHtml(orders));
  if (contractVars && typeof contractVars === 'object') {
    for (const [key, val] of Object.entries(contractVars)) {
      if (key === 'ORDER_LINES') continue;
      s = s.replaceAll(`{{${key}}}`, val == null || val === '' ? '' : String(val));
    }
  }
  s = previewFillContractTemplate(s);
  return ensureSalesContractTitleBelowCompany(s, contractVars);
}

function escapeHtmlText(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** A4 可印区域边距（与版心一致：页边距在 @page 上，不再叠一层 .print-wrap padding） */
const CONTRACT_PREVIEW_PAGE_MARGIN_MM = { top: 10, right: 12, bottom: 10, left: 12 };

/** 打印预览弹窗：屏上模拟 A4 宽度预览；真正打印/导出为 A4 + 固定页边距 */
export function getContractPreviewPrintWindowStyleCss() {
  const { top, right, bottom, left } = CONTRACT_PREVIEW_PAGE_MARGIN_MM;
  return `html,body{margin:0;padding:0;background:#fff;}
body{font-family:SimSun,宋体;font-size:14px;line-height:1.7;color:#000;}
/* 屏上约 A4 版心宽：210mm - 左右页边距 */
.print-wrap{max-width:calc(210mm - ${left + right}mm);margin:0 auto;padding:${top}mm ${right}mm ${bottom}mm ${left}mm;box-sizing:content-box;}
@media print{
  @page{size:A4;margin:${top}mm ${right}mm ${bottom}mm ${left}mm;}
  html,body{margin:0!important;padding:0!important;background:#fff!important;}
  .print-wrap{max-width:none;margin:0;padding:0;box-sizing:border-box;}
}`;
}

/**
 * 导出 Word：A4 + 页边距；WordSection1 / mso 分页便于 Word、WPS 识别纸型（避免整篇落成「连续」版式）。
 */
export function getContractPreviewExportStyleCss() {
  const { top, right, bottom, left } = CONTRACT_PREVIEW_PAGE_MARGIN_MM;
  return `@page WordSection1{
  size:210mm 297mm;
  margin:${top}mm ${right}mm ${bottom}mm ${left}mm;
  mso-page-orientation:portrait;
}
div.WordSection1{page:WordSection1;}
html,body{width:100%;margin:0;padding:0;background:#fff;}
body{font-family:SimSun,宋体;font-size:14px;line-height:1.7;color:#000;}
.print-wrap{margin:0;padding:0;box-sizing:border-box;max-width:none;}`;
}

/** Word 打开 HTML 时的可选指令块（增强纸型/打印视图） */
function wordDocumentDirectiveXml() {
  return `<!--[if gte mso 9]><xml>
<w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word">
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
<w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml><![endif]-->`;
}

/**
 * 供「打印」打开新窗口：与列表/合同页 printContractPreview 的 HTML 分支一致。
 * @param {string} innerHtml 已 finalize 的正文（勿含外层 .print-wrap）
 */
export function buildContractPreviewPrintWindowHtml(innerHtml, documentTitle = '') {
  const title = escapeHtmlText(documentTitle);
  const css = getContractPreviewPrintWindowStyleCss();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body><div class="print-wrap">${innerHtml || ''}</div></body></html>`;
}

/**
 * 将 HTML 正文导出为 Word 可直接打开的 .doc（OLE HTML Word 容器，可用 Microsoft Word / WPS 打开）。
 * 版式与 buildContractPreviewPrintWindowHtml 打印结果一致（10mm 12mm 内边距、宋体 14px）。
 * @param {string} innerHtml 已 finalize 的正文 inner HTML
 * @param {string} filename 建议使用 .doc 后缀
 */
export function downloadHtmlAsWordDoc(innerHtml, filename) {
  const safeName =
    filename && String(filename).trim()
      ? /\.doc$/i.test(filename)
        ? filename
        : `${String(filename).replace(/\.(html?|docx)$/i, '')}.doc`
      : '合同.doc';
  const css = getContractPreviewExportStyleCss();
  const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><meta name="ProgId" content="Word.Document">${wordDocumentDirectiveXml()}<style>${css}</style></head><body><div class="WordSection1"><div class="print-wrap">${innerHtml || ''}</div></div></body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
