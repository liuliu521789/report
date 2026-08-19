import { ORDERS_AUTO_REFRESH_MS } from '../utils/salesOrderListPrefs.js';

export const INBOX_AUTO_REFRESH_MS = 15000;
export const VISIBILITY_REFRESH_DEBOUNCE_MS = 1500;

/**
 * 订单列表轮询：列表+看板合并刷新、站内信、visibility 防抖、loadSeq。
 * 供 Options API 页面在 mounted/beforeUnmount 中挂载。
 */
export function createSalesOrderPollingController(ctx) {
  let ordersTimer = null;
  let inboxTimer = null;
  let visibilityHandler = null;
  let visibilityDebounceTimer = null;
  let loadSeq = 0;

  function nextLoadSeq() {
    loadSeq += 1;
    return loadSeq;
  }

  function isLatestLoadSeq(seq) {
    return seq === loadSeq;
  }

  function canRun() {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
    if (ctx.isBlockedByPasswordPolicy?.()) return false;
    return true;
  }

  function refreshOrdersSilent() {
    if (!canRun()) return;
    if (!ctx.canQueryOrders?.()) return;
    ctx.refreshOrdersSilent?.();
  }

  function refreshInboxIfOpen() {
    if (!canRun()) return;
    if (!ctx.isInboxDrawerOpen?.()) return;
    ctx.refreshInbox?.();
  }

  function onVisibility() {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer);
    visibilityDebounceTimer = setTimeout(() => {
      visibilityDebounceTimer = null;
      refreshInboxIfOpen();
      refreshOrdersSilent();
    }, VISIBILITY_REFRESH_DEBOUNCE_MS);
  }

  function start() {
    stop();
    ordersTimer = setInterval(refreshOrdersSilent, ORDERS_AUTO_REFRESH_MS);
    inboxTimer = setInterval(refreshInboxIfOpen, INBOX_AUTO_REFRESH_MS);
    visibilityHandler = onVisibility;
    document.addEventListener('visibilitychange', visibilityHandler);
  }

  function stop() {
    if (ordersTimer) {
      clearInterval(ordersTimer);
      ordersTimer = null;
    }
    if (inboxTimer) {
      clearInterval(inboxTimer);
      inboxTimer = null;
    }
    if (visibilityDebounceTimer) {
      clearTimeout(visibilityDebounceTimer);
      visibilityDebounceTimer = null;
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
  }

  return {
    start,
    stop,
    nextLoadSeq,
    isLatestLoadSeq
  };
}
