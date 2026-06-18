import puppeteer from 'puppeteer';
import { fetchContractData } from './contractDocxExport.js';
import { buildContractOrderLinesHtml } from './contractOrderLines.js';
import { prepareOrderRowForContractHtml, tonsFromQtyAndSpec } from './salesOrderFields.js';
import { amountToRmbUppercase } from './chineseMoney.js';
import {
  applyCompanySellerNameToFilledContract,
  fillContractTemplate,
  formatSigningDateZhShanghai
} from './contractTemplateFill.js';

const TITLE_FONT =
  'FZXiaoBiaoSong-S05,FZXiaoBiaoSong,方正小标宋简体,方正小标宋,方正小标宋_GBK,FZShuSong_GB2312,SimSun';
const BODY_FONT = 'FangSong_GB2312,仿宋_GB2312,仿宋,FangSong';
const PAGE_MARGIN_MM = { top: 25.4, right: 25.4, bottom: 25.4, left: 31.7 };
/** Word 导出为 sz=1（1/8pt）；PDF 用 0.5pt 细线，避免 Chromium 把 1px 渲得过粗 */
const PDF_TABLE_BORDER = '0.5pt solid #000';

function getContractPrintCss() {
  const { top, right, bottom, left } = PAGE_MARGIN_MM;
  const tableBorderRules = `
.print-wrap table{border-collapse:collapse!important;width:100%;border:none!important;}
.print-wrap table th,.print-wrap table td{border:${PDF_TABLE_BORDER}!important;padding:6px 8px;text-align:center;font-size:16px;font-family:${BODY_FONT};box-sizing:border-box;}
.print-wrap table.contract-order-lines th,.print-wrap table.contract-order-lines td{padding:5px 10px!important;white-space:nowrap;}
.print-wrap table.contract-header-meta,.print-wrap table.contract-header-meta th,.print-wrap table.contract-header-meta td{border:none!important;}
.contract-header-meta{width:auto!important;max-width:100%;margin-left:auto!important;margin-right:auto!important;}
.contract-header-meta td,.contract-header-meta th{text-align:left!important;vertical-align:top;}
table.contract-header-meta{border-collapse:separate!important;border-spacing:0!important;width:auto!important;max-width:100%!important;}
.party-table{page-break-inside:avoid;break-inside:avoid;font-size:14px;line-height:1.35;}
.party-table tr{page-break-inside:avoid;break-inside:avoid;}
.party-table td{text-align:left;font-size:14px!important;line-height:1.35!important;padding:5px 8px!important;}
.party-table .party-col-title{text-align:center!important;font-weight:700;margin-bottom:4px;display:block;}`;
  return `html,body{margin:0;padding:0;background:#fff;}
body{font-family:${BODY_FONT};font-size:16px;line-height:1.5;color:#000;text-align:left;}
h1,h2,h3,.contract-title{font-family:${TITLE_FONT};font-size:22px;font-weight:normal;text-align:center;letter-spacing:2px;}
p{text-indent:2em;margin:0.5em 0;text-align:justify;}
${tableBorderRules}
.print-wrap{max-width:210mm;margin:0 auto;padding:${top}mm ${right}mm ${bottom}mm ${left}mm;box-sizing:border-box;}
@media print{
  @page{size:A4;margin:0;}
  html,body{margin:0!important;padding:0!important;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .print-wrap{max-width:none;margin:0;padding:${top}mm ${right}mm ${bottom}mm ${left}mm;box-sizing:border-box;}
  ${tableBorderRules}
  table.contract-order-lines{width:100%!important;table-layout:auto;}
  table.contract-order-lines th,table.contract-order-lines td{white-space:normal!important;font-size:11px;letter-spacing:0;padding:4px 10px!important;text-align:center!important;vertical-align:middle!important;font-variant-numeric:tabular-nums;}
  table.contract-order-lines th:first-child,table.contract-order-lines td:first-child{white-space:nowrap!important;}
  table.contract-order-lines tbody tr:last-child td{white-space:nowrap!important;}
}`;
}

function escapeHtmlText(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildContractPrintHtml(innerHtml, documentTitle = '') {
  const css = getContractPrintCss();
  const title = escapeHtmlText(documentTitle);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${css}</style></head><body><div class="print-wrap">${innerHtml || ''}</div></body></html>`;
}

function buildFillVars(contract, orders, listFieldDefs) {
  const vars = {
    CUSTOMER_NAME: contract.customer_name || '',
    COMPANY_NAME_ZH: contract.company_name_zh || '',
    CONTRACT_NO: contract.contract_no || '',
    SIGN_DATE_ZH: contract.created_at ? formatSigningDateZhShanghai(new Date(contract.created_at)) : '',
    CUSTOMER_ADDRESS: contract.customer_address || '',
    CUSTOMER_CONTACT: contract.customer_contact || '',
    CUSTOMER_PHONE: contract.customer_phone || '',
    CUSTOMER_FAX: contract.customer_fax || '',
    CUSTOMER_BANK: contract.customer_bank || '',
    CUSTOMER_ACCOUNT: contract.customer_account || '',
    CUSTOMER_TAX_ID: contract.customer_tax_id || ''
  };
  const bodyHtml = String(contract.body_html || '');
  if (bodyHtml.includes('{{ORDER_LINES}}')) {
    vars.ORDER_LINES = buildContractOrderLinesHtml(orders, listFieldDefs);
    let sum = 0;
    for (const raw of orders || []) {
      const o = listFieldDefs?.length ? prepareOrderRowForContractHtml(raw, listFieldDefs) : raw;
      const d = o?.display_data || {};
      const grossUnit = Number(o?.unit_price ?? d?.unit_price);
      const tons = tonsFromQtyAndSpec(o?.quantity ?? d?.quantity, o?.product_name ?? d?.product_name ?? '');
      if (Number.isFinite(grossUnit) && grossUnit > 0 && tons != null && tons > 0) {
        sum += grossUnit * tons;
      }
    }
    sum = Math.round(sum * 100) / 100;
    if (sum > 0) {
      vars.AMOUNT_TOTAL = sum.toFixed(2);
      vars.AMOUNT_TOTAL_CN = amountToRmbUppercase(sum);
    }
  }
  return vars;
}

function finalizeContractBodyForExport(contract, orders, listFieldDefs) {
  const vars = buildFillVars(contract, orders, listFieldDefs);
  const html = fillContractTemplate(String(contract.body_html || ''), vars);
  return applyCompanySellerNameToFilledContract(html, contract.company_name_zh);
}

async function renderHtmlToPdfBuffer(fullHtml) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.emulateMediaType('print');
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

export async function generateContractPdf(pool, contractId) {
  const data = await fetchContractData(pool, contractId);
  if (!data) return null;
  const { contract, orders, listFieldDefs } = data;
  const innerHtml = finalizeContractBodyForExport(contract, orders, listFieldDefs);
  const title = `${contract.customer_name || ''} · 销售合同 · ${contract.contract_no || contractId}`;
  const fullHtml = buildContractPrintHtml(innerHtml, title);
  const buffer = await renderHtmlToPdfBuffer(fullHtml);
  const safeNo = (contract.contract_no || `contract-${contractId}`).replace(/[/\\?%*:|"<>]/g, '-');
  return { buffer, filename: `${safeNo}.pdf` };
}

/** 上传类合同：图片转 PDF */
export async function renderUploadImageToPdf(buffer, mime, baseName = 'contract') {
  const safeMime = String(mime || 'image/png').split(';')[0].trim() || 'image/png';
  const b64 = Buffer.from(buffer).toString('base64');
  const src = `data:${safeMime};base64,${b64}`;
  const { top, right, bottom, left } = PAGE_MARGIN_MM;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page{size:A4;margin:0;}
    body{margin:0;text-align:center;padding:${top}mm ${right}mm ${bottom}mm ${left}mm;box-sizing:border-box;}
    img{max-width:100%;height:auto;}
  </style></head><body><img src="${src}" alt="" /></body></html>`;
  const pdfBuffer = await renderHtmlToPdfBuffer(html);
  const safeBase = String(baseName || 'contract').replace(/[/\\?%*:|"<>]/g, '-');
  return { buffer: pdfBuffer, filename: `${safeBase}.pdf` };
}
