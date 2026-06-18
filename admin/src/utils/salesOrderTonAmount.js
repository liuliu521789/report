/**
 * 订单「吨数 × 含税单价」金额试算（与 server/src/lib/salesOrderFields.js 一致）
 * 单价在订单列表以元/kg 展示，计算时自动 ×1000 换算为元/吨；金额（价税合计）= 单价 × 吨数；吨数 = 数量 × 规格（千克加 kg 等后缀时 ÷1000）。
 */

export function parseQuantityToLegacyNumber(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 0 ? raw : 0;
  }
  const m = String(raw).match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function specNumericToTonFactor(specText) {
  const raw = String(specText ?? '');
  const n = parseQuantityToLegacyNumber(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/千克|公斤|kg/i.test(raw)) return n / 1000;
  return n;
}

export function tonsFromQtyAndSpec(qtyRaw, specText) {
  const q = parseQuantityToLegacyNumber(qtyRaw);
  const factor = specNumericToTonFactor(specText);
  if (!Number.isFinite(q) || q <= 0 || factor == null) return null;
  const tons = q * factor;
  if (!Number.isFinite(tons) || tons <= 0) return null;
  return Math.round(tons * 100) / 100;
}

/** 本批数量（kg）= 数量 × 规格；规格含 kg 时直接乘，含吨或无单位时按吨系数 ×1000 */
export function kgFromQtyAndSpec(qtyRaw, specText) {
  const q = parseQuantityToLegacyNumber(qtyRaw);
  const raw = String(specText ?? '');
  const n = parseQuantityToLegacyNumber(raw);
  if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(n) || n <= 0) return null;
  let kgPerUnit;
  if (/千克|公斤|kg/i.test(raw)) {
    kgPerUnit = n;
  } else {
    kgPerUnit = n * 1000;
  }
  const kg = q * kgPerUnit;
  if (!Number.isFinite(kg) || kg <= 0) return null;
  return Math.round(kg * 100) / 100;
}

export function roundOrderDecimal4(n) {
  if (n == null || n === '') return 0;
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10000) / 10000;
}

/** 价税合计（元）= 含税单价 × 吨；无法算吨时返回 null */
export function grossAmountFromQtySpecUnitPrice(quantityRaw, specText, unitPriceRaw) {
  const tons = tonsFromQtyAndSpec(quantityRaw, specText);
  const up = typeof unitPriceRaw === 'number' ? unitPriceRaw : Number(unitPriceRaw);
  if (tons == null || !Number.isFinite(up) || up <= 0) return null;
  return roundOrderDecimal4(up * tons);
}

/**
 * @param {{ display_data?: Record<string, unknown> } | null} row
 * @param {{ maps_to?: string, field_key: string }[]} definitions
 */
export function grossAmountFromRowDisplayData(row, definitions) {
  if (!row?.display_data || !definitions?.length) return null;
  const key = (m) => definitions.find((d) => d.maps_to === m)?.field_key;
  const kq = key('quantity');
  const ks = key('product_name');
  const ku = key('unit_price');
  if (!kq || !ks || !ku) return null;
  return grossAmountFromQtySpecUnitPrice(row.display_data[kq], row.display_data[ks], row.display_data[ku]);
}
