/**
 * 订单列表「厂家」列展示名：与 admin/src/utils/salesOrderDisplayMerge.js orderListCustomerDisplayName 一致。
 * @param {Record<string, unknown> | null | undefined} row
 * @param {'short' | 'full'} [mode]
 */
export function orderListCustomerDisplayName(row, mode = 'short') {
  const full = String(row?.customer_name ?? '').trim();
  const short = String(row?.contact_name ?? '').trim();
  if (mode === 'full') return full || short;
  return short || full;
}
