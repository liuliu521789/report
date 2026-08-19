<template>
  <el-card class="toolbar-card" shadow="never">
    <div v-if="isMobile" class="mobile-filters">
      <el-select
        :model-value="filters.searchField"
        placeholder="搜索字段"
        class="w-full"
        @update:model-value="patchFilters({ searchField: $event })"
      >
        <el-option label="客户名称" value="customer_name" />
        <el-option label="客户编号" value="customer_code" />
        <el-option label="标签型号" value="product_model" />
        <el-option label="仓库型号" value="warehouse_model" />
        <el-option label="订单号" value="order_no" />
      </el-select>
      <el-input
        :model-value="filters.searchValue"
        placeholder="输入搜索内容"
        clearable
        class="w-full"
        @update:model-value="patchFilters({ searchValue: $event })"
        @input="$emit('search-input')"
        @clear="$emit('search-input')"
        @keyup.enter="$emit('load-now')"
      />
      <el-select
        :model-value="statusFilterSelection"
        placeholder="订单状态"
        clearable
        class="w-full"
        @update:model-value="$emit('update:statusFilterSelection', $event)"
        @change="$emit('status-filter-change')"
      >
        <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
      </el-select>
      <el-date-picker
        :model-value="dateRange"
        type="daterange"
        range-separator="至"
        :start-placeholder="orderDateRangeStartPh"
        :end-placeholder="orderDateRangeEndPh"
        value-format="YYYY-MM-DD"
        class="w-full mobile-date-range"
        @update:model-value="$emit('update:dateRange', $event)"
        @change="$emit('load')"
      />
      <div class="mobile-filter-actions">
        <el-button type="primary" class="mobile-filter-actions__primary" icon="Search" @click="$emit('load-now')">
          查询
        </el-button>
        <el-button class="mobile-filter-actions__reset" :disabled="!hasActiveFilters" @click="$emit('reset-filters')">
          重置
        </el-button>
      </div>
    </div>
    <div v-else class="toolbar">
      <div class="left">
        <el-input
          :model-value="filters.searchValue"
          placeholder="输入搜索内容"
          clearable
          class="search-bar"
          @update:model-value="patchFilters({ searchValue: $event })"
          @input="$emit('search-input')"
          @clear="$emit('search-input')"
          @keyup.enter="$emit('load-now')"
        >
          <template #prepend>
            <el-select
              :model-value="filters.searchField"
              placeholder="搜索"
              style="width:110px"
              @update:model-value="patchFilters({ searchField: $event })"
            >
              <el-option label="客户名称" value="customer_name" />
              <el-option label="客户编号" value="customer_code" />
              <el-option label="标签型号" value="product_model" />
              <el-option label="仓库型号" value="warehouse_model" />
              <el-option label="订单号" value="order_no" />
            </el-select>
          </template>
        </el-input>
        <el-select
          :model-value="statusFilterSelection"
          placeholder="订单状态"
          clearable
          class="field-select"
          @update:model-value="$emit('update:statusFilterSelection', $event)"
          @change="$emit('status-filter-change')"
        >
          <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-date-picker
          :model-value="dateRange"
          type="daterange"
          range-separator="至"
          :start-placeholder="orderDateRangeStartPh"
          :end-placeholder="orderDateRangeEndPh"
          value-format="YYYY-MM-DD"
          class="field-date"
          @update:model-value="$emit('update:dateRange', $event)"
          @change="$emit('load')"
        />
        <el-button type="primary" :icon="Search" @click="$emit('load-now')">查询</el-button>
        <el-button :disabled="!hasActiveFilters" @click="$emit('reset-filters')">重置</el-button>
      </div>
      <div class="right">
        <el-button v-if="perm('order_management', 'order_input')" type="primary" @click="$emit('open-create')">
          手动录入
        </el-button>
        <el-dropdown v-if="showToolbarManageMenu" trigger="click" @command="$emit('toolbar-manage', $event)">
          <el-button>
            管理
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="perm('process_management', 'edit_flow')" command="flow-config">
                审核流程
              </el-dropdown-item>
              <el-dropdown-item v-if="perm('order_management', 'order_field_config')" command="field-manage">
                表单字段
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div v-if="activeFilterTags.length" class="order-filter-tags">
      <span class="order-filter-tags__label">当前筛选</span>
      <el-tag
        v-for="tag in activeFilterTags"
        :key="tag.key"
        closable
        size="small"
        type="info"
        effect="plain"
        class="order-filter-tag"
        @close="tag.onClose()"
      >
        {{ tag.label }}
      </el-tag>
      <el-button link type="primary" size="small" class="order-filter-tags__clear" @click="$emit('reset-filters')">
        清空全部
      </el-button>
    </div>

    <div class="batch-actions" :class="{ 'batch-actions--mobile': isMobile }">
      <el-button
        v-if="isMobile"
        text
        type="primary"
        class="mobile-batch-toggle"
        @click="$emit('update:mobileBatchOpen', !mobileBatchOpen)"
      >
        {{ mobileBatchOpen ? '收起更多操作' : '更多操作（导入/导出/批量）' }}
        <el-icon class="el-icon--right"><ArrowDown v-if="!mobileBatchOpen" /><ArrowUp v-else /></el-icon>
      </el-button>
      <div v-show="!isMobile || mobileBatchOpen" class="batch-actions-inner">
        <div class="batch-actions-group">
          <span v-if="!isMobile" class="batch-actions-group__label">数据</span>
          <el-upload
            v-if="perm('order_management', 'order_input')"
            :show-file-list="false"
            accept=".xlsx,.xls"
            :before-upload="onImportBeforeUpload"
          >
            <el-button type="primary" :icon="UploadFilled">Excel 导入</el-button>
          </el-upload>
          <el-button
            v-if="canExport"
            :loading="exporting"
            type="primary"
            plain
            :icon="Download"
            @click="$emit('export-xlsx')"
          >
            导出 Excel
          </el-button>
          <el-button
            v-if="perm('order_management', 'order_input')"
            :icon="Download"
            @click="$emit('download-template')"
          >
            下载导入模板
          </el-button>
          <template v-if="isMobile">
            <el-dropdown v-if="showToolbarManageMenu" trigger="click" @command="$emit('toolbar-manage', $event)">
              <el-button>管理</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="perm('process_management', 'edit_flow')" command="flow-config">
                    审核流程
                  </el-dropdown-item>
                  <el-dropdown-item v-if="perm('order_management', 'order_field_config')" command="field-manage">
                    表单字段
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button v-if="perm('order_management', 'order_input')" type="primary" @click="$emit('open-create')">
              手动录入
            </el-button>
          </template>
        </div>
        <el-divider v-if="!isMobile" direction="vertical" class="batch-group-divider" />
        <div class="batch-actions-group batch-actions-group--batch">
          <span v-if="!isMobile" class="batch-actions-group__label">批量</span>
          <span v-if="selectedCount > 0" class="selected-tip">{{ selectedCountLabel || `已选 ${selectedCount} 条` }}</span>
          <SalesOrderBatchActions
            variant="toolbar"
            :selected-count="selectedCount"
            :batch-submit-button-label="batchSubmitButtonLabel"
            :batch-submit-tooltip="batchSubmitTooltip"
            :batch-submit-disabled="batchSubmitDisabled"
            :batch-submit-tip-disabled="batchSubmitTipDisabled"
            :batch-withdraw-button-label="batchWithdrawButtonLabel"
            :batch-withdraw-tooltip="batchWithdrawTooltip"
            :batch-withdraw-disabled="batchWithdrawDisabled"
            :batch-withdraw-tip-disabled="batchWithdrawTipDisabled"
            :batch-delete-button-label="batchDeleteButtonLabel"
            :batch-delete-tooltip="batchDeleteTooltip"
            :batch-delete-disabled="batchDeleteDisabled"
            :batch-delete-tip-disabled="batchDeleteTipDisabled"
            :batch-finance-count="batchFinanceCount"
            :batch-qc-count="batchQcCount"
            :batch-ship-count="batchShipCount"
            :batch-ship-visible="batchShipVisible"
            @batch-submit="$emit('batch-submit')"
            @batch-withdraw="$emit('batch-withdraw')"
            @open-finance-batch="$emit('open-finance-batch')"
            @open-qc-batch="$emit('open-qc-batch')"
            @open-ship-batch="$emit('open-ship-batch')"
            @batch-delete="$emit('batch-delete')"
            @open-contract-gen="$emit('open-contract-gen')"
          />
        </div>
      </div>
    </div>
  </el-card>
</template>

<script>
import { ArrowDown, ArrowUp, Download, Search, UploadFilled } from '@element-plus/icons-vue';
import { perm } from '../../utils/permissions';
import SalesOrderBatchActions from './SalesOrderBatchActions.vue';

export default {
  name: 'SalesOrderListToolbar',
  components: { SalesOrderBatchActions, ArrowDown, ArrowUp },
  props: {
    isMobile: { type: Boolean, default: false },
    filters: { type: Object, required: true },
    dateRange: { type: Array, default: () => [] },
    statusFilterSelection: { type: String, default: '' },
    statusOptions: { type: Array, default: () => [] },
    mobileBatchOpen: { type: Boolean, default: false },
    activeFilterTags: { type: Array, default: () => [] },
    hasActiveFilters: { type: Boolean, default: false },
    orderDateRangeStartPh: { type: String, default: '开始时间' },
    orderDateRangeEndPh: { type: String, default: '结束时间' },
    showToolbarManageMenu: { type: Boolean, default: false },
    canExport: { type: Boolean, default: false },
    exporting: { type: Boolean, default: false },
    selectedCount: { type: Number, default: 0 },
    selectedCountLabel: { type: String, default: '' },
    batchSubmitButtonLabel: { type: String, default: '' },
    batchSubmitTooltip: { type: String, default: '' },
    batchSubmitDisabled: { type: Boolean, default: true },
    batchSubmitTipDisabled: { type: Boolean, default: true },
    batchWithdrawButtonLabel: { type: String, default: '' },
    batchWithdrawTooltip: { type: String, default: '' },
    batchWithdrawDisabled: { type: Boolean, default: true },
    batchWithdrawTipDisabled: { type: Boolean, default: true },
    batchDeleteButtonLabel: { type: String, default: '' },
    batchDeleteTooltip: { type: String, default: '' },
    batchDeleteDisabled: { type: Boolean, default: true },
    batchDeleteTipDisabled: { type: Boolean, default: true },
    batchFinanceCount: { type: Number, default: 0 },
    batchQcCount: { type: Number, default: 0 },
    batchShipCount: { type: Number, default: 0 },
    batchShipVisible: { type: Boolean, default: false }
  },
  emits: [
    'update:filters',
    'update:dateRange',
    'update:statusFilterSelection',
    'update:mobileBatchOpen',
    'search-input',
    'load-now',
    'load',
    'reset-filters',
    'status-filter-change',
    'open-create',
    'toolbar-manage',
    'import-file',
    'export-xlsx',
    'download-template',
    'batch-submit',
    'batch-withdraw',
    'open-finance-batch',
    'open-qc-batch',
    'open-ship-batch',
    'batch-delete',
    'open-contract-gen'
  ],
  setup() {
    return { Search, UploadFilled, Download, perm };
  },
  methods: {
    patchFilters(partial) {
      this.$emit('update:filters', { ...this.filters, ...partial });
    },
    onImportBeforeUpload(file) {
      this.$emit('import-file', file);
      return false;
    }
  }
};
</script>

<style scoped>
.sales-order-batch-actions {
  display: contents;
}
</style>
