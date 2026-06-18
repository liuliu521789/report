import { formatBatchWeight, formatPackingValue, specTextToPackingKg } from './reportQtyFields.js';
import { parseQuantityToLegacyNumber } from './salesOrderFields.js';

/** 本批数量（kg）= 数量 × 规格 */
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

export function orderValueByMapsTo(row, fieldDefinitions, mapsTo) {
  const def = fieldDefinitions?.find((d) => d.maps_to === mapsTo);
  if (def) {
    const v = row?.display_data?.[def.field_key];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  const legacy = row?.[mapsTo];
  if (legacy != null && String(legacy).trim() !== '') return String(legacy).trim();
  return '';
}

/** 订单 → 新建报告字段预填 */
export function buildOrderReportPrefill(row, fieldDefinitions) {
  const productName = orderValueByMapsTo(row, fieldDefinitions, 'product_model');
  const batchNo = orderValueByMapsTo(row, fieldDefinitions, 'product_code');
  const quantityRaw = orderValueByMapsTo(row, fieldDefinitions, 'quantity');
  const specRaw = orderValueByMapsTo(row, fieldDefinitions, 'product_name');

  const packingKg = specTextToPackingKg(specRaw);
  const packing = formatPackingValue(packingKg);
  const kg = kgFromQtyAndSpec(quantityRaw, specRaw);
  const batch_weight = formatBatchWeight(kg);

  const customerId =
    row?.customer_id != null && Number(row.customer_id) > 0 ? Number(row.customer_id) : null;
  const customerName = String(row?.customer_name || '').trim();
  const customerContact = String(row?.customer_contact || row?.contact_name || '').trim();

  return {
    orderId: row?.id,
    orderNo: row?.order_no || '',
    customerId,
    customerName,
    customerContact,
    product_name: { zh: productName, en: productName },
    packing,
    batch_no: { zh: batchNo, en: batchNo },
    batch_weight
  };
}
