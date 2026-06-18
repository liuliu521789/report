<template>
  <div class="sales-orders" :class="{ 'sales-orders--touch': isTouchLike || isMobile }">
     <el-card class="toolbar-card" shadow="never">
       <div v-if="isMobile" class="mobile-filters">
          <el-select v-model="filters.searchField" placeholder="搜索字段" class="w-full">
            <el-option label="客户名称" value="customer_name" />
            <el-option label="客户编号" value="customer_code" />
            <el-option label="标签型号" value="product_model" />
            <el-option label="仓库型号" value="warehouse_model" />
            <el-option label="订单号" value="order_no" />
          </el-select>
          <el-input
            v-model="filters.searchValue"
            placeholder="输入搜索内容"
            clearable
            class="w-full"
            @input="onSearchInput"
            @clear="onSearchInput"
            @keyup.enter="loadNow"
          />
          <el-select v-model="statusFilterSelection" placeholder="订单状态" clearable class="w-full" @change="onStatusFilterChange">
            <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            :start-placeholder="orderDateRangeStartPh"
            :end-placeholder="orderDateRangeEndPh"
            value-format="YYYY-MM-DD"
            class="w-full mobile-date-range"
            @change="load"
          />
          <div class="mobile-filter-actions">
            <el-button type="primary" class="mobile-filter-actions__primary" @click="loadNow" icon="Search">查询</el-button>
            <el-button class="mobile-filter-actions__reset" :disabled="!hasActiveFilters" @click="resetFilters">重置</el-button>
          </div>
       </div>
       <div v-else class="toolbar">
          <div class="left">
            <el-input v-model="filters.searchValue" placeholder="输入搜索内容" clearable @input="onSearchInput" @clear="onSearchInput" @keyup.enter="loadNow" class="search-bar">
              <template #prepend>
                <el-select v-model="filters.searchField" placeholder="搜索" style="width:110px">
                  <el-option label="客户名称" value="customer_name" />
                  <el-option label="客户编号" value="customer_code" />
                  <el-option label="标签型号" value="product_model" />
                  <el-option label="仓库型号" value="warehouse_model" />
                  <el-option label="订单号" value="order_no" />
                </el-select>
              </template>
            </el-input>
           <el-select v-model="statusFilterSelection" placeholder="订单状态" clearable class="field-select" @change="onStatusFilterChange">
             <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
           </el-select>
           <el-date-picker
             v-model="dateRange"
             type="daterange"
             range-separator="至"
             :start-placeholder="orderDateRangeStartPh"
             :end-placeholder="orderDateRangeEndPh"
             value-format="YYYY-MM-DD"
             class="field-date"
             @change="load"
           />
          <el-button type="primary" @click="loadNow" :icon="Search">查询</el-button>
          <el-button :disabled="!hasActiveFilters" @click="resetFilters">重置</el-button>
          </div>
          <div class="right">
            <el-button v-if="perm('order_management', 'order_input')" type="primary" @click="openCreate">手动录入</el-button>
            <el-dropdown
              v-if="showToolbarManageMenu"
              trigger="click"
              @command="onToolbarManageCommand"
            >
              <el-button>
                管理
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-if="perm('process_management', 'edit_flow')"
                    command="flow-config"
                  >
                    审核流程
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-if="perm('order_management', 'order_field_config')"
                    command="field-manage"
                  >
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
        <el-button link type="primary" size="small" class="order-filter-tags__clear" @click="resetFilters">
          清空全部
        </el-button>
      </div>
      <div class="batch-actions" :class="{ 'batch-actions--mobile': isMobile }">
        <el-button
          v-if="isMobile"
          text
          type="primary"
          class="mobile-batch-toggle"
          @click="mobileBatchOpen = !mobileBatchOpen"
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
              :before-upload="onImportFile"
            >
              <el-button type="primary" :icon="UploadFilled">Excel 导入</el-button>
            </el-upload>
            <el-button
              v-if="canExport"
              :loading="exporting"
              @click="exportXlsx"
              type="primary"
              plain
              :icon="Download">导出 Excel</el-button>
            <el-button v-if="perm('order_management', 'order_input')" @click="downloadTpl" :icon="Download">下载导入模板</el-button>
            <template v-if="isMobile">
              <el-dropdown
                v-if="showToolbarManageMenu"
                trigger="click"
                @command="onToolbarManageCommand"
              >
                <el-button>管理</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-if="perm('process_management', 'edit_flow')"
                      command="flow-config"
                    >
                      审核流程
                    </el-dropdown-item>
                    <el-dropdown-item
                      v-if="perm('order_management', 'order_field_config')"
                      command="field-manage"
                    >
                      表单字段
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button v-if="perm('order_management', 'order_input')" type="primary" @click="openCreate">手动录入</el-button>
            </template>
          </div>
          <el-divider v-if="!isMobile" direction="vertical" class="batch-group-divider" />
          <div class="batch-actions-group batch-actions-group--batch">
            <span v-if="!isMobile" class="batch-actions-group__label">批量</span>
            <span class="selected-tip" v-if="effectiveSelected.length > 0">已选 {{ effectiveSelected.length }} 条</span>
            <el-tooltip
              placement="top"
              :disabled="batchSubmitTipDisabled"
              :content="batchSubmitTooltip"
            >
              <span class="batch-del-tooltip-host">
                <el-button
                  v-if="perm('order_management', 'order_submit')"
                  type="primary"
                  plain
                  :disabled="batchSubmitDisabled"
                  @click="batchSubmitReview"
                 :icon="Check">
                  {{ batchSubmitButtonLabel }}
                </el-button>
              </span>
            </el-tooltip>
            <el-tooltip
              placement="top"
              :disabled="batchWithdrawTipDisabled"
              :content="batchWithdrawTooltip"
            >
              <span class="batch-del-tooltip-host">
                <el-button
                  v-if="perm('order_management', 'order_withdraw')"
                  type="warning"
                  plain
                  :disabled="batchWithdrawDisabled"
                  @click="batchWithdrawReview"
                >
                  {{ batchWithdrawButtonLabel }}
                </el-button>
              </span>
            </el-tooltip>
            <el-button
              v-if="perm('order_management', 'order_status_finance')"
              type="warning"
              plain
              :disabled="batchFinanceReviewableList.length === 0"
              @click="openFinanceBatch"
            >
              批量审核
            </el-button>
            <el-button
              v-if="perm('order_management', 'order_status_qc')"
              type="warning"
              plain
              :disabled="batchQcReviewableList.length === 0"
              @click="openQcReviewBatch"
            >
              批量品管审核
            </el-button>
            <el-button
              v-if="batchShipActionVisible"
              type="primary"
              plain
              :disabled="batchShippableList.length === 0"
              @click="openShipBatch"
            >
              批量发货
            </el-button>
            <el-tooltip
              placement="top"
              :disabled="batchDeleteTipDisabled"
              :content="batchDeleteTooltip"
            >
              <span class="batch-del-tooltip-host">
                <el-button
                  v-if="perm('order_management', 'order_delete')"
                  type="danger"
                  plain
                  :disabled="batchDeleteDisabled"
                  @click="batchDeleteOrders"
                 :icon="Delete">
                  {{ batchDeleteButtonLabel }}
                </el-button>
              </span>
            </el-tooltip>
            <el-button
              v-if="perm('contract_management', 'contract_generate')"
              type="success"
              :disabled="effectiveSelected.length === 0"
              @click="openContractGen"
            >生成合同</el-button>
          </div>
        </div>
      </div>
    </el-card>

    <div class="table-wrap">
      <div v-if="perm('order_management', 'order_query')" class="table-list-toolbar desktop-only">
        <SalesOrderFlowBoard
          :flow-summary="flowSummary"
          :sla-summary="flowSlaSummary"
          :active-bucket="filters.flow_bucket"
          :respect-date="flowBoardRespectDate"
          :loading="flowSlaLoading"
          @select="onFlowBoardSelect"
          @update:respect-date="onFlowBoardRespectDateChange"
        />
      </div>
      <div class="table-list-controls desktop-only">
        <span class="table-list-controls__hint">共 {{ total }} 条 · 双击行可编辑</span>
        <span v-if="lastListSyncedLabel" class="table-list-controls__sync-hint">{{ lastListSyncedLabel }}</span>
        <div class="table-list-controls__actions">
          <el-button size="small" :loading="loading" icon="Refresh" @click="refreshListManual">刷新</el-button>
          <el-popover placement="bottom-start" :width="220" trigger="click">
            <template #reference>
              <el-button size="small">
                列显示
                <el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
            </template>
            <div class="order-list-column-picker">
              <div class="order-list-column-picker__title">部分列默认隐藏；勾选「发货人」可显示独立列（状态角标仍会尽量带出姓名）</div>
              <el-checkbox v-model="orderListColVisible.orderNo">订单号</el-checkbox>
              <el-checkbox v-model="orderListColVisible.sales">销售</el-checkbox>
              <el-checkbox v-model="orderListColVisible.shipper">发货人</el-checkbox>
              <el-checkbox v-model="orderListColVisible.uploadedAt">上传日期</el-checkbox>
            </div>
          </el-popover>
          <el-checkbox v-model="ordersVirtualTable" size="small" @change="onOrdersVirtualTableChange">
            虚拟滚动（大数据）
          </el-checkbox>
          <el-checkbox
            v-if="perm('order_management', 'order_field_config')"
            v-model="orderTableDesignMode"
            size="small"
            :disabled="ordersVirtualTable"
            :title="ordersVirtualTable ? '请先关闭虚拟滚动' : ''"
            @change="onOrderTableDesignModeChange"
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
          <div v-if="!items.length && !loading" class="orders-empty-state">
            <el-empty :description="listEmptyDescription" :image-size="72">
              <div class="orders-empty-state__actions">
                <template v-if="listEmptyIsFiltered">
                  <el-button type="primary" plain @click="resetFilters">清空筛选</el-button>
                </template>
                <template v-else>
                  <el-button
                    v-if="perm('order_management', 'order_input')"
                    type="primary"
                    @click="openCreate"
                  >
                    手动录入
                  </el-button>
                  <el-button
                    v-if="perm('order_management', 'order_input')"
                    plain
                    @click="downloadTpl"
                  >
                    下载导入模板
                  </el-button>
                </template>
              </div>
            </el-empty>
          </div>
          <el-auto-resizer v-else>
            <template #default="{ height, width }">
              <el-table-v2
                v-if="height > 0 && width > 0"
                :key="'orders-v2-' + customerListNameMode"
                class="orders-table-v2"
                :columns="scaleOrdersV2Columns(ordersV2Columns, width)"
                :data="items"
                :width="width"
                :height="height"
                :row-height="52"
                :row-class="orderV2RowClass"
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
          :row-class-name="orderRowClassName"
          @selection-change="onOrdersSelectionChange"
          @row-dblclick="onOrderRowDblClick"
        >
        <template #empty>
          <div class="orders-empty-state">
            <el-empty :description="listEmptyDescription" :image-size="72">
              <div class="orders-empty-state__actions">
                <template v-if="listEmptyIsFiltered">
                  <el-button type="primary" plain @click="resetFilters">清空筛选</el-button>
                </template>
                <template v-else>
                  <el-button
                    v-if="perm('order_management', 'order_input')"
                    type="primary"
                    @click="openCreate"
                  >
                    手动录入
                  </el-button>
                  <el-button
                    v-if="perm('order_management', 'order_input')"
                    plain
                    @click="downloadTpl"
                  >
                    下载导入模板
                  </el-button>
                </template>
              </div>
            </el-empty>
          </div>
        </template>
        <el-table-column
          v-if="showOrderRowSelection"
          type="selection"
          width="40"
          :reserve-selection="true"
          :selectable="orderRowSelectable"
        />
        <el-table-column
          v-if="orderListColVisible.orderNo"
          prop="order_no"
          label="订单号"
          align="center"
          header-align="center"
          show-overflow-tooltip
        />
        <el-table-column label="状态" min-width="96" align="center" header-align="center" class-name="orders-col-status">
          <template #default="{ row }">
            <div class="orders-status-cell">
              <el-tooltip content="查看审批记录" placement="top">
                <SalesStatusPill
                  kind="order"
                  :order-row="row"
                  clickable
                  @click="openLogs(row)"
                />
              </el-tooltip>
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
          <template #default="{ row }">
            {{ $dt(row.created_at) }}
          </template>
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
            <div v-if="isCustomerNameColumn(col)" class="orders-customer-header">
              <span class="orders-col-header__text">{{ col.required ? '*' : '' }}{{ orderListColumnTitle(col) }}</span>
              <div class="orders-customer-header__mode" @click.stop @mousedown.stop>
                <el-button
                  size="small"
                  :type="customerListNameMode === 'short' ? 'primary' : 'default'"
                  @click="setCustomerListNameMode('short')"
                >
                  简称
                </el-button>
                <el-button
                  size="small"
                  :type="customerListNameMode === 'full' ? 'primary' : 'default'"
                  @click="setCustomerListNameMode('full')"
                >
                  全称
                </el-button>
              </div>
            </div>
            <span v-else-if="!showOrderHeaderDesign" class="orders-col-header__text">{{ col.required ? '*' : '' }}{{ orderListColumnTitle(col) }}</span>
            <span v-else class="orders-col-header">
              <span class="orders-col-header__text">{{ col.required ? '*' : '' }}{{ orderListColumnTitle(col) }}</span>
              <span class="header-field-actions">
                <el-icon
                  class="header-field-icon"
                  @click.stop="editFieldRow(col)"
                >
                  <Edit />
                </el-icon>
                <el-icon
                  v-if="col.is_active"
                  class="header-field-icon danger"
                  @click.stop="removeFieldRow(col)"
                >
                  <Delete />
                </el-icon>
              </span>
            </span>
          </template>
          <template #default="{ row }">
            {{ displayCell(row, col.field_key) }}
          </template>
        </el-table-column>
        <el-table-column
          v-if="showOrderHeaderDesign"
          width="40"
          align="center"
          header-align="center"
        >
          <template #header>
            <el-button
              type="primary"
              link
              circle
              @click.stop="openNewField"
            >
              <el-icon><Plus /></el-icon>
            </el-button>
          </template>
        </el-table-column>
        <el-table-column v-if="showOrderListContractCol" label="合同" min-width="72" align="center" header-align="center" class-name="orders-col-contract">
          <template #default="{ row }">
            <div class="contract-cell">
              <template v-if="row.contract_id">
                <div
                  class="contract-thumb-wrap contract-thumb-wrap--icon"
                  :class="'contract-thumb-wrap--' + (row.contract_status || 'draft')"
                  :title="'合同 · ' + contractStatusLabel(row.contract_status || 'draft')"
                >
                  <div class="contract-thumb-body">
                    <WordDocumentIcon class="contract-doc-icon" />
                  </div>
                  <div
                    class="contract-audit-glass"
                    :class="'contract-audit-glass--' + (row.contract_status || 'draft')"
                  >
                    {{ contractStatusLabel(row.contract_status || 'draft') }}
                  </div>
                  <div class="contract-thumb-actions">
                    <el-tooltip content="查看预览" placement="top">
                      <el-button
                        type="primary"
                        circle
                        size="small"
                        class="contract-thumb-action"
                        @click.stop="openOrderContractPreview(row)"
                      >
                        <el-icon><View /></el-icon>
                      </el-button>
                    </el-tooltip>
                    <el-dropdown trigger="click" @command="(cmd) => downloadOrderContractFile(row, cmd)">
                      <el-button
                        type="success"
                        circle
                        size="small"
                        class="contract-thumb-action"
                        @click.stop
                      >
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
                  v-if="canAddContractForRow(row)"
                  class="contract-add"
                  type="primary"
                  circle
                  size="small"
                  title="绑定已有合同"
                  @click="openBindContractForRow(row)"
                >
                  <el-icon><Plus /></el-icon>
                </el-button>
              </template>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="showOrderListQcCol" label="质检" min-width="72" align="center" header-align="center" class-name="orders-col-qc">
          <template #default="{ row }">
            <div class="qc-cell">
              <div v-if="row.qc_thumb_data_url" class="qc-thumb-wrap">
                <img
                  class="qc-thumb-img"
                  :src="row.qc_thumb_data_url"
                  alt=""
                >
                <div class="qc-thumb-actions">
                  <el-tooltip content="下载二维码" placement="top">
                    <span class="qc-thumb-action-host">
                      <el-button
                        type="primary"
                        circle
                        size="small"
                        class="qc-thumb-action"
                        @click.stop="downloadQcThumb(row)"
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
                        @click.stop="previewQcThumb(row)"
                      >
                        <el-icon><View /></el-icon>
                      </el-button>
                    </span>
                  </el-tooltip>
                  <el-tooltip
                    :content="canRemoveQc(row) ? '删除二维码绑定' : '当前不可删除二维码绑定'"
                    placement="top"
                  >
                    <span class="qc-thumb-action-host">
                      <el-button
                        type="danger"
                        circle
                        size="small"
                        class="qc-thumb-action"
                        :disabled="!canRemoveQc(row)"
                        @click.stop="handleClearQc(row)"
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
                  qcPlaceholderShowsGenerate(row) && perm('reports', 'create') ? 'qc-placeholder--link' : 'muted'
                ]"
                @click="onQcPlaceholderClick(row)"
              >{{ qcPlaceholderText(row) }}</span>
              <el-button
                v-if="canEditOrderQc(row)"
                class="qc-add"
                type="primary"
                circle
                size="small"
                title="绑定二维码"
                @click="openQcBind(row)"
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
                v-for="act in getOrderRowPrimaryActions(row)"
                :key="act.key"
                :content="act.tooltip"
                placement="top"
              >
                <span class="orders-action-btn-host">
                  <el-button
                    :type="act.type"
                    :plain="act.plain"
                    size="small"
                    circle
                    @click="act.onClick()"
                  >
                    <el-icon><component :is="act.icon" /></el-icon>
                  </el-button>
                </span>
              </el-tooltip>
              <el-dropdown
                v-if="getOrderRowSecondaryActions(row).length"
                trigger="click"
                @command="(key) => onOrderRowMenuCommand(row, key)"
              >
                <span class="orders-action-btn-host">
                  <el-button size="small" circle plain title="更多操作">
                    <el-icon><MoreFilled /></el-icon>
                  </el-button>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="act in getOrderRowSecondaryActions(row)"
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

      <div class="mobile-list" v-loading="loading" element-loading-text="加载中...">
        <div class="mobile-list-toolbar">
          <el-button size="small" :loading="loading" icon="Refresh" @click="refreshListManual">刷新</el-button>
          <span v-if="lastListSyncedLabel" class="mobile-list-toolbar__sync">{{ lastListSyncedLabel }}</span>
        </div>
        <SalesOrderFlowBoard
          v-if="perm('order_management', 'order_query')"
          class="mobile-flow-board"
          :flow-summary="flowSummary"
          :sla-summary="flowSlaSummary"
          :active-bucket="filters.flow_bucket"
          :respect-date="flowBoardRespectDate"
          :loading="flowSlaLoading"
          compact
          @select="onFlowBoardSelect"
          @update:respect-date="onFlowBoardRespectDateChange"
        />
        <div
          v-if="showOrderRowSelection && items.length"
          class="mobile-select-bar"
        >
          <el-checkbox
            :model-value="mobilePageAllSelected"
            :indeterminate="mobilePageIndeterminate"
            @change="onMobilePageSelectAll"
          >
            全选本页
          </el-checkbox>
          <span v-if="effectiveSelected.length" class="mobile-select-bar__count">
            已选 {{ effectiveSelected.length }} 条
          </span>
        </div>
        <div
          v-for="row in items"
          :key="'m-' + row.id"
          class="mobile-card"
          :class="{
            'mobile-card--focus': focusOrderId != null && Number(focusOrderId) === Number(row.id),
            'mobile-card--selected': showOrderRowSelection && v2SelectedIds.includes(row.id),
            'mobile-card--highlight': isOrderHighlighted(row),
            'mobile-card--editable': canEdit(row)
          }"
          @dblclick="onOrderRowDblClick(row)"
        >
          <div class="mobile-head">
            <el-checkbox
              v-if="showOrderRowSelection"
              class="mobile-card__pick"
              :model-value="v2SelectedIds.includes(row.id)"
              :disabled="!orderRowSelectable(row)"
              @click.stop
              @change="(v) => onV2RowPick(row, !!v)"
            />
            <strong class="mobile-order-no">{{ row.order_no || '—' }}</strong>
            <el-tooltip content="查看审批记录" placement="top">
              <SalesStatusPill
                kind="order"
                :order-row="row"
                clickable
                @click="openLogs(row)"
              />
            </el-tooltip>
          </div>
          <div
            v-for="col in mobilePreviewFields"
            :key="col.field_key"
            class="mobile-line"
          >
            <span>{{ orderListColumnTitle(col) }}</span>
            <span>{{ displayCell(row, col.field_key) }}</span>
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
              v-for="act in getOrderRowPrimaryActions(row)"
              :key="act.key"
              :type="act.type"
              :plain="act.plain !== false"
              size="small"
              @click="act.onClick()"
            >{{ act.label }}</el-button>
            <el-dropdown
              v-if="getOrderRowSecondaryActions(row).length"
              trigger="click"
              @command="(key) => onOrderRowMenuCommand(row, key)"
            >
              <el-button size="small">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-for="act in getOrderRowSecondaryActions(row)"
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
        <div v-if="!items.length && !loading" class="orders-empty-state">
          <el-empty :description="listEmptyDescription" :image-size="72">
            <div class="orders-empty-state__actions">
              <template v-if="listEmptyIsFiltered">
                <el-button type="primary" plain @click="resetFilters">清空筛选</el-button>
              </template>
              <template v-else>
                <el-button
                  v-if="perm('order_management', 'order_input')"
                  type="primary"
                  @click="openCreate"
                >
                  手动录入
                </el-button>
                <el-button
                  v-if="perm('order_management', 'order_input')"
                  plain
                  @click="downloadTpl"
                >
                  下载导入模板
                </el-button>
              </template>
            </div>
          </el-empty>
        </div>
      </div>

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

      <transition name="orders-batch-bar-fade">
        <div v-if="effectiveSelected.length" class="orders-batch-bar">
          <div class="orders-batch-bar__left">
            <span class="orders-batch-bar__count">已选 {{ effectiveSelected.length }} 条</span>
            <el-popover placement="top-start" :width="300" trigger="click">
              <template #reference>
                <el-button link type="primary" size="small">查看清单</el-button>
              </template>
              <div class="orders-batch-bar__list">
                <div
                  v-for="r in effectiveSelected"
                  :key="'sel-' + r.id"
                  class="orders-batch-bar__item"
                >
                  {{ r.order_no || `订单 #${r.id}` }}
                </div>
              </div>
            </el-popover>
            <el-button link size="small" @click="clearAllOrderSelection">清空选择</el-button>
          </div>
          <div class="orders-batch-bar__actions">
            <el-tooltip
              placement="top"
              :disabled="batchSubmitTipDisabled"
              :content="batchSubmitTooltip"
            >
              <span class="batch-del-tooltip-host">
                <el-button
                  v-if="perm('order_management', 'order_submit')"
                  type="primary"
                  size="small"
                  plain
                  :disabled="batchSubmitDisabled"
                  @click="batchSubmitReview"
                >
                  {{ batchSubmitButtonLabel }}
                </el-button>
              </span>
            </el-tooltip>
            <el-tooltip
              placement="top"
              :disabled="batchWithdrawTipDisabled"
              :content="batchWithdrawTooltip"
            >
              <span class="batch-del-tooltip-host">
                <el-button
                  v-if="perm('order_management', 'order_withdraw')"
                  type="warning"
                  size="small"
                  plain
                  :disabled="batchWithdrawDisabled"
                  @click="batchWithdrawReview"
                >
                  {{ batchWithdrawButtonLabel }}
                </el-button>
              </span>
            </el-tooltip>
            <el-button
              v-if="perm('order_management', 'order_status_finance')"
              type="warning"
              size="small"
              plain
              :disabled="batchFinanceReviewableList.length === 0"
              @click="openFinanceBatch"
            >
              批量审核
            </el-button>
            <el-button
              v-if="perm('order_management', 'order_status_qc')"
              type="warning"
              size="small"
              plain
              :disabled="batchQcReviewableList.length === 0"
              @click="openQcReviewBatch"
            >
              批量品管
            </el-button>
            <el-button
              v-if="batchShipActionVisible"
              type="primary"
              size="small"
              plain
              :disabled="batchShippableList.length === 0"
              @click="openShipBatch"
            >
              批量发货
            </el-button>
            <el-tooltip
              placement="top"
              :disabled="batchDeleteTipDisabled"
              :content="batchDeleteTooltip"
            >
              <span class="batch-del-tooltip-host">
                <el-button
                  v-if="perm('order_management', 'order_delete')"
                  type="danger"
                  size="small"
                  plain
                  :disabled="batchDeleteDisabled"
                  @click="batchDeleteOrders"
                >
                  {{ batchDeleteButtonLabel }}
                </el-button>
              </span>
            </el-tooltip>
            <el-button
              v-if="perm('contract_management', 'contract_generate')"
              type="success"
              size="small"
              @click="openContractGen"
            >
              生成合同
            </el-button>
          </div>
        </div>
      </transition>
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
  downloadSalesImportTemplate,
  importSalesOrdersXlsx,
  createSalesOrderExportJob,
  getSalesOrderExportJob,
  downloadSalesOrderExportJobFile,
  listSalesOrderFields,
  getSalesOrderFlowSummary,
  getSalesOrderSlaSummary,
  getSalesOrderFlowConfig,
  patchSalesOrderQcQrcode
} from '../api';
import { downloadContractFile, contractDownloadErrorMessage } from '../utils/contractDownload.js';
import SalesStatusPill from '../components/SalesStatusPill.vue';
import WordDocumentIcon from '../components/WordDocumentIcon.vue';
import SalesOrderFormDialog from './sales-orders/SalesOrderFormDialog.vue';
import SalesOrderLogsDialog from './sales-orders/SalesOrderLogsDialog.vue';
import SalesOrderReviewDialog from './sales-orders/SalesOrderReviewDialog.vue';
import SalesOrderShipDialog from './sales-orders/SalesOrderShipDialog.vue';
import SalesOrderContractGenDialog from './sales-orders/SalesOrderContractGenDialog.vue';
import SalesOrderBindContractDialog from './sales-orders/SalesOrderBindContractDialog.vue';
import SalesOrderContractPreviewDialog from './sales-orders/SalesOrderContractPreviewDialog.vue';
import SalesOrderFieldManageDialog from './sales-orders/SalesOrderFieldManageDialog.vue';
import SalesOrderQcBindDialog from './sales-orders/SalesOrderQcBindDialog.vue';
import SalesOrderMessagesDrawer from './sales-orders/SalesOrderMessagesDrawer.vue';
import SalesOrderImportDupDialog from './sales-orders/SalesOrderImportDupDialog.vue';
import SalesOrderImportErrorsDialog from './sales-orders/SalesOrderImportErrorsDialog.vue';
import SalesOrderFlowBoard from './sales-orders/SalesOrderFlowBoard.vue';
import { h } from 'vue';
import { ElButton, ElCheckbox, ElDropdown, ElDropdownItem, ElDropdownMenu, ElIcon, ElTooltip } from 'element-plus';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleCheck,
  CircleClose,
  CloseBold,
  Delete,
  Document,
  Download,
  Edit,
  MoreFilled,
  Plus,
  Promotion,
  RefreshLeft,
  Search,
  Select,
  UploadFilled,
  Van,
  View
} from '@element-plus/icons-vue';
import { startDownload } from '../composables/useDownloadProgress.js';
import { zhMessageForApiError } from '../../../shared/apiErrorZh.js';
import {
  orderFlowStatusZh,
  SALES_ORDER_STATUS_FILTER_OPTIONS,
  isSalesOrderFlowBucketKey
} from '../utils/salesStatusDisplay';
import { useAuthStore } from '../stores/auth';
import {
  createDefaultSalesOrderFilters,
  buildSalesOrderQueryParams,
  loadSalesOrderList
} from '../composables/useSalesOrderList';
import { grossAmountFromRowDisplayData } from '../utils/salesOrderTonAmount';
import { orderListCustomerDisplayName } from '../utils/salesOrderDisplayMerge';
import {
  buildOrderReportPrefill,
  REPORT_PREFILL_FROM_ORDER_KEY
} from '../utils/orderReportPrefill';
import {
  detectOrderRowActionProfile,
  splitOrderRowActions
} from '../utils/orderRowActionSplit';

const CUSTOMER_LIST_NAME_MODE_KEY = 'sales_orders_list_customer_name_mode';
const ORDER_LIST_PREFS_KEY = 'sales_orders_list_prefs';
const ORDER_LIST_FILTERS_SESSION_KEY = 'sales_orders_list_filters_session';
const ORDERS_AUTO_REFRESH_MS = 30000;

const DEFAULT_ORDER_LIST_COL_VISIBLE = {
  orderNo: false,
  sales: false,
  shipper: false,
  uploadedAt: false
};

function readOrderListPrefs() {
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

function buildInitialOrderListPrefs() {
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

const INITIAL_ORDER_LIST_PREFS = buildInitialOrderListPrefs();

const SALES_ORDER_EXPORT_LIMIT = 5000;

export default {
  name: 'SalesOrders',
  components: {
    SalesStatusPill,
    WordDocumentIcon,
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
    SalesOrderFlowBoard,
    ArrowDown,
    ArrowUp,
    MoreFilled,
    Download,
    View,
    Plus,
    Delete,
    Edit
  },
  setup() {
    return {
      Search,
      UploadFilled,
      Download,
      Check,
      Delete,
      View,
      Plus,
      Edit
    };
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
      customerListNameMode:
        typeof localStorage !== 'undefined' &&
        localStorage.getItem(CUSTOMER_LIST_NAME_MODE_KEY) === 'full'
          ? 'full'
          : 'short',
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
      /** @type {ReturnType<typeof setInterval> | null} */
      ordersAutoRefreshTimer: null,
      /** @type {ReturnType<typeof setInterval> | null} */
      inboxAutoRefreshTimer: null,
      /** @type {(() => void) | null} */
      pageVisibilityHandler: null,
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
      return {
        customer_name: '客户名称',
        customer_code: '客户编号',
        product_model: '标签型号',
        warehouse_model: '仓库型号',
        order_no: '订单号'
      };
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
      const tags = [];
      const sv = String(this.filters.searchValue || '').trim();
      if (sv) {
        const fieldLabel = this.searchFieldLabels[this.filters.searchField] || '搜索';
        tags.push({
          key: 'search',
          label: `${fieldLabel}：${sv}`,
          onClose: () => this.clearSearchFilter()
        });
      }
      if (this.filters.flow_bucket) {
        const opt = this.statusOptions.find((s) => s.value === this.filters.flow_bucket);
        tags.push({
          key: 'flow_bucket',
          label: opt?.label || this.filters.flow_bucket,
          onClose: () => this.clearFlowBucketFilter()
        });
      }
      if (this.filters.status) {
        const opt = this.statusOptions.find((s) => s.value === this.filters.status);
        tags.push({
          key: 'status',
          label: opt?.label || this.filters.status,
          onClose: () => this.clearTerminalStatusFilter()
        });
      }
      if (this.filters.pending_finance_only) {
        tags.push({
          key: 'pending_finance_only',
          label: '待财务审核（快捷视图）',
          onClose: () => this.clearQuickViewFilter()
        });
      }
      if (this.filters.pending_qc_only) {
        tags.push({
          key: 'pending_qc_only',
          label: '待品管审核（快捷视图）',
          onClose: () => this.clearQuickViewFilter()
        });
      }
      if (this.filters.customer_code) {
        tags.push({
          key: 'customer_code',
          label: `客户编号：${this.filters.customer_code}`,
          onClose: () => this.clearCustomerCodeFilter()
        });
      }
      if (Array.isArray(this.dateRange) && this.dateRange.length === 2) {
        tags.push({
          key: 'date_range',
          label: `${this.dateRange[0]} 至 ${this.dateRange[1]}`,
          onClose: () => this.clearDateRangeFilter()
        });
      }
      if (this.focusOrderId != null && Number(this.focusOrderId) > 0) {
        tags.push({
          key: 'focus_order',
          label: `定位订单 #${this.focusOrderId}`,
          onClose: () => this.clearFocusOrderFilter()
        });
      }
      return tags;
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
      const total = this.effectiveSelected.length;
      const ok = this.batchSubmittableList.length;
      if (!ok) return '批量提交审核';
      if (ok === total) return '批量提交审核';
      return `提交 ${ok} 条`;
    },
    batchSubmitTooltip() {
      const total = this.effectiveSelected.length;
      const ok = this.batchSubmittableList.length;
      if (!total) return '';
      if (ok === 0) return '所选订单均不可提交（须本人创建且未提交过）';
      if (ok === total) return '将所选订单一并提交财务审核';
      return `已选 ${total} 条，其中 ${ok} 条可提交；点击将仅提交符合条件的订单`;
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
      const total = this.effectiveSelected.length;
      const ok = this.batchWithdrawableList.length;
      if (!ok) return '批量撤回审核';
      if (ok === total) return '批量撤回审核';
      return `撤回 ${ok} 条`;
    },
    batchWithdrawTooltip() {
      const total = this.effectiveSelected.length;
      const ok = this.batchWithdrawableList.length;
      if (!total) return '';
      if (ok === 0) return '所选订单均不可撤回（须本人创建且仍在首节点待审）';
      if (ok === total) return '将所选订单一并撤回审核申请，财务将收到汇总通知';
      return `已选 ${total} 条，其中 ${ok} 条可撤回；点击将仅撤回符合条件的订单`;
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
      const total = this.effectiveSelected.length;
      const ok = this.batchDeletableList.length;
      if (!ok) return '批量删除';
      if (ok === total) return '批量删除';
      return `删除 ${ok} 条`;
    },
    batchDeleteTooltip() {
      const total = this.effectiveSelected.length;
      const ok = this.batchDeletableList.length;
      if (!total) return '';
      if (ok === 0) return '所选订单均不可删除（无权限或状态不允许）';
      if (ok === total) return '永久删除所选订单，不可恢复';
      return `已选 ${total} 条，其中 ${ok} 条可删除；点击将仅删除符合条件的订单`;
    },
    ordersV2RowEventHandlers() {
      return {
        onDblclick: ({ rowData }) => {
          this.onOrderRowDblClick(rowData);
        }
      };
    },
    ordersV2Columns() {
      const nameMode = this.customerListNameMode;
      const cols = [];
      if (this.showOrderRowSelection) {
        cols.push({
          key: '__pick',
          dataKey: 'id',
          title: '',
          width: 40,
          align: 'center',
          cellRenderer: ({ rowData }) =>
            h(ElCheckbox, {
              size: 'small',
              modelValue: this.v2SelectedIds.includes(rowData.id),
              disabled: !this.orderRowSelectable(rowData),
              'onUpdate:modelValue': (v) => this.onV2RowPick(rowData, !!v)
            })
        });
      }
      if (this.orderListColVisible.orderNo) {
        cols.push({
          key: 'order_no',
          dataKey: 'order_no',
          title: '订单号',
          width: 96,
          align: 'center',
          cellRenderer: ({ rowData }) =>
            h('span', { class: 'v2-cell-txt', title: rowData.order_no || '' }, rowData.order_no || '—')
        });
      }
      cols.push({
        key: 'status',
        dataKey: 'status',
        title: '状态',
        width: 120,
        align: 'center',
        cellRenderer: ({ rowData }) =>
          h(SalesStatusPill, {
            kind: 'order',
            orderRow: rowData,
            clickable: true,
            title: '查看审批记录',
            onClick: () => this.openLogs(rowData)
          })
      });
      if (this.orderListColVisible.shipper) {
        cols.push({
          key: 'shipper',
          dataKey: 'shipped_by_name',
          title: '发货人',
          width: 72,
          align: 'center',
          cellRenderer: ({ rowData }) =>
            h(
              'span',
              { class: 'v2-cell-txt', title: rowData.shipped_by_name || '' },
              rowData.shipped_by_name || '—'
            )
        });
      }
      if (this.orderListColVisible.sales) {
        cols.push({
          key: 'sales',
          dataKey: 'created_by_username',
          title: '销售',
          width: 64,
          align: 'center',
          cellRenderer: ({ rowData }) =>
            h('span', { class: 'v2-cell-txt', title: rowData.created_by_username || '' }, rowData.created_by_username || '—')
        });
      }
      if (this.orderListColVisible.uploadedAt) {
        cols.push({
          key: 'uploaded',
          dataKey: 'created_at',
          title: '上传日期',
          width: 100,
          align: 'center',
          cellRenderer: ({ rowData }) =>
            h('span', { class: 'v2-cell-txt' }, this.$dt(rowData.created_at))
        });
      }
      for (const col of this.orderListFieldDefinitions) {
        const key = col.field_key;
        if (this.isCustomerNameColumn(col)) {
          cols.push({
            key: `${key}-${nameMode}`,
            dataKey: key,
            width: 108,
            align: 'center',
            headerCellRenderer: () => this.renderCustomerNameColumnHeader(col),
            cellRenderer: ({ rowData }) => {
              const text = this.displayCustomerNameCell(rowData, col);
              return h('span', { class: 'v2-cell-txt', title: text === '—' ? '' : String(text) }, text);
            }
          });
          continue;
        }
        cols.push({
          key,
          dataKey: key,
          title: `${col.required ? '*' : ''}${this.orderListColumnTitle(col)}`,
          width: 72,
          align: 'center',
          cellRenderer: ({ rowData }) => {
            const text = this.displayCell(rowData, key);
            return h('span', { class: 'v2-cell-txt', title: text === '—' ? '' : String(text) }, text);
          }
        });
      }
      cols.push({
        key: 'actions',
        dataKey: 'id',
        title: '操作',
        width: 88,
        align: 'center',
        cellRenderer: ({ rowData }) => {
          const chunks = this.buildOrderRowActionNodes(rowData);
          return h(
            'div',
            { class: 'orders-v2-actions' },
            chunks.map((node, i) => h('span', { key: i, class: 'orders-v2-actions__btn' }, [node]))
          );
        }
      });
      return cols;
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
      try {
        localStorage.setItem(CUSTOMER_LIST_NAME_MODE_KEY, mode === 'full' ? 'full' : 'short');
      } catch {
        /* ignore */
      }
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
      this.refreshFlowSlaBoard({ silent: true });
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
    if (!this.isBlockedByPasswordPolicy()) this.$refs.messagesDrawerRef?.refresh();
    this.inboxAutoRefreshTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (this.isBlockedByPasswordPolicy()) return;
      if (this.showMessages) this.$refs.messagesDrawerRef?.refresh();
    }, 2000);
    this.ordersAutoRefreshTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (this.isBlockedByPasswordPolicy()) return;
      if (perm('order_management', 'order_query')) {
        this.load({ silent: true });
        this.refreshFlowSlaBoard({ silent: true });
      }
    }, ORDERS_AUTO_REFRESH_MS);
    this.pageVisibilityHandler = () => {
      if (document.visibilityState !== 'visible') return;
      if (this.isBlockedByPasswordPolicy()) return;
      if (this.showMessages) this.$refs.messagesDrawerRef?.refresh();
      if (perm('order_management', 'order_query')) {
        this.load({ silent: true });
        this.refreshFlowSlaBoard({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', this.pageVisibilityHandler);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.syncMobile);
    this.touchMediaQuery?.removeEventListener('change', this.syncTouchLike);
    this.touchMediaQuery = null;
    this.saveFiltersToSession();
    if (this.highlightOrderTimer) clearTimeout(this.highlightOrderTimer);
    if (this.filtersSessionSaveTimer) clearTimeout(this.filtersSessionSaveTimer);
    if (this.inboxAutoRefreshTimer) clearInterval(this.inboxAutoRefreshTimer);
    if (this.ordersAutoRefreshTimer) clearInterval(this.ordersAutoRefreshTimer);
    if (this.pageVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.pageVisibilityHandler);
      this.pageVisibilityHandler = null;
    }
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  },
  methods: {
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
      try {
        sessionStorage.removeItem(ORDER_LIST_FILTERS_SESSION_KEY);
      } catch {
        /* ignore */
      }
      this.load();
      this.refreshFlowSlaBoard();
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
      this.refreshFlowSlaBoard();
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
      try {
        localStorage.setItem(
          ORDER_LIST_PREFS_KEY,
          JSON.stringify({
            colVisible: this.orderListColVisible,
            virtualTable: this.ordersVirtualTable,
            designMode: this.orderTableDesignMode,
            flowBoardRespectDate: this.flowBoardRespectDate
          })
        );
      } catch {
        /* ignore */
      }
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
      await Promise.all([this.load(), this.refreshFlowSlaBoard()]);
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
      const p = {
        customer_name: this.filters.customer_name || undefined,
        customer_code: this.filters.customer_code || undefined,
        product_name: this.filters.product_name || undefined,
        product_model: this.filters.product_model || undefined,
        warehouse_model: this.filters.warehouse_model || undefined,
        product_code: this.filters.product_code || undefined,
        order_no: this.filters.order_no || undefined,
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
      try {
        sessionStorage.setItem(
          ORDER_LIST_FILTERS_SESSION_KEY,
          JSON.stringify({
            filters: this.filters,
            dateRange: Array.isArray(this.dateRange) ? this.dateRange : [],
            page: this.page,
            pageSize: this.pageSize,
            listPrefs: {
              orderListColVisible: this.orderListColVisible,
              ordersVirtualTable: this.ordersVirtualTable,
              orderTableDesignMode: this.orderTableDesignMode,
              flowBoardRespectDate: this.flowBoardRespectDate
            }
          })
        );
      } catch {
        /* ignore */
      }
    },
    restoreFiltersFromSession() {
      const q = this.$route?.query || {};
      if (q.view || q.customer_code || q.focus_order_id || q.flow_bucket) return false;
      try {
        const raw = sessionStorage.getItem(ORDER_LIST_FILTERS_SESSION_KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw);
        if (!saved || typeof saved !== 'object') return false;
        this.filters = { ...createDefaultSalesOrderFilters(), ...(saved.filters || {}) };
        this.dateRange = Array.isArray(saved.dateRange) ? saved.dateRange : [];
        if (Number.isFinite(Number(saved.page)) && Number(saved.page) > 0) {
          this.page = Number(saved.page);
        }
        if (Number.isFinite(Number(saved.pageSize)) && Number(saved.pageSize) > 0) {
          this.pageSize = Number(saved.pageSize);
        }
        const lp = saved.listPrefs;
        if (lp && typeof lp === 'object') {
          if (lp.orderListColVisible && typeof lp.orderListColVisible === 'object') {
            this.orderListColVisible = {
              ...DEFAULT_ORDER_LIST_COL_VISIBLE,
              ...lp.orderListColVisible
            };
          }
          if (typeof lp.ordersVirtualTable === 'boolean') {
            this.ordersVirtualTable = lp.ordersVirtualTable;
          }
          if (typeof lp.orderTableDesignMode === 'boolean') {
            this.orderTableDesignMode = lp.orderTableDesignMode;
          }
          if (typeof lp.flowBoardRespectDate === 'boolean') {
            this.flowBoardRespectDate = lp.flowBoardRespectDate;
          }
        }
        this.filtersRestoredFromSession = true;
        return true;
      } catch {
        return false;
      }
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
      const tb = this.$refs.ordersTable;
      if (!tb) return;
      const row = (this.items || []).find((r) => Number(r.id) === Number(id));
      if (!row) return;
      tb.setCurrentRow(row);
      await this.$nextTick();
      const tr = tb.$el?.querySelector?.('.el-table__body tr.current-row');
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
      if (!silent) this.loading = true;
      try {
        const d = await loadSalesOrderList({
          listApi: listSalesOrders,
          params: this.queryParams(),
          silent
        });
        this.items = d.items || [];
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
        const tb = this.$refs.ordersTable;
        if (tb) {
          tb.clearSelection();
          for (const row of nextSelected) tb.toggleRowSelection(row, true);
        }
        await this.$nextTick();
        try {
          this.$refs.ordersTable?.doLayout?.();
        } catch {
          /* ignore */
        }
        this.touchListSyncedLabel();
      } catch (e) {
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
        if (perm('order_management', 'order_query')) {
          this.refreshFlowSlaBoard({ silent: true });
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
      return !row?.qc_thumb_data_url && row?.qc_report_label === '无可用报告';
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
    createOrderActionIconBtn({ tooltip, icon, type = 'default', plain = true, className = '', onClick }) {
      const btn = h(
        ElButton,
        {
          size: 'small',
          circle: true,
          type,
          plain,
          class: className,
          onClick
        },
        {
          default: () => h(ElIcon, null, { default: () => h(icon) })
        }
      );
      return h(
        ElTooltip,
        { content: tooltip, placement: 'top' },
        { default: () => h('span', { class: 'orders-action-btn-host' }, [btn]) }
      );
    },
    collectOrderRowActions(row) {
      if (!row) return [];
      const actions = [];
      const push = (action) => actions.push(action);

      if (perm('order_management', 'order_status_finance') && this.canFinanceReview(row)) {
        push({
          key: 'finance_approve',
          label: '财务通过',
          tooltip: '财务通过',
          icon: Select,
          type: 'success',
          plain: false,
          priority: 10,
          onClick: () => this.approveSingle(row)
        });
        push({
          key: 'finance_reject',
          label: '财务驳回',
          tooltip: '财务驳回',
          icon: CloseBold,
          type: 'danger',
          plain: false,
          priority: 11,
          onClick: () => this.rejectSingle(row)
        });
      }
      if (perm('order_management', 'order_status_qc') && this.canQcReview(row)) {
        push({
          key: 'qc_approve',
          label: '品管通过',
          tooltip: '审核通过',
          icon: CircleCheck,
          type: 'success',
          plain: false,
          priority: 12,
          onClick: () => this.approveSingleQc(row)
        });
        push({
          key: 'qc_reject',
          label: '品管驳回',
          tooltip: '品管驳回',
          icon: CircleClose,
          type: 'danger',
          plain: false,
          priority: 13,
          onClick: () => this.rejectSingleQc(row)
        });
      }
      if (perm('order_management', 'order_submit') && this.canSubmit(row)) {
        push({
          key: 'submit',
          label: '提交审核',
          tooltip: '提交审核',
          icon: Promotion,
          type: 'primary',
          plain: false,
          priority: 15,
          onClick: () => this.submitSingle(row)
        });
      }
      if (this.canWithdrawSubmit(row)) {
        push({
          key: 'withdraw',
          label: '撤回审核',
          tooltip: '撤回审核申请',
          icon: RefreshLeft,
          type: 'warning',
          plain: true,
          priority: 16,
          onClick: () => this.withdrawReview(row)
        });
      }
      if (this.canShip(row)) {
        push({
          key: 'ship',
          label: '发货',
          tooltip: '发货',
          icon: Van,
          type: 'primary',
          plain: true,
          priority: 20,
          onClick: () => this.openShip(row)
        });
      }
      if (perm('order_management', 'order_status_finance') && this.canComplete(row)) {
        push({
          key: 'complete',
          label: '完结',
          tooltip: '财务确认订单完结',
          icon: CircleCheck,
          type: 'success',
          plain: true,
          priority: 22,
          onClick: () => this.doComplete(row)
        });
      }
      if (perm('order_management', 'order_edit') && this.canEdit(row)) {
        push({
          key: 'edit',
          label: '编辑',
          tooltip: '编辑',
          icon: Edit,
          type: 'primary',
          plain: true,
          priority: 25,
          onClick: () => this.openEdit(row)
        });
      }
      if (perm('reports', 'create')) {
        push({
          key: 'report',
          label: '生成报告',
          tooltip: '生成报告',
          icon: Document,
          type: 'success',
          plain: true,
          priority: 40,
          onClick: () => this.openGenerateReport(row)
        });
      }
      if (perm('order_management', 'order_cancel') && this.canCancel(row)) {
        push({
          key: 'cancel',
          label: '取消订单',
          tooltip: '取消订单',
          icon: CircleClose,
          type: 'warning',
          plain: true,
          priority: 45,
          onClick: () => this.doCancel(row)
        });
      }
      if (perm('order_management', 'order_delete') && this.canDelete(row)) {
        push({
          key: 'delete',
          label: '删除',
          tooltip: '删除',
          icon: Delete,
          type: 'danger',
          plain: true,
          priority: 50,
          divided: true,
          onClick: () => this.doDeleteRow(row)
        });
      }
      return actions.sort((a, b) => a.priority - b.priority);
    },
    splitOrderRowActionsForRow(row) {
      const all = this.collectOrderRowActions(row);
      return splitOrderRowActions(all, this.orderRowActionProfile);
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
      const primary = this.getOrderRowPrimaryActions(row);
      const secondary = this.getOrderRowSecondaryActions(row);
      const nodes = primary.map((act) =>
        this.createOrderActionIconBtn({
          tooltip: act.tooltip,
          icon: act.icon,
          type: act.type,
          plain: act.plain,
          onClick: act.onClick
        })
      );
      if (secondary.length) {
        nodes.push(
          h(
            ElDropdown,
            {
              trigger: 'click',
              onCommand: (key) => this.onOrderRowMenuCommand(row, key)
            },
            {
              default: () =>
                h('span', { class: 'orders-action-btn-host' }, [
                  h(
                    ElButton,
                    { size: 'small', circle: true, plain: true, title: '更多操作' },
                    { default: () => h(ElIcon, null, { default: () => h(MoreFilled) }) }
                  )
                ]),
              dropdown: () =>
                h(
                  ElDropdownMenu,
                  null,
                  {
                    default: () =>
                      secondary.map((act) =>
                        h(
                          ElDropdownItem,
                          { command: act.key, divided: act.divided },
                          { default: () => act.label }
                        )
                      )
                  }
                )
            }
          )
        );
      }
      return nodes;
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
      const src = row?.qc_thumb_data_url;
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
      const tb = this.$refs.ordersTable;
      if (!tb) return;
      this.ordersTableSelectionSync = true;
      try {
        tb.clearSelection();
      } catch {
        /* ignore */
      }
      this.$nextTick(() => {
        this.ordersTableSelectionSync = false;
      });
    },
    openImportDupDialog(rows) {
      this.importDupDialogRows = Array.isArray(rows) ? rows : [];
      this.importDupDialogSummary =
        this.importDupDialogRows.length > 0
          ? '以下数据来自系统检测结果，仅作文本展示；若内容含特殊字符亦为纯文本，不会作为网页代码执行。'
          : '';
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
    maybeAutoEnableVirtualTable() {
      const nCol = (this.fieldDefinitions && this.fieldDefinitions.length) || 0;
      if (this.pageSize >= 100 || nCol >= 14) {
        if (!this.ordersVirtualTable) this.ordersVirtualTable = true;
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
            this.$refs.ordersTable?.clearSelection?.();
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
          this.$refs.ordersTable?.doLayout?.();
        } catch {
          /* ignore */
        }
      });
    },
    /** 虚拟列表列宽按容器等比缩放，避免横向滚动 */
    scaleOrdersV2Columns(cols, containerWidth) {
      if (!cols?.length || !containerWidth || containerWidth <= 0) return cols;
      const baseWidths = cols.map((c) => Math.max(40, Number(c.width) || 72));
      const sum = baseWidths.reduce((a, b) => a + b, 0);
      const scale = containerWidth / sum;
      return cols.map((c, i) => ({
        ...c,
        width: Math.max(40, Math.floor(baseWidths[i] * scale))
      }));
    },
    syncV2PickToElTable() {
      const tb = this.$refs.ordersTable;
      const rows = this.filterSelectableOrderRows(
        (this.v2SelectedIds || [])
          .map((id) => this.v2SelectedSnapshots[id] || (this.items || []).find((r) => r.id === id))
          .filter(Boolean)
      );
      this.ordersTableSelectionSync = true;
      this.selected = [];
      this.$nextTick(() => {
        try {
          tb?.clearSelection?.();
        } catch {
          /* ignore */
        }
        for (const row of rows) {
          if ((this.items || []).some((r) => r.id === row.id)) tb?.toggleRowSelection?.(row, true);
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
      const partial = rows.length < total;
      try {
        await this.$confirm(
          partial
            ? `已选 ${total} 条，其中 ${rows.length} 条可删除。是否仅删除这 ${rows.length} 条？删除后不可恢复。`
            : `确定永久删除已选的 ${rows.length} 条订单？删除后不可恢复。`,
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
      const partial = rows.length < total;
      try {
        await this.$confirm(
          partial
            ? `已选 ${total} 条，其中 ${rows.length} 条可提交。是否仅提交这 ${rows.length} 条？财务将收到 1 条站内信汇总通知。`
            : `将 ${rows.length} 笔订单一并提交财务审核，财务将收到 1 条站内信汇总通知。是否继续？`,
          '批量提交审核',
          { type: 'warning' }
        );
      } catch {
        return;
      }
      try {
        const r = await batchSubmitSalesOrderReview(rows.map((x) => x.id));
        if (r.failed?.length) {
          const errLabel = (code) =>
            ({
              FORBIDDEN: '非本人创建',
              NOT_FOUND: '不存在',
              INVALID_STATUS: '状态不符',
              ALREADY_SUBMITTED: '已提交过审核'
            }[code] || zhMessageForApiError(code) || '未知原因');
          const parts = r.failed.slice(0, 5).map((f) => `订单#${f.id}：${errLabel(f.error)}`);
          const more =
            r.failed.length > 5 ? ` 等共 ${r.failed.length} 笔` : '';
          this.$message.warning(
            `成功 ${r.ok || 0} 笔，未处理 ${r.failed.length} 笔。${parts.join('；')}${more}`
          );
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
      const partial = rows.length < total;
      try {
        await this.$confirm(
          partial
            ? `已选 ${total} 条，其中 ${rows.length} 条可撤回。是否仅撤回这 ${rows.length} 条？财务将收到 1 条站内信汇总通知。`
            : `将 ${rows.length} 笔订单一并撤回审核申请，财务将收到 1 条站内信汇总通知。是否继续？`,
          '批量撤回审核',
          { type: 'warning' }
        );
      } catch {
        return;
      }
      try {
        const r = await batchWithdrawSalesOrderReview(rows.map((x) => x.id));
        if (r.failed?.length) {
          const errLabel = (code) =>
            ({
              FORBIDDEN: '非本人创建',
              NOT_FOUND: '不存在',
              NOT_SUBMITTED: '不在首节点待审',
              ORDER_STATE_CHANGED: '状态已变更'
            }[code] || zhMessageForApiError(code) || '未知原因');
          const parts = r.failed.slice(0, 5).map((f) => `订单#${f.id}：${errLabel(f.error)}`);
          const more = r.failed.length > 5 ? ` 等共 ${r.failed.length} 笔` : '';
          this.$message.warning(
            `成功 ${r.ok || 0} 笔，未处理 ${r.failed.length} 笔。${parts.join('；')}${more}`
          );
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
        const blob = await downloadSalesImportTemplate();
        startDownload({ request: blob, filename: 'sales-import-template.xlsx' });
      } catch (e) {
        this.$message.error('下载失败');
      }
    },
    async onImportFile(file) {
      const run = async (confirmDuplicate) => {
        const r = await importSalesOrdersXlsx(file, { confirmDuplicate });
        
        // 显示与已有订单重复的数据详情
        if (r.duplicates?.length) {
          this.openImportDupDialog(r.duplicates);
        }

        if (r.errors?.length) {
          this.openImportErrorsDialog(r.errors);
          this.$message.warning(`成功 ${r.ok} 条，失败 ${r.errors.length} 条，详见失败明细`);
          // eslint-disable-next-line no-console
          console.warn(r.errors);
        } else if (r.ok > 0 && Array.isArray(r.created_ids) && r.created_ids.length) {
          /* 成功提示由 focusImportedOrders 统一展示 */
        } else if (!r.duplicates?.length) {
          this.$message.success(`导入成功 ${r.ok} 条`);
        } else if (r.ok > 0) {
          this.$message.success(`导入成功 ${r.ok} 条（${r.duplicates.length} 条与已有订单重复已跳过）`);
        }
        if (r.ok > 0) {
          this.page = 1;
          await this.load();
          if (Array.isArray(r.created_ids) && r.created_ids.length) {
            this.focusImportedOrders(r.created_ids);
          }
        }
      };
      try {
        await run(false);
      } catch (e) {
        const d = e?.response?.data;
        if (d?.error === 'EXCEL_DUPLICATE_ROWS' && Array.isArray(d?.duplicate_groups)) {
          const lines = d.duplicate_groups
            .slice(0, 8)
            .map((g) => `第 ${(g.rows || []).join('、')} 行内容完全一致`);
          const more = d.duplicate_groups.length > 8 ? `\n… 另有 ${d.duplicate_groups.length - 8} 组重复` : '';
          try {
            await this.$confirm(
              `检测到 ${d.duplicate_groups.length} 组「全字段完全相同」的重复行（示例）：\n${lines.join('\n')}${more}\n\n是否仍要全部导入？`,
              '重复行强提醒',
              { type: 'warning' }
            );
            await run(true);
          } catch {
            /* 用户取消 */
          }
          return false;
        }
        const msg =
          (typeof d?.message === 'string' && d.message) ||
          (d?.error === 'FORBIDDEN_ORDER_INPUT'
            ? '缺少权限：销售·订单-录入/Excel导入'
            : '') ||
          (d?.error === 'HEADER_MISMATCH'
            ? '表头与模板不一致，请下载「导入模板」对照表头（或去掉 * 后仍须与列名一致）'
            : '') ||
          d?.error ||
          '导入失败';
        // eslint-disable-next-line no-console
        if (d?.expected && d?.got) console.warn('导入表头 expected', d.expected, 'got', d.got);
        this.$message.error(msg);
      }
      return false;
    },
    async exportXlsx() {
      if (!this.total) {
        this.$message.warning('没有可导出的数据');
        return;
      }
      if (this.total > SALES_ORDER_EXPORT_LIMIT) {
        try {
          await this.$confirm(
            `当前筛选共 ${this.total} 条，单次最多导出 ${SALES_ORDER_EXPORT_LIMIT} 条；将仅导出按上传时间倒序的前 ${SALES_ORDER_EXPORT_LIMIT} 条。建议缩小日期范围或增加筛选条件。是否继续？`,
            '导出条数限制',
            { type: 'warning' }
          );
        } catch {
          return;
        }
      }
      this.exporting = true;
      try {
        const params = this.queryParams();
        const created = await createSalesOrderExportJob(params, { silent: true });
        const jobId = created?.id ?? created?.data?.id;
        if (!jobId) {
          this.$message.error('创建导出任务失败');
          return;
        }
        const pollMs = 1500;
        const maxWait = 300000;
        let waited = 0;
        while (waited < maxWait) {
          const st = await getSalesOrderExportJob(jobId, { silent: true });
          const status = st?.status ?? st?.data?.status;
          if (status === 'done') break;
          if (status === 'failed') {
            this.$message.error(st?.last_error || st?.data?.last_error || '导出失败');
            return;
          }
          await new Promise((r) => setTimeout(r, pollMs));
          waited += pollMs;
        }
        const finalSt = await getSalesOrderExportJob(jobId, { silent: true });
        if ((finalSt?.status ?? finalSt?.data?.status) !== 'done') {
          this.$message.warning('导出任务处理较慢，请稍后刷新页面或重试导出');
          return;
        }
        const blob = await downloadSalesOrderExportJobFile(jobId);
        const hit = finalSt?.total_hit ?? finalSt?.data?.total_hit;
        const n = finalSt?.row_count_exported ?? finalSt?.data?.row_count_exported;
        let msg;
        if (hit != null && n != null && Number(hit) > Number(n)) {
          msg = `已下载 ${n} 条（命中 ${hit} 条，已按单次上限截取）`;
        } else {
          msg = `已下载 ${n != null ? n : ''} 条`.trim() || '导出完成';
        }
        startDownload({
          request: blob,
          filename: `sales-orders-${Date.now()}.xlsx`,
          onSuccess: () => { this.$message.success(msg); }
        });
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '导出失败'));
      } finally {
        this.exporting = false;
      }
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

<style scoped>
.sales-orders {
  display: flex;
  flex-direction: column;
  /* 64px 顶栏 + ~38px 页签 + 36px main 内边距 */
  height: calc(100vh - 138px);
  min-height: 320px;
  box-sizing: border-box;
}
.toolbar-card {
  margin-bottom: 12px;
  flex-shrink: 0;
}
.toolbar-card :deep(.el-card__body) {
  padding: 14px 16px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.left,
.right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.left {
  flex: 1;
  min-width: 0;
}
.right {
  flex-shrink: 0;
  justify-content: flex-end;
}
.search-bar {
  flex: 1 1 220px;
  min-width: 200px;
  max-width: 360px;
}
.batch-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px solid #eef2f7;
}
.order-filter-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  padding-top: 10px;
  margin-top: 10px;
  border-top: 1px solid #eef2f7;
}
.order-filter-tags__label {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  line-height: 24px;
}
.order-filter-tag {
  max-width: min(100%, 320px);
}
.order-filter-tag :deep(.el-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-filter-tags__clear {
  flex-shrink: 0;
  padding-left: 2px;
  padding-right: 2px;
}
.mobile-filter-actions {
  display: flex;
  gap: 8px;
  width: 100%;
}
.mobile-filter-actions__primary {
  flex: 1;
}
.mobile-filter-actions__reset {
  flex-shrink: 0;
}
.orders-batch-bar {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding: 10px 14px;
  background: linear-gradient(180deg, #f8fbff 0%, #fff 100%);
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  box-shadow: 0 -4px 18px rgba(15, 23, 42, 0.08);
}
.orders-batch-bar__left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.orders-batch-bar__count {
  font-size: 13px;
  font-weight: 600;
  color: #1d4ed8;
}
.orders-batch-bar__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}
.orders-batch-bar__list {
  max-height: 220px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.orders-batch-bar__item {
  font-size: 13px;
  color: #334155;
  line-height: 1.4;
  word-break: break-all;
}
.orders-batch-bar-fade-enter-active,
.orders-batch-bar-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.orders-batch-bar-fade-enter-from,
.orders-batch-bar-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.batch-actions-inner {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.batch-actions-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.batch-actions-group__label {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  min-width: 28px;
  line-height: 32px;
}
.batch-actions-group--batch {
  flex: 1;
  min-width: 0;
}
.batch-group-divider {
  height: 28px;
  margin: 0 2px;
  align-self: center;
}
.selected-tip {
  font-size: 13px;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 2px 10px;
  line-height: 22px;
}
.field-input {
  width: 160px;
}
.field-input-sm {
  width: 120px;
}
.field-select {
  width: 130px;
  flex-shrink: 0;
}
.field-date {
  width: 260px;
  flex-shrink: 0;
}
.batch-del-tooltip-host {
  display: inline-block;
}
.ship-batch-hint {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  margin: 0 0 12px;
}
.w140 { width: 140px; }
.w120 { width: 120px; }
.w130 { width: 130px; }
.w260 { width: 260px; }
.w100 { width: 100px; }
.w-full { width: 100%; }
.table-wrap {
  background: #fff;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.table-list-toolbar {
  margin-bottom: 10px;
  flex-shrink: 0;
}
.table-list-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eef2f7;
  flex-shrink: 0;
}
.table-list-controls__hint {
  font-size: 13px;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}
.table-list-controls__sync-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-left: 8px;
}
.table-list-controls__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-left: auto;
}
.order-list-column-picker {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
}
.order-list-column-picker__title {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 6px;
  line-height: 1.4;
}
.order-list-column-picker :deep(.el-checkbox) {
  margin-right: 0;
  height: auto;
  padding: 4px 0;
}
.orders-empty-state {
  padding: 24px 12px 12px;
}
.orders-empty-state__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}
.table-inner {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.table-inner--v2 {
  display: flex;
  flex-direction: column;
  min-height: 280px;
}
.table-inner--v2 :deep(.el-auto-resizer) {
  flex: 1;
  min-height: 0;
}
.orders-v2-hint {
  margin-bottom: 8px;
  flex-shrink: 0;
}
.orders-table-v2 {
  font-size: 13px;
}
.orders-customer-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 100%;
  line-height: 1.2;
}
.orders-customer-header__title {
  font-weight: 600;
  color: inherit;
}
.orders-customer-header__mode {
  display: inline-flex;
  gap: 4px;
}
.orders-customer-header__mode .el-button {
  padding: 2px 8px;
  font-size: 11px;
  margin: 0;
}
.orders-customer-header--v2 {
  padding: 2px 0;
}
.orders-table-v2 :deep(.el-table-v2__header-cell) {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.orders-table-v2 :deep(.el-table-v2__header-cell .orders-customer-header) {
  white-space: normal;
  overflow: visible;
}
.orders-table-v2 :deep(.el-table-v2__row-cell) {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.v2-cell-txt {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  word-break: break-word;
  text-align: center;
  line-height: 1.3;
  font-size: 12px;
}
.orders-v2-actions__btn {
  display: inline-flex;
}
.ml8 {
  margin-left: 8px;
}
.orders-table {
  width: 100% !important;
}
.orders-table :deep(.el-table__inner-wrapper) {
  overflow-x: hidden !important;
}
.orders-table :deep(.el-table__body-wrapper),
.orders-table :deep(.el-table__header-wrapper) {
  overflow-x: hidden !important;
}
.orders-table-v2 :deep(.el-virtual-scrollbar.el-vl--horizontal) {
  display: none !important;
}
.orders-table-v2 :deep(.el-table-v2__main) {
  overflow-x: hidden !important;
}
.orders-status-cell {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 100%;
}
.orders-table :deep(.el-table__header .el-table__cell),
.orders-table :deep(.el-table__body .el-table__cell) {
  vertical-align: middle;
}
.orders-table :deep(.el-table__header .el-table__cell .cell) {
  display: block;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  word-break: keep-all;
  line-height: 1.35;
  padding: 6px 4px;
  min-height: 100%;
  box-sizing: border-box;
  font-size: 12px;
}
.orders-table :deep(.el-table__body .el-table__cell .cell) {
  display: block;
  text-align: center;
  white-space: normal;
  word-break: break-word;
  line-height: 1.35;
  padding: 6px 4px;
  min-height: 100%;
  box-sizing: border-box;
  font-size: 12px;
  overflow: hidden;
}
.orders-table :deep(.orders-col-status .cell),
.orders-table :deep(.orders-col-contract .cell),
.orders-table :deep(.orders-col-qc .cell),
.orders-table :deep(.orders-col-actions .cell) {
  display: flex;
  align-items: center;
  justify-content: center;
}
.orders-table :deep(.orders-col-contract .cell),
.orders-table :deep(.orders-col-qc .cell) {
  overflow: visible;
}
.orders-table :deep(td.orders-col-qc) {
  overflow: visible;
  position: relative;
}
.orders-table :deep(td.orders-col-qc:hover) {
  z-index: 6;
}
.orders-table :deep(.el-table-column--selection .cell),
.orders-table :deep(.orders-col-actions .cell) {
  white-space: nowrap;
  flex-wrap: wrap;
  gap: 3px;
  padding-left: 4px;
  padding-right: 4px;
}
.orders-table :deep(.sales-status-wrap) {
  max-width: 100%;
}
.orders-table :deep(.sales-status-pill) {
  padding: 2px 6px !important;
  height: auto !important;
  max-width: 100%;
}
.orders-table :deep(.sales-status-pill__text) {
  font-size: 11px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.25;
}
.orders-table :deep(.sales-status-pill__icon) {
  margin-right: 2px !important;
  font-size: 12px !important;
}
.orders-table :deep(.sales-status-reason) {
  max-width: 100%;
  font-size: 10px;
  padding: 2px 4px;
  margin-top: 2px;
}
.orders-table :deep(.contract-thumb-wrap--icon) {
  width: 56px;
  height: 52px;
}
.orders-table :deep(.contract-audit-glass) {
  font-size: 8px;
  padding: 3px 2px 2px;
}
.orders-table :deep(.contract-doc-icon) {
  transform: scale(0.85);
}
.orders-table :deep(.contract-thumb-actions) {
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 4px;
  padding: 0 3px;
  box-sizing: border-box;
}
.orders-table :deep(.contract-thumb-actions .el-tooltip__trigger) {
  display: inline-flex;
  line-height: 0;
  flex-shrink: 0;
}
.orders-table :deep(.contract-thumb-action.el-button.is-circle) {
  width: 20px;
  height: 20px;
  min-height: 20px;
  padding: 0;
  flex-shrink: 0;
}
.orders-table :deep(.contract-thumb-action.el-button.is-circle .el-icon) {
  font-size: 11px;
}
.orders-table :deep(.contract-placeholder) {
  font-size: 11px;
}
.orders-table :deep(.qc-thumb-wrap) {
  width: 52px;
  height: 52px;
}
.orders-table :deep(.qc-thumb-img) {
  width: 52px;
  height: 52px;
}
.orders-table :deep(.qc-placeholder) {
  font-size: 10px;
  max-width: 100%;
  line-height: 1.2;
}
.orders-table :deep(.qc-placeholder--link) {
  color: var(--el-color-primary);
  cursor: pointer;
}
.orders-table :deep(.qc-placeholder--link:hover) {
  text-decoration: underline;
}
.orders-table :deep(.orders-col-actions .el-button.is-circle) {
  width: 26px;
  height: 26px;
  padding: 4px;
}
.orders-table :deep(.orders-col-actions .el-button.is-circle .el-icon) {
  font-size: 13px;
}
.orders-table :deep(.contract-cell),
.orders-table :deep(.qc-cell) {
  gap: 4px;
  flex-wrap: wrap;
}
.orders-row-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 100%;
}
.orders-action-btn-host {
  display: inline-flex;
  vertical-align: middle;
}
.orders-v2-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  justify-content: center;
  align-items: center;
  max-width: 100%;
}
.orders-col-header__text {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
.orders-col-header {
  display: inline-flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
  max-width: 100%;
  white-space: nowrap;
  vertical-align: middle;
}
.orders-col-header .orders-col-header__text {
  flex: 1 1 auto;
  min-width: 0;
  max-width: calc(100% - 40px);
}
.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
  flex-shrink: 0;
}
.qc-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: nowrap;
}
.qc-thumb-wrap {
  position: relative;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}
.qc-thumb-wrap:hover {
  z-index: 4;
}
.qc-thumb-img {
  width: 52px;
  height: 52px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  cursor: default;
  display: block;
  background: #fff;
}
.qc-thumb-actions {
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.58);
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  align-content: center;
  gap: 3px;
  padding: 4px 3px;
  box-sizing: border-box;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}
.qc-thumb-actions :deep(.el-tooltip__trigger),
.qc-thumb-action-host {
  display: inline-flex;
  line-height: 0;
  flex-shrink: 0;
}
.qc-thumb-wrap:hover .qc-thumb-actions {
  opacity: 1;
  pointer-events: auto;
}
.qc-thumb-action.el-button.is-circle {
  width: 20px !important;
  height: 20px !important;
  min-height: 20px !important;
  padding: 0 !important;
  flex-shrink: 0;
  border: none !important;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.2);
}
.qc-thumb-action.el-button.is-circle .el-icon {
  font-size: 11px !important;
}
.qc-thumb-action {
  border: none !important;
}
.qc-placeholder {
  font-size: 12px;
  max-width: 72px;
  line-height: 1.3;
}
.qc-placeholder--link {
  color: var(--el-color-primary);
  cursor: pointer;
}
.qc-placeholder--link:hover {
  text-decoration: underline;
}
.qc-add {
  flex-shrink: 0;
}
.qc-bind-search {
  margin-bottom: 12px;
}
.qc-bind-pad {
  padding: 16px 0;
}
.qc-bind-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid #f1f5f9;
}
.qc-bind-thumb {
  width: 56px;
  height: 56px;
  object-fit: contain;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  flex-shrink: 0;
  background: #fff;
}
.qc-bind-meta {
  flex: 1;
  min-width: 0;
}
.qc-bind-id {
  font-weight: 600;
  font-size: 13px;
  color: #0f172a;
}
.qc-bind-tags {
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.4;
  word-break: break-word;
}
.muted { color: #94a3b8; font-size: 12px; }
.log-block { font-weight: 600; margin-bottom: 8px; }
.log-block.mt { margin-top: 16px; }
.hint { font-size: 12px; color: #64748b; margin-top: 8px; }
.ml4 { margin-left: 4px; }
.text-muted { color: #64748b; }

.desktop-only {
  display: block;
}
.mobile-list {
  display: none;
}
.mobile-filters {
  display: none;
}
.mobile-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  margin-bottom: 10px;
}
.mobile-card--highlight {
  border-color: #facc15;
  box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.28);
  animation: orders-row-highlight-pulse 2s ease-in-out 3;
}
@keyframes orders-row-highlight-pulse {
  0%,
  100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.04);
  }
}
.sales-orders--touch .qc-thumb-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.sales-orders--touch .qc-thumb-actions {
  position: static;
  inset: auto;
  opacity: 1;
  pointer-events: auto;
  background: transparent;
  margin-top: 6px;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 8px;
  padding: 0;
}
.sales-orders--touch .qc-thumb-action.el-button.is-circle {
  width: 28px;
  height: 28px;
  min-height: 28px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}
.sales-orders--touch .qc-thumb-action.el-button.is-circle .el-icon {
  font-size: 15px;
}
.sales-orders--touch .contract-thumb-wrap--icon {
  height: auto;
  min-height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.sales-orders--touch .contract-thumb-wrap--icon .contract-thumb-actions {
  position: static;
  inset: auto;
  opacity: 1;
  pointer-events: auto;
  background: transparent;
  margin-top: 4px;
}
.sales-orders--touch .contract-thumb-wrap--icon:hover .contract-thumb-body,
.sales-orders--touch .contract-thumb-wrap--icon:hover .contract-audit-glass {
  opacity: 1;
}
.orders-table :deep(tr.orders-row--highlight > td.el-table__cell) {
  background: #fef9c3 !important;
  animation: orders-row-highlight-pulse 2s ease-in-out 3;
}
.orders-table :deep(tr.orders-row--editable > td.el-table__cell) {
  cursor: pointer;
}
.orders-table-v2 :deep(.el-table-v2__row.orders-row--highlight) {
  background: #fef9c3;
  animation: orders-row-highlight-pulse 2s ease-in-out 3;
}
.orders-table-v2 :deep(.el-table-v2__row.orders-row--editable) {
  cursor: pointer;
}
.mobile-card--editable {
  cursor: pointer;
}
.mobile-card--focus {
  border-color: rgba(34, 197, 94, 0.55);
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.12);
}
.mobile-card--selected {
  border-color: #93c5fd;
  background: #f8fbff;
}
.mobile-list-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.mobile-list-toolbar__sync {
  font-size: 12px;
  color: #94a3b8;
}
.mobile-select-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}
.mobile-select-bar__count {
  font-size: 12px;
  color: #2563eb;
  font-weight: 600;
}
.mobile-card__pick {
  flex-shrink: 0;
}
.mobile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.mobile-order-no {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: #0f172a;
  word-break: break-all;
}
.mobile-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 0;
  font-size: 13px;
  color: #475569;
}
.mobile-line > span:first-child {
  flex-shrink: 0;
  color: #94a3b8;
}
.mobile-line > span:last-child {
  text-align: right;
  word-break: break-all;
}
.mobile-actions {
  margin-top: 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.mobile-flow-board {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed #e2e8f0;
}

@media (max-width: 992px) {
  .sales-orders {
    height: auto;
    min-height: 0;
  }
  .mobile-filters {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mobile-filters .w-full {
    width: 100%;
  }
  .mobile-date-range {
    max-width: 100%;
  }
  .mobile-date-range :deep(.el-range-input) {
    font-size: 13px;
  }
  .batch-actions--mobile {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .batch-actions--mobile .batch-actions-inner {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
  }
  .batch-actions--mobile .batch-actions-group {
    display: contents;
  }
  .batch-actions--mobile .batch-actions-group__label {
    display: none;
  }
  .batch-actions--mobile .batch-actions-inner .el-upload {
    width: 100%;
  }
  .batch-actions--mobile .batch-actions-inner .el-upload .el-button {
    width: 100%;
  }
  .batch-actions--mobile .batch-del-tooltip-host {
    display: block;
    width: 100%;
  }
  .batch-actions--mobile .batch-del-tooltip-host .el-button {
    width: 100%;
  }
  .batch-actions--mobile .selected-tip {
    grid-column: 1 / -1;
  }
  .mobile-batch-toggle {
    width: 100%;
    justify-content: center;
    margin: 0;
    padding: 8px 0;
  }
  .desktop-only {
    display: none !important;
  }
  .mobile-list {
    display: block;
  }
  .table-wrap {
    flex: none;
    overflow: visible;
    padding: 10px;
  }
  .pager {
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .pager .w100 {
    width: 100%;
  }
  .pager :deep(.el-pagination) {
    flex-wrap: wrap;
    justify-content: center;
  }
}

.messages-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e2e8f0;
}
.messages-toolbar--top .messages-hint {
  flex: 1;
  text-align: right;
}
.msg-type-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-bottom: 12px;
  width: 100%;
}
.msg-type-filter :deep(.el-radio-button__inner) {
  padding: 7px 10px;
}
.messages-hint {
  font-size: 12px;
  color: #94a3b8;
}
.messages-scroll {
  padding-right: 4px;
}
.messages-empty {
  padding: 24px 0;
}
.msg-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 12px 10px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.msg-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  background: #fff;
}
.msg-card:focus-visible {
  outline: 2px solid rgba(34, 197, 94, 0.45);
  outline-offset: 2px;
}
.msg-card--unread {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.06), #f8fafc);
  border-color: rgba(34, 197, 94, 0.35);
  border-left-width: 3px;
  border-left-color: #22c55e;
}
.msg-card__row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.msg-card__icon-wrap {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.msg-card__icon-wrap--reject {
  background: #ef4444;
  border-color: #dc2626;
  box-shadow: 0 1px 3px rgba(220, 38, 38, 0.35);
}
.msg-card__reject-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 26px;
  font-weight: 600;
  line-height: 1;
  color: #fff;
  user-select: none;
}
.msg-card__icon-wrap--notice :deep(.el-icon) {
  color: #2563eb;
}
.msg-card__icon-wrap--todo :deep(.el-icon) {
  color: #d97706;
}
.msg-card__icon-wrap--system :deep(.el-icon) {
  color: #64748b;
}
.msg-card__main {
  flex: 1;
  min-width: 0;
}
.msg-card__head {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-bottom: 8px;
}
.msg-card__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: #ef4444;
}
.msg-card__title {
  flex: 1;
  min-width: 120px;
  font-weight: 600;
  font-size: 14px;
  color: #0f172a;
  line-height: 1.4;
}
.msg-card__type-tag {
  flex-shrink: 0;
  color: #64748b !important;
  border-color: #e2e8f0 !important;
  background: rgba(255, 255, 255, 0.9) !important;
}
.msg-card__badge {
  flex-shrink: 0;
}
.msg-card__body {
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-card__time {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 10px;
}
.form-hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 12px;
}
.header-field-actions {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
}
.header-field-icon {
  cursor: pointer;
  color: #64748b;
}
.header-field-icon.danger {
  color: #f97373;
}
.contract-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: nowrap;
}
.contract-thumb-wrap--icon {
  position: relative;
  width: 58px;
  height: 72px;
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  box-sizing: border-box;
  background: linear-gradient(165deg, #ffffff 0%, #f8fafc 100%);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}
.contract-thumb-body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
  padding: 2px 2px 0;
}
.contract-thumb-wrap--icon::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 8px 0 0 8px;
  z-index: 0;
}
.contract-thumb-wrap--draft.contract-thumb-wrap--icon {
  border-color: #cbd5e1;
}
.contract-thumb-wrap--draft.contract-thumb-wrap--icon::before {
  background: #64748b;
}
.contract-thumb-wrap--pending_review.contract-thumb-wrap--icon {
  border-color: rgba(217, 119, 6, 0.45);
  background: linear-gradient(165deg, #ffffff 0%, #fffbeb 100%);
}
.contract-thumb-wrap--pending_review.contract-thumb-wrap--icon::before {
  background: #d97706;
}
.contract-thumb-wrap--approved.contract-thumb-wrap--icon {
  border-color: rgba(22, 163, 74, 0.4);
  background: linear-gradient(165deg, #ffffff 0%, #f0fdf4 100%);
}
.contract-thumb-wrap--approved.contract-thumb-wrap--icon::before {
  background: #16a34a;
}
.contract-thumb-wrap--rejected.contract-thumb-wrap--icon {
  border-color: rgba(220, 38, 38, 0.4);
  background: linear-gradient(165deg, #ffffff 0%, #fff1f2 100%);
}
.contract-thumb-wrap--rejected.contract-thumb-wrap--icon::before {
  background: #dc2626;
}
/* 底部审核状态：与角色块同色系的半透明 + 毛玻璃 */
.contract-audit-glass {
  flex-shrink: 0;
  position: relative;
  z-index: 2;
  width: 100%;
  padding: 5px 3px 4px;
  font-size: 9px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-align: center;
  pointer-events: none;
  backdrop-filter: blur(10px) saturate(1.15);
  -webkit-backdrop-filter: blur(10px) saturate(1.15);
  border-top: 1px solid rgba(255, 255, 255, 0.55);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
}
.contract-audit-glass--draft {
  color: #334155;
  background: rgba(241, 245, 249, 0.55);
}
.contract-audit-glass--pending_review {
  color: #92400e;
  background: rgba(254, 243, 199, 0.52);
}
.contract-audit-glass--approved {
  color: #14532d;
  background: rgba(220, 252, 231, 0.52);
}
.contract-audit-glass--rejected {
  color: #7f1d1d;
  background: rgba(254, 226, 226, 0.52);
}
.contract-doc-icon {
  flex-shrink: 0;
  width: 30px;
}
.contract-thumb-actions {
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.52);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}
.contract-thumb-actions :deep(.el-tooltip__trigger) {
  display: inline-flex;
  line-height: 0;
}
.contract-thumb-wrap--icon:hover {
  overflow: visible;
  z-index: 2;
}
.contract-thumb-wrap--icon:hover .contract-thumb-actions {
  opacity: 1;
  pointer-events: auto;
}
.contract-thumb-wrap--icon:hover .contract-thumb-body,
.contract-thumb-wrap--icon:hover .contract-audit-glass {
  opacity: 0;
}
.contract-thumb-action {
  border: none !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18);
}
.contract-placeholder {
  font-size: 11px;
  max-width: 76px;
  line-height: 1.35;
  padding: 5px 8px;
  text-align: center;
  color: #94a3b8;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
}
.contract-add {
  flex-shrink: 0;
}
.print-tooltip-trigger {
  display: inline-block;
}
.contract-preview-dialog-inner {
  min-height: 50vh;
}
.contract-preview-html {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 24px 32px;
  max-height: 70vh;
  overflow: auto;
  font-family: FangSong_GB2312, 仿宋_GB2312, 仿宋, FangSong;
  font-size: 16px;
  line-height: 1.5;
  color: #000;
  text-align: left;
}
.contract-preview-html :deep(h1),
.contract-preview-html :deep(h2),
.contract-preview-html :deep(h3),
.contract-preview-html :deep(.contract-title) {
  font-family: FZXiaoBiaoSong-S05, FZXiaoBiaoSong, 方正小标宋简体, 方正小标宋, 方正小标宋_GBK, FZShuSong_GB2312, SimSun;
  font-size: 22px;
  font-weight: normal;
  text-align: center;
  letter-spacing: 2px;
}
.contract-preview-html :deep(p) {
  text-indent: 2em;
  margin: 0.5em 0;
  text-align: justify;
}
.contract-preview-html :deep(table) {
  border-collapse: collapse;
  width: 100%;
}
.contract-preview-html :deep(.contract-header-meta) {
  width: auto;
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
  border: none;
}
.contract-preview-html :deep(.contract-header-meta th),
.contract-preview-html :deep(.contract-header-meta td) {
  border: none;
  text-align: left;
  vertical-align: top;
}
.contract-preview-html :deep(th),
.contract-preview-html :deep(td) {
  border: 1px solid #000;
  padding: 6px 8px;
  text-align: center;
  font-size: 16px;
}
.contract-preview-html :deep(.party-table) {
  page-break-inside: avoid;
  break-inside: avoid;
  font-size: 14px;
  line-height: 1.35;
}
.contract-preview-html :deep(.party-table tr) {
  page-break-inside: avoid;
  break-inside: avoid;
}
.contract-preview-html :deep(.party-table td) {
  text-align: left;
  font-size: 14px;
  line-height: 1.35;
  padding: 5px 8px;
}
.contract-preview-html :deep(.party-table .party-col-title) {
  text-align: center;
  font-weight: 700;
  margin-bottom: 4px;
  display: block;
}
.contract-preview-pdf {
  width: 100%;
  min-height: 62vh;
  border: none;
  border-radius: 8px;
  background: #f1f5f9;
}
.contract-preview-docx {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  max-height: 70vh;
  overflow: auto;
  font-size: 13px;
  line-height: 1.55;
  color: #111;
}
.contract-preview-docx :deep(table) {
  border-collapse: collapse;
  width: 100%;
}
.contract-preview-docx :deep(td),
.contract-preview-docx :deep(th) {
  border: 1px solid #ddd;
  padding: 4px 8px;
}
.contract-preview-image {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  margin: 0 auto;
  object-fit: contain;
}
.contract-preview-other {
  padding: 24px;
  text-align: center;
  color: #475569;
}
.btn-fake-disabled {
  opacity: 0.55;
}
:deep(.el-table__row) {
  cursor: pointer;
  transition: background-color 0.2s ease;
}
:deep(.el-table__row:hover) {
  background-color: rgba(34, 197, 94, 0.06) !important;
}
:deep(.el-table__row--striped) {
  background-color: #f8fafc;
}
:deep(.el-table__row--striped:hover) {
  background-color: rgba(34, 197, 94, 0.06) !important;
}
:deep(.el-table th) {
  background-color: #f8fafc !important;
  color: #334155;
  font-weight: 600;
  border-bottom: 2px solid #e2e8f0;
}
:deep(.el-table td) {
  border-bottom-color: #eef2f7;
}
:deep(.el-table--border .el-table__inner-wrapper::after),
:deep(.el-table--border::after),
:deep(.el-table--border::before),
:deep(.el-table__inner-wrapper::before) {
  border-color: #e2e8f0;
}
:deep(.el-button--small) {
  border-radius: 8px;
  padding: 6px 12px;
}
:deep(.el-tag) {
  border-radius: 6px;
}
:deep(.el-pagination) {
  --el-pagination-button-bg-color: #fff;
  --el-pagination-button-color: #334155;
  --el-pagination-hover-color: #22c55e;
}
:deep(.el-pagination .el-pager li.is-active) {
  background-color: #22c55e;
  color: #fff;
}
:deep(.el-pagination .el-pager li:hover) {
  color: #22c55e;
}
</style>
