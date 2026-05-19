/**
 * 与 server/src/lib/salesOrderFields.js 中 mergeRowDataJson、prepareOrderRowForContractHtml、legacyRowToDataJson 一致（浏览器端）。
 * 合同预览等场景：将 data_json 字段按 maps_to 展开到行顶层，供合同明细计算。
 */

function parseJsonMaybe(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

export function legacyRowToDataJson(row) {
  const o = {};
  if (!row) return o;
  const map = {
    customer_code: row.customer_code,
    customer_name: row.customer_name,
    product_code: row.product_code,
    product_name: row.product_name,
    product_model: row.product_model,
    warehouse_model: row.warehouse_model,
    quantity: row.quantity,
    unit_price: row.unit_price,
    amount: row.amount,
    remark: row.remark
  };
  for (const [k, v] of Object.entries(map)) {
    if (v !== undefined && v !== null && v !== '') o[k] = v;
  }
  return o;
}

export function mergeRowDataJson(row, definitions) {
  const dj = parseJsonMaybe(row.data_json);
  const legacy = legacyRowToDataJson(row);
  const base =
    dj && typeof dj === 'object' && !Array.isArray(dj) ? { ...legacy, ...dj } : { ...legacy };
  const display = {};
  for (const d of (definitions || []).filter((x) => x.is_active)) {
    display[d.field_key] = base[d.field_key] ?? '';
  }
  return { dataJson: base, display_data: display };
}

function pickUnitPriceFromBase(base, definitions, display_data) {
  const tryNum = (v) => {
    const n = Number(v);
    return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null;
  };
  for (const d of definitions || []) {
    if (d.maps_to === 'unit_price') {
      const n = tryNum(base?.[d.field_key]);
      if (n != null) return n;
    }
  }
  const priceDef = (definitions || []).find(
    (d) => /价格|单价|售价|price/i.test(d.label_zh || '') && d.maps_to !== 'unit_price'
  );
  if (priceDef) {
    const fromDisplay = tryNum(display_data?.[priceDef.field_key]);
    if (fromDisplay != null) return fromDisplay;
    const fromBase = tryNum(base?.[priceDef.field_key]);
    if (fromBase != null) return fromBase;
  }
  for (const k of ['unit_price', 'price', 'unitPrice']) {
    const n = tryNum(base?.[k]);
    if (n != null) return n;
  }
  return null;
}

export function prepareOrderRowForContractHtml(row, definitions) {
  if (!row || !definitions?.length) return row;
  const { dataJson: base, display_data } = mergeRowDataJson(row, definitions);
  const keyFor = (m) => definitions.find((d) => d.maps_to === m)?.field_key;
  const pick = (mapsTo, fallback) => {
    const key = keyFor(mapsTo);
    if (
      key != null &&
      display_data[key] !== undefined &&
      display_data[key] !== null &&
      String(display_data[key]).trim() !== ''
    ) {
      return display_data[key];
    }
    if (fallback !== undefined && fallback !== null && String(fallback).trim() !== '') {
      return fallback;
    }
    return undefined;
  };
  let unitPrice = pick('unit_price', row.unit_price);
  if (unitPrice == null || Number(unitPrice) <= 0) {
    const fromBase = pickUnitPriceFromBase(base, definitions, display_data);
    if (fromBase != null) unitPrice = fromBase;
  }
  const out = {
    ...row,
    display_data,
    quantity: pick('quantity', row.quantity),
    product_name: pick('product_name', row.product_name),
    product_model: pick('product_model', row.product_model),
    unit_price: unitPrice,
    amount: pick('amount', row.amount)
  };
  const tr = pick('tax_rate', row.tax_rate);
  const vr = pick('vat_rate', row.vat_rate);
  if (tr !== undefined) out.tax_rate = tr;
  if (vr !== undefined) out.vat_rate = vr;
  return out;
}
