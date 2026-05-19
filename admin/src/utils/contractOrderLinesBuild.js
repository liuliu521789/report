/** 与 server/src/lib/contractOrderLines.js 计算逻辑一致，用于前端预览补全 {{ORDER_LINES}} */

import {
  CONTRACT_ORDER_LINE_HEADERS_FINAL,
  CONTRACT_ORDER_LINE_HEADERS_EDITOR
} from './contractVisualDefaults.js';
import { tonsFromQtyAndSpec } from './salesOrderTonAmount.js';
import { prepareOrderRowForContractHtml } from './salesOrderDisplayMerge.js';
import {
  ORDER_LINES_CELL_NOWRAP as CELL_NOWRAP,
  ORDER_LINES_CELL_STYLE as CELL_STYLE,
  orderLinesTableOpenTag
} from './contractOrderLinesTableStyle.js';

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

function resolveVatRateFraction(order) {
  const d = order?.display_data || {};
  const raw = order?.tax_rate ?? order?.vat_rate ?? d?.tax_rate ?? d?.vat_rate;
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
 * @param {any[]} orders
 * @param {{ variant?: 'final'|'editor', definitions?: any[] }} [options] definitions=订单字段定义时按 data_json 展开单价/规格等
 */
export function buildContractOrderLinesHtml(orders = [], options = {}) {
  const variant = options.variant === 'editor' ? 'editor' : 'final';
  const defs = options.definitions;
  const isEditor = variant === 'editor';
  const headers = isEditor ? CONTRACT_ORDER_LINE_HEADERS_EDITOR : CONTRACT_ORDER_LINE_HEADERS_FINAL;
  const head = headers.map((h, i) => `<th style="${i < 2 ? CELL_NOWRAP : CELL_STYLE}">${h}</th>`).join('');

  const body = (orders || [])
    .map((raw) => {
      const o = defs?.length ? prepareOrderRowForContractHtml(raw, defs) : raw;
      const d = o?.display_data || {};
      const productModel = esc(o?.product_model || d?.product_model);
      const quantity = fmtInt(o?.quantity ?? d?.quantity);
      const tonsCell = esc(fmtTonsFromOrder(o));
      const { grossUnitStr, netUnitStr, netAmountStr, taxRateCell, taxAmountStr, totalWithTaxStr } =
        lineAmountsFromOrder(o);

      if (isEditor) {
        return `<tr>
        <td style="${CELL_NOWRAP}"></td>
        <td style="${CELL_NOWRAP}">${productModel}</td>
        <td style="${CELL_STYLE}">${esc(grossUnitStr)}</td>
        <td style="${CELL_STYLE}">${esc(netUnitStr)}</td>
        <td style="${CELL_STYLE}">${tonsCell}</td>
        <td style="${CELL_STYLE}">${quantity}</td>
        <td style="${CELL_STYLE}">${esc(netAmountStr)}</td>
        <td style="${CELL_STYLE}">${esc(taxRateCell)}</td>
        <td style="${CELL_STYLE}">${esc(taxAmountStr)}</td>
        <td style="${CELL_STYLE}">${esc(totalWithTaxStr)}</td>
      </tr>`;
      }
      return `<tr>
        <td style="${CELL_NOWRAP}"></td>
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
