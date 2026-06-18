import { fetchSalesContractRow } from '../routes/sales/salesShared.js';
import { resolveCustomerLegalNameForContract } from './salesCustomerContractName.js';
import { resolveBuyerFieldsForContract } from './salesCustomerContractInfo.js';

function parseContractDataJson(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function parseMaybeObject(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

function parseRate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(s);
  if (pct) {
    const p = Number(pct[1]);
    if (!Number.isFinite(p)) return null;
    const n = p / 100;
    if (n < 0 || n > 1) return null;
    return n;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // 合同表格常填 13 / 9 / 6（百分数），按百分比转小数。
  if (n > 1 && n <= 100) return n / 100;
  if (n < 0 || n > 1) return null;
  return n;
}

function extractTaxRateFromVisual(visual) {
  const rows = Array.isArray(visual?.tableRows) ? visual.tableRows : [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    // 10 列编辑态：税率索引 7；9 列最终态：税率索引 6。
    const candidates = [row[7], row[6]];
    for (const c of candidates) {
      const r = parseRate(c);
      if (r != null) return r;
    }
  }
  return null;
}

function pickNonPlaceholder(v) {
  const s = String(v ?? '').trim();
  if (!s || /\{\{/.test(s)) return null;
  return s;
}

/** 从订单扩展字段提取计量单位（如 吨、千克、件） */
function pickItemUnitFromOrderData(orderData) {
  if (!orderData || typeof orderData !== 'object') return null;
  const keys = ['计量单位', 'item_unit', 'unit', 'measure_unit', 'unit_name'];
  for (const k of keys) {
    const v = pickNonPlaceholder(orderData[k]);
    if (v) return v.slice(0, 32);
  }
  return null;
}

function normalizeLabel(label) {
  return String(label ?? '').trim().replace(/\s+/g, '');
}

function valueFromPlaceholderToken(raw, ctx) {
  const token = String(raw ?? '').trim();
  if (!token) return null;
  const map = {
    '{{CUSTOMER_NAME}}': ctx.buyerName,
    '{{CUSTOMER_ADDRESS}}': ctx.address,
    '{{CUSTOMER_CONTACT}}': ctx.contact,
    '{{CUSTOMER_PHONE}}': ctx.phone,
    '{{CUSTOMER_FAX}}': ctx.fax,
    '{{CUSTOMER_BANK}}': ctx.bank,
    '{{CUSTOMER_ACCOUNT}}': ctx.account,
    '{{CUSTOMER_TAX_ID}}': ctx.taxId
  };
  const v = map[token];
  return v != null && String(v).trim() !== '' ? String(v).trim() : null;
}

const LEGACY_BUYER_KEYS = [
  ['单位', 'buyerUnit'],
  ['地址', 'buyerAddress'],
  ['电话', 'buyerPhone'],
  ['开户银行', 'buyerBank'],
  ['账号', 'buyerAccount'],
  ['税号', 'buyerTaxNo']
];

/** @typedef {{ buyerName?: string, address?: string, phone?: string, taxId?: string, bank?: string, account?: string }} BuyerResolveCtx */

/**
 * 与合同预览 renderPartyItemsInnerHtml 一致：value 为空时用 fallback 占位符解析为实际客户字段。
 */
function resolvePartyItemValue(item, ctx) {
  const direct = pickNonPlaceholder(item?.value);
  if (direct) return direct;
  const fromValueToken = valueFromPlaceholderToken(item?.value, ctx);
  if (fromValueToken) return fromValueToken;
  const fb = String(item?.fallback ?? '').trim();
  if (!fb || /\{\{/.test(fb) === false) {
    /* fallback 本身可能是已填写的字面量 */
    return pickNonPlaceholder(fb);
  }
  return valueFromPlaceholderToken(fb, ctx);
}

/** 合同签章区买方行 → 开票购方字段 */
export function invoiceFieldsFromPartyBuyerItems(items, ctx = {}) {
  if (!Array.isArray(items)) return {};
  const pick = (labels) => {
    const aliases = Array.isArray(labels) ? labels : [labels];
    const aliasSet = new Set(aliases.map((x) => normalizeLabel(x)));
    const it = items.find((x) => aliasSet.has(normalizeLabel(x?.label)));
    if (!it) return null;
    return resolvePartyItemValue(it, ctx);
  };
  return {
    buyer_name: pick(['单位', '购方名称', '公司全称', '购买方名称']),
    buyer_address: pick(['地址', '注册地址', '购方地址', '公司地址']),
    buyer_phone: pick(['电话', '联系电话', '购方电话']),
    buyer_tax_id: pick(['税号', '纳税人识别号', '统一社会信用代码', '统一信用代码']),
    buyer_bank_name: pick(['开户银行', '开户行', '购方开户行']),
    buyer_bank_account: pick(['账号', '银行账号', '购方账号'])
  };
}

function invoiceFieldsFromLegacyVisual(visual, ctx) {
  if (!visual || typeof visual !== 'object') return {};
  const out = {};
  for (const [label, key] of LEGACY_BUYER_KEYS) {
    const v = pickNonPlaceholder(visual[key]);
    if (v) {
      if (label === '单位') out.buyer_name = v;
      else if (label === '地址') out.buyer_address = v;
      else if (label === '电话') out.buyer_phone = v;
      else if (label === '税号') out.buyer_tax_id = v;
      else if (label === '开户银行') out.buyer_bank_name = v;
      else if (label === '账号') out.buyer_bank_account = v;
    }
  }
  const items = visual.partyBuyerItems;
  return mergeDefined(out, invoiceFieldsFromPartyBuyerItems(items, ctx));
}

function decodeHtmlEntities(s) {
  return String(s ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function invoiceFieldsFromBodyHtml(html) {
  const raw = String(html ?? '').trim();
  if (!raw) return {};
  const text = decodeHtmlEntities(
    raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li|td|tr|h1|h2|h3|h4|h5|h6)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n');

  const fields = [
    { key: 'buyer_name', labels: ['单位', '购方名称', '公司全称', '购买方名称'] },
    { key: 'buyer_address', labels: ['地址', '注册地址', '购方地址', '公司地址'] },
    { key: 'buyer_phone', labels: ['电话', '联系电话', '购方电话'] },
    { key: 'buyer_tax_id', labels: ['税号', '纳税人识别号', '统一社会信用代码', '统一信用代码'] },
    { key: 'buyer_bank_name', labels: ['开户银行', '开户行', '购方开户行'] },
    { key: 'buyer_bank_account', labels: ['账号', '银行账号', '购方账号'] }
  ];
  const out = {};
  for (const cfg of fields) {
    for (const label of cfg.labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`${escaped}\\s*[：:]\\s*([^\\n]+)`, 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        const v = pickNonPlaceholder(m[1]);
        if (v) out[cfg.key] = v;
      }
    }
  }
  return out;
}

export function __test_only_invoiceFieldsFromBodyHtml(html) {
  return invoiceFieldsFromBodyHtml(html);
}

export function __test_only_extractTaxRateFromVisual(visual) {
  return extractTaxRateFromVisual(visual);
}

function mergeDefined(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v != null && String(v).trim() !== '') out[k] = v;
  }
  return out;
}

function orNonEmpty(...vals) {
  for (const v of vals) {
    const s = v != null ? String(v).trim() : '';
    if (s) return s;
  }
  return null;
}

/** 与合同生成同源：首条关联订单 + 名录反查 */
async function resolveContractBuyerContext(pool, contractId, contractRow) {
  const cid = Number(contractId);
  const c = contractRow;
  const [[orderRow]] = await pool.query(
    `SELECT o.customer_id,
            cu.customer_name, cu.contact_name, cu.customer_group,
            cu.address AS customer_address, cu.contact_person AS customer_contact, cu.phone AS customer_phone,
            cu.fax AS customer_fax, cu.bank_name AS customer_bank, cu.bank_account AS customer_account, cu.tax_id AS customer_tax_id
     FROM sales_contract_orders sco
     INNER JOIN sales_orders o ON o.id = sco.order_id
     INNER JOIN sales_customers cu ON cu.id = o.customer_id
     WHERE sco.contract_id = ?
     ORDER BY sco.id ASC
     LIMIT 1`,
    [cid]
  );

  let contactName = orderRow?.contact_name;
  let customerGroup = orderRow?.customer_group;
  if (contactName == null && customerGroup == null && c?.customer_id) {
    const [[cuRow]] = await pool.query(
      'SELECT contact_name, customer_group FROM sales_customers WHERE id = ? LIMIT 1',
      [c.customer_id]
    );
    contactName = cuRow?.contact_name;
    customerGroup = cuRow?.customer_group;
  }

  const originalName = String(orderRow?.customer_name || c?.customer_name || '').trim();
  const resolvedName = originalName
    ? await resolveCustomerLegalNameForContract(pool, {
        customer_name: originalName,
        customer_contact: contactName || c?.customer_contact,
        customer_group: customerGroup || ''
      })
    : '';

  const buyerFields = originalName
    ? await resolveBuyerFieldsForContract(
        pool,
        {
          customer_address: orderRow?.customer_address || c?.customer_address,
          customer_contact: orderRow?.customer_contact || c?.customer_contact,
          customer_phone: orderRow?.customer_phone || c?.customer_phone,
          customer_fax: orderRow?.customer_fax || c?.customer_fax,
          customer_bank: orderRow?.customer_bank || c?.customer_bank,
          customer_account: orderRow?.customer_account || c?.customer_account,
          customer_tax_id: orderRow?.customer_tax_id || c?.customer_tax_id
        },
        resolvedName || originalName,
        originalName
      )
    : { address: '', contact: '', phone: '', fax: '', bank: '', account: '', taxId: '' };

  return {
    buyerName: orNonEmpty(resolvedName, originalName),
    address: orNonEmpty(buyerFields.address, orderRow?.customer_address, c?.customer_address),
    contact: orNonEmpty(buyerFields.contact, orderRow?.customer_contact, c?.customer_contact),
    phone: orNonEmpty(buyerFields.phone, orderRow?.customer_phone, c?.customer_phone),
    fax: orNonEmpty(buyerFields.fax, orderRow?.customer_fax, c?.customer_fax),
    bank: orNonEmpty(buyerFields.bank, orderRow?.customer_bank, c?.customer_bank),
    account: orNonEmpty(buyerFields.account, orderRow?.customer_account, c?.customer_account),
    taxId: orNonEmpty(buyerFields.taxId, orderRow?.customer_tax_id, c?.customer_tax_id)
  };
}

/**
 * 开票表单默认字段：客户/订单 + 名录反查 + 合同签章区（含占位符） + 首条订单明细。
 */
export async function loadContractInvoiceAutoFields(pool, contractId) {
  const cid = Number(contractId);
  if (!Number.isFinite(cid) || cid < 1) return {};
  try {
    const c = await fetchSalesContractRow(pool, cid);
    if (!c) return {};

    const ctx = await resolveContractBuyerContext(pool, cid, c);
    const fromResolved = {
      buyer_name: ctx.buyerName,
      buyer_tax_id: ctx.taxId,
      buyer_address: ctx.address,
      buyer_phone: ctx.phone,
      buyer_bank_name: ctx.bank,
      buyer_bank_account: ctx.account
    };

    const dataJson = parseContractDataJson(c.data_json);
    const visual =
      parseMaybeObject(dataJson?.contract_visual) ||
      parseMaybeObject(dataJson?.contractVisual) ||
      null;
    const fromVisual = invoiceFieldsFromLegacyVisual(visual, ctx);
    const fromBody = invoiceFieldsFromBodyHtml(c.body_html);

    const buyer = mergeDefined(mergeDefined(fromResolved, fromVisual), fromBody);

    const [[itemRow]] = await pool.query(
      `SELECT o.product_name, o.product_model, o.quantity, o.unit_price, o.tax_rate, o.vat_rate, o.data_json
       FROM sales_contract_orders sco
       INNER JOIN sales_orders o ON o.id = sco.order_id
       WHERE sco.contract_id = ?
       ORDER BY sco.id ASC
       LIMIT 1`,
      [cid]
    );
    const product = [itemRow?.product_name, itemRow?.product_model].filter(Boolean).join(' / ').trim();
    const orderData = parseContractDataJson(itemRow?.data_json);
    const visualTaxRate = extractTaxRateFromVisual(visual);
    const orderTaxRate = parseRate(
      itemRow?.tax_rate ?? itemRow?.vat_rate ?? orderData?.tax_rate ?? orderData?.vat_rate
    );
    const taxRate = visualTaxRate ?? orderTaxRate;

    const itemUnit = pickItemUnitFromOrderData(orderData) || '吨';

    return {
      ...buyer,
      tax_rate: taxRate,
      item_name: product || null,
      item_unit: itemUnit,
      item_quantity: itemRow?.quantity == null ? null : Number(itemRow.quantity),
      item_unit_price: itemRow?.unit_price == null ? null : Number(itemRow.unit_price)
    };
  } catch {
    return {};
  }
}
