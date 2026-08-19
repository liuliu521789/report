import { formatBatchWeight, formatPackingValue, specTextToPackingKg } from './reportQtyFields.js';
import { kgFromQtyAndSpec } from './salesOrderTonAmount.js';

/** 从订单行 display_data / 旧列读取 maps_to 对应值 */
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

/**
 * 订单 → 新建报告字段预填
 * - 产品名称：标签型号 product_model（与质检自动匹配一致）
 * - 包装规格：订单「规格」product_name
 * - 生产批号：批号 product_code
 * - 本批数量：数量 × 规格（kg）
 */
export function buildOrderReportPrefill(row, fieldDefinitions) {
  const productName = orderValueByMapsTo(row, fieldDefinitions, 'product_model');
  const batchNo = orderValueByMapsTo(row, fieldDefinitions, 'product_code');
  const quantityRaw = orderValueByMapsTo(row, fieldDefinitions, 'quantity');
  const specRaw = orderValueByMapsTo(row, fieldDefinitions, 'product_name');

  const packingKg = specTextToPackingKg(specRaw);
  const packing = formatPackingValue(packingKg);
  const kg = kgFromQtyAndSpec(quantityRaw, specRaw);
  const batch_weight = formatBatchWeight(kg);

  return {
    orderId: row?.id,
    orderNo: row?.order_no || '',
    customerId: row?.customerId ?? (row?.customer_id != null ? Number(row.customer_id) : null),
    customerName: String(row?.customerName ?? row?.customer_name ?? '').trim(),
    customerContact: String(row?.customerContact ?? row?.customer_contact ?? row?.contact_name ?? '').trim(),
    product_name: { zh: productName, en: productName },
    packing,
    batch_no: { zh: batchNo, en: batchNo },
    batch_weight
  };
}
