/**
 * 合同签章区买卖双方：可编辑字段名、可增删行。
 */

/** @typedef {{ label: string, value?: string, fallback?: string }} PartyFieldItem */

export const PARTY_FALLBACK_COMPANY = '__COMPANY_NAME__';
export const PARTY_FALLBACK_CUSTOMER = '{{CUSTOMER_NAME}}';

export const DEFAULT_PARTY_SELLER_ITEMS = [
  { label: '单位', value: '开封物源化工有限公司', fallback: PARTY_FALLBACK_COMPANY },
  { label: '地址', value: '' },
  { label: '联系人', value: '' },
  { label: '电话', value: '' },
  { label: '传真', value: '' },
  { label: '开户银行', value: '' },
  { label: '账号', value: '' },
  { label: '行号', value: '' }
];

export const DEFAULT_PARTY_BUYER_ITEMS = [
  { label: '单位', value: '', fallback: PARTY_FALLBACK_CUSTOMER },
  { label: '地址', value: '', fallback: '{{CUSTOMER_ADDRESS}}' },
  { label: '联系人', value: '', fallback: '{{CUSTOMER_CONTACT}}' },
  { label: '电话', value: '', fallback: '{{CUSTOMER_PHONE}}' },
  { label: '传真', value: '', fallback: '{{CUSTOMER_FAX}}' },
  { label: '开户银行', value: '', fallback: '{{CUSTOMER_BANK}}' },
  { label: '账号', value: '', fallback: '{{CUSTOMER_ACCOUNT}}' },
  { label: '税号', value: '', fallback: '{{CUSTOMER_TAX_ID}}' }
];

const LEGACY_SELLER = [
  ['单位', 'sellerUnit', PARTY_FALLBACK_COMPANY],
  ['地址', 'sellerAddress', ''],
  ['联系人', 'sellerContact', ''],
  ['电话', 'sellerPhone', ''],
  ['传真', 'sellerFax', ''],
  ['开户银行', 'sellerBank', ''],
  ['账号', 'sellerAccount', ''],
  ['行号', 'sellerBankNo', '']
];

const LEGACY_BUYER = [
  ['单位', 'buyerUnit', PARTY_FALLBACK_CUSTOMER],
  ['地址', 'buyerAddress', '{{CUSTOMER_ADDRESS}}'],
  ['联系人', 'buyerContact', '{{CUSTOMER_CONTACT}}'],
  ['电话', 'buyerPhone', '{{CUSTOMER_PHONE}}'],
  ['传真', 'buyerFax', '{{CUSTOMER_FAX}}'],
  ['开户银行', 'buyerBank', '{{CUSTOMER_BANK}}'],
  ['账号', 'buyerAccount', '{{CUSTOMER_ACCOUNT}}'],
  ['税号', 'buyerTaxNo', '{{CUSTOMER_TAX_ID}}']
];

function cloneItems(items) {
  return (items || []).map((it) => ({
    label: String(it?.label ?? ''),
    value: it?.value != null ? String(it.value) : '',
    ...(it?.fallback ? { fallback: String(it.fallback) } : {})
  }));
}

function legacyToItems(pairs, visual) {
  return pairs.map(([label, key, fallback]) => {
    const raw = visual?.[key];
    const item = {
      label,
      value: raw != null ? String(raw) : ''
    };
    if (fallback) item.fallback = fallback;
    return item;
  });
}

/** 旧版 sellerUnit / buyerAddress 等扁平字段 → 可编辑行列表 */
export function migrateLegacyPartyFields(visual) {
  if (!visual || typeof visual !== 'object') return visual;
  const out = { ...visual };
  if (!Array.isArray(out.partySellerItems) || !out.partySellerItems.length) {
    const hasLegacy = LEGACY_SELLER.some(([, key]) => {
      const v = out[key];
      return v != null && String(v).trim() !== '';
    });
    out.partySellerItems =
      hasLegacy || !Array.isArray(out.partySellerItems)
        ? legacyToItems(LEGACY_SELLER, out)
        : cloneItems(DEFAULT_PARTY_SELLER_ITEMS);
  } else {
    out.partySellerItems = cloneItems(out.partySellerItems);
  }
  if (!Array.isArray(out.partyBuyerItems) || !out.partyBuyerItems.length) {
    const hasLegacy = LEGACY_BUYER.some(([, key]) => {
      const v = out[key];
      return v != null && String(v).trim() !== '';
    });
    out.partyBuyerItems =
      hasLegacy || !Array.isArray(out.partyBuyerItems)
        ? legacyToItems(LEGACY_BUYER, out)
        : cloneItems(DEFAULT_PARTY_BUYER_ITEMS);
  } else {
    out.partyBuyerItems = cloneItems(out.partyBuyerItems);
  }
  return out;
}

export function ensurePartyItemsOnVisual(visual) {
  const v = migrateLegacyPartyFields(visual || {});
  if (!Array.isArray(v.partySellerItems)) v.partySellerItems = cloneItems(DEFAULT_PARTY_SELLER_ITEMS);
  if (!Array.isArray(v.partyBuyerItems)) v.partyBuyerItems = cloneItems(DEFAULT_PARTY_BUYER_ITEMS);
  return v;
}

/**
 * @param {PartyFieldItem[]} items
 * @param {(s: string) => string} esc
 */
export function renderPartyItemsInnerHtml(items, esc) {
  const lines = [];
  for (const item of items || []) {
    const label = String(item?.label ?? '').trim();
    if (!label) continue;
    let value = String(item?.value ?? '').trim();
    if (!value && item?.fallback) {
      if (item.fallback === PARTY_FALLBACK_COMPANY) value = '{{COMPANY_NAME_ZH}}';
      else if (item.fallback === PARTY_FALLBACK_CUSTOMER) value = '{{CUSTOMER_NAME}}';
      else value = String(item.fallback).trim();
    }
    lines.push(`${esc(label)}：${esc(value)}`);
  }
  return lines.join('<br>\n        ');
}

export function createEmptyPartyItem() {
  return { label: '', value: '' };
}
