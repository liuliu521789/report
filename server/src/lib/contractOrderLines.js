const CELL_STYLE = 'border:1px solid #000;padding:4px 6px;text-align:center';
const CELL_NOWRAP = `${CELL_STYLE};white-space:nowrap`;
const TABLE_STYLE =
  'width:100%;border-collapse:collapse;border:1px solid #000;font-family:FangSong_GB2312,仿宋_GB2312,仿宋,FangSong;font-size:16px;line-height:1.35';

/** 与合同模板可视化、预览一致；生成合同时注入 {{ORDER_LINES}} */
export const CONTRACT_ORDER_LINE_HEADERS = [
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

function esc(v) {
  if (v == null || v === '') return '';
  return String(v);
}

function fmtNum(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(4) : '';
}

function fmtInt(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : '';
}

/**
 * 从订单生成合同时：品名留空，填充型号、数量（整数）、单价、金额，
 * 税率、税额、价税合计留空由用户填写。
 * 订单数据取自 display_data 或直接字段。
 */
export function buildContractOrderLinesHtml(orders = []) {
  const head = CONTRACT_ORDER_LINE_HEADERS.map((h, i) => `<th style="${i < 2 ? CELL_NOWRAP : CELL_STYLE}">${h}</th>`).join('');

  const body = (orders || [])
    .map((o) => {
      const d = o?.display_data || {};
      const productModel = esc(o?.product_model || d?.product_model);
      const quantity = fmtInt(o?.quantity ?? d?.quantity);
      const unitPrice = fmtNum(o?.unit_price ?? d?.unit_price);
      const amount = fmtNum(o?.amount ?? d?.amount);

      return `<tr>
        <td style="${CELL_NOWRAP}"></td>
        <td style="${CELL_NOWRAP}">${productModel}</td>
        <td style="${CELL_STYLE}">${unitPrice}</td>
        <td style="${CELL_STYLE}"></td>
        <td style="${CELL_STYLE}">${quantity}</td>
        <td style="${CELL_STYLE}">${amount}</td>
        <td style="${CELL_STYLE}"></td>
        <td style="${CELL_STYLE}"></td>
        <td style="${CELL_STYLE}"></td>
      </tr>`;
    })
    .join('');

  const totalRow = `<tr><td style="${CELL_STYLE}">总金额</td><td colspan="8" style="${CELL_STYLE};text-align:left">{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）</td></tr>`;
  return `<table style="${TABLE_STYLE}"><thead><tr>${head}</tr></thead><tbody>${body}${totalRow}</tbody></table>`;
}
