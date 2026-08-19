import {
  DEFAULT_ORDER_LIST_COL_VISIBLE,
  ORDER_LIST_FILTERS_SESSION_KEY
} from '../utils/salesOrderListPrefs.js';

export const SALES_ORDER_SEARCH_FIELD_LABELS = {
  customer_name: '客户名称',
  customer_code: '客户编号',
  product_model: '标签型号',
  warehouse_model: '仓库型号',
  order_no: '订单号'
};

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

export function buildSalesOrderQueryParams({
  filters,
  dateRange,
  page,
  pageSize,
  sort,
  focusOrderId,
  customerListNameMode
}) {
  const hasDateRange = Array.isArray(dateRange) && dateRange.length === 2;
  const [df, dt] = hasDateRange ? dateRange : [];
  const searchParam = {};
  if (filters.searchField && filters.searchValue) {
    searchParam[filters.searchField] = filters.searchValue;
  }
  const params = {
    ...searchParam,
    customer_code: filters.customer_code || undefined,
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
  if (customerListNameMode === 'full' || customerListNameMode === 'short') {
    params.customer_list_name_mode = customerListNameMode;
  }
  return params;
}

export async function loadSalesOrderList({ listApi, params, silent = false }) {
  return listApi(params, { silent });
}

/** 当前筛选条件对应的标签（不含 onClose，由页面绑定清除动作） */
export function buildSalesOrderActiveFilterTags({
  filters,
  dateRange,
  focusOrderId,
  statusOptions = []
}) {
  const tags = [];
  const sv = String(filters?.searchValue || '').trim();
  if (sv) {
    const fieldLabel = SALES_ORDER_SEARCH_FIELD_LABELS[filters.searchField] || '搜索';
    tags.push({ key: 'search', label: `${fieldLabel}：${sv}` });
  }
  if (filters?.flow_bucket) {
    const opt = statusOptions.find((s) => s.value === filters.flow_bucket);
    tags.push({ key: 'flow_bucket', label: opt?.label || filters.flow_bucket });
  }
  if (filters?.status) {
    const opt = statusOptions.find((s) => s.value === filters.status);
    tags.push({ key: 'status', label: opt?.label || filters.status });
  }
  if (filters?.pending_finance_only) {
    tags.push({ key: 'pending_finance_only', label: '待财务审核（快捷视图）' });
  }
  if (filters?.pending_qc_only) {
    tags.push({ key: 'pending_qc_only', label: '待品管审核（快捷视图）' });
  }
  if (filters?.customer_code) {
    tags.push({ key: 'customer_code', label: `客户编号：${filters.customer_code}` });
  }
  if (Array.isArray(dateRange) && dateRange.length === 2) {
    tags.push({ key: 'date_range', label: `${dateRange[0]} 至 ${dateRange[1]}` });
  }
  if (focusOrderId != null && Number(focusOrderId) > 0) {
    tags.push({ key: 'focus_order', label: `定位订单 #${focusOrderId}` });
  }
  return tags;
}

export function shouldSkipFiltersSessionRestore(routeQuery) {
  const q = routeQuery || {};
  return !!(q.view || q.customer_code || q.focus_order_id || q.flow_bucket);
}

export function serializeSalesOrderFiltersSession(state) {
  return {
    filters: state.filters,
    dateRange: Array.isArray(state.dateRange) ? state.dateRange : [],
    page: state.page,
    pageSize: state.pageSize,
    listPrefs: {
      orderListColVisible: state.orderListColVisible,
      ordersVirtualTable: state.ordersVirtualTable,
      orderTableDesignMode: state.orderTableDesignMode,
      flowBoardRespectDate: state.flowBoardRespectDate
    }
  };
}

export function saveSalesOrderFiltersSession(state) {
  try {
    sessionStorage.setItem(
      ORDER_LIST_FILTERS_SESSION_KEY,
      JSON.stringify(serializeSalesOrderFiltersSession(state))
    );
  } catch {
    /* ignore */
  }
}

export function readSalesOrderFiltersSession() {
  try {
    const raw = sessionStorage.getItem(ORDER_LIST_FILTERS_SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return saved && typeof saved === 'object' ? saved : null;
  } catch {
    return null;
  }
}

export function clearSalesOrderFiltersSession() {
  try {
    sessionStorage.removeItem(ORDER_LIST_FILTERS_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** 将会话存储解析为页面可直接赋值的字段 */
export function parseSalesOrderFiltersSession(saved) {
  const lp = saved?.listPrefs;
  const listPrefs =
    lp && typeof lp === 'object'
      ? {
          orderListColVisible:
            lp.orderListColVisible && typeof lp.orderListColVisible === 'object'
              ? { ...DEFAULT_ORDER_LIST_COL_VISIBLE, ...lp.orderListColVisible }
              : null,
          ordersVirtualTable: typeof lp.ordersVirtualTable === 'boolean' ? lp.ordersVirtualTable : null,
          orderTableDesignMode:
            typeof lp.orderTableDesignMode === 'boolean' ? lp.orderTableDesignMode : null,
          flowBoardRespectDate:
            typeof lp.flowBoardRespectDate === 'boolean' ? lp.flowBoardRespectDate : null
        }
      : null;

  return {
    filters: { ...createDefaultSalesOrderFilters(), ...(saved.filters || {}) },
    dateRange: Array.isArray(saved.dateRange) ? saved.dateRange : [],
    page: Number.isFinite(Number(saved.page)) && Number(saved.page) > 0 ? Number(saved.page) : null,
    pageSize:
      Number.isFinite(Number(saved.pageSize)) && Number(saved.pageSize) > 0 ? Number(saved.pageSize) : null,
    listPrefs
  };
}
