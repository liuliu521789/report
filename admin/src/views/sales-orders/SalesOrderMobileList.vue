<template>
  <div class="mobile-list" v-loading="loading" element-loading-text="加载中...">
    <div class="mobile-list-toolbar">
      <el-button size="small" :loading="loading" icon="Refresh" @click="$emit('refresh')">刷新</el-button>
      <span v-if="lastListSyncedLabel" class="mobile-list-toolbar__sync">{{ lastListSyncedLabel }}</span>
    </div>
    <SalesOrderFlowBoard
      v-if="perm('order_management', 'order_query')"
      class="mobile-flow-board"
      :flow-summary="flowSummary"
      :sla-summary="flowSlaSummary"
      :active-bucket="flowBucket"
      :respect-date="flowBoardRespectDate"
      :loading="flowSlaLoading"
      compact
      @select="$emit('flow-board-select', $event)"
      @update:respect-date="$emit('update:flowBoardRespectDate', $event)"
    />
    <div v-if="showOrderRowSelection && items.length" class="mobile-select-bar">
      <el-checkbox
        :model-value="mobilePageAllSelected"
        :indeterminate="mobilePageIndeterminate"
        @change="$emit('mobile-page-select-all', $event)"
      >
        全选本页
      </el-checkbox>
      <span v-if="selectedCount" class="mobile-select-bar__count">{{ selectedCountLabel || `已选 ${selectedCount} 条` }}</span>
    </div>
    <div
      v-for="row in items"
      :key="'m-' + row.id"
      class="mobile-card"
      :class="{
        'mobile-card--focus': focusOrderId != null && Number(focusOrderId) === Number(row.id),
        'mobile-card--selected': showOrderRowSelection && v2SelectedIds.includes(row.id),
        'mobile-card--highlight': isOrderHighlighted(row),
        'mobile-card--editable': handlers.canEdit(row)
      }"
      @dblclick="$emit('row-dblclick', row)"
    >
      <div class="mobile-head">
        <el-checkbox
          v-if="showOrderRowSelection"
          class="mobile-card__pick"
          :model-value="v2SelectedIds.includes(row.id)"
          :disabled="!handlers.orderRowSelectable(row)"
          @click.stop
          @change="(v) => $emit('v2-row-pick', row, !!v)"
        />
        <strong class="mobile-order-no">{{ row.order_no || '—' }}</strong>
        <SalesStatusPill kind="order" :order-row="row" clickable @click="handlers.openLogs(row)" />
      </div>
      <div v-for="col in mobilePreviewFields" :key="col.field_key" class="mobile-line">
        <span>{{ handlers.orderListColumnTitle(col) }}</span>
        <span>{{ handlers.displayCell(row, col.field_key) }}</span>
      </div>
      <div v-if="orderListColVisible.shipper && row.shipped_by_name" class="mobile-line">
        <span>发货人</span>
        <span>{{ row.shipped_by_name }}</span>
      </div>
      <div v-if="orderListColVisible.sales && row.created_by_username" class="mobile-line">
        <span>销售</span>
        <span>{{ row.created_by_username }}</span>
      </div>
      <div class="mobile-actions">
        <el-button
          v-for="act in handlers.getOrderRowPrimaryActions(row)"
          :key="act.key"
          :type="act.type"
          :plain="act.plain !== false"
          size="small"
          @click="act.onClick()"
        >
          {{ act.label }}
        </el-button>
        <el-dropdown
          v-if="handlers.getOrderRowSecondaryActions(row).length"
          trigger="click"
          @command="(key) => handlers.onOrderRowMenuCommand(row, key)"
        >
          <el-button size="small">更多</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="act in handlers.getOrderRowSecondaryActions(row)"
                :key="act.key"
                :command="act.key"
              >
                {{ act.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
    <SalesOrderListEmpty
      v-if="!items.length && !loading"
      :description="listEmptyDescription"
      :is-filtered="listEmptyIsFiltered"
      :can-input="perm('order_management', 'order_input')"
      @reset-filters="$emit('reset-filters')"
      @open-create="$emit('open-create')"
      @download-template="$emit('download-template')"
    />
  </div>
</template>

<script>
import SalesStatusPill from '../../components/SalesStatusPill.vue';
import { perm } from '../../utils/permissions';
import SalesOrderFlowBoard from './SalesOrderFlowBoard.vue';
import SalesOrderListEmpty from './SalesOrderListEmpty.vue';

export default {
  name: 'SalesOrderMobileList',
  components: { SalesStatusPill, SalesOrderFlowBoard, SalesOrderListEmpty },
  props: {
    items: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    handlers: { type: Object, required: true },
    flowSummary: { type: Object, default: () => ({}) },
    flowSlaSummary: { type: Object, default: () => ({}) },
    flowBucket: { type: String, default: '' },
    flowBoardRespectDate: { type: Boolean, default: false },
    flowSlaLoading: { type: Boolean, default: false },
    showOrderRowSelection: { type: Boolean, default: false },
    v2SelectedIds: { type: Array, default: () => [] },
    selectedCount: { type: Number, default: 0 },
    selectedCountLabel: { type: String, default: '' },
    mobilePageAllSelected: { type: Boolean, default: false },
    mobilePageIndeterminate: { type: Boolean, default: false },
    focusOrderId: { type: [Number, String], default: null },
    mobilePreviewFields: { type: Array, default: () => [] },
    orderListColVisible: { type: Object, default: () => ({}) },
    listEmptyDescription: { type: String, default: '' },
    listEmptyIsFiltered: { type: Boolean, default: false },
    lastListSyncedLabel: { type: String, default: '' },
    isOrderHighlighted: { type: Function, required: true }
  },
  emits: [
    'refresh',
    'flow-board-select',
    'update:flowBoardRespectDate',
    'mobile-page-select-all',
    'row-dblclick',
    'v2-row-pick',
    'reset-filters',
    'open-create',
    'download-template'
  ],
  setup() {
    return { perm };
  }
};
</script>
