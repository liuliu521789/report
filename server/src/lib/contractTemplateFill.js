const PLACEHOLDER_KEYS = [
  'CUSTOMER_NAME',
  'ORDER_LINES',
  'AMOUNT_TOTAL',
  'AMOUNT_TOTAL_CN',
  'CONTRACT_NO',
  'SIGN_DATE_ZH',
  'COMPANY_NAME_ZH',
  'CUSTOMER_ADDRESS',
  'CUSTOMER_CONTACT',
  'CUSTOMER_PHONE'
];

const ORDER_LINES_TABLE_STYLE_MARK =
  'width:100%;border-collapse:collapse;border:1px solid #000;font-family:SimSun,宋体;font-size:12px;line-height:1.35';

/** 旧模板在表格外仍有「总金额」段落时，与表内合计重复，生成后去掉紧跟订单明细表后的该段 */
function stripLegacyOrderTotalParagraph(html) {
  const escaped = ORDER_LINES_TABLE_STYLE_MARK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(<table style="${escaped}">[\\s\\S]*?</table>)\\s*<p[^>]*>[\\s\\S]*?总金额(（大写）)?[：:][\\s\\S]*?</p>`,
    'i'
  );
  return String(html ?? '').replace(re, '$1');
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 历史模板可能缺少「销售合同」主标题，若能定位公司名称则在其下方补齐。 */
function ensureSalesContractTitleBelowCompany(html, vars = {}) {
  let s = String(html ?? '');
  const companyKeys = [vars.COMPANY_NAME_ZH, '{{COMPANY_NAME_ZH}}'].filter(Boolean);
  const titleHtml =
    '<span style="display:block;text-align:center;font-size:14px;letter-spacing:2px;line-height:1.6;margin-top:6px;font-family:SimSun,宋体">销售合同</span>';
  if (!s) return s;
  for (const key of companyKeys) {
    const escapedKey = escapeRegExp(String(key));
    // 先处理「公司名 销售合同」同一行，强制拆行。
    const inlineTitleRe = new RegExp(`${escapedKey}(?:\\s|&nbsp;|　)*销售合同`, 'g');
    if (inlineTitleRe.test(s)) {
      s = s.replace(inlineTitleRe, `${key}<br/>${titleHtml}`);
      return s;
    }
    // 若尚未出现标题，则补在公司名后。
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

/** @param {string} html @param {Record<string, string|number>} vars */
export function fillContractTemplate(html, vars) {
  let s = String(html ?? '');
  for (const key of PLACEHOLDER_KEYS) {
    const v = vars[key];
    const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    s = s.replace(re, v == null || v === '' ? '' : String(v));
  }
  s = stripLegacyOrderTotalParagraph(s);
  return ensureSalesContractTitleBelowCompany(s, vars || {});
}

/** 签订日期：YYYY年MM月DD日（上海时区） */
export function formatSigningDateZhShanghai(d = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const mo = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (y == null || mo == null || day == null) return '';
  const m = String(mo).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${y}年${m}月${dd}日`;
}

/** YYYYMMDD（上海时区），与合同编号日期段一致 */
export function shanghaiYmdCompact(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const mo = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (y && mo && day) return `${y}${mo}${day}`;
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
