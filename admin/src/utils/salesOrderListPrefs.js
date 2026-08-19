export const CUSTOMER_LIST_NAME_MODE_KEY = 'sales_orders_list_customer_name_mode';
export const ORDER_LIST_PREFS_KEY = 'sales_orders_list_prefs';
export const ORDER_LIST_FILTERS_SESSION_KEY = 'sales_orders_list_filters_session';
export const ORDERS_AUTO_REFRESH_MS = 30000;
export const SALES_ORDER_EXPORT_LIMIT = 5000;

export const DEFAULT_ORDER_LIST_COL_VISIBLE = {
  orderNo: false,
  sales: false,
  shipper: false,
  uploadedAt: false
};

export function readOrderListPrefs() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ORDER_LIST_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function buildInitialOrderListPrefs() {
  const prefs = readOrderListPrefs();
  const col = prefs?.colVisible;
  return {
    orderListColVisible: {
      ...DEFAULT_ORDER_LIST_COL_VISIBLE,
      orderNo: col?.orderNo === true,
      sales: col?.sales === true,
      shipper: col?.shipper === true,
      uploadedAt: col?.uploadedAt === true
    },
    ordersVirtualTable: prefs?.virtualTable === true,
    orderTableDesignMode: prefs?.designMode === true,
    flowBoardRespectDate: prefs?.flowBoardRespectDate === true
  };
}

export function readCustomerListNameMode() {
  if (typeof localStorage === 'undefined') return 'short';
  return localStorage.getItem(CUSTOMER_LIST_NAME_MODE_KEY) === 'full' ? 'full' : 'short';
}

export function persistCustomerListNameMode(mode) {
  try {
    localStorage.setItem(CUSTOMER_LIST_NAME_MODE_KEY, mode === 'full' ? 'full' : 'short');
  } catch {
    /* ignore */
  }
}

export function persistOrderListPrefs({
  orderListColVisible,
  ordersVirtualTable,
  orderTableDesignMode,
  flowBoardRespectDate
}) {
  try {
    localStorage.setItem(
      ORDER_LIST_PREFS_KEY,
      JSON.stringify({
        colVisible: orderListColVisible,
        virtualTable: ordersVirtualTable,
        designMode: orderTableDesignMode,
        flowBoardRespectDate
      })
    );
  } catch {
    /* ignore */
  }
}
