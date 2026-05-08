/** 与 server/src/lib/contractOrderLines.js 保持一致，用于前端预览补全 {{ORDER_LINES}} */

const CELL_STYLE = 'border:1px solid #000;padding:4px 6px;text-align:center';
const CELL_NOWRAP = `${CELL_STYLE};white-space:nowrap`;
const TABLE_STYLE =
  'width:100%;border-collapse:collapse;border:1px solid #000;font-family:FangSong_GB2312,仿宋_GB2312,仿宋,FangSong;font-size:16px;line-height:1.35';

function esc(v) {
  return String(v ?? '');
}

const COL_HEADERS = [
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

export function buildContractOrderLinesHtml(orders = []) {
  const head = COL_HEADERS.map((h, i) => `<th style="${i < 2 ? CELL_NOWRAP : CELL_STYLE}">${h}</th>`).join('') || '';
  const empty = `<td style="${CELL_STYLE}"></td>`;
  const body = (orders || [])
    .map((o) => {
      const modelCell = `<td style="${CELL_NOWRAP}">${esc(o?.product_model)}</td>`;
      return `<tr><td style="${CELL_NOWRAP}"></td>${modelCell}${empty}${empty}${empty}${empty}${empty}${empty}${empty}</tr>`;
    })
    .join('');
  const totalRow = `<tr><td style="${CELL_STYLE}">总金额</td><td colspan="8" style="${CELL_STYLE};text-align:left">{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）</td></tr>`;
  return `<table style="${TABLE_STYLE}"><thead><tr>${head}</tr></thead><tbody>${body}${totalRow}</tbody></table>`;
}
