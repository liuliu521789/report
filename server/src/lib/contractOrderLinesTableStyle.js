/** 生成/落库合同「订单明细」表：列宽随内容，略宽于纯自适应（左右留白） */
export const CONTRACT_ORDER_LINES_TABLE_CLASS = 'contract-order-lines';

export const ORDER_LINES_TABLE_STYLE =
  'width:100%;border-collapse:collapse;border:1px solid #000;font-family:FangSong_GB2312,仿宋_GB2312,仿宋,FangSong;font-size:16px;line-height:1.35';

const CELL_PAD = '5px 10px';

export const ORDER_LINES_CELL_STYLE = `border:1px solid #000;padding:${CELL_PAD};text-align:center`;

export const ORDER_LINES_CELL_NOWRAP = `${ORDER_LINES_CELL_STYLE};white-space:nowrap`;

export function orderLinesTableOpenTag() {
  return `<table class="${CONTRACT_ORDER_LINES_TABLE_CLASS}" style="${ORDER_LINES_TABLE_STYLE}">`;
}
