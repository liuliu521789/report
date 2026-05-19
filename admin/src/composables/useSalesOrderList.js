export function createDefaultSalesOrderFilters() {
  return {
    searchField: 'customer_name',
    searchValue: '',
    status: '',
    flow_bucket: '',
    pending_finance_only: false,
    pending_qc_only: false
  };
}

export function buildSalesOrderQueryParams({ filters, dateRange, page, pageSize, sort, focusOrderId }) {
  const hasDateRange = Array.isArray(dateRange) && dateRange.length === 2;
  const [df, dt] = hasDateRange ? dateRange : [];
  const searchParam = {};
  if (filters.searchField && filters.searchValue) {
    searchParam[filters.searchField] = filters.searchValue;
  }
  const params = {
    ...searchParam,
    status: filters.status || undefined,
    date_from: df || undefined,
    date_to: dt || undefined,
    page,
    page_size: pageSize,
    sort,
    pending_finance_only: filters.pending_finance_only ? '1' : undefined,
    pending_qc_only: filters.pending_qc_only ? '1' : undefined,
    flow_bucket: filters.flow_bucket || undefined
  };
  if (Number.isFinite(focusOrderId) && focusOrderId > 0) {
    params.id = focusOrderId;
  }
  return params;
}

export async function loadSalesOrderList({ listApi, params, silent = false }) {
  return listApi(params, { silent });
}
