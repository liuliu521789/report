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
  'width:100%;border-collapse:collapse;border:1px solid #000;font-family:FangSong_GB2312,仿宋_GB2312,仿宋,FangSong;font-size:16px;line-height:1.35';

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
    '<span style="display:block;text-align:center;font-size:22px;letter-spacing:2px;line-height:1.6;margin-top:6px;font-family:FZXiaoBiaoSong-S05,FZXiaoBiaoSong,方正小标宋简体,方正小标宋,方正小标宋_GBK,FZShuSong_GB2312,SimSun">销售合同</span>';
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

/** 管理端可视化默认卖方/抬头名；存进模板后若未改，生成合同时应换成公司信息里的名称 */
const DEMO_SELLER_COMPANY_ZH_MARKERS = ['开封物源化工有限公司（示例）', '开封物源化工有限公司'];

/**
 * 占位符替换后，将正文中仍残留的示例卖方公司名统一为公司信息中的中文名称。
 * @param {string} html fillContractTemplate 之后
 * @param {string} companyNameZh company_settings.company_name_zh（trim 后）
 */
export function applyCompanySellerNameToFilledContract(html, companyNameZh) {
  const official = String(companyNameZh || '').trim();
  if (!official) return String(html ?? '');
  let s = String(html ?? '');
  for (const needle of DEMO_SELLER_COMPANY_ZH_MARKERS) {
    if (needle && needle !== official) s = s.split(needle).join(official);
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

/**
 * 合同编号：当前年份(4) + 月日各两位 + 当日流水两位（上海时区），共 10 位数字。
 * 须在事务内调用；返回后请在本连接 commit/rollback 之后调用 {@link releaseShanghaiContractNoLock}。
 * @param {import('mysql2/promise').PoolConnection} conn
 * @returns {Promise<{ contractNo: string, lockKey: string }>}
 */
export async function reserveNextShanghaiContractNo(conn) {
  const prefix = shanghaiYmdCompact();
  const lockKey = `sales_cn_${prefix}`.slice(0, 64);
  const [[lockRow]] = await conn.query('SELECT GET_LOCK(?, 20) AS got', [lockKey]);
  if (!lockRow || Number(lockRow.got) !== 1) {
    const e = new Error('CONTRACT_NO_LOCK_FAILED');
    e.code = 'CONTRACT_NO_LOCK_FAILED';
    throw e;
  }
  try {
    const [rows] = await conn.query(
      `SELECT COALESCE(MAX(CAST(RIGHT(contract_no, 2) AS UNSIGNED)), 0) AS m
       FROM sales_contracts
       WHERE CHAR_LENGTH(contract_no) = 10
         AND contract_no REGEXP '^[0-9]{10}$'
         AND LEFT(contract_no, 8) = ?`,
      [prefix]
    );
    const next = (Number(rows[0]?.m) || 0) + 1;
    if (next > 99) {
      await conn.query('SELECT RELEASE_LOCK(?)', [lockKey]);
      const e = new Error('CONTRACT_NO_DAY_LIMIT');
      e.code = 'CONTRACT_NO_DAY_LIMIT';
      throw e;
    }
    const contractNo = `${prefix}${String(next).padStart(2, '0')}`;
    return { contractNo, lockKey };
  } catch (e) {
    if (e && e.code === 'CONTRACT_NO_DAY_LIMIT') throw e;
    await conn.query('SELECT RELEASE_LOCK(?)', [lockKey]);
    throw e;
  }
}

/** 与 {@link reserveNextShanghaiContractNo} 配对，在事务结束释放连接前调用 */
export async function releaseShanghaiContractNoLock(conn, lockKey) {
  if (!lockKey) return;
  await conn.query('SELECT RELEASE_LOCK(?)', [lockKey]);
}
