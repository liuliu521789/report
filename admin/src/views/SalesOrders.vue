<template>
  <div class="sales-orders" :class="{ 'sales-orders--touch': isTouchLike || isMobile }">
    <SalesOrderListToolbar
      v-model:filters="filters"
      v-model:date-range="dateRange"
      v-model:status-filter-selection="statusFilterSelection"
      v-model:mobile-batch-open="mobileBatchOpen"
      :is-mobile="isMobile"
      :status-options="statusOptions"
      :active-filter-tags="activeFilterTags"
      :has-active-filters="hasActiveFilters"
      :order-date-range-start-ph="orderDateRangeStartPh"
      :order-date-range-end-ph="orderDateRangeEndPh"
      :show-toolbar-manage-menu="showToolbarManageMenu"
      :can-export="canExport"
      :exporting="exporting"
      v-bind="batchActionProps"
      @search-input="onSearchInput"
      @load-now="loadNow"
      @load="load"
      @reset-filters="resetFilters"
      @status-filter-change="onStatusFilterChange"
      @open-create="openCreate"
      @toolbar-manage="onToolbarManageCommand"
      @import-file="onImportFile"
      @export-xlsx="exportXlsx"
      @download-template="downloadTpl"
      @batch-submit="batchSubmitReview"
      @batch-withdraw="batchWithdrawReview"
      @open-finance-batch="openFinanceBatch"
      @open-qc-batch="openQcReviewBatch"
      @open-ship-batch="openShipBatch"
      @batch-delete="batchDeleteOrders"
      @open-contract-gen="openContractGen"
    />

    <div class="table-wrap" :class="{ 'table-wrap--batch-active': effectiveSelected.length > 0 }">
      <SalesOrderDesktopTable
        v-if="!isMobile"
        ref="desktopTable"
        :items="items"
        :total="total"
        :loading="loading"
        :handlers="listHandlers"
        :format-date="formatListDate"
        :flow-summary="flowSummary"
        :sla-summary="flowSlaSummary"
        :flow-bucket="filters.flow_bucket"
        :flow-board-respect-date="flowBoardRespectDate"
        :flow-sla-loading="flowSlaLoading"
        :order-list-col-visible="orderListColVisible"
        v-model:orders-virtual-table="ordersVirtualTable"
        v-model:order-table-design-mode="orderTableDesignMode"
        :customer-list-name-mode="customerListNameMode"
        :order-list-field-definitions="orderListFieldDefinitions"
        :show-order-header-design="showOrderHeaderDesign"
        :show-order-row-selection="showOrderRowSelection"
        :show-order-list-contract-col="showOrderListContractCol"
        :show-order-list-qc-col="showOrderListQcCol"
        :orders-v2-columns="ordersV2Columns"
        :orders-v2-row-event-handlers="ordersV2RowEventHandlers"
        :list-empty-description="listEmptyDescription"
        :list-empty-is-filtered="listEmptyIsFiltered"
        :last-list-synced-label="lastListSyncedLabel"
        @flow-board-select="onFlowBoardSelect"
        @update:flow-board-respect-date="onFlowBoardRespectDateChange"
        @refresh="refreshListManual"
        @virtual-table-change="onOrdersVirtualTableChange"
        @design-mode-change="onOrderTableDesignModeChange"
        @reset-filters="resetFilters"
        @open-create="openCreate"
        @download-template="downloadTpl"
        @selection-change="onOrdersSelectionChange"
        @row-dblclick="onOrderRowDblClick"
      />

      <SalesOrderMobileList
        v-if="isMobile"
        :items="items"
        :loading="loading"
        :handlers="listHandlers"
        :flow-summary="flowSummary"
        :sla-summary="flowSlaSummary"
        :flow-bucket="filters.flow_bucket"
        :flow-board-respect-date="flowBoardRespectDate"
        :flow-sla-loading="flowSlaLoading"
        :show-order-row-selection="showOrderRowSelection"
        :v2-selected-ids="v2SelectedIds"
        :selected-count="effectiveSelected.length"
        :selected-count-label="selectedCountLabel"
        :mobile-page-all-selected="mobilePageAllSelected"
        :mobile-page-indeterminate="mobilePageIndeterminate"
        :focus-order-id="focusOrderId"
        :mobile-preview-fields="mobilePreviewFields"
        :order-list-col-visible="orderListColVisible"
        :list-empty-description="listEmptyDescription"
        :list-empty-is-filtered="listEmptyIsFiltered"
        :last-list-synced-label="lastListSyncedLabel"
        :is-order-highlighted="isOrderHighlighted"
        @refresh="refreshListManual"
        @flow-board-select="onFlowBoardSelect"
        @update:flow-board-respect-date="onFlowBoardRespectDateChange"
        @mobile-page-select-all="onMobilePageSelectAll"
        @row-dblclick="onOrderRowDblClick"
        @v2-row-pick="onV2RowPick"
        @reset-filters="resetFilters"
        @open-create="openCreate"
        @download-template="downloadTpl"
      />

      <div class="pager">
        <el-select v-model="pageSize" class="w100" @change="load">
          <el-option :value="10" label="10 条/页" />
          <el-option :value="20" label="20 条/页" />
          <el-option :value="50" label="50 条/页" />
          <el-option :value="100" label="100 条/页" />
          <el-option :value="200" label="200 条/页" />
          <el-option :value="500" label="500 条/页" />
        </el-select>
        <el-pagination
          layout="prev, pager, next, total"
          :total="total"
          :page-size="pageSize"
          :current-page="page"
          @current-change="(p) => { page = p; load(); }"
        />
      </div>

      <SalesOrderBatchBar
        anchor-selector=".sales-orders .table-wrap"
        v-bind="batchActionProps"
        :selected-rows="effectiveSelected"
        @clear-selection="clearAllOrderSelection"
        @batch-submit="batchSubmitReview"
        @batch-withdraw="batchWithdrawReview"
        @open-finance-batch="openFinanceBatch"
        @open-qc-batch="openQcReviewBatch"
        @open-ship-batch="openShipBatch"
        @batch-delete="batchDeleteOrders"
        @open-contract-gen="openContractGen"
      />
    </div>

    <SalesOrderFormDialog
      v-model="formDialogVisible"
      :edit-row="formDialogEditRow"
      :field-definitions="fieldDefinitions"
      @success="onFormDialogSuccess"
    />

    <SalesOrderLogsDialog
      v-model:visible="logsDialogVisible"
      :mode="logsDialogMode"
      :contract-rows="logsDialogContractRows"
      :status-logs="logsDialogStatusLogs"
      :edit-logs="logsDialogEditLogs"
      :field-definitions="fieldDefinitions"
    />

    <SalesOrderReviewDialog
      v-model:visible="reviewDialogVisible"
      :kind="reviewDialogKind"
      :rows="reviewDialogRows"
      @success="onReviewSuccess"
    />

    <SalesOrderShipDialog
      v-model:visible="shipDialogVisible"
      :row="shipDialogRow"
      :batch-list="shipDialogBatchList"
      @success="onShipSuccess"
    />

    <SalesOrderContractGenDialog
      v-model:visible="genDialogVisible"
      :order-ids="genDialogOrderIds"
      @success="onGenSuccess"
    />

    <SalesOrderBindContractDialog
      v-model:visible="bindContractDialogVisible"
      :order-id="bindContractDialogOrderId"
      :customer-name="bindContractDialogCustomerName"
      :customer-id="bindContractDialogCustomerId"
      @success="onBindContractSuccess"
    />

    <SalesOrderContractPreviewDialog
      v-model="contractPreviewDialogVisible"
      :contract-id="contractPreviewDialogContractId"
      :field-definitions="fieldDefinitions"
    />

    <SalesOrderFieldManageDialog
      v-model:visible="fieldManageDialogVisible"
      :schema-version="fieldSchemaVersion"
      @changed="onFieldManageChanged"
    />

    <SalesOrderQcBindDialog
      v-model:visible="qcBindDialogVisible"
      :order-id="qcBindDialogOrderId"
      @success="onQcBindSuccess"
    />

    <SalesOrderMessagesDrawer
      ref="messagesDrawerRef"
      v-model:visible="messagesDrawerVisible"
      :show-messages="showMessages"
      @unread-changed="onUnreadChanged"
    />

    <SalesOrderImportDupDialog
      v-model:visible="importDupDialogVisible"
      :summary="importDupDialogSummary"
      :rows="importDupDialogRows"
    />

    <SalesOrderImportErrorsDialog
      v-model:visible="importErrorsDialogVisible"
      :rows="importErrorsDialogRows"
    />
  </div>
</template>

<script>
import { perm, isSuperAdmin } from '../utils/permissions';
import {
  listSalesOrders,
  submitSalesOrderReview,
  batchSubmitSalesOrderReview,
  withdrawSalesOrderReview,
  batchWithdrawSalesOrderReview,
  batchFinanceReviewSalesOrder,
  batchQcReviewSalesOrder,
  completeSalesOrder,
  cancelSalesOrder,
  deleteSalesOrder,
  batchDeleteSalesOrders,
  listCustomerContracts,
  listSalesOrderStatusLogs,
  listSalesOrderEditLogs,
  listSalesOrderFields,
  getSalesOrderFlowSummary,
  getSalesOrderSlaSummary,
  getSalesOrderFlowConfig,
  patchSalesOrderQcQrcode
} from '../api';
import { downloadContractFile, contractDownloadErrorMessage } from '../utils/contractDownload.js';
import { defineAsyncComponent, h } from 'vue';
import { ElButton, ElIcon } from 'element-plus';
import { startDownload } from '../composables/useDownloadProgress.js';
import {
  downloadSalesOrderImportTemplateFile,
  importSalesOrderXlsxFile,
  parseSalesOrderImportError,
  buildExcelDuplicateConfirmMessage,
  summarizeImportResult,
  exportSalesOrdersXlsx,
  buildImportDupDialogSummary
} from '../composables/useSalesOrderImportExport.js';
import { createSalesOrderPollingController } from '../composables/useSalesOrderPolling.js';
import SalesOrderListToolbar from './sales-orders/SalesOrderListToolbar.vue';
import SalesOrderDesktopTable from './sales-orders/SalesOrderDesktopTable.vue';
import SalesOrderMobileList from './sales-orders/SalesOrderMobileList.vue';
import SalesOrderBatchBar from './sales-orders/SalesOrderBatchBar.vue';

const SalesOrderFormDialog = defineAsyncComponent(() => import('./sales-orders/SalesOrderFormDialog.vue'));
const SalesOrderLogsDialog = defineAsyncComponent(() => import('./sales-orders/SalesOrderLogsDialog.vue'));
const SalesOrderReviewDialog = defineAsyncComponent(() => import('./sales-orders/SalesOrderReviewDialog.vue'));
const SalesOrderShipDialog = defineAsyncComponent(() => import('./sales-orders/SalesOrderShipDialog.vue'));
const SalesOrderContractGenDialog = defineAsyncComponent(() =>
  import('./sales-orders/SalesOrderContractGenDialog.vue')
);
const SalesOrderBindContractDialog = defineAsyncComponent(() =>
  import('./sales-orders/SalesOrderBindContractDialog.vue')
);
const SalesOrderContractPreviewDialog = defineAsyncComponent(() =>
  import('./sales-orders/SalesOrderContractPreviewDialog.vue')
);
const SalesOrderFieldManageDialog = defineAsyncComponent(() =>
  import('./sales-orders/SalesOrderFieldManageDialog.vue')
);
const SalesOrderQcBindDialog = defineAsyncComponent(() => import('./sales-orders/SalesOrderQcBindDialog.vue'));
const SalesOrderMessagesDrawer = defineAsyncComponent(() =>
  import('./sales-orders/SalesOrderMessagesDrawer.vue')
);
const SalesOrderImportDupDialog = defineAsyncComponent(() =>
  import('./sales-orders/SalesOrderImportDupDialog.vue')
);
const SalesOrderImportErrorsDialog = defineAsyncComponent(() =>
  import('./sales-orders/SalesOrderImportErrorsDialog.vue')
);
import {
  orderFlowStatusZh,
  SALES_ORDER_STATUS_FILTER_OPTIONS,
  isSalesOrderFlowBucketKey
} from '../utils/salesStatusDisplay';
import { useAuthStore } from '../stores/auth';
import {
  createDefaultSalesOrderFilters,
  buildSalesOrderQueryParams,
  loadSalesOrderList,
  saveSalesOrderFiltersSession,
  readSalesOrderFiltersSession,
  parseSalesOrderFiltersSession,
  clearSalesOrderFiltersSession,
  shouldSkipFiltersSessionRestore,
  buildSalesOrderActiveFilterTags,
  SALES_ORDER_SEARCH_FIELD_LABELS
} from '../composables/useSalesOrderList';
import { grossAmountFromRowDisplayData } from '../utils/salesOrderTonAmount';
import { orderListCustomerDisplayName } from '../utils/salesOrderDisplayMerge';
import {
  buildOrderReportPrefill,
  REPORT_PREFILL_FROM_ORDER_KEY
} from '../utils/orderReportPrefill';
import {
  detectOrderRowActionProfile
} from '../utils/orderRowActionSplit';
import {
  batchDeleteConfirmMessage,
  batchSubmitConfirmMessage,
  batchSubmitErrorLabel,
  batchWithdrawConfirmMessage,
  batchWithdrawErrorLabel,
  buildBatchActionButtonLabel,
  buildBatchActionTooltip,
  summarizeBatchPartialFailure
} from '../utils/salesOrderBatchUi';
import {
  buildInitialOrderListPrefs,
  persistCustomerListNameMode,
  persistOrderListPrefs as persistOrderListPrefsStore,
  readCustomerListNameMode
} from '../utils/salesOrderListPrefs';
import { buildOrdersV2Columns, scaleOrdersV2Columns as scaleOrderV2ColumnWidths } from '../utils/salesOrderV2Columns';
import {
  buildOrderRowActionNodes as buildOrderRowActionNodesUtil,
  collectSalesOrderRowActions,
  splitSalesOrderRowActions
} from '../utils/salesOrderRowActions';
import { attachQcThumbsToOrderRows, ensureQcQrThumb } from '../utils/qcQrThumb';

const INITIAL_ORDER_LIST_PREFS = buildInitialOrderListPrefs();

export default {
  name: 'SalesOrders',
  components: {
    SalesOrderFormDialog,
    SalesOrderLogsDialog,
    SalesOrderReviewDialog,
    SalesOrderShipDialog,
    SalesOrderContractGenDialog,
    SalesOrderBindContractDialog,
    SalesOrderContractPreviewDialog,
    SalesOrderFieldManageDialog,
    SalesOrderQcBindDialog,
    SalesOrderMessagesDrawer,
    SalesOrderImportDupDialog,
    SalesOrderImportErrorsDialog,
    SalesOrderListToolbar,
    SalesOrderDesktopTable,
    SalesOrderMobileList,
    SalesOrderBatchBar
  },
  data() {
    return {
      isMobile: false,
      isTouchLike: false,
      mobileBatchOpen: false,
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      selected: [],
      filters: createDefaultSalesOrderFilters(),
      dateRange: [],
      sort: 'created_at_desc',
      /** 路由 query focus_order_id：站内信跳转定位订单 */
      focusOrderId: null,
      /** 列表「厂家」列：short=简称 full=全称 */
      customerListNameMode: readCustomerListNameMode(),
      fieldDefinitions: [],
      exporting: false,
      loading: false,
      /** 虚拟滚动表格（Element Plus TableV2），大量行时减轻 DOM 压力 */
      ordersVirtualTable: INITIAL_ORDER_LIST_PREFS.ordersVirtualTable,
      /** 开启后在表头显示字段编辑/删除/新增列（需 order_field_config） */
      orderTableDesignMode: INITIAL_ORDER_LIST_PREFS.orderTableDesignMode,
      financeLoading: false,
      qcReviewLoading: false,
      /** 虚拟列表模式下按 id 勾选（与 items 行对象解耦） */
      v2SelectedIds: [],
      v2SelectedSnapshots: {},
      /** When true, ignore el-table selection-change (clearSelection/toggleRowSelection would otherwise wipe `selected`). */
      ordersTableSelectionSync: false,
      /** @type {ReturnType<typeof createSalesOrderPollingController> | null} */
      ordersPolling: null,
      /** 本次会话是否已提示过自动开启虚拟表 */
      virtualTablePromptHandled: false,
      flowSummary: {},
      flowSlaSummary: {},
      flowBoardRespectDate: INITIAL_ORDER_LIST_PREFS.flowBoardRespectDate,
      orderFlowConfig: null,
      flowSlaLoading: false,
      /** 来自 sales_settings.order_field_schema_version */
      fieldSchemaVersion: null,
      /** 列表默认隐藏：订单号、销售、上传日期、发货人（状态角标仍会尽量带出姓名） */
      orderListColVisible: { ...INITIAL_ORDER_LIST_PREFS.orderListColVisible },
      statusOptions: SALES_ORDER_STATUS_FILTER_OPTIONS,
      /* ---- 子组件代理属性 ---- */
      formDialogVisible: false,
      formDialogEditRow: null,
      logsDialogVisible: false,
      logsDialogMode: 'logs',
      logsDialogContractRows: [],
      logsDialogStatusLogs: [],
      logsDialogEditLogs: [],
      reviewDialogVisible: false,
      reviewDialogKind: 'finance',
      reviewDialogRows: [],
      shipDialogVisible: false,
      shipDialogRow: null,
      shipDialogBatchList: [],
      genDialogVisible: false,
      genDialogOrderIds: [],
      bindContractDialogVisible: false,
      bindContractDialogOrderId: null,
      bindContractDialogCustomerName: '',
      bindContractDialogCustomerId: null,
      contractPreviewDialogVisible: false,
      contractPreviewDialogContractId: null,
      fieldManageDialogVisible: false,
      qcBindDialogVisible: false,
      qcBindDialogOrderId: null,
      messagesDrawerVisible: false,
      unreadCount: 0,
      importDupDialogVisible: false,
      importDupDialogSummary: '',
      importDupDialogRows: [],
      importErrorsDialogVisible: false,
      importErrorsDialogRows: [],
      /** @type {ReturnType<typeof setTimeout> | null} */
      searchDebounceTimer: null,
      lastListSyncedLabel: '',
      highlightOrderIds: [],
      /** @type {ReturnType<typeof setTimeout> | null} */
      highlightOrderTimer: null,
      /** @type {ReturnType<typeof setTimeout> | null} */
      filtersSessionSaveTimer: null,
      filtersRestoredFromSession: false,
      /** @type {MediaQueryList | null} */
      touchMediaQuery: null
    };
  },
  computed: {
    isSuper() {
      return isSuperAdmin();
    },
    showOrderListUnitPrice() {
      return perm('order_management', 'order_list_unit_price');
    },
    showOrderListContractCol() {
      return perm('order_management', 'order_list_contract');
    },
    showOrderListQcCol() {
      return perm('order_management', 'order_list_qc_qrcode');
    },
    /** 表头字段设计模式：仅普通表格且用户主动开启 */
    showOrderHeaderDesign() {
      return (
        this.orderTableDesignMode &&
        perm('order_management', 'order_field_config') &&
        !this.ordersVirtualTable
      );
    },
    /** 列表动态列（录入表单仍用 fieldDefinitions） */
    orderListFieldDefinitions() {
      const defs = this.fieldDefinitions || [];
      if (!this.showOrderListUnitPrice) {
        return defs.filter((d) => d.maps_to !== 'unit_price');
      }
      const hasUnitPriceDef = defs.some((d) => d.maps_to === 'unit_price');
      if (hasUnitPriceDef) return defs;
      const hasPriceLikeDef = defs.some((d) => /单价|价格|售价|price/i.test(String(d?.label_zh || '')));
      if (hasPriceLikeDef) return defs;
      // 历史配置可能缺少 maps_to=unit_price；列表补一个只读兜底列，数据来自 row.unit_price
      return [
        ...defs,
        {
          field_key: '__legacy_unit_price',
          label_zh: '单价',
          field_type: 'number',
          required: false,
          sort_order: 9999,
          maps_to: 'unit_price',
          is_active: true
        }
      ];
    },
    /** 移动端卡片展示的前几列字段 */
    mobilePreviewFields() {
      return (this.orderListFieldDefinitions || []).slice(0, 6);
    },
    /** 状态下拉：流程阶段走 flow_bucket，已完成/已取消走 status */
    statusFilterSelection: {
      get() {
        return this.filters.flow_bucket || this.filters.status || '';
      },
      set(val) {
        if (val && isSalesOrderFlowBucketKey(val)) {
          this.filters.flow_bucket = val;
          this.filters.status = '';
        } else {
          this.filters.flow_bucket = '';
          this.filters.status = val || '';
        }
      }
    },
    searchFieldLabels() {
      return SALES_ORDER_SEARCH_FIELD_LABELS;
    },
    hasActiveFilters() {
      return this.activeFilterTags.length > 0;
    },
    showToolbarManageMenu() {
      return (
        perm('process_management', 'edit_flow') ||
        perm('order_management', 'order_field_config')
      );
    },
    listEmptyIsFiltered() {
      return this.hasActiveFilters;
    },
    listEmptyDescription() {
      return this.listEmptyIsFiltered ? '没有符合筛选条件的订单' : '暂无订单，可先录入或导入';
    },
    mobilePageSelectableRows() {
      return (this.items || []).filter((r) => this.orderRowSelectable(r));
    },
    mobilePageAllSelected() {
      const rows = this.mobilePageSelectableRows;
      if (!rows.length) return false;
      return rows.every((r) => this.v2SelectedIds.includes(r.id));
    },
    mobilePageIndeterminate() {
      const rows = this.mobilePageSelectableRows;
      if (!rows.length) return false;
      const picked = rows.filter((r) => this.v2SelectedIds.includes(r.id)).length;
      return picked > 0 && picked < rows.length;
    },
    activeFilterTags() {
      const closeMap = {
        search: () => this.clearSearchFilter(),
        flow_bucket: () => this.clearFlowBucketFilter(),
        status: () => this.clearTerminalStatusFilter(),
        pending_finance_only: () => this.clearQuickViewFilter(),
        pending_qc_only: () => this.clearQuickViewFilter(),
        customer_code: () => this.clearCustomerCodeFilter(),
        date_range: () => this.clearDateRangeFilter(),
        focus_order: () => this.clearFocusOrderFilter()
      };
      return buildSalesOrderActiveFilterTags({
        filters: this.filters,
        dateRange: this.dateRange,
        focusOrderId: this.focusOrderId,
        statusOptions: this.statusOptions
      }).map((t) => ({ ...t, onClose: closeMap[t.key] }));
    },
    canExport() {
      return (
        this.isSuper ||
        perm('data_management', 'data_export') ||
        perm('data_management', 'data_export_all')
      );
    },
    showMessages() {
      return (
        perm('order_management', 'order_submit') ||
        perm('order_management', 'order_status_finance') ||
        perm('order_management', 'order_status_qc') ||
        perm('contract_management', 'contract_submit') ||
        perm('contract_management', 'contract_review')
      );
    },
    /** 行操作外露策略：单角色用角色偏好，多角色按当前订单待办优先 */
    orderRowActionProfile() {
      return detectOrderRowActionProfile({
        hasFinance: perm('order_management', 'order_status_finance'),
        hasQc: perm('order_management', 'order_status_qc'),
        hasShip:
          perm('order_management', 'order_ship') ||
          perm('order_management', 'order_status_warehouse'),
        hasSales:
          perm('order_management', 'order_submit') ||
          perm('order_management', 'order_input')
      });
    },
    showOrderRowSelection() {
      return (
        this.isSuper ||
        perm('contract_management', 'contract_generate') ||
        perm('order_management', 'order_submit') ||
        perm('order_management', 'order_status_finance') ||
        perm('order_management', 'order_status_qc') ||
        perm('order_management', 'order_delete') ||
        perm('order_management', 'order_ship') ||
        perm('order_management', 'order_status_warehouse')
      );
    },
    batchShipActionVisible() {
      return (
        this.isSuper ||
        perm('order_management', 'order_ship') ||
        perm('order_management', 'order_status_warehouse')
      );
    },
    effectiveSelected() {
      if (this.ordersVirtualTable || this.isMobile) {
        const rows = this.v2SelectedIds.map((id) => this.v2SelectedSnapshots[id]).filter(Boolean);
        return this.filterSelectableOrderRows(rows);
      }
      return this.filterSelectableOrderRows(this.selected || []);
    },
    batchSubmittableList() {
      return this.effectiveSelected.filter((r) => this.canSubmit(r));
    },
    batchSubmitDisabled() {
      return this.batchSubmittableList.length === 0;
    },
    batchSubmitTipDisabled() {
      return !perm('order_management', 'order_submit') || !this.effectiveSelected.length;
    },
    batchSubmitButtonLabel() {
      return buildBatchActionButtonLabel({
        total: this.effectiveSelected.length,
        ok: this.batchSubmittableList.length,
        allLabel: '批量提交审核',
        partialVerb: '提交'
      });
    },
    batchSubmitTooltip() {
      return buildBatchActionTooltip({
        total: this.effectiveSelected.length,
        ok: this.batchSubmittableList.length,
        noneTip: '所选订单均不可提交（须本人创建且未提交过）',
        allTip: '将所选订单一并提交财务审核',
        partialTip: (total, ok) =>
          `已选 ${total} 条，其中 ${ok} 条可提交；点击将仅提交符合条件的订单`
      });
    },
    batchWithdrawableList() {
      return this.effectiveSelected.filter((r) => this.canWithdrawSubmit(r));
    },
    batchWithdrawDisabled() {
      return this.batchWithdrawableList.length === 0;
    },
    batchWithdrawTipDisabled() {
      return !perm('order_management', 'order_withdraw') || !this.effectiveSelected.length;
    },
    batchWithdrawButtonLabel() {
      return buildBatchActionButtonLabel({
        total: this.effectiveSelected.length,
        ok: this.batchWithdrawableList.length,
        allLabel: '批量撤回审核',
        partialVerb: '撤回'
      });
    },
    batchWithdrawTooltip() {
      return buildBatchActionTooltip({
        total: this.effectiveSelected.length,
        ok: this.batchWithdrawableList.length,
        noneTip: '所选订单均不可撤回（须本人创建且仍在首节点待审）',
        allTip: '将所选订单一并撤回审核申请，财务将收到汇总通知',
        partialTip: (total, ok) =>
          `已选 ${total} 条，其中 ${ok} 条可撤回；点击将仅撤回符合条件的订单`
      });
    },
    batchShippableList() {
      return this.effectiveSelected.filter((r) => this.canShip(r));
    },
    batchFinanceReviewableList() {
      return this.effectiveSelected.filter((r) => this.canFinanceReview(r));
    },
    batchQcReviewableList() {
      return this.effectiveSelected.filter((r) => this.canQcReview(r));
    },
    orderFlowSteps() {
      return Array.isArray(this.orderFlowConfig?.steps) ? this.orderFlowConfig.steps : [];
    },
    financeApproveNextStep() {
      const steps = this.orderFlowSteps;
      const idx = steps.findIndex((s) => s.node_type === 'finance_review');
      return idx >= 0 ? steps[idx + 1] || null : null;
    },
    financeApproveConfirmHint() {
      const next = this.financeApproveNextStep;
      return next ? `通过后进入${next.label}。` : '通过后进入待备货发货。';
    },
    financeApproveSuccessHint() {
      const next = this.financeApproveNextStep;
      return next ? `财务已通过，订单已进入${next.label}` : '财务已通过，订单已进入待备货发货';
    },
    batchDeletableList() {
      return this.effectiveSelected.filter((r) => this.canDelete(r));
    },
    batchDeleteDisabled() {
      return this.batchDeletableList.length === 0;
    },
    batchDeleteTipDisabled() {
      return !perm('order_management', 'order_delete') || !this.effectiveSelected.length;
    },
    batchDeleteButtonLabel() {
      return buildBatchActionButtonLabel({
        total: this.effectiveSelected.length,
        ok: this.batchDeletableList.length,
        allLabel: '批量删除',
        partialVerb: '删除'
      });
    },
    batchDeleteTooltip() {
      return buildBatchActionTooltip({
        total: this.effectiveSelected.length,
        ok: this.batchDeletableList.length,
        noneTip: '所选订单均不可删除（无权限或状态不允许）',
        allTip: '永久删除所选订单，不可恢复',
        partialTip: (total, ok) =>
          `已选 ${total} 条，其中 ${ok} 条可删除；点击将仅删除符合条件的订单`
      });
    },
    ordersV2RowEventHandlers() {
      return {
        onDblclick: ({ rowData }) => {
          this.onOrderRowDblClick(rowData);
        }
      };
    },
    ordersV2Columns() {
      return buildOrdersV2Columns({
        showOrderRowSelection: this.showOrderRowSelection,
        orderListColVisible: this.orderListColVisible,
        customerListNameMode: this.customerListNameMode,
        orderListFieldDefinitions: this.orderListFieldDefinitions,
        v2SelectedIds: this.v2SelectedIds,
        orderRowSelectable: (row) => this.orderRowSelectable(row),
        onV2RowPick: (row, v) => this.onV2RowPick(row, v),
        openLogs: (row) => this.openLogs(row),
        formatDateTime: (v) => this.$dt(v),
        orderListColumnTitle: (col) => this.orderListColumnTitle(col),
        isCustomerNameColumn: (col) => this.isCustomerNameColumn(col),
        renderCustomerNameColumnHeader: (col) => this.renderCustomerNameColumnHeader(col),
        displayCustomerNameCell: (row, col) => this.displayCustomerNameCell(row, col),
        displayCell: (row, key) => this.displayCell(row, key),
        buildOrderRowActionNodes: (row) => this.buildOrderRowActionNodes(row)
      });
    },
    /** 与后端列表一致：待财务队列 / 纯财务账号按「提交审核」时间筛，其余按上传时间 */
    orderDateRangeUsesSubmittedAt() {
      if (this.filters.pending_finance_only) return true;
      return perm('order_management', 'order_status_finance') && !perm('order_management', 'order_input');
    },
    /** 与后端纯品管列表一致：日期按 finance_reviewed_at */
    orderDateRangeUsesFinancePassedAt() {
      if (this.filters.pending_qc_only) return true;
      return perm('order_management', 'order_status_qc') && !perm('order_management', 'order_input');
    },
    orderDateRangeStartPh() {
      if (this.orderDateRangeUsesFinancePassedAt) return '财务通过开始';
      return this.orderDateRangeUsesSubmittedAt ? '提交审核开始' : '开始时间';
    },
    orderDateRangeEndPh() {
      if (this.orderDateRangeUsesFinancePassedAt) return '财务通过结束';
      return this.orderDateRangeUsesSubmittedAt ? '提交审核结束' : '结束时间';
    },
    selectedCountLabel() {
      const n = this.effectiveSelected.length;
      if (!n) return '';
      const pageIds = new Set((this.items || []).map((r) => r?.id).filter((id) => id != null));
      const offPage = this.effectiveSelected.filter((r) => r && !pageIds.has(r.id)).length;
      if (offPage > 0) return `已选 ${n} 条（含其他页 ${offPage} 条）`;
      return `已选 ${n} 条`;
    },
    batchActionProps() {
      return {
        selectedCount: this.effectiveSelected.length,
        selectedCountLabel: this.selectedCountLabel,
        batchSubmitButtonLabel: this.batchSubmitButtonLabel,
        batchSubmitTooltip: this.batchSubmitTooltip,
        batchSubmitDisabled: this.batchSubmitDisabled,
        batchSubmitTipDisabled: this.batchSubmitTipDisabled,
        batchWithdrawButtonLabel: this.batchWithdrawButtonLabel,
        batchWithdrawTooltip: this.batchWithdrawTooltip,
        batchWithdrawDisabled: this.batchWithdrawDisabled,
        batchWithdrawTipDisabled: this.batchWithdrawTipDisabled,
        batchDeleteButtonLabel: this.batchDeleteButtonLabel,
        batchDeleteTooltip: this.batchDeleteTooltip,
        batchDeleteDisabled: this.batchDeleteDisabled,
        batchDeleteTipDisabled: this.batchDeleteTipDisabled,
        batchFinanceCount: this.batchFinanceReviewableList.length,
        batchQcCount: this.batchQcReviewableList.length,
        batchShipCount: this.batchShippableList.length,
        batchShipVisible: this.batchShipActionVisible
      };
    },
    listHandlers() {
      const self = this;
      return {
        openLogs: (row) => self.openLogs(row),
        displayCell: (row, key) => self.displayCell(row, key),
        orderListColumnTitle: (col) => self.orderListColumnTitle(col),
        isCustomerNameColumn: (col) => self.isCustomerNameColumn(col),
        setCustomerListNameMode: (mode) => self.setCustomerListNameMode(mode),
        editFieldRow: (col) => self.editFieldRow(col),
        removeFieldRow: (col) => self.removeFieldRow(col),
        openNewField: () => self.openNewField(),
        contractStatusLabel: (status) => self.contractStatusLabel(status),
        openOrderContractPreview: (row) => self.openOrderContractPreview(row),
        downloadOrderContractFile: (row, cmd) => self.downloadOrderContractFile(row, cmd),
        canAddContractForRow: (row) => self.canAddContractForRow(row),
        openBindContractForRow: (row) => self.openBindContractForRow(row),
        downloadQcThumb: (row) => self.downloadQcThumb(row),
        previewQcThumb: (row) => self.previewQcThumb(row),
        canRemoveQc: (row) => self.canRemoveQc(row),
        handleClearQc: (row) => self.handleClearQc(row),
        qcPlaceholderShowsGenerate: (row) => self.qcPlaceholderShowsGenerate(row),
        qcPlaceholderText: (row) => self.qcPlaceholderText(row),
        onQcPlaceholderClick: (row) => self.onQcPlaceholderClick(row),
        canEditOrderQc: (row) => self.canEditOrderQc(row),
        openQcBind: (row) => self.openQcBind(row),
        getOrderRowPrimaryActions: (row) => self.getOrderRowPrimaryActions(row),
        getOrderRowSecondaryActions: (row) => self.getOrderRowSecondaryActions(row),
        onOrderRowMenuCommand: (row, key) => self.onOrderRowMenuCommand(row, key),
        orderRowSelectable: (row) => self.orderRowSelectable(row),
        orderRowClassName: (args) => self.orderRowClassName(args),
        orderV2RowClass: (args) => self.orderV2RowClass(args),
        scaleOrdersV2Columns: (cols, width) => self.scaleOrdersV2Columns(cols, width),
        canEdit: (row) => self.canEdit(row)
      };
    }
  },
  watch: {
    '$route.query.view'() {
      this.applyQuickViewFromRoute();
      this.load();
    },
    '$route.query.focus_order_id'() {
      this.applyFocusOrderFromRoute();
      this.load();
    },
    '$route.query.flow_bucket'() {
      this.applyQuickViewFromRoute();
      this.load();
    },
    '$route.query.customer_code'() {
      this.applyQuickViewFromRoute();
      this.load();
    },
    pageSize() {
      this.maybeAutoEnableVirtualTable();
      this.scheduleFiltersSessionSave();
    },
    'fieldDefinitions.length'() {
      this.maybeAutoEnableVirtualTable();
    },
    customerListNameMode(mode) {
      persistCustomerListNameMode(mode);
    },
    orderListColVisible: {
      deep: true,
      handler() {
        this.persistOrderListPrefs();
      }
    },
    ordersVirtualTable() {
      this.persistOrderListPrefs();
    },
    orderTableDesignMode() {
      this.persistOrderListPrefs();
    },
    flowBoardRespectDate() {
      this.persistOrderListPrefs();
    },
    filters: {
      deep: true,
      handler() {
        this.scheduleFiltersSessionSave();
      }
    },
    dateRange() {
      this.scheduleFiltersSessionSave();
    },
    page() {
      this.scheduleFiltersSessionSave();
    }
  },
  activated() {
    if (!this.isBlockedByPasswordPolicy()) {
      this.loadOrderFlowConfig();
      this.load({ silent: true });
    }
  },
  mounted() {
    this.syncMobile();
    this.syncTouchLike();
    this.touchMediaQuery = window.matchMedia('(hover: none), (pointer: coarse)');
    this.touchMediaQuery.addEventListener('change', this.syncTouchLike);
    window.addEventListener('resize', this.syncMobile);
    this.restoreFiltersFromSession();
    this.applyQuickViewFromRoute();
    this.applyRoleDefaultViewIfNeeded();
    this.applyFocusOrderFromRoute();
    if (!this.isBlockedByPasswordPolicy()) {
      this.ensureOrderFieldDefinitions()
        .then(() => {
          this.maybeAutoEnableVirtualTable();
          this.loadOrderFlowConfig();
          this.load();
        })
        .catch(() => {});
    }
    if (!this.isBlockedByPasswordPolicy() && this.messagesDrawerVisible) {
      this.$refs.messagesDrawerRef?.refresh();
    }
    this.ordersPolling = createSalesOrderPollingController({
      isBlockedByPasswordPolicy: () => this.isBlockedByPasswordPolicy(),
      canQueryOrders: () => perm('order_management', 'order_query'),
      isInboxDrawerOpen: () => this.showMessages && this.messagesDrawerVisible,
      refreshInbox: () => this.$refs.messagesDrawerRef?.refresh(),
      refreshOrdersSilent: () => this.load({ silent: true, skipBoard: false })
    });
    this.ordersPolling.start();
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.syncMobile);
    this.touchMediaQuery?.removeEventListener('change', this.syncTouchLike);
    this.touchMediaQuery = null;
    this.saveFiltersToSession();
    if (this.highlightOrderTimer) clearTimeout(this.highlightOrderTimer);
    if (this.filtersSessionSaveTimer) clearTimeout(this.filtersSessionSaveTimer);
    this.ordersPolling?.stop();
    this.ordersPolling = null;
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  },
  methods: {
    formatListDate(value) {
      return this.$dt(value);
    },
    financeApproveSuccessMessage(toStatus) {
      if (toStatus === 'pending_qc') {
        const next = this.financeApproveNextStep;
        return next?.label ? `财务已通过，订单已进入${next.label}` : '财务已通过，订单已进入待品管审核';
      }
      if (toStatus === 'approved') return '财务已通过，订单已进入待备货发货';
      if (toStatus === 'rejected') return '订单已驳回';
      return this.financeApproveSuccessHint;
    },
    syncMobile() {
      this.isMobile = window.innerWidth <= 992;
      if (!this.isMobile) this.mobileBatchOpen = false;
    },
    syncTouchLike() {
      try {
        this.isTouchLike = window.matchMedia('(hover: none), (pointer: coarse)').matches;
      } catch {
        this.isTouchLike = false;
      }
    },
    orderFlowStatusZh,
    perm,
    isBlockedByPasswordPolicy() {
      return !!useAuthStore().forceChangePassword;
    },
    contractStatusLabel(status) {
      if (status === 'draft') return '草稿';
      if (status === 'pending_review') return '待审核';
      if (status === 'approved') return '已通过';
      if (status === 'rejected') return '已驳回';
      return '未知';
    },
    canAddContractForRow(row) {
      if (!row || row.contract_id) return false;
      return perm('contract_management', 'contract_generate');
    },
    canEdit(row) {
      if (!perm('order_management', 'order_edit')) return false;
      if (row.status === 'rejected') return true;
      if (row.status === 'pending_review' && !row.submitted_for_review_at) return true;
      return false;
    },
    /** 与 /api/sales/orders/batch-submit 一致：仅待审核或驳回状态且未提交过，且须本人创建（超管除外） */
    canSubmit(row) {
      if (!perm('order_management', 'order_submit')) return false;
      if ((row.status !== 'pending_review' && row.status !== 'rejected') || row.submitted_for_review_at) return false;
      if (this.isSuper) return true;
      const uid = this.myUserId();
      if (uid == null) return false;
      if (row.created_by == null || row.created_by === '') return false;
      return Number(row.created_by) === Number(uid);
    },
    canShowSubmitAction(row) {
      if (!perm('order_management', 'order_submit')) return false;
      if ((row.status !== 'pending_review' && row.status !== 'rejected') || row.submitted_for_review_at) return false;
      return true;
    },
    submitActionTooltip(row) {
      return this.canSubmit(row) ? '提交审核' : '仅可提交本人创建且未提交的订单';
    },
    canWithdraw(row) {
      return row.status === 'pending_review' && row.submitted_for_review_at;
    },
    /** 与 POST /orders/:id/withdraw 一致：须本人创建（超管除外） */
    canWithdrawSubmit(row) {
      if (!perm('order_management', 'order_withdraw')) return false;
      if (!this.canWithdraw(row)) return false;
      if (this.isSuper) return true;
      const uid = this.myUserId();
      if (uid == null) return false;
      if (row.created_by == null || row.created_by === '') return false;
      return Number(row.created_by) === Number(uid);
    },
    canComplete(row) {
      return row.status === 'shipped';
    },
    canFinanceReview(row) {
      return row.status === 'pending_review' && row.submitted_for_review_at;
    },
    canQcReview(row) {
      return row.status === 'pending_qc';
    },
    /** 与 POST /orders/:id/ship 一致：order_ship 或（兼容旧配置）order_status_warehouse */
    canShip(row) {
      if (row.status !== 'approved') return false;
      return (
        this.isSuper ||
        perm('order_management', 'order_ship') ||
        perm('order_management', 'order_status_warehouse')
      );
    },
    canCancel(row) {
      if (['shipped', 'completed', 'cancelled'].includes(row.status)) return false;
      if (this.isSuper || perm('order_management', 'order_status_finance')) return true;
      return row.status === 'pending_review' && !row.submitted_for_review_at;
    },
    myUserId() {
      const raw = localStorage.getItem('token');
      if (!raw) return null;
      try {
        const part = raw.split('.')[1];
        const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const p = JSON.parse(atob(b64));
        return p.userId;
      } catch {
        return null;
      }
    },
    canDelete(row) {
      if (!perm('order_management', 'order_delete')) return false;
      if (this.isSuper || perm('order_management', 'order_status_finance')) {
        if (['completed', 'cancelled'].includes(row.status)) return false;
        return true;
      }
      const uid = this.myUserId();
      if (uid != null && Number(row.created_by) === Number(uid)) return true;
      return false;
    },
    queryParams() {
      return buildSalesOrderQueryParams({
        filters: this.filters,
        dateRange: this.dateRange,
        page: this.page,
        pageSize: this.pageSize,
        sort: this.sort,
        focusOrderId: this.focusOrderId,
        customerListNameMode: this.customerListNameMode
      });
    },
    resetFilters() {
      this.filters = createDefaultSalesOrderFilters();
      this.dateRange = [];
      this.focusOrderId = null;
      this.page = 1;
      this.filtersRestoredFromSession = false;
      this.stripRouteQueryKeys(['view', 'customer_code', 'focus_order_id', 'flow_bucket']);
      clearSalesOrderFiltersSession();
      this.load();
    },
    stripRouteQueryKeys(keys) {
      const q = { ...(this.$route?.query || {}) };
      let changed = false;
      for (const k of keys) {
        if (q[k] != null && String(q[k]).trim() !== '') {
          delete q[k];
          changed = true;
        }
      }
      if (!changed) return;
      this.$router.replace({ path: this.$route.path, query: q }).catch(() => {});
    },
    clearSearchFilter() {
      this.filters.searchValue = '';
      this.page = 1;
      this.load();
    },
    clearFlowBucketFilter() {
      this.filters.flow_bucket = '';
      this.stripRouteQueryKeys(['flow_bucket']);
      this.page = 1;
      this.load();
    },
    clearTerminalStatusFilter() {
      this.filters.status = '';
      this.page = 1;
      this.load();
    },
    clearQuickViewFilter() {
      this.filters.pending_finance_only = false;
      this.filters.pending_qc_only = false;
      this.filters.status = '';
      this.stripRouteQueryKeys(['view']);
      this.page = 1;
      this.load();
    },
    clearCustomerCodeFilter() {
      this.filters.customer_code = '';
      this.stripRouteQueryKeys(['customer_code']);
      this.page = 1;
      this.load();
    },
    clearDateRangeFilter() {
      this.dateRange = [];
      this.page = 1;
      this.load();
    },
    clearFocusOrderFilter() {
      this.focusOrderId = null;
      this.stripRouteQueryKeys(['focus_order_id']);
      this.load();
    },
    onSearchInput() {
      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.searchDebounceTimer = null;
        this.page = 1;
        this.load();
      }, 400);
    },
    loadNow() {
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = null;
      }
      this.page = 1;
      this.load();
    },
    persistOrderListPrefs() {
      persistOrderListPrefsStore({
        orderListColVisible: this.orderListColVisible,
        ordersVirtualTable: this.ordersVirtualTable,
        orderTableDesignMode: this.orderTableDesignMode,
        flowBoardRespectDate: this.flowBoardRespectDate
      });
      this.scheduleFiltersSessionSave();
    },
    onToolbarManageCommand(command) {
      if (command === 'flow-config') {
        this.$router.push('/sales/orders/flow-config');
        return;
      }
      if (command === 'field-manage') {
        this.openFieldManage();
      }
    },
    async refreshListManual() {
      await this.load();
    },
    touchListSyncedLabel() {
      const now = new Date();
      this.lastListSyncedLabel = `更新于 ${now.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })}`;
    },
    onMobilePageSelectAll(on) {
      const rows = this.mobilePageSelectableRows;
      const ids = new Set(this.v2SelectedIds);
      const snap = { ...this.v2SelectedSnapshots };
      if (on) {
        for (const row of rows) {
          ids.add(row.id);
          snap[row.id] = { ...row };
        }
      } else {
        for (const row of rows) {
          ids.delete(row.id);
          delete snap[row.id];
        }
      }
      this.v2SelectedIds = Array.from(ids);
      this.v2SelectedSnapshots = snap;
    },
    flowSlaQueryParams() {
      const respect = this.flowBoardRespectDate === true;
      const hasDate = Array.isArray(this.dateRange) && this.dateRange.length === 2;
      const base = buildSalesOrderQueryParams({
        filters: this.filters,
        dateRange: respect && hasDate ? this.dateRange : [],
        page: 1,
        pageSize: 1,
        sort: this.sort,
        focusOrderId: null,
        customerListNameMode: this.customerListNameMode
      });
      const {
        page: _page,
        page_size: _pageSize,
        sort: _sort,
        date_from: _df,
        date_to: _dt,
        pending_finance_only: _pf,
        pending_qc_only: _pq,
        flow_bucket: _fb,
        status: _st,
        id: _id,
        ...rest
      } = base;
      const p = {
        ...rest,
        apply_date_range: respect && hasDate ? '1' : '0'
      };
      if (respect && hasDate) {
        p.date_from = this.dateRange[0];
        p.date_to = this.dateRange[1];
      }
      return p;
    },
    async refreshFlowSlaBoard(options = {}) {
      if (!perm('order_management', 'order_query')) return;
      if (this.isBlockedByPasswordPolicy()) return;
      const silent = options.silent === true;
      if (!silent) this.flowSlaLoading = true;
      try {
        const p = this.flowSlaQueryParams();
        const [f, sla] = await Promise.all([
          getSalesOrderFlowSummary(p, { silent }),
          getSalesOrderSlaSummary(p, { silent })
        ]);
        this.flowSummary = f || {};
        this.flowSlaSummary = sla || {};
      } catch (e) {
        if (!silent) this.$message.error(this.$apiUserMsg(e, '加载流程摘要失败'));
      } finally {
        this.flowSlaLoading = false;
      }
    },
    onFlowBoardSelect(key) {
      if (!key) {
        this.clearFlowBucketFilter();
        return;
      }
      this.toggleFlowBucket(key);
    },
    onFlowBoardRespectDateChange(value) {
      this.flowBoardRespectDate = value === true;
      this.refreshFlowSlaBoard();
    },
    toggleFlowBucket(key) {
      const next = this.filters.flow_bucket === key ? '' : key;
      this.filters.flow_bucket = next;
      if (next) {
        this.filters.status = '';
        this.filters.pending_finance_only = false;
        this.filters.pending_qc_only = false;
      }
      this.page = 1;
      this.load();
    },
    clearFlowBucketFilter() {
      this.filters.flow_bucket = '';
      this.page = 1;
      this.load();
    },
    onStatusFilterChange() {
      if (this.filters.status) this.filters.flow_bucket = '';
      this.page = 1;
      this.load();
    },
    onPendingFinanceChange() {
      if (this.filters.pending_finance_only) this.filters.flow_bucket = '';
      this.load();
    },
    onPendingQcChange() {
      if (this.filters.pending_qc_only) this.filters.flow_bucket = '';
      this.load();
    },
    applyQuickViewFromRoute() {
      const q = this.$route?.query || {};
      if (q.view) {
        this.filters.flow_bucket = '';
        const view = q.view;
        if (view === 'sales') {
          this.filters.status = '';
          this.filters.pending_finance_only = false;
          this.filters.pending_qc_only = false;
        } else if (view === 'finance') {
          this.filters.status = '';
          this.filters.pending_finance_only = true;
          this.filters.pending_qc_only = false;
        } else if (view === 'warehouse') {
          this.filters.status = 'approved';
          this.filters.pending_finance_only = false;
          this.filters.pending_qc_only = false;
        } else if (view === 'qc') {
          this.filters.status = '';
          this.filters.pending_finance_only = false;
          this.filters.pending_qc_only = true;
        }
      } else if (isSalesOrderFlowBucketKey(q.flow_bucket)) {
        this.filters.flow_bucket = String(q.flow_bucket);
        this.filters.status = '';
        this.filters.pending_finance_only = false;
        this.filters.pending_qc_only = false;
      }
      if (q.customer_code) {
        this.filters.customer_code = String(q.customer_code);
      }
    },
    applyRoleDefaultViewIfNeeded() {
      const q = this.$route?.query || {};
      if (q.view || q.customer_code || q.focus_order_id || q.flow_bucket) return;
      if (this.filtersRestoredFromSession) return;
      if (this.hasActiveFilters) return;

      const hasFinance = perm('order_management', 'order_status_finance');
      const hasQc = perm('order_management', 'order_status_qc');
      const hasInput = perm('order_management', 'order_input');
      const hasShip =
        perm('order_management', 'order_ship') ||
        perm('order_management', 'order_status_warehouse');

      if (hasFinance && !hasInput && !hasQc && !hasShip) {
        this.filters.pending_finance_only = true;
        this.filters.pending_qc_only = false;
        this.filters.status = '';
        this.filters.flow_bucket = '';
        return;
      }
      if (hasQc && !hasInput && !hasFinance && !hasShip) {
        this.filters.pending_qc_only = true;
        this.filters.pending_finance_only = false;
        this.filters.status = '';
        this.filters.flow_bucket = '';
        return;
      }
      if (hasShip && !hasInput && !hasFinance && !hasQc) {
        this.filters.status = 'approved';
        this.filters.pending_finance_only = false;
        this.filters.pending_qc_only = false;
        this.filters.flow_bucket = '';
      }
    },
    scheduleFiltersSessionSave() {
      if (this.filtersSessionSaveTimer) clearTimeout(this.filtersSessionSaveTimer);
      this.filtersSessionSaveTimer = setTimeout(() => {
        this.filtersSessionSaveTimer = null;
        this.saveFiltersToSession();
      }, 300);
    },
    saveFiltersToSession() {
      saveSalesOrderFiltersSession({
        filters: this.filters,
        dateRange: this.dateRange,
        page: this.page,
        pageSize: this.pageSize,
        orderListColVisible: this.orderListColVisible,
        ordersVirtualTable: this.ordersVirtualTable,
        orderTableDesignMode: this.orderTableDesignMode,
        flowBoardRespectDate: this.flowBoardRespectDate
      });
    },
    restoreFiltersFromSession() {
      if (shouldSkipFiltersSessionRestore(this.$route?.query)) return false;
      const saved = readSalesOrderFiltersSession();
      if (!saved) return false;
      const parsed = parseSalesOrderFiltersSession(saved);
      this.filters = parsed.filters;
      this.dateRange = parsed.dateRange;
      if (parsed.page != null) this.page = parsed.page;
      if (parsed.pageSize != null) this.pageSize = parsed.pageSize;
      const lp = parsed.listPrefs;
      if (lp) {
        if (lp.orderListColVisible) this.orderListColVisible = lp.orderListColVisible;
        if (lp.ordersVirtualTable != null) this.ordersVirtualTable = lp.ordersVirtualTable;
        if (lp.orderTableDesignMode != null) this.orderTableDesignMode = lp.orderTableDesignMode;
        if (lp.flowBoardRespectDate != null) this.flowBoardRespectDate = lp.flowBoardRespectDate;
      }
      this.filtersRestoredFromSession = true;
      return true;
    },
    isOrderHighlighted(row) {
      const id = row?.id;
      if (id == null) return false;
      return this.highlightOrderIds.includes(Number(id));
    },
    orderRowClassName({ row }) {
      const parts = [];
      if (this.isOrderHighlighted(row)) parts.push('orders-row--highlight');
      if (this.canEdit(row)) parts.push('orders-row--editable');
      return parts.join(' ');
    },
    orderV2RowClass({ rowData }) {
      const parts = [];
      if (this.isOrderHighlighted(rowData)) parts.push('orders-row--highlight');
      if (this.canEdit(rowData)) parts.push('orders-row--editable');
      return parts.join(' ');
    },
    focusImportedOrders(ids) {
      const normalized = (Array.isArray(ids) ? ids : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (!normalized.length) return;

      this.highlightOrderIds = normalized;
      if (this.highlightOrderTimer) clearTimeout(this.highlightOrderTimer);
      this.highlightOrderTimer = setTimeout(() => {
        this.highlightOrderIds = [];
        this.highlightOrderTimer = null;
      }, 10000);

      const firstId = normalized[0];
      this.focusOrderId = firstId;
      this.stripRouteQueryKeys(['focus_order_id']);
      this.$nextTick(() => {
        this.maybeScrollToFocusOrder();
      });

      if (normalized.length === 1) {
        const hit = (this.items || []).find((r) => Number(r.id) === firstId);
        this.$message.success(`导入成功，已定位订单 ${hit?.order_no || `#${firstId}`}`);
      } else {
        this.$message.success(`导入成功 ${normalized.length} 条，已在列表中高亮显示`);
      }
    },
    applyFocusOrderFromRoute() {
      const foc = this.$route?.query?.focus_order_id;
      if (foc != null && String(foc).trim() !== '') {
        const n = Number(foc);
        this.focusOrderId = Number.isFinite(n) && n > 0 ? n : null;
      } else {
        this.focusOrderId = null;
      }
    },
    async maybeScrollToFocusOrder() {
      const id = this.focusOrderId;
      if (!id || this.ordersVirtualTable) return;
      await this.$nextTick();
      const dt = this.$refs.desktopTable;
      if (!dt) return;
      const row = (this.items || []).find((r) => Number(r.id) === Number(id));
      if (!row) return;
      dt.setTableCurrentRow(row);
      await this.$nextTick();
      const tr = dt.queryTableCurrentRowEl();
      tr?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    onOrdersSelectionChange(rows) {
      if (this.ordersTableSelectionSync) return;
      this.selected = this.filterSelectableOrderRows(rows || []);
    },
    /** 剔除不可勾选或已无有效 id 的行，避免 reserve-selection 残留导致「未勾选却显示已选 N 条」 */
    filterSelectableOrderRows(rows) {
      const byId = new Map((this.items || []).map((r) => [r.id, r]));
      const out = [];
      const seen = new Set();
      for (const row of rows || []) {
        if (!row || row.id == null || seen.has(row.id)) continue;
        const fresh = byId.get(row.id) || row;
        if (!this.orderRowSelectable(fresh)) continue;
        seen.add(row.id);
        out.push(fresh);
      }
      return out;
    },
    syncOrderSelectionState(nextSelected) {
      const rows = this.filterSelectableOrderRows(nextSelected || []);
      this.selected = rows;
      if (this.ordersVirtualTable || this.isMobile) {
        const snap = {};
        for (const row of rows) snap[row.id] = { ...row };
        this.v2SelectedIds = rows.map((r) => r.id);
        this.v2SelectedSnapshots = snap;
      }
      return rows;
    },
    async load(options = {}) {
      if (this.isBlockedByPasswordPolicy()) {
        this.items = [];
        this.total = 0;
        return;
      }
      const silent = options.silent === true;
      const skipBoard = options.skipBoard === true;
      const seq = this.ordersPolling?.nextLoadSeq?.() ?? Date.now();
      if (!silent) this.loading = true;
      try {
        const d = await loadSalesOrderList({
          listApi: listSalesOrders,
          params: this.queryParams(),
          silent
        });
        if (this.ordersPolling && !this.ordersPolling.isLatestLoadSeq(seq)) return;
        const items = d.items || [];
        await attachQcThumbsToOrderRows(items);
        if (this.ordersPolling && !this.ordersPolling.isLatestLoadSeq(seq)) return;
        this.items = items;
        this.total = d.total || 0;
        // 定时静默刷新会用新对象替换列表行；若不同步选中行，selection 仍指向旧引用，条件（如是否已提交）会过期，导致批量操作的笔数与结果错乱
        const selIds = new Set(
          [
            ...(this.selected || []).map((r) => r && r.id),
            ...(this.v2SelectedIds || [])
          ].filter((id) => id != null)
        );
        const byId = new Map((this.items || []).map((r) => [r.id, r]));
        const candidates = Array.from(selIds)
          .map(
            (id) =>
              byId.get(id) ||
              (this.selected || []).find((r) => r && r.id === id) ||
              this.v2SelectedSnapshots[id]
          )
          .filter(Boolean);
        this.ordersTableSelectionSync = true;
        const nextSelected = this.syncOrderSelectionState(candidates);
        await this.$nextTick();
        const dt = this.$refs.desktopTable;
        if (dt) {
          dt.clearTableSelection();
          for (const row of nextSelected) dt.toggleTableRowSelection(row, true);
        }
        await this.$nextTick();
        try {
          this.$refs.desktopTable?.doTableLayout?.();
        } catch {
          /* ignore */
        }
        this.touchListSyncedLabel();
      } catch (e) {
        if (this.ordersPolling && !this.ordersPolling.isLatestLoadSeq(seq)) return;
        const code = e?.response?.data?.error;
        if (!silent) {
          if (code === 'PASSWORD_MUST_CHANGE') {
            // 同步 pinia 状态，停止 sales 模块轮询/加载，避免控制台持续刷 403
            useAuthStore().setForceChangePassword(true);
            this.$message.error('请先修改初始密码后再访问销售模块');
          } else {
            this.$message.error(this.$apiUserMsg(e, '加载失败'));
          }
        }
      } finally {
        if (!silent) this.loading = false;
        await this.$nextTick();
        this.ordersTableSelectionSync = false;
        await this.maybeScrollToFocusOrder();
        if (!skipBoard && perm('order_management', 'order_query')) {
          if (!this.ordersPolling || this.ordersPolling.isLatestLoadSeq(seq)) {
            this.refreshFlowSlaBoard({ silent: true });
          }
        }
      }
    },
    canEditOrderQc(row) {
      return (
        (perm('order_management', 'order_edit') && this.canEdit(row)) ||
        (perm('order_management', 'order_status_qc') && row && row.status === 'pending_qc')
      );
    },
    canRemoveQc(row) {
      return this.canEditOrderQc(row) && (row.qc_bound_manual || row.qc_report_label === '绑定已失效');
    },
    qcPlaceholderShowsGenerate(row) {
      return !row?.qc_public_url && row?.qc_report_label === '无可用报告';
    },
    qcPlaceholderText(row) {
      if (this.qcPlaceholderShowsGenerate(row)) return '去生成报告';
      return row?.qc_report_label || '';
    },
    onQcPlaceholderClick(row) {
      if (!this.qcPlaceholderShowsGenerate(row)) return;
      if (!perm('reports', 'create')) return;
      this.openGenerateReport(row);
    },
    handleClearQc(row) {
      if (!this.canRemoveQc(row)) {
        this.$message.warning('当前订单二维码不可删除绑定');
        return;
      }
      this.clearOrderQc(row);
    },
    openQcPublic(row) {
      if (row.qc_public_url) window.open(row.qc_public_url, '_blank', 'noopener');
    },
    async clearOrderQc(row) {
      try {
        await this.$confirm(
          '解除绑定后，若客户、标签型号、批号与报告一致将恢复自动关联。是否继续？',
          '解除绑定',
          { type: 'warning' }
        );
      } catch {
        return;
      }
      try {
        await patchSalesOrderQcQrcode(row.id, { qrcodeId: null });
        this.$message.success('已解除绑定');
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    openQcBind(row) {
      this.qcBindDialogOrderId = row.id;
      this.qcBindDialogVisible = true;
    },
    isOrderListUnitPriceColumn(def, key) {
      const isPriceLikeColumn = /单价|价格|售价|price/i.test(String(def?.label_zh || key || ''));
      return !!(
        this.showOrderListUnitPrice &&
        (def?.maps_to === 'unit_price' || key === '__legacy_unit_price' || isPriceLikeColumn)
      );
    },
    orderListColumnTitle(col) {
      if (this.isOrderListUnitPriceColumn(col, col?.field_key)) return '单价(元/吨)';
      return String(col?.label_zh || '');
    },
    formatUnitPriceDisplay(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      return n.toFixed(2);
    },
    isCustomerNameColumn(col) {
      return col?.maps_to === 'customer_name';
    },
    setCustomerListNameMode(mode) {
      const next = mode === 'full' ? 'full' : 'short';
      if (this.customerListNameMode === next) return;
      this.customerListNameMode = next;
    },
    renderCustomerNameColumnHeader(col) {
      const mode = this.customerListNameMode;
      const mkBtn = (value, label) =>
        h(
          ElButton,
          {
            size: 'small',
            type: mode === value ? 'primary' : 'default',
            onClick: (e) => {
              e.stopPropagation();
              this.setCustomerListNameMode(value);
            },
            onMousedown: (e) => e.stopPropagation()
          },
          { default: () => label }
        );
      return h('div', { class: 'orders-customer-header orders-customer-header--v2' }, [
        h(
          'span',
          { class: 'orders-customer-header__title' },
          `${col.required ? '*' : ''}${this.orderListColumnTitle(col)}`
        ),
        h('div', { class: 'orders-customer-header__mode' }, [mkBtn('short', '简称'), mkBtn('full', '全称')])
      ]);
    },
    displayCustomerNameCell(row, def) {
      const fromCustomer = orderListCustomerDisplayName(row, this.customerListNameMode);
      if (fromCustomer) return fromCustomer;
      const v = row.display_data?.[def.field_key];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
      return '—';
    },
    displayCell(row, key) {
      const def = this.orderListFieldDefinitions.find((d) => d.field_key === key);
      if (this.isCustomerNameColumn(def)) {
        return this.displayCustomerNameCell(row, def);
      }
      if (def?.maps_to === 'amount' && this.fieldDefinitions?.length) {
        const calc = grossAmountFromRowDisplayData(row, this.fieldDefinitions);
        if (calc != null) return String(calc);
      }
      const v = row.display_data?.[key];
      const isUnitPriceColumn = this.isOrderListUnitPriceColumn(def, key);
      if (v !== undefined && v !== null && v !== '') {
        if (isUnitPriceColumn) {
          const fixed = this.formatUnitPriceDisplay(v);
          if (fixed != null) return fixed;
        }
        return v;
      }
      if (isUnitPriceColumn) {
        const p = Number(row?.unit_price);
        if (Number.isFinite(p)) return this.formatUnitPriceDisplay(p);
      }
      return '—';
    },
    orderRowActionHandlers() {
      return {
        canFinanceReview: (row) => this.canFinanceReview(row),
        canQcReview: (row) => this.canQcReview(row),
        canSubmit: (row) => this.canSubmit(row),
        canWithdrawSubmit: (row) => this.canWithdrawSubmit(row),
        canShip: (row) => this.canShip(row),
        canComplete: (row) => this.canComplete(row),
        canEdit: (row) => this.canEdit(row),
        canCancel: (row) => this.canCancel(row),
        canDelete: (row) => this.canDelete(row),
        approveSingle: (row) => this.approveSingle(row),
        rejectSingle: (row) => this.rejectSingle(row),
        approveSingleQc: (row) => this.approveSingleQc(row),
        rejectSingleQc: (row) => this.rejectSingleQc(row),
        submitSingle: (row) => this.submitSingle(row),
        withdrawReview: (row) => this.withdrawReview(row),
        openShip: (row) => this.openShip(row),
        doComplete: (row) => this.doComplete(row),
        openEdit: (row) => this.openEdit(row),
        openGenerateReport: (row) => this.openGenerateReport(row),
        doCancel: (row) => this.doCancel(row),
        doDeleteRow: (row) => this.doDeleteRow(row)
      };
    },
    collectOrderRowActions(row) {
      return collectSalesOrderRowActions(row, this.orderRowActionHandlers());
    },
    splitOrderRowActionsForRow(row) {
      return splitSalesOrderRowActions(row, this.orderRowActionProfile, this.orderRowActionHandlers());
    },
    getOrderRowPrimaryActions(row) {
      return this.splitOrderRowActionsForRow(row).primary;
    },
    getOrderRowSecondaryActions(row) {
      return this.splitOrderRowActionsForRow(row).secondary;
    },
    onOrderRowMenuCommand(row, key) {
      const act = this.collectOrderRowActions(row).find((a) => a.key === key);
      act?.onClick?.();
    },
    countOrderRowActions(row) {
      return this.collectOrderRowActions(row).length;
    },
    buildOrderRowActionNodes(row) {
      return buildOrderRowActionNodesUtil(row, {
        profile: this.orderRowActionProfile,
        handlers: this.orderRowActionHandlers(),
        onMenuCommand: (r, key) => this.onOrderRowMenuCommand(r, key)
      });
    },
    openCreate() {
      this.formDialogEditRow = null;
      this.formDialogVisible = true;
    },
    openGenerateReport(row) {
      if (!perm('reports', 'create')) return;
      const prefill = buildOrderReportPrefill(row, this.fieldDefinitions);
      if (!prefill.product_name?.zh) {
        this.$message.warning('该订单缺少标签型号，无法生成报告');
        return;
      }
      try {
        sessionStorage.setItem(REPORT_PREFILL_FROM_ORDER_KEY, JSON.stringify(prefill));
      } catch {
        this.$message.error('无法保存预填数据，请重试');
        return;
      }
      this.$router.push({ path: '/reports/new', query: { fromOrder: String(row.id) } });
    },
    openEdit(row) {
      this.formDialogEditRow = row;
      this.formDialogVisible = true;
    },
    onOrderRowDblClick(row) {
      if (!row) return;
      this.handleEditClick(row);
    },
    handleEditClick(row) {
      if (this.canEdit(row)) {
        this.openEdit(row);
        return;
      }
      if (row.status === 'approved') {
        this.$message.warning('该订单待备货发货，不能编辑');
        return;
      }
      if (row.status === 'shipped') {
        this.$message.warning('该订单已发货，不能编辑');
        return;
      }
      this.$message.warning('当前订单状态不支持编辑');
    },
    handleSubmitClick(row) {
      if (this.canSubmit(row)) {
        this.submitSingle(row);
        return;
      }
      this.$message.warning('仅可提交本人创建且未提交的订单');
    },
    async downloadQcThumb(row) {
      let src = row?.qc_thumb_data_url;
      if (!src && row?.qc_public_url) {
        src = await ensureQcQrThumb(row.qc_public_url, { width: 280 });
        if (src) row.qc_thumb_data_url = src;
      }
      if (!src) {
        this.$message.warning('暂无可下载二维码');
        return;
      }
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error('BAD_RESPONSE');
        const blob = await res.blob();
        const ext = (blob.type || '').includes('jpeg') ? 'jpg' : 'png';
        startDownload({ request: blob, filename: `order-${row.order_no || row.id}-qrcode.${ext}` });
      } catch {
        this.$message.error('下载失败');
      }
    },
    previewQcThumb(row) {
      this.openQcPublic(row);
    },
    clearOrderSelection() {
      this.selected = [];
      this.v2SelectedIds = [];
      this.v2SelectedSnapshots = {};
    },
    clearAllOrderSelection() {
      this.clearOrderSelection();
      const dt = this.$refs.desktopTable;
      if (!dt) return;
      this.ordersTableSelectionSync = true;
      try {
        dt.clearTableSelection();
      } catch {
        /* ignore */
      }
      this.$nextTick(() => {
        this.ordersTableSelectionSync = false;
      });
    },
    openImportDupDialog(rows) {
      this.importDupDialogRows = Array.isArray(rows) ? rows : [];
      this.importDupDialogSummary = buildImportDupDialogSummary(this.importDupDialogRows);
      this.importDupDialogVisible = true;
    },
    openImportErrorsDialog(rows) {
      this.importErrorsDialogRows = Array.isArray(rows) ? rows : [];
      this.importErrorsDialogVisible = this.importErrorsDialogRows.length > 0;
    },
    async ensureOrderFieldDefinitions() {
      const can =
        perm('order_management', 'order_query') ||
        perm('order_management', 'order_input') ||
        perm('order_management', 'order_field_config') ||
        perm('order_management', 'order_status_qc');
      if (!can) return;
      try {
        const d = await listSalesOrderFields({});
        this.fieldDefinitions = d.items || [];
        if (d.schema_version != null && d.schema_version !== '') {
          const n = Number(d.schema_version);
          this.fieldSchemaVersion = Number.isFinite(n) ? n : d.schema_version;
        }
      } catch {
        /* ignore */
      }
    },
    async loadOrderFlowConfig() {
      if (!perm('order_management', 'order_query') && !perm('order_management', 'order_status_finance')) return;
      try {
        const d = await getSalesOrderFlowConfig();
        const payload = d?.data ?? d;
        this.orderFlowConfig = payload?.definition || null;
      } catch {
        /* ignore */
      }
    },
    async maybeAutoEnableVirtualTable() {
      const nCol = (this.fieldDefinitions && this.fieldDefinitions.length) || 0;
      const shouldSuggest = this.pageSize >= 100 || nCol >= 14;
      if (!shouldSuggest || this.ordersVirtualTable || this.virtualTablePromptHandled) return;
      this.virtualTablePromptHandled = true;
      try {
        await this.$confirm(
          '当前分页较大或自定义字段较多，建议开启「高性能表格」以提升滚动性能。开启后合同预览、质检缩略图等列可能简化展示。是否开启？',
          '开启高性能表格',
          { type: 'info', confirmButtonText: '开启', cancelButtonText: '暂不' }
        );
        this.ordersVirtualTable = true;
        this.persistOrderListPrefs();
      } catch {
        /* 用户取消，保持设计表 */
      }
    },
    onV2RowPick(row, on) {
      if (!this.orderRowSelectable(row)) return;
      const id = row.id;
      const ids = new Set(this.v2SelectedIds);
      const snap = { ...this.v2SelectedSnapshots };
      if (on) {
        ids.add(id);
        snap[id] = { ...row };
      } else {
        ids.delete(id);
        delete snap[id];
      }
      this.v2SelectedIds = Array.from(ids);
      this.v2SelectedSnapshots = snap;
    },
    onOrdersVirtualTableChange() {
      if (this.ordersVirtualTable) {
        this.orderTableDesignMode = false;
        const nextIds = new Set(this.v2SelectedIds);
        const snap = { ...this.v2SelectedSnapshots };
        for (const r of this.filterSelectableOrderRows(this.selected || [])) {
          if (r && r.id != null) {
            nextIds.add(r.id);
            snap[r.id] = { ...r };
          }
        }
        const rows = this.filterSelectableOrderRows(
          Array.from(nextIds).map((id) => snap[id]).filter(Boolean)
        );
        const nextSnap = {};
        for (const row of rows) nextSnap[row.id] = { ...row };
        this.v2SelectedIds = rows.map((r) => r.id);
        this.v2SelectedSnapshots = nextSnap;
        this.ordersTableSelectionSync = true;
        this.selected = [];
        this.$nextTick(() => {
          try {
            this.$refs.desktopTable?.clearTableSelection?.();
          } catch {
            /* ignore */
          }
          this.ordersTableSelectionSync = false;
        });
      } else {
        this.syncV2PickToElTable();
      }
    },
    onOrderTableDesignModeChange() {
      this.$nextTick(() => {
        try {
          this.$refs.desktopTable?.doTableLayout?.();
        } catch {
          /* ignore */
        }
      });
    },
    scaleOrdersV2Columns(cols, containerWidth) {
      return scaleOrderV2ColumnWidths(cols, containerWidth);
    },
    syncV2PickToElTable() {
      const dt = this.$refs.desktopTable;
      const rows = this.filterSelectableOrderRows(
        (this.v2SelectedIds || [])
          .map((id) => this.v2SelectedSnapshots[id] || (this.items || []).find((r) => r.id === id))
          .filter(Boolean)
      );
      this.ordersTableSelectionSync = true;
      this.selected = [];
      this.$nextTick(() => {
        try {
          dt?.clearTableSelection?.();
        } catch {
          /* ignore */
        }
        for (const row of rows) {
          if ((this.items || []).some((r) => r.id === row.id)) dt?.toggleTableRowSelection?.(row, true);
        }
        this.selected = this.filterSelectableOrderRows(
          (this.items || []).filter((r) => rows.some((x) => x.id === r.id))
        );
        this.ordersTableSelectionSync = false;
      });
    },
    openFieldManage() {
      this.fieldManageDialogVisible = true;
    },
    async openContracts(row) {
      this.logsDialogContractRows = [];
      this.logsDialogMode = 'contracts';
      this.logsDialogVisible = true;
      listCustomerContracts(row.customer_id).then((d) => {
        this.logsDialogContractRows = d.items || [];
      }).catch(() => {});
    },
    async openLogs(row) {
      try {
        const [s, e] = await Promise.all([listSalesOrderStatusLogs(row.id), listSalesOrderEditLogs(row.id)]);
        this.logsDialogStatusLogs = s.items || [];
        this.logsDialogEditLogs = e.items || [];
        this.logsDialogMode = 'logs';
        this.logsDialogVisible = true;
      } catch (err) {
        this.$message.error(this.$apiUserMsg(err, '加载失败'));
      }
    },
    async submitReview(row) {
      try {
        await submitSalesOrderReview(row.id);
        this.$message.success('已提交财务审核');
        this.load();
        this.$refs.messagesDrawerRef?.refresh();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    async withdrawReview(row) {
      try {
        await this.$confirm(
          `撤回订单 ${row.order_no} 的审核申请？撤回后可重新编辑并再次提交。`,
          '撤回审核',
          { type: 'warning' }
        );
      } catch {
        return;
      }
      try {
        await withdrawSalesOrderReview(row.id);
        this.$message.success('已撤回');
        this.load();
        this.$refs.messagesDrawerRef?.refresh();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    orderRowSelectable(row) {
      if (perm('contract_management', 'contract_generate')) return true;
      if (perm('order_management', 'order_submit') && this.canSubmit(row)) return true;
      if (this.canWithdrawSubmit(row)) return true;
      if (perm('order_management', 'order_status_finance') && this.canFinanceReview(row)) return true;
      if (perm('order_management', 'order_status_qc') && this.canQcReview(row)) return true;
      if (perm('order_management', 'order_delete') && this.canDelete(row)) return true;
      if (this.canShip(row)) return true;
      return false;
    },
    async doDeleteRow(row) {
      try {
        await this.$confirm(
          `确定永久删除订单「${row.order_no}」？删除后不可恢复；若已关联合同，关联将自动解除。`,
          '删除确认',
          { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
        );
      } catch {
        return;
      }
      try {
        await deleteSalesOrder(row.id);
        this.$message.success('已删除');
        this.clearOrderSelection();
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '删除失败'));
      }
    },
    async batchDeleteOrders() {
      const rows = this.batchDeletableList;
      if (!rows.length) return;
      const total = this.effectiveSelected.length;
      try {
        await this.$confirm(
          batchDeleteConfirmMessage({ total, ok: rows.length }),
          '批量删除确认',
          { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
        );
      } catch {
        return;
      }
      try {
        const r = await batchDeleteSalesOrders(rows.map((x) => x.id));
        if (r.failed?.length) {
          this.$message.warning(`已删除 ${r.ok} 条，${r.failed.length} 条未能删除（无权限或状态不允许）`);
        } else {
          this.$message.success(`已删除 ${r.ok} 条`);
        }
        this.clearOrderSelection();
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '删除失败'));
      }
    },
    openFinance(row) {
      this.reviewDialogKind = 'finance';
      this.reviewDialogRows = [row];
      this.reviewDialogVisible = true;
    },
    openFinanceBatch() {
      const rows = this.batchFinanceReviewableList;
      if (!rows.length) return;
      this.reviewDialogKind = 'finance';
      this.reviewDialogRows = [...rows];
      this.reviewDialogVisible = true;
    },
    async submitSingle(row) {
      try {
        await this.$confirm(`提交订单 ${row.order_no} 至财务审核？财务将收到站内信通知。`, '提交审核', {
          type: 'warning'
        });
      } catch {
        return;
      }
      try {
        const r = await batchSubmitSalesOrderReview([row.id]);
        if (r.failed?.length) {
          this.$message.error(`提交失败：${r.failed[0].error}`);
        } else {
          this.$message.success('已提交审核');
          this.load();
          this.$refs.messagesDrawerRef?.refresh();
        }
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    async batchSubmitReview() {
      const rows = this.batchSubmittableList;
      if (!rows.length) return;
      const total = this.effectiveSelected.length;
      try {
        await this.$confirm(
          batchSubmitConfirmMessage({ total, ok: rows.length }),
          '批量提交审核',
          { type: 'warning' }
        );
      } catch {
        return;
      }
      try {
        const r = await batchSubmitSalesOrderReview(rows.map((x) => x.id));
        const warning = summarizeBatchPartialFailure(r, batchSubmitErrorLabel);
        if (warning) {
          this.$message.warning(warning);
        } else {
          this.$message.success(`已提交 ${r.ok} 笔`);
        }
        this.clearOrderSelection();
        this.load();
        this.$refs.messagesDrawerRef?.refresh();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    async batchWithdrawReview() {
      const rows = this.batchWithdrawableList;
      if (!rows.length) return;
      const total = this.effectiveSelected.length;
      try {
        await this.$confirm(
          batchWithdrawConfirmMessage({ total, ok: rows.length }),
          '批量撤回审核',
          { type: 'warning' }
        );
      } catch {
        return;
      }
      try {
        const r = await batchWithdrawSalesOrderReview(rows.map((x) => x.id));
        const warning = summarizeBatchPartialFailure(r, batchWithdrawErrorLabel);
        if (warning) {
          this.$message.warning(warning);
        } else {
          this.$message.success(`已撤回 ${r.ok} 笔`);
        }
        this.clearOrderSelection();
        this.load();
        this.$refs.messagesDrawerRef?.refresh();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    openQcReviewBatch() {
      const rows = this.batchQcReviewableList;
      if (!rows.length) return;
      this.reviewDialogKind = 'qc';
      this.reviewDialogRows = [...rows];
      this.reviewDialogVisible = true;
    },
    async approveSingleQc(row) {
      try {
        await this.$confirm(`确认审核通过订单 ${row.order_no}？通过后仓库可发货。`, '审核通过', { type: 'warning' });
      } catch {
        return;
      }
      this.qcReviewLoading = true;
      try {
        const r = await batchQcReviewSalesOrder({
          ids: [row.id],
          result: 'approved',
          comment: ''
        });
        if (r.failed?.length) {
          this.$message.warning('部分订单未能处理，请刷新后重试');
        } else {
          this.$message.success('订单已进入待备货发货');
        }
        this.load();
        this.$refs.messagesDrawerRef?.refresh();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      } finally {
        this.qcReviewLoading = false;
      }
    },
    async rejectSingleQc(row) {
      let comment = '';
      try {
        const { value } = await this.$prompt(`请输入驳回订单 ${row.order_no} 的原因`, '驳回', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          inputType: 'textarea',
          inputPlaceholder: '驳回原因必填',
          inputValidator: (v) => {
            if (!v || !String(v).trim()) return '驳回原因必填';
            return true;
          }
        });
        comment = String(value || '').trim();
      } catch {
        return;
      }
      if (!comment) return;
      this.qcReviewLoading = true;
      try {
        const r = await batchQcReviewSalesOrder({
          ids: [row.id],
          result: 'rejected',
          comment
        });
        if (r.failed?.length) {
          this.$message.warning('部分订单未能处理，请刷新后重试');
        } else {
          this.$message.success('已驳回 1 笔订单');
        }
        this.load();
        this.$refs.messagesDrawerRef?.refresh();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      } finally {
        this.qcReviewLoading = false;
      }
    },
    openShip(row) {
      this.shipDialogRow = row;
      this.shipDialogBatchList = [];
      this.shipDialogVisible = true;
    },
    openShipBatch() {
      const rows = this.batchShippableList;
      if (!rows.length) return;
      this.shipDialogRow = null;
      this.shipDialogBatchList = [...rows];
      this.shipDialogVisible = true;
    },
    async approveSingle(row) {
      await this.loadOrderFlowConfig();
      try {
        await this.$confirm(
          `确认财务通过订单 ${row.order_no}？${this.financeApproveConfirmHint}`,
          '财务通过',
          { type: 'warning' }
        );
      } catch {
        return;
      }
      this.financeLoading = true;
      try {
        const r = await batchFinanceReviewSalesOrder({
          ids: [row.id],
          result: 'approved',
          comment: ''
        });
        if (r.failed?.length) {
          this.$message.warning('部分订单未能处理，请刷新后重试');
        } else {
          const payload = r?.data ?? r;
          const item = (payload.ok_items || payload.okItems)?.[0];
          this.$message.success(this.financeApproveSuccessMessage(item?.to_status));
        }
        this.load();
        this.$refs.messagesDrawerRef?.refresh();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      } finally {
        this.financeLoading = false;
      }
    },
    async rejectSingle(row) {
      let comment = '';
      try {
        const { value } = await this.$prompt(`请输入驳回订单 ${row.order_no} 的原因`, '驳回订单', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          inputType: 'textarea',
          inputPlaceholder: '驳回原因必填',
          inputValidator: (v) => {
            if (!v || !String(v).trim()) return '驳回原因必填';
            return true;
          }
        });
        comment = String(value || '').trim();
      } catch {
        return;
      }
      if (!comment) return;
      this.financeLoading = true;
      try {
        const r = await batchFinanceReviewSalesOrder({
          ids: [row.id],
          result: 'rejected',
          comment
        });
        if (r.failed?.length) {
          this.$message.warning('部分订单未能处理，请刷新后重试');
        } else {
          this.$message.success('已驳回 1 笔订单');
        }
        this.load();
        this.$refs.messagesDrawerRef?.refresh();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      } finally {
        this.financeLoading = false;
      }
    },
    async doComplete(row) {
      try {
        await this.$confirm(
          `确认将订单 ${row.order_no} 标记为已完结？`,
          '完结订单',
          { type: 'warning' }
        );
      } catch {
        return;
      }
      try {
        await completeSalesOrder(row.id);
        this.$message.success('已完结');
        this.load();
        this.$refs.messagesDrawerRef?.refresh();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    async doCancel(row) {
      try {
        await this.$confirm(`确认取消订单 ${row.order_no}？`, '取消订单', { type: 'warning' });
      } catch {
        return;
      }
      try {
        await cancelSalesOrder(row.id);
        this.$message.success('已取消');
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    async downloadTpl() {
      try {
        await downloadSalesOrderImportTemplateFile();
      } catch {
        this.$message.error('下载失败');
      }
    },
    async onImportFile(file) {
      const run = async (confirmDuplicate) => {
        const r = await importSalesOrderXlsxFile(file, { confirmDuplicate });
        const summary = summarizeImportResult(r);
        if (summary.showDupDialog) this.openImportDupDialog(summary.dupRows);
        if (summary.showErrorsDialog) this.openImportErrorsDialog(summary.errorRows);
        for (const m of summary.messages) {
          if (m.type === 'warning') this.$message.warning(m.text);
          else this.$message.success(m.text);
        }
        if (summary.shouldReload) {
          this.page = 1;
          await this.load();
          if (summary.createdIds.length) this.focusImportedOrders(summary.createdIds);
        }
      };
      try {
        await run(false);
      } catch (e) {
        const parsed = parseSalesOrderImportError(e);
        if (parsed.duplicateGroups) {
          try {
            await this.$confirm(buildExcelDuplicateConfirmMessage(parsed.duplicateGroups), '重复行强提醒', {
              type: 'warning'
            });
            await run(true);
          } catch {
            /* 用户取消 */
          }
          return false;
        }
        this.$message.error(parsed.message || '导入失败');
      }
      return false;
    },
    async exportXlsx() {
      await exportSalesOrdersXlsx({
        total: this.total,
        queryParams: () => this.queryParams(),
        confirmOverLimit: async ({ total, limit }) => {
          try {
            await this.$confirm(
              `当前筛选共 ${total} 条，单次最多导出 ${limit} 条；将仅导出按上传时间倒序的前 ${limit} 条。建议缩小日期范围或增加筛选条件。是否继续？`,
              '导出条数限制',
              { type: 'warning' }
            );
            return true;
          } catch {
            return false;
          }
        },
        onExportingChange: (v) => {
          this.exporting = v;
        },
        onSuccess: (msg) => this.$message.success(msg),
        onError: (e) => {
          if (typeof e === 'string') this.$message.error(e);
          else this.$message.error(this.$apiUserMsg(e, '导出失败'));
        },
        onWarning: (msg) => this.$message.warning(msg)
      });
    },
    async openContractGen() {
      if (!this.effectiveSelected.length) {
        this.$message.warning('请先勾选订单');
        return;
      }
      const already = this.effectiveSelected.filter((r) => r.contract_id);
      if (already.length) {
        this.$message.warning(
          `已选中有 ${already.length} 条订单已关联合同，请取消勾选后再生成`
        );
        return;
      }
      // BIGINT 等在接口里可能是 number 或 string；用数值统一后再去重，避免同一客户被误判为多个
      const normCustomerId = (v) => {
        if (v == null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : String(v).trim();
      };
      const cids = [...new Set(this.effectiveSelected.map((r) => normCustomerId(r.customer_id)))];
      if (cids.length !== 1 || cids[0] == null) {
        this.$message.warning('请选择同一客户的订单');
        return;
      }
      this.genDialogOrderIds = this.effectiveSelected.map((r) => r.id);
      this.genDialogVisible = true;
    },
    openOrderContractPreview(row) {
      const id = row && row.contract_id;
      if (!id) return;
      this.contractPreviewDialogContractId = id;
      this.contractPreviewDialogVisible = true;
    },
    async downloadOrderContractFile(row, format) {
      const id = row && row.contract_id;
      if (!id) return;
      try {
        await downloadContractFile(id, format);
      } catch (e) {
        this.$message.error(contractDownloadErrorMessage(e, this.$apiUserMsg(e, '下载失败')));
      }
    },
    openBindContractForRow(row) {
      if (!this.canAddContractForRow(row)) return;
      this.bindContractDialogOrderId = row.id;
      this.bindContractDialogCustomerName = row.customer_name || '';
      this.bindContractDialogCustomerId = row.customer_id || null;
      this.bindContractDialogVisible = true;
    },
    /* ---- 子组件 success 回调 ---- */
    onFormDialogSuccess() {
      this.load();
    },
    onReviewSuccess() {
      this.load();
      this.$refs.messagesDrawerRef?.refresh();
    },
    onShipSuccess() {
      this.clearOrderSelection();
      this.load();
      this.$refs.messagesDrawerRef?.refresh();
    },
    onGenSuccess() {
      this.load();
    },
    onBindContractSuccess() {
      this.load();
    },
    onQcBindSuccess() {
      this.load();
    },
    onFieldManageChanged() {
      this.ensureOrderFieldDefinitions();
      this.maybeAutoEnableVirtualTable();
      this.load();
    },
    onUnreadChanged(count) {
      this.unreadCount = count;
    }
  }
};
</script>

<style>
@import '../styles/salesOrdersPage.css';
</style>
