<template>
  <div v-if="perm('order_management', 'order_query')" class="table-list-toolbar desktop-only">
    <SalesOrderFlowBoard
      :flow-summary="flowSummary"
      :sla-summary="flowSlaSummary"
      :active-bucket="flowBucket"
      :respect-date="flowBoardRespectDate"
      :loading="flowSlaLoading"
      @select="$emit('flow-board-select', $event)"
      @update:respect-date="$emit('update:flowBoardRespectDate', $event)"
    />
  </div>
  <div class="table-list-controls desktop-only">
    <span class="table-list-controls__hint">共 {{ total }} 条 · 双击行可编辑</span>
    <span v-if="lastListSyncedLabel" class="table-list-controls__sync-hint">{{ lastListSyncedLabel }}</span>
    <div class="table-list-controls__actions">
      <el-button size="small" :loading="loading" icon="Refresh" @click="$emit('refresh')">刷新</el-button>
      <el-popover placement="bottom-start" :width="220" trigger="click">
        <template #reference>
          <el-button size="small">
            列显示
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
        </template>
        <div class="order-list-column-picker">
          <div class="order-list-column-picker__title">
            部分列默认隐藏；勾选「发货人」可显示独立列（状态角标仍会尽量带出姓名）
          </div>
          <el-checkbox v-model="orderListColVisible.orderNo">订单号</el-checkbox>
          <el-checkbox v-model="orderListColVisible.sales">销售</el-checkbox>
          <el-checkbox v-model="orderListColVisible.shipper">发货人</el-checkbox>
          <el-checkbox v-model="orderListColVisible.uploadedAt">上传日期</el-checkbox>
        </div>
      </el-popover>
      <el-checkbox
        :model-value="ordersVirtualTable"
        size="small"
        @update:model-value="$emit('update:ordersVirtualTable', $event)"
        @change="$emit('virtual-table-change')"
      >
        虚拟滚动（大数据）
      </el-checkbox>
      <el-checkbox
        v-if="perm('order_management', 'order_field_config')"
        :model-value="orderTableDesignMode"
        size="small"
        :disabled="ordersVirtualTable"
        :title="ordersVirtualTable ? '请先关闭虚拟滚动' : ''"
        @update:model-value="$emit('update:orderTableDesignMode', $event)"
        @change="$emit('design-mode-change')"
      >
        设计表
      </el-checkbox>
    </div>
  </div>
  <div
    class="table-inner desktop-only"
    :class="{ 'table-inner--v2': ordersVirtualTable }"
    v-loading="loading"
    element-loading-text="加载中..."
  >
    <template v-if="ordersVirtualTable">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="orders-v2-hint"
        title="虚拟列表模式下仍可通过首列勾选做批量操作；勾选状态按订单 id 保留。合同与二维码缩略图仍不展示以减轻渲染压力。"
      />
      <SalesOrderListEmpty
        v-if="!items.length && !loading"
        :description="listEmptyDescription"
        :is-filtered="listEmptyIsFiltered"
        :can-input="perm('order_management', 'order_input')"
        @reset-filters="$emit('reset-filters')"
        @open-create="$emit('open-create')"
        @download-template="$emit('download-template')"
      />
      <el-auto-resizer v-else>
        <template #default="{ height, width }">
          <el-table-v2
            v-if="height > 0 && width > 0"
            :key="'orders-v2-' + customerListNameMode"
            class="orders-table-v2"
            :columns="handlers.scaleOrdersV2Columns(ordersV2Columns, width)"
            :data="items"
            :width="width"
            :height="height"
            :row-height="52"
            :row-class="handlers.orderV2RowClass"
            :row-event-handlers="ordersV2RowEventHandlers"
            row-key="id"
          />
        </template>
      </el-auto-resizer>
    </template>
    <el-table
      v-else
      :key="'orders-table-' + customerListNameMode"
      ref="ordersTable"
      class="orders-table"
      :class="{ 'orders-table--design': showOrderHeaderDesign }"
      :data="items"
      border
      stripe
      height="100%"
      style="width: 100%; table-layout: fixed;"
      row-key="id"
      :row-class-name="handlers.orderRowClassName"
      @selection-change="$emit('selection-change', $event)"
      @row-dblclick="$emit('row-dblclick', $event)"
    >
      <template #empty>
        <SalesOrderListEmpty
          :description="listEmptyDescription"
          :is-filtered="listEmptyIsFiltered"
          :can-input="perm('order_management', 'order_input')"
          @reset-filters="$emit('reset-filters')"
          @open-create="$emit('open-create')"
          @download-template="$emit('download-template')"
        />
      </template>
      <el-table-column
        v-if="showOrderRowSelection"
        type="selection"
        width="40"
        :reserve-selection="true"
        :selectable="handlers.orderRowSelectable"
      />
      <el-table-column
        v-if="orderListColVisible.orderNo"
        prop="order_no"
        label="订单号"
        align="center"
        header-align="center"
        show-overflow-tooltip
      />
      <el-table-column label="状态" min-width="112" align="center" header-align="center" class-name="orders-col-status">
        <template #default="{ row }">
          <div class="orders-status-cell">
            <SalesStatusPill kind="order" :order-row="row" clickable @click="handlers.openLogs(row)" />
          </div>
        </template>
      </el-table-column>
      <el-table-column
        v-if="orderListColVisible.shipper"
        prop="shipped_by_name"
        label="发货人"
        align="center"
        header-align="center"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="orderListColVisible.sales"
        prop="created_by_username"
        label="销售"
        align="center"
        header-align="center"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="orderListColVisible.uploadedAt"
        label="上传日期"
        align="center"
        header-align="center"
        show-overflow-tooltip
      >
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column
        v-for="col in orderListFieldDefinitions"
        :key="col.field_key"
        :prop="'display_data.' + col.field_key"
        align="center"
        header-align="center"
        show-overflow-tooltip
      >
        <template #header>
          <div v-if="handlers.isCustomerNameColumn(col)" class="orders-customer-header">
            <span class="orders-col-header__text">
              {{ col.required ? '*' : '' }}{{ handlers.orderListColumnTitle(col) }}
            </span>
            <div class="orders-customer-header__mode" @click.stop @mousedown.stop>
              <el-button
                size="small"
                :type="customerListNameMode === 'short' ? 'primary' : 'default'"
                @click="handlers.setCustomerListNameMode('short')"
              >
                简称
              </el-button>
              <el-button
                size="small"
                :type="customerListNameMode === 'full' ? 'primary' : 'default'"
                @click="handlers.setCustomerListNameMode('full')"
              >
                全称
              </el-button>
            </div>
          </div>
          <span v-else-if="!showOrderHeaderDesign" class="orders-col-header__text">
            {{ col.required ? '*' : '' }}{{ handlers.orderListColumnTitle(col) }}
          </span>
          <span v-else class="orders-col-header">
            <span class="orders-col-header__text">
              {{ col.required ? '*' : '' }}{{ handlers.orderListColumnTitle(col) }}
            </span>
            <span class="header-field-actions">
              <el-icon class="header-field-icon" @click.stop="handlers.editFieldRow(col)"><Edit /></el-icon>
              <el-icon
                v-if="col.is_active"
                class="header-field-icon danger"
                @click.stop="handlers.removeFieldRow(col)"
              >
                <Delete />
              </el-icon>
            </span>
          </span>
        </template>
        <template #default="{ row }">{{ handlers.displayCell(row, col.field_key) }}</template>
      </el-table-column>
      <el-table-column v-if="showOrderHeaderDesign" width="40" align="center" header-align="center">
        <template #header>
          <el-button type="primary" link circle @click.stop="handlers.openNewField()">
            <el-icon><Plus /></el-icon>
          </el-button>
        </template>
      </el-table-column>
      <el-table-column
        v-if="showOrderListContractCol"
        label="合同"
        min-width="72"
        align="center"
        header-align="center"
        class-name="orders-col-contract"
      >
        <template #default="{ row }">
          <div class="contract-cell">
            <template v-if="row.contract_id">
              <div
                class="contract-thumb-wrap contract-thumb-wrap--icon"
                :class="'contract-thumb-wrap--' + (row.contract_status || 'draft')"
                :title="'合同 · ' + handlers.contractStatusLabel(row.contract_status || 'draft')"
              >
                <div class="contract-thumb-body">
                  <WordDocumentIcon class="contract-doc-icon" />
                </div>
                <div
                  class="contract-audit-glass"
                  :class="'contract-audit-glass--' + (row.contract_status || 'draft')"
                >
                  {{ handlers.contractStatusLabel(row.contract_status || 'draft') }}
                </div>
                <div class="contract-thumb-actions">
                  <el-tooltip content="查看预览" placement="top">
                    <el-button
                      type="primary"
                      circle
                      size="small"
                      class="contract-thumb-action"
                      @click.stop="handlers.openOrderContractPreview(row)"
                    >
                      <el-icon><View /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-dropdown trigger="click" @command="(cmd) => handlers.downloadOrderContractFile(row, cmd)">
                    <el-button type="success" circle size="small" class="contract-thumb-action" @click.stop>
                      <el-icon><Download /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="word">下载 Word</el-dropdown-item>
                        <el-dropdown-item command="pdf">下载 PDF</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </template>
            <template v-else>
              <span class="contract-placeholder">未绑定</span>
              <el-button
                v-if="handlers.canAddContractForRow(row)"
                class="contract-add"
                type="primary"
                circle
                size="small"
                title="绑定已有合同"
                @click="handlers.openBindContractForRow(row)"
              >
                <el-icon><Plus /></el-icon>
              </el-button>
            </template>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        v-if="showOrderListQcCol"
        label="质检"
        min-width="72"
        align="center"
        header-align="center"
        class-name="orders-col-qc"
      >
        <template #default="{ row }">
          <div class="qc-cell">
            <div v-if="row.qc_public_url && row.qc_thumb_data_url" class="qc-thumb-wrap">
              <img class="qc-thumb-img" :src="row.qc_thumb_data_url" alt="">
              <div class="qc-thumb-actions">
                <el-tooltip content="下载二维码" placement="top">
                  <span class="qc-thumb-action-host">
                    <el-button
                      type="primary"
                      circle
                      size="small"
                      class="qc-thumb-action"
                      @click.stop="handlers.downloadQcThumb(row)"
                    >
                      <el-icon><Download /></el-icon>
                    </el-button>
                  </span>
                </el-tooltip>
                <el-tooltip content="预览" placement="top">
                  <span class="qc-thumb-action-host">
                    <el-button
                      type="success"
                      circle
                      size="small"
                      class="qc-thumb-action"
                      @click.stop="handlers.previewQcThumb(row)"
                    >
                      <el-icon><View /></el-icon>
                    </el-button>
                  </span>
                </el-tooltip>
                <el-tooltip
                  :content="handlers.canRemoveQc(row) ? '删除二维码绑定' : '当前不可删除二维码绑定'"
                  placement="top"
                >
                  <span class="qc-thumb-action-host">
                    <el-button
                      type="danger"
                      circle
                      size="small"
                      class="qc-thumb-action"
                      :disabled="!handlers.canRemoveQc(row)"
                      @click.stop="handlers.handleClearQc(row)"
                    >
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </span>
                </el-tooltip>
              </div>
            </div>
            <span
              v-else
              :class="[
                'qc-placeholder',
                handlers.qcPlaceholderShowsGenerate(row) && perm('reports', 'create')
                  ? 'qc-placeholder--link'
                  : 'muted'
              ]"
              @click="handlers.onQcPlaceholderClick(row)"
            >
              {{ handlers.qcPlaceholderText(row) }}
            </span>
            <el-button
              v-if="handlers.canEditOrderQc(row)"
              class="qc-add"
              type="primary"
              circle
              size="small"
              title="绑定二维码"
              @click="handlers.openQcBind(row)"
            >
              <el-icon><Plus /></el-icon>
            </el-button>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        min-width="100"
        align="center"
        header-align="center"
        class-name="orders-col-actions"
      >
        <template #default="{ row }">
          <div class="orders-row-actions">
            <el-tooltip
              v-for="act in handlers.getOrderRowPrimaryActions(row)"
              :key="act.key"
              :content="act.tooltip"
              placement="top"
            >
              <span class="orders-action-btn-host">
                <el-button :type="act.type" :plain="act.plain" size="small" circle @click="act.onClick()">
                  <el-icon><component :is="act.icon" /></el-icon>
                </el-button>
              </span>
            </el-tooltip>
            <el-dropdown
              v-if="handlers.getOrderRowSecondaryActions(row).length"
              trigger="click"
              @command="(key) => handlers.onOrderRowMenuCommand(row, key)"
            >
              <span class="orders-action-btn-host">
                <el-button size="small" circle plain title="更多操作">
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="act in handlers.getOrderRowSecondaryActions(row)"
                    :key="act.key"
                    :command="act.key"
                    :divided="act.divided"
                  >
                    {{ act.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
import { ArrowDown, Delete, Download, Edit, MoreFilled, Plus, View } from '@element-plus/icons-vue';
import SalesStatusPill from '../../components/SalesStatusPill.vue';
import WordDocumentIcon from '../../components/WordDocumentIcon.vue';
import { perm } from '../../utils/permissions';
import SalesOrderFlowBoard from './SalesOrderFlowBoard.vue';
import SalesOrderListEmpty from './SalesOrderListEmpty.vue';

export default {
  name: 'SalesOrderDesktopTable',
  components: {
    SalesStatusPill,
    WordDocumentIcon,
    SalesOrderFlowBoard,
    SalesOrderListEmpty,
    ArrowDown,
    MoreFilled
  },
  props: {
    items: { type: Array, default: () => [] },
    total: { type: Number, default: 0 },
    loading: { type: Boolean, default: false },
    handlers: { type: Object, required: true },
    formatDate: { type: Function, required: true },
    flowSummary: { type: Object, default: () => ({}) },
    flowSlaSummary: { type: Object, default: () => ({}) },
    flowBucket: { type: String, default: '' },
    flowBoardRespectDate: { type: Boolean, default: false },
    flowSlaLoading: { type: Boolean, default: false },
    orderListColVisible: { type: Object, required: true },
    ordersVirtualTable: { type: Boolean, default: false },
    orderTableDesignMode: { type: Boolean, default: false },
    customerListNameMode: { type: String, default: 'short' },
    orderListFieldDefinitions: { type: Array, default: () => [] },
    showOrderHeaderDesign: { type: Boolean, default: false },
    showOrderRowSelection: { type: Boolean, default: false },
    showOrderListContractCol: { type: Boolean, default: false },
    showOrderListQcCol: { type: Boolean, default: false },
    ordersV2Columns: { type: Array, default: () => [] },
    ordersV2RowEventHandlers: { type: Object, default: () => ({}) },
    listEmptyDescription: { type: String, default: '' },
    listEmptyIsFiltered: { type: Boolean, default: false },
    lastListSyncedLabel: { type: String, default: '' }
  },
  emits: [
    'flow-board-select',
    'update:flowBoardRespectDate',
    'refresh',
    'update:ordersVirtualTable',
    'update:orderTableDesignMode',
    'reset-filters',
    'open-create',
    'download-template',
    'selection-change',
    'row-dblclick',
    'virtual-table-change',
    'design-mode-change'
  ],
  setup() {
    return { Delete, Download, Edit, Plus, View, perm };
  },
  methods: {
    getOrdersTable() {
      return this.$refs.ordersTable;
    },
    clearTableSelection() {
      this.$refs.ordersTable?.clearSelection?.();
    },
    toggleTableRowSelection(row, on) {
      this.$refs.ordersTable?.toggleRowSelection?.(row, on);
    },
    setTableCurrentRow(row) {
      this.$refs.ordersTable?.setCurrentRow?.(row);
    },
    doTableLayout() {
      this.$refs.ordersTable?.doLayout?.();
    },
    queryTableCurrentRowEl() {
      return this.$refs.ordersTable?.$el?.querySelector?.('.el-table__body tr.current-row');
    }
  }
};
</script>
