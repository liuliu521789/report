import { previewFillContractTemplate } from './contractTemplateDefaults';
import { buildContractOrderLinesHtml } from './contractOrderLinesBuild';
import { prepareOrderRowForContractHtml } from './salesOrderDisplayMerge';
import { amountToRmbUppercase } from './chineseMoney';
import { tonsFromQtyAndSpec } from './salesOrderTonAmount';

/** 标题：方正小标宋 二号（22px） */
export const CONTRACT_PREVIEW_TITLE_FONT =
  'FZXiaoBiaoSong-S05,FZXiaoBiaoSong,方正小标宋简体,方正小标宋,方正小标宋_GBK,FZShuSong_GB2312,SimSun';
/** 正文：仿宋_GB2312 三号（16px） */
export const CONTRACT_PREVIEW_BODY_FONT = 'FangSong_GB2312,仿宋_GB2312,仿宋,FangSong';

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function appendSemicolonStyles(base, addition) {
  const a = String(base || '').trim();
  const b = String(addition || '').trim();
  if (!b) return a;
  if (!a) return b;
  return `${a.replace(/;+\s*$/, '')};${b}`;
}

/**
 * HTML 另存 .doc 时：WPS 对「collapse + 双列无框」表易画贯穿竖线；float/div 在 WPS 里又常不成两列。
 * 保留真实 table 两列，仅用 separate + cellspacing 拉开列间距（略增间隙，换稳定），不改库 body_html。
 */
function prepareContractHeaderMetaTableForWordExport(html) {
  const raw = String(html || '');
  if (!raw.includes('contract-header-meta')) return raw;
  if (typeof DOMParser === 'undefined') return raw;
  const wrapId = 'word-export-header-meta-root';
  let doc;
  try {
    doc = new DOMParser().parseFromString(`<div id="${wrapId}">${raw}</div>`, 'text/html');
  } catch {
    return raw;
  }
  const root = doc.getElementById(wrapId);
  if (!root || doc.querySelector('parsererror')) return raw;
  const tableExtra =
    'border-collapse:separate;border-spacing:0;width:auto;max-width:100%;border:none;outline:none';
  const cellExtra = 'border:0 none;text-align:left;vertical-align:top';
  const tables = [...root.querySelectorAll('table.contract-header-meta')];
  for (const table of tables) {
    table.setAttribute('border', '0');
    table.setAttribute('cellpadding', '0');
    table.setAttribute('cellspacing', '10');
    table.setAttribute('style', appendSemicolonStyles(table.getAttribute('style'), tableExtra));
    for (const cell of table.querySelectorAll('td, th')) {
      cell.setAttribute('style', appendSemicolonStyles(cell.getAttribute('style'), cellExtra));
    }
  }
  return root.innerHTML;
}

function ensureSalesContractTitleBelowCompany(html, contractVars = null) {
  let s = String(html || '');
  if (!s) return s;
  const companyName = contractVars?.COMPANY_NAME_ZH ? String(contractVars.COMPANY_NAME_ZH) : '';
  const companyKeys = [companyName, '{{COMPANY_NAME_ZH}}'].filter(Boolean);
  const titleHtml = `<span style="display:block;text-align:center;font-size:22px;letter-spacing:2px;line-height:1.6;margin-top:6px;font-family:${CONTRACT_PREVIEW_TITLE_FONT}">销售合同</span>`;
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
export function finalizeContractBodyForPreview(bodyHtml, orders = [], contractVars = null, previewOptions = {}) {
  let s = String(bodyHtml || '');
  // 正文已嵌入订单明细表时勿用关联订单重算，否则会覆盖用户在合同里手改的内容
  const skipOrderLines =
    previewOptions.skipOrderLinesFromOrders === true || !s.includes('{{ORDER_LINES}}');
  if (!skipOrderLines) {
    s = s
      .split('{{ORDER_LINES}}')
      .join(
        buildContractOrderLinesHtml(orders, {
          definitions: previewOptions.orderFieldDefinitions
        })
      );
  }
  if (!skipOrderLines && orders?.length && s.includes('{{AMOUNT_TOTAL')) {
    const defs = previewOptions.orderFieldDefinitions;
    let sum = 0;
    for (const raw of orders) {
      const o = defs?.length ? prepareOrderRowForContractHtml(raw, defs) : raw;
      const d = o?.display_data || {};
      const grossUnit = Number(o?.unit_price ?? d?.unit_price);
      const tons = tonsFromQtyAndSpec(o?.quantity ?? d?.quantity, o?.product_name ?? d?.product_name ?? '');
      if (Number.isFinite(grossUnit) && grossUnit > 0 && tons != null && tons > 0) {
        sum += grossUnit * tons;
      }
    }
    sum = Math.round(sum * 100) / 100;
    if (sum > 0) {
      s = s.replaceAll('{{AMOUNT_TOTAL_CN}}', amountToRmbUppercase(sum));
      s = s.replaceAll('{{AMOUNT_TOTAL}}', sum.toFixed(2));
    }
  }
  if (contractVars && typeof contractVars === 'object') {
    for (const [key, val] of Object.entries(contractVars)) {
      if (key === 'ORDER_LINES') continue;
      s = s.replaceAll(`{{${key}}}`, val == null || val === '' ? '' : String(val));
    }
  }
  s = previewFillContractTemplate(s);
  return ensureSalesContractTitleBelowCompany(s, contractVars);
}

export function escapeHtmlText(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** A4 可印区域边距（企业合同常用格式：上2.54cm 下2.54cm 左3.17cm 右3.17cm） */
const CONTRACT_PREVIEW_PAGE_MARGIN_MM = { top: 25.4, right: 25.4, bottom: 25.4, left: 31.7 };

/** 打印预览弹窗：屏上模拟 A4 宽度预览；真正打印/导出为 A4 + 固定页边距 */
export function getContractPreviewPrintWindowStyleCss() {
  const { top, right, bottom, left } = CONTRACT_PREVIEW_PAGE_MARGIN_MM;
  return `html,body{margin:0;padding:0;background:#fff;}
body{font-family:${CONTRACT_PREVIEW_BODY_FONT};font-size:16px;line-height:1.5;color:#000;text-align:left;}
h1,h2,h3,.contract-title{font-family:${CONTRACT_PREVIEW_TITLE_FONT};font-size:22px;font-weight:normal;text-align:center;letter-spacing:2px;}
p{text-indent:2em;margin:0.5em 0;text-align:justify;}
table{border-collapse:collapse;width:100%;}
table.contract-order-lines{width:100%!important;}
table.contract-order-lines th,table.contract-order-lines td{padding:5px 10px!important;white-space:nowrap;}
th,td{border:1px solid #000;padding:6px 8px;text-align:center;font-size:16px;font-family:${CONTRACT_PREVIEW_BODY_FONT};}
.contract-header-meta{width:auto!important;max-width:100%;margin-left:auto!important;margin-right:auto!important;border:none!important;}
.contract-header-meta td,.contract-header-meta th{border:none!important;text-align:left!important;vertical-align:top;}
table.contract-header-meta{border-collapse:separate!important;border-spacing:0!important;width:auto!important;max-width:100%!important;border:none!important;}
table.contract-header-meta td,table.contract-header-meta th{border:0 none!important;text-align:left!important;vertical-align:top!important;}
.party-table{page-break-inside:avoid;break-inside:avoid;font-size:14px;line-height:1.35;}
.party-table tr{page-break-inside:avoid;break-inside:avoid;}
.party-table td{text-align:left;font-size:14px!important;line-height:1.35!important;padding:5px 8px!important;}
.party-table .party-col-title{text-align:center!important;font-weight:700;margin-bottom:4px;display:block;}
/* 屏上约 A4 版心宽：210mm - 左右页边距 */
.print-wrap{max-width:calc(210mm - ${left + right}mm);margin:0 auto;padding:${top}mm ${right}mm ${bottom}mm ${left}mm;box-sizing:content-box;}
@media print{
  @page{size:A4;margin:0;}
  html,body{margin:0!important;padding:0!important;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .print-wrap{max-width:none;margin:0;padding:${top}mm ${right}mm ${bottom}mm ${left}mm;box-sizing:border-box;}
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
body{font-family:${CONTRACT_PREVIEW_BODY_FONT};font-size:16px;line-height:1.5;color:#000;text-align:left;}
h1,h2,h3,.contract-title{font-family:${CONTRACT_PREVIEW_TITLE_FONT};font-size:22px;font-weight:normal;text-align:center;letter-spacing:2px;}
p{text-indent:2em;margin:0.5em 0;text-align:justify;}
table{border-collapse:collapse;width:100%;}
table.contract-order-lines{width:100%!important;}
table.contract-order-lines th,table.contract-order-lines td{padding:5px 10px!important;white-space:nowrap;}
th,td{border:1px solid #000;padding:6px 8px;text-align:center;font-size:16px;font-family:${CONTRACT_PREVIEW_BODY_FONT};}
.contract-header-meta{width:auto!important;max-width:100%;margin-left:auto!important;margin-right:auto!important;border:none!important;}
.contract-header-meta td,.contract-header-meta th{border:none!important;text-align:left!important;vertical-align:top;}
table.contract-header-meta{border-collapse:separate!important;border-spacing:0!important;width:auto!important;max-width:100%!important;border:none!important;}
table.contract-header-meta td,table.contract-header-meta th{border:0 none!important;text-align:left!important;vertical-align:top!important;}
.party-table{page-break-inside:avoid;break-inside:avoid;font-size:14px;line-height:1.35;}
.party-table tr{page-break-inside:avoid;break-inside:avoid;}
.party-table td{text-align:left;font-size:14px!important;line-height:1.35!important;padding:5px 8px!important;}
.party-table .party-col-title{text-align:center!important;font-weight:700;margin-bottom:4px;display:block;}
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
 * 在隐藏 iframe 中打印完整 HTML 文档（避免新开 about:blank 标签页）。
 * 纸张上的日期、网址、页码来自浏览器「页眉和页脚」，须在打印对话框中关闭（Chrome/Edge：更多设置 → 取消勾选页眉和页脚）。
 */
export function printHtmlDocumentInHiddenIframe(fullDocumentHtml) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute(
    'style',
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none'
  );
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = doc.defaultView;
  doc.open();
  doc.write(fullDocumentHtml);
  doc.close();

  let cleaned = false;
  let fallbackTimer = null;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (fallbackTimer != null) window.clearTimeout(fallbackTimer);
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  const runPrint = () => {
    win.addEventListener('afterprint', cleanup, { once: true });
    fallbackTimer = window.setTimeout(cleanup, 120000);
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  };

  if (doc.readyState === 'complete') {
    window.requestAnimationFrame(() => window.setTimeout(runPrint, 50));
  } else {
    win.addEventListener('load', () => window.setTimeout(runPrint, 50), { once: true });
  }
}

/** 合同正文打印：版式同 buildContractPreviewPrintWindowHtml，经隐藏 iframe 调出打印对话框 */
export function printContractPreviewFromHtml(innerHtml, documentTitle = '合同打印') {
  printHtmlDocumentInHiddenIframe(buildContractPreviewPrintWindowHtml(innerHtml, documentTitle));
}

/**
 * 将 HTML 正文导出为 Word 可直接打开的 .doc（OLE HTML Word 容器，可用 Microsoft Word / WPS 打开）。
 * 版式与 buildContractPreviewPrintWindowHtml 打印结果一致（A4 页边距、正文仿宋 16px）。
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
  const bodyInner = prepareContractHeaderMetaTableForWordExport(innerHtml);
  const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><meta name="ProgId" content="Word.Document">${wordDocumentDirectiveXml()}<style>${css}</style></head><body><div class="WordSection1"><div class="print-wrap">${bodyInner || ''}</div></div></body></html>`;
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
