/** 合同模板：推荐版式与预览用示例数据（与生成合同时订单表结构一致） */

import {
  CONTRACT_ORDER_LINES_TABLE_CLASS,
  ORDER_LINES_CELL_NOWRAP,
  ORDER_LINES_CELL_STYLE,
  ORDER_LINES_TABLE_STYLE,
  orderLinesTableOpenTag
} from './contractOrderLinesTableStyle.js';

const TD = `style="${ORDER_LINES_CELL_STYLE}"`;
const TDNW = `style="${ORDER_LINES_CELL_NOWRAP}"`;
const TD_TOTAL = 'style="border:1px solid #000;padding:5px 10px;text-align:left"';
export const CONTRACT_TPL_PREVIEW_LINES = `${orderLinesTableOpenTag()}<thead><tr><th ${TDNW}>品名</th><th ${TDNW}>型号</th><th ${TD}>不含税单价（元）</th><th ${TD}>单位（吨）</th><th ${TD}>数量（桶）</th><th ${TD}>不含税金额（元）</th><th ${TD}>税率</th><th ${TD}>税额（元）</th><th ${TD}>价税合计（元）</th></tr></thead><tbody><tr><td ${TDNW}></td><td ${TDNW}>NL385</td><td ${TD}>1000.00</td><td ${TD}>10.00</td><td ${TD}>15</td><td ${TD}>10000.00</td><td ${TD}>13%</td><td ${TD}>1300.00</td><td ${TD}>11300.00</td></tr><tr><td ${TDNW}></td><td ${TDNW}>NL1681</td><td ${TD}>2000.00</td><td ${TD}>5.00</td><td ${TD}>8</td><td ${TD}>10000.00</td><td ${TD}>13%</td><td ${TD}>1300.00</td><td ${TD}>11300.00</td></tr><tr><td ${TD}>总金额</td><td colspan="8" ${TD_TOTAL}>{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）</td></tr></tbody></table>`;

const TPL_PREVIEW_VARS = {
  COMPANY_NAME_ZH: '开封物源化工有限公司（示例）',
  CUSTOMER_NAME: '昆明华信金属材料制造有限公司（示例）',
  CUSTOMER_ADDRESS: '云南省昆明市示例区工业园',
  CUSTOMER_CONTACT: '李明超',
  CUSTOMER_PHONE: '18087180880',
  CUSTOMER_FAX: '0871-12345678',
  CUSTOMER_BANK: '中国工商银行昆明示例支行',
  CUSTOMER_ACCOUNT: '25020245090000EXAMPLE',
  CUSTOMER_TAX_ID: '91530100MA6EXAMPLE',
  CONTRACT_NO: 'HT20260406DEMO01',
  SIGN_DATE_ZH: '2026年04月06日',
  ORDER_LINES: CONTRACT_TPL_PREVIEW_LINES,
  AMOUNT_TOTAL: '22600.00',
  AMOUNT_TOTAL_CN: '贰万贰仟陆佰元整'
};

/** 旧模板「订单表 + 单独总金额段」与新表内合计并存时去掉表后多余段落 */
function stripLegacyOrderTotalParagraph(html) {
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `(<table[^>]*class="[^"]*${CONTRACT_ORDER_LINES_TABLE_CLASS}[^"]*"[^>]*>[\\s\\S]*?</table>)\\s*<p[^>]*>[\\s\\S]*?总金额(（大写）)?[：:][\\s\\S]*?</p>`,
      'i'
    ),
    new RegExp(
      `(<table style="${esc(ORDER_LINES_TABLE_STYLE)}">[\\s\\S]*?</table>)\\s*<p[^>]*>[\\s\\S]*?总金额(（大写）)?[：:][\\s\\S]*?</p>`,
      'i'
    ),
    new RegExp(
      '(<table style="width:100%;border-collapse:collapse;border:1px solid #000[^"]*">[\\s\\S]*?</table>)\\s*<p[^>]*>[\\s\\S]*?总金额(（大写）)?[：:][\\s\\S]*?</p>',
      'i'
    )
  ];
  let s = String(html ?? '');
  for (const re of patterns) {
    s = s.replace(re, '$1');
  }
  return s;
}

export function previewFillContractTemplate(html) {
  let s = String(html ?? '');
  for (const [key, val] of Object.entries(TPL_PREVIEW_VARS)) {
    s = s.replaceAll(`{{${key}}}`, val);
  }
  return stripLegacyOrderTotalParagraph(s);
}

export const BLANK_TPL_BODY = '<p></p>';
