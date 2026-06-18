import { tonsFromQtyAndSpec, prepareOrderRowForContractHtml } from './salesOrderFields.js';
import {
  ORDER_LINES_CELL_NOWRAP as CELL_NOWRAP,
  ORDER_LINES_CELL_STYLE as CELL_STYLE,
  orderLinesTableOpenTag
} from './contractOrderLinesTableStyle.js';

/** 生成/落库合同正文「订单明细」表头（不含「单价」列） */
export const CONTRACT_ORDER_LINE_HEADERS_FINAL = [
  '品名',
  '型号',
  '不含税单价（元）',
  '单位（吨）',
  '数量（桶）',
  '不含税金额（元）',
  '税率',
  '税额（元）',
  '价税合计（元）'
];

/** @deprecated 与 FINAL 相同，保留别名避免外部引用断裂 */
export const CONTRACT_ORDER_LINE_HEADERS = CONTRACT_ORDER_LINE_HEADERS_FINAL;

const DEFAULT_VAT_RATE = 0.13;

function esc(v) {
  if (v == null || v === '') return '';
  return String(v);
}

function fmtMoney2(n) {
  if (!Number.isFinite(n)) return '';
  return (Math.round(n * 100) / 100).toFixed(2);
}

function fmtInt(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : '';
}

/** 税率：支持 0.13 或 13 或 "13%" */
function resolveVatRateFraction(order) {
  const d = order?.display_data || {};
  const raw =
    order?.tax_rate ?? order?.vat_rate ?? d?.tax_rate ?? d?.vat_rate ?? order?.data_json?.tax_rate;
  if (raw == null || raw === '') return DEFAULT_VAT_RATE;
  const s = String(raw).replace(/%/g, '').trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_VAT_RATE;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

function formatTaxRateCell(rate) {
  if (!Number.isFinite(rate) || rate < 0) return '';
  const pct = Math.round(rate * 10000) / 100;
  return `${pct}%`;
}

function fmtTonsFromOrder(o) {
  const d = o?.display_data || {};
  const t = tonsFromQtyAndSpec(o?.quantity ?? d?.quantity, o?.product_name ?? d?.product_name ?? '');
  if (t == null) return '';
  return t.toFixed(2);
}

/**
 * 订单 unit_price 视为含税单价（元/吨）；税率默认 13%，可用订单 tax_rate / vat_rate（0.13 或 13 或 13%）。
 * 不含税单价 = 含税单价/(1+税率)；不含税金额 = 不含税单价×吨；价税合计 = 含税单价×吨；税额 = 价税合计−不含税金额。
 */
function lineAmountsFromOrder(o) {
  const d = o?.display_data || {};
  const grossUnit = Number(o?.unit_price ?? d?.unit_price);
  const tons = tonsFromQtyAndSpec(o?.quantity ?? d?.quantity, o?.product_name ?? d?.product_name ?? '');
  const r = resolveVatRateFraction(o);
  if (!Number.isFinite(grossUnit) || grossUnit <= 0 || tons == null || tons <= 0 || !Number.isFinite(r) || r < 0) {
    return {
      grossUnitStr: '',
      netUnitStr: '',
      netAmountStr: '',
      taxAmountStr: '',
      totalWithTaxStr: '',
      taxRateCell: formatTaxRateCell(r)
    };
  }
  const netUnit = grossUnit / (1 + r);
  const totalWithTax = grossUnit * tons;
  const netAmount = netUnit * tons;
  const taxAmount = totalWithTax - netAmount;
  return {
    grossUnitStr: fmtMoney2(grossUnit),
    netUnitStr: fmtMoney2(netUnit),
    netAmountStr: fmtMoney2(netAmount),
    taxAmountStr: fmtMoney2(taxAmount),
    totalWithTaxStr: fmtMoney2(totalWithTax),
    taxRateCell: formatTaxRateCell(r)
  };
}

/**
 * 从订单生成合同时：品名留空；填充型号、不含税单价、单位（吨）、数量（整数）、不含税金额、税率、税额、价税合计（无「单价」列）。
 * 订单数据取自 data_json 合并后的 display_data 及物理列（须传入 field_definitions）。
 */
export function buildContractOrderLinesHtml(orders = [], definitions = null, modelToProductNameMap = {}) {
  const headers = CONTRACT_ORDER_LINE_HEADERS_FINAL;
  const head = headers.map((h, i) => `<th style="${i < 2 ? CELL_NOWRAP : CELL_STYLE}">${h}</th>`).join('');

  const body = (orders || [])
    .map((raw) => {
      const o = definitions?.length ? prepareOrderRowForContractHtml(raw, definitions) : raw;
      const d = o?.display_data || {};
      const productModel = esc(o?.product_model || d?.product_model);
      const productName = modelToProductNameMap[productModel.toUpperCase()] || '';
      const qtyRaw = o?.quantity ?? d?.quantity ?? '';
      const quantity = esc(typeof qtyRaw === 'number' ? fmtInt(qtyRaw) : String(qtyRaw));
      const tonsCell = esc(fmtTonsFromOrder(o));
      const { netUnitStr, netAmountStr, taxRateCell, taxAmountStr, totalWithTaxStr } = lineAmountsFromOrder(o);

      return `<tr>
        <td style="${CELL_NOWRAP}">${esc(productName)}</td>
        <td style="${CELL_NOWRAP}">${productModel}</td>
        <td style="${CELL_STYLE}">${esc(netUnitStr)}</td>
        <td style="${CELL_STYLE}">${tonsCell}</td>
        <td style="${CELL_STYLE}">${quantity}</td>
        <td style="${CELL_STYLE}">${esc(netAmountStr)}</td>
        <td style="${CELL_STYLE}">${esc(taxRateCell)}</td>
        <td style="${CELL_STYLE}">${esc(taxAmountStr)}</td>
        <td style="${CELL_STYLE}">${esc(totalWithTaxStr)}</td>
      </tr>`;
    })
    .join('');

  const colspan = headers.length - 1;
  const totalRow = `<tr><td style="${CELL_STYLE}">总金额</td><td colspan="${colspan}" style="${CELL_STYLE};text-align:left">{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）</td></tr>`;
  return `${orderLinesTableOpenTag()}<thead><tr>${head}</tr></thead><tbody>${body}${totalRow}</tbody></table>`;
}
