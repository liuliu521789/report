export function createDefaultSalesOrderFilters() {
  return {
    customer_name: '',
    customer_code: '',
    product_name: '',
    product_model: '',
    warehouse_model: '',
    product_code: '',
    order_no: '',
    status: '',
    pending_finance_only: false,
    pending_qc_only: false
  };
}

export function buildSalesOrderQueryParams({ filters, dateRange, page, pageSize, sort, focusOrderId }) {
  const hasDateRange = Array.isArray(dateRange) && dateRange.length === 2;
  const [df, dt] = hasDateRange ? dateRange : [];
  const params = {
    customer_name: filters.customer_name || undefined,
    customer_code: filters.customer_code || undefined,
    product_name: filters.product_name || undefined,
    product_model: filters.product_model || undefined,
    warehouse_model: filters.warehouse_model || undefined,
    product_code: filters.product_code || undefined,
    order_no: filters.order_no || undefined,
    status: filters.status || undefined,
    date_from: df || undefined,
    date_to: dt || undefined,
    page,
    page_size: pageSize,
    sort,
    pending_finance_only: filters.pending_finance_only ? '1' : undefined,
    pending_qc_only: filters.pending_qc_only ? '1' : undefined
  };
  if (Number.isFinite(focusOrderId) && focusOrderId > 0) {
    params.id = focusOrderId;
  }
  return params;
}

export async function loadSalesOrderList({ listApi, params, silent = false }) {
  return listApi(params, { silent });
}
