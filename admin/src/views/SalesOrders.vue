<template>
  <div class="sales-orders">
    <el-card class="toolbar-card" shadow="never">
      <div class="toolbar">
        <div class="left">
          <el-input v-model="filters.customer_name" placeholder="客户名称" clearable class="field-input" @keyup.enter="load" />
          <el-input v-model="filters.customer_code" placeholder="客户编号" clearable class="field-input-sm" @keyup.enter="load" />
          <el-input v-model="filters.product_name" placeholder="商品名称" clearable class="field-input-sm" @keyup.enter="load" />
          <el-input v-model="filters.product_model" placeholder="标签型号" clearable class="field-input-sm" @keyup.enter="load" />
          <el-input v-model="filters.warehouse_model" placeholder="仓库型号" clearable class="field-input-sm" @keyup.enter="load" />
          <el-input v-model="filters.order_no" placeholder="订单号" clearable class="field-input" @keyup.enter="load" />
          <el-select v-model="filters.status" placeholder="订单状态" clearable class="field-select" @change="load">
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
          <el-checkbox v-if="perm('order_management', 'order_status_finance')" v-model="filters.pending_finance_only" @change="load">
            仅待财务审核
          </el-checkbox>
          <el-checkbox v-if="perm('order_management', 'order_status_qc')" v-model="filters.pending_qc_only" @change="load">
            仅待质检审核
          </el-checkbox>
          <el-button type="primary" @click="load" icon=Search>查询</el-button>
          <el-button @click="resetFilters" icon=Refresh>重置</el-button>
        </div>
        <div class="right">
          <el-button v-if="perm('order_management', 'order_input')" @click="downloadTpl" icon=Download size="small">下载导入模板</el-button>
          <el-upload
            v-if="perm('order_management', 'order_input')"
            :show-file-list="false"
            accept=".xlsx,.xls"
            :before-upload="onImportFile"
          >
            <el-button icon=UploadFilled size="small">Excel 导入</el-button>
          </el-upload>
          <el-button
            v-if="perm('order_management', 'order_field_config')"
            @click="openFieldManage"
            size="small"
          >表单字段</el-button>
          <el-button
            v-if="canExport"
            :loading="exporting"
            @click="exportXlsx"
            icon=Download size="small">导出 Excel</el-button>
          <el-button v-if="perm('order_management', 'order_input')" type="primary" @click="openCreate" size="small">手动录入</el-button>
          <el-button v-if="showMessages" @click="messagesOpen = true" size="small">
            站内信
            <el-badge v-if="unreadCount" :value="unreadCount" class="ml4" />
          </el-button>
        </div>
      </div>
      <div class="batch-actions">
        <span class="selected-tip" v-if="selected.length > 0">已选 {{ selected.length }} 条</span>
        <el-divider v-if="selected.length > 0" direction="vertical" />
        <el-tooltip
          placement="top"
          :disabled="batchSubmitTipDisabled"
          content="批量提交仅支持您本人创建且当前可提交审核的订单。请先取消不符合条件的勾选项。"
        >
          <span class="batch-del-tooltip-host">
            <el-button
              v-if="perm('order_management', 'order_submit')"
              type="primary"
              plain
              size="small"
              :disabled="batchSubmitDisabled"
              @click="batchSubmitReview"
             icon=Check>
              批量提交审核
            </el-button>
          </span>
        </el-tooltip>
        <el-button
          v-if="perm('order_management', 'order_status_finance')"
          type="warning"
          plain
          size="small"
          :disabled="batchFinanceReviewableList.length === 0"
          @click="openFinanceBatch"
        >
          批量审核
        </el-button>
        <el-button
          v-if="perm('order_management', 'order_status_qc')"
          type="warning"
          plain
          size="small"
          :disabled="batchQcReviewableList.length === 0"
          @click="openQcReviewBatch"
        >
          批量质检审核
        </el-button>
        <el-button
          v-if="batchShipActionVisible"
          type="primary"
          plain
          size="small"
          :disabled="batchShippableList.length === 0"
          @click="openShipBatch"
        >
          批量发货
        </el-button>
        <el-tooltip
          placement="top"
          :disabled="batchDeleteTipDisabled"
          content="批量删除仅支持当前账号有删除权限且状态允许的订单。请先取消不符合条件的勾选项。"
        >
          <span class="batch-del-tooltip-host">
            <el-button
              v-if="perm('order_management', 'order_delete')"
              type="danger"
              plain
              size="small"
              :disabled="batchDeleteDisabled"
              @click="batchDeleteOrders"
             icon=Delete>
              批量删除
            </el-button>
          </span>
        </el-tooltip>
        <el-button
          v-if="perm('contract_management', 'contract_generate')"
          type="success"
          size="small"
          :disabled="selected.length === 0"
          @click="openContractGen"
        >生成合同</el-button>
      </div>
    </el-card>

    <div class="table-wrap">
      <div class="table-list-toolbar">
        <el-popover placement="bottom-start" :width="220" trigger="click">
          <template #reference>
            <el-button>
              列显示
              <el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
          </template>
          <div class="order-list-column-picker">
            <div class="order-list-column-picker__title">部分列默认隐藏；勾选「发货人」可关闭独立列（状态角标仍会尽量带出姓名）</div>
            <el-checkbox v-model="orderListColVisible.orderNo">订单号</el-checkbox>
            <el-checkbox v-model="orderListColVisible.sales">销售</el-checkbox>
            <el-checkbox v-model="orderListColVisible.shipper">发货人</el-checkbox>
            <el-checkbox v-model="orderListColVisible.uploadedAt">上传日期</el-checkbox>
          </div>
        </el-popover>
        <el-checkbox v-model="ordersVirtualTable" size="small" class="ml8" @change="onOrdersVirtualToggle">
          虚拟滚动（大数据）
        </el-checkbox>
      </div>
      <div class="table-inner" :class="{ 'table-inner--v2': ordersVirtualTable }">
        <template v-if="ordersVirtualTable">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            class="orders-v2-hint"
            title="虚拟列表模式下不展示行勾选、合同与二维码缩略图；适合单次加载数百至上千行。需要批量操作请关闭此项。"
          />
          <el-auto-resizer>
            <template #default="{ height, width }">
              <el-table-v2
                v-if="height > 0 && width > 0"
                class="orders-table-v2"
                :columns="ordersV2Columns"
                :data="items"
                :width="Math.max(ordersV2TableWidth, width)"
                :height="height"
                :row-height="48"
                row-key="id"
                fixed
              />
            </template>
          </el-auto-resizer>
        </template>
        <el-table
          v-else
          ref="ordersTable"
          class="orders-table"
          :data="items"
          border
          stripe
          height="100%"
          style="width: 100%; max-width: 100vw; table-layout: fixed;"
          row-key="id"
          @selection-change="onOrdersSelectionChange"
        >
        <el-table-column
          v-if="showOrderRowSelection"
          type="selection"
          width="48"
          :selectable="orderRowSelectable"
        />
        <el-table-column
          v-if="orderListColVisible.orderNo"
          prop="order_no"
          label="订单号"
          width="140"
          show-overflow-tooltip
        />
        <el-table-column label="状态" width="180" align="center">
          <template #default="{ row }">
            <div class="orders-status-cell">
              <SalesStatusPill kind="order" :order-row="row" />
            </div>
          </template>
        </el-table-column>
        <el-table-column
          v-if="orderListColVisible.shipper"
          prop="shipped_by_name"
          label="发货人"
          width="92"
          show-overflow-tooltip
        />
        <el-table-column
          v-for="col in fieldDefinitions"
          :key="col.field_key"
          :prop="'display_data.' + col.field_key"
          min-width="72"
        >
          <template #header>
            <span>{{ col.required ? '*' : '' }}{{ col.label_zh }}</span>
            <span
              v-if="perm('order_management', 'order_field_config')"
              class="header-field-actions"
            >
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
          </template>
          <template #default="{ row }">
            {{ displayCell(row, col.field_key) }}
          </template>
        </el-table-column>
        <el-table-column
          v-if="perm('order_management', 'order_field_config')"
          width="52"
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
        <el-table-column
          v-if="orderListColVisible.sales"
          prop="created_by_username"
          label="销售"
          width="60"
          show-overflow-tooltip
        />
        <el-table-column v-if="orderListColVisible.uploadedAt" label="上传日期" width="120" show-overflow-tooltip>
          <template #default="{ row }">
            {{ $dt(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="合同" width="100" align="center">
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
                    <el-tooltip content="下载为 Word（上传类合同为原文件）" placement="top">
                      <el-button
                        type="success"
                        circle
                        size="small"
                        class="contract-thumb-action"
                        @click.stop="downloadOrderContractFile(row)"
                      >
                        <el-icon><Download /></el-icon>
                      </el-button>
                    </el-tooltip>
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
        <el-table-column label="质检二维码" width="100" align="center">
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
                    <el-button
                      type="primary"
                      circle
                      size="small"
                      class="qc-thumb-action"
                      @click.stop="downloadQcThumb(row)"
                    >
                      <el-icon><Download /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip content="预览" placement="top">
                    <el-button
                      type="success"
                      circle
                      size="small"
                      class="qc-thumb-action"
                      @click.stop="previewQcThumb(row)"
                    >
                      <el-icon><View /></el-icon>
                    </el-button>
                  </el-tooltip>
                  <el-tooltip
                    :content="canRemoveQc(row) ? '删除二维码绑定' : '当前不可删除二维码绑定'"
                    placement="top"
                  >
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
                  </el-tooltip>
                </div>
              </div>
              <span v-else class="qc-placeholder muted">{{ row.qc_report_label }}</span>
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
        <el-table-column label="操作" width="300" align="right" class-name="orders-col-actions">
          <template #default="{ row }">
            <el-button
              v-if="perm('order_management', 'order_edit')"
              :type="canEdit(row) ? 'primary' : 'info'"
              :class="{ 'btn-fake-disabled': !canEdit(row) }"
              size="small"
              plain
              @click="handleEditClick(row)"
             icon=Edit>编辑</el-button>
            <el-button
              v-if="perm('order_management', 'order_delete') && canDelete(row)"
              type="danger"
              size="small"
              plain
              @click="doDeleteRow(row)"
             icon=Delete>删除</el-button>
            <el-button
              v-if="perm('order_management', 'order_status_finance') && canFinanceReview(row)"
              type="success"
              size="small"
              @click="approveSingle(row)"
             icon=Select>通过</el-button>
            <el-button
              v-if="perm('order_management', 'order_status_finance') && canFinanceReview(row)"
              type="danger"
              size="small"
              @click="rejectSingle(row)"
            >驳回</el-button>
            <el-button
              v-if="perm('order_management', 'order_status_qc') && canQcReview(row)"
              type="success"
              size="small"
              @click="approveSingleQc(row)"
             icon=Select>审核通过</el-button>
            <el-button
              v-if="perm('order_management', 'order_status_qc') && canQcReview(row)"
              type="danger"
              size="small"
              @click="rejectSingleQc(row)"
            >驳回</el-button>
            <el-button
              v-if="canShip(row)"
              type="primary"
              size="small"
              plain
              @click="openShip(row)"
            >发货</el-button>
            <el-button
              v-if="perm('order_management', 'order_submit') && canSubmit(row)"
              type="primary"
              size="small"
              @click="submitSingle(row)"
             icon=Check>提交审核</el-button>
          </template>
        </el-table-column>
        </el-table>
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
    </div>

    <el-dialog v-model="formOpen" :title="form.id ? '修改订单' : '录入订单'" width="560px" @close="resetForm">
      <p class="form-hint">
        订单号由系统自动生成，保存后出现。发货日期为您在表格/表单中填写的业务日期；上传日期在首次保存时由系统自动记录，列表中可查看。
      </p>
      <el-form :model="formData" label-width="120px">
        <el-form-item
          v-for="col in fieldDefinitions"
          :key="col.field_key"
          :label="col.label_zh"
          :required="!!col.required"
          :error="formErrors[col.field_key]"
        >
          <el-input
            v-if="col.field_type === 'text'"
            v-model="formData[col.field_key]"
            clearable
            @input="clearFieldError(col.field_key)"
          />
          <el-input
            v-else-if="col.field_type === 'textarea'"
            v-model="formData[col.field_key]"
            type="textarea"
            rows="2"
            @input="clearFieldError(col.field_key)"
          />
          <el-input
            v-else-if="col.field_type === 'date'"
            v-model="formData[col.field_key]"
            placeholder="YYYY-MM-DD"
            @input="clearFieldError(col.field_key)"
          />
          <el-input-number
            v-else-if="col.field_type === 'number' || col.field_type === 'positive_number'"
            v-model="formData[col.field_key]"
            :min="col.field_type === 'positive_number' ? 0.0001 : undefined"
            :precision="4"
            class="w-full"
            @change="clearFieldError(col.field_key)"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formOpen = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm" icon=Check>保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="contractsOpen" title="客户相关合同" width="640px">
      <el-table v-if="contractRows.length" :data="contractRows" border size="small">
        <el-table-column prop="contract_no" label="合同编号" width="160" />
        <el-table-column prop="status" label="状态" min-width="200" align="center">
          <template #default="{ row }">
            <div class="orders-status-cell">
              <SalesStatusPill kind="contract" :status="row.status" :reject-reason="row.last_reject_comment || ''" />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="reviewer_username" label="审核人" width="100" />
        <el-table-column label="生成时间" min-width="160">
          <template #default="{ row }">{{ $dt(row.created_at) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无合同" />
    </el-dialog>

    <el-dialog v-model="logsOpen" title="订单追溯" width="720px">
      <div class="log-block">状态变更</div>
      <el-timeline v-if="statusLogs.length">
        <el-timeline-item v-for="l in statusLogs" :key="l.id" :timestamp="$dt(l.created_at)">
          {{ orderFlowStatusZh(l.from_status) }} → {{ orderFlowStatusZh(l.to_status) }} · 操作人：{{ l.actor_username || '—' }}<template v-if="l.remark"> · 备注：{{ l.remark }}</template>
        </el-timeline-item>
      </el-timeline>
      <div class="log-block mt">修改记录</div>
      <el-table v-if="editLogs.length" :data="editLogs" border size="small">
        <el-table-column label="时间" width="168">
          <template #default="{ row }">{{ $dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="actor_username" label="操作人" width="100" />
      </el-table>
    </el-dialog>

    <el-dialog v-model="financeOpen" :title="financeDialogTitle" width="440px">
      <el-form label-width="80px">
        <el-form-item label="结果">
          <el-radio-group v-model="financeForm.result">
            <el-radio label="approved">通过</el-radio>
            <el-radio label="rejected">驳回</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="意见">
          <el-input v-model="financeForm.comment" type="textarea" rows="3" placeholder="驳回必填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="financeOpen = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="financeLoading" @click="submitFinance" icon=Check>确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="qcReviewOpen" :title="qcReviewDialogTitle" width="440px">
      <el-form label-width="80px">
        <el-form-item label="结果">
          <el-radio-group v-model="qcReviewForm.result">
            <el-radio label="approved">审核通过</el-radio>
            <el-radio label="rejected">驳回</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="意见">
          <el-input v-model="qcReviewForm.comment" type="textarea" rows="3" placeholder="驳回必填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="qcReviewOpen = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="qcReviewLoading" @click="submitQcReview" icon=Check>确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="shipOpen" :title="shipDialogTitle" width="440px" @close="resetShipDialog">
      <p v-if="shipBatchList.length > 1" class="ship-batch-hint">
        已选 {{ shipBatchList.length }} 笔「财务与质检均已通过」的订单，将一并标记为已发货；以下说明会写入每笔订单并发站内信通知销售与财务。
      </p>
      <el-input v-model="shipNote" type="textarea" rows="3" placeholder="发货指令 / 备注（可选）" />
      <template #footer>
        <el-button @click="shipOpen = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="shipLoading" @click="submitShip" icon=Check>确认发货</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="genOpen" title="生成合同" width="520px" @closed="onGenDialogClosed">
      <el-form label-width="100px">
        <el-form-item label="方式">
          <el-radio-group v-model="genUseBlankTemplate" class="gen-contract-mode">
            <el-radio :label="false" :disabled="!templates.length">选用已保存模板</el-radio>
            <el-radio :label="true">从空白模板创建</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="!genUseBlankTemplate" label="模板">
          <el-select v-model="genTemplateId" placeholder="选择模板" class="w-full" filterable>
            <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <p v-if="genUseBlankTemplate" class="hint gen-contract-blank-hint">
          使用系统推荐版式，正文均为占位符，生成时按当前客户与订单填入买方全称、地址、联系方式及订单明细；避免选用其他客户模板中写死的名称。
        </p>
        <div class="hint">
          已选 {{ genOrderIdCount }} 条订单；自列表勾选生成时须为同一客户。
        </div>
      </el-form>
      <template #footer>
        <el-button @click="genOpen = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="genLoading" @click="runGenerate">生成</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="bindContractOpen"
      title="绑定已有合同"
      width="520px"
      :close-on-click-modal="false"
      @closed="onBindContractDialogClosed"
    >
      <p v-if="bindContractCustomerName" class="form-hint">
        当前订单客户：<strong>{{ bindContractCustomerName }}</strong>；仅可绑定同一客户下的合同。
      </p>
      <div v-loading="bindContractLoading">
        <el-form label-width="88px">
          <el-form-item label="合同">
            <el-select
              v-model="bindContractSelectedId"
              class="w-full"
              filterable
              placeholder="从合同列表中选择"
              :disabled="!bindContractRows.length"
            >
              <el-option
                v-for="c in bindContractRows"
                :key="c.id"
                :label="bindContractOptionLabel(c)"
                :value="c.id"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <el-empty v-if="!bindContractLoading && !bindContractRows.length" description="该客户暂无合同，请先在「销售合同」中创建" />
      </div>
      <template #footer>
        <el-button @click="bindContractOpen = false" icon=Close>取消</el-button>
        <el-button
          type="primary"
          :loading="bindContractSaving"
          :disabled="!bindContractSelectedId"
          @click="submitBindContract"
        >
          绑定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="contractPreviewOpen"
      :title="contractPreviewTitle"
      width="920px"
      top="4vh"
      class="contract-preview-dialog"
      :close-on-click-modal="false"
      @closed="onOrderContractPreviewClosed"
    >
      <div v-loading="contractPreviewLoading" class="contract-preview-dialog-inner">
        <div
          v-if="contractPreviewMode === 'html' && contractPreviewHtml"
          class="contract-preview-html"
          v-html="contractPreviewHtml"
        />
        <iframe
          v-else-if="contractPreviewMode === 'pdf' && contractPreviewPdfUrl"
          :src="contractPreviewPdfUrl"
          class="contract-preview-pdf"
          title="合同 PDF 预览"
        />
        <div
          v-else-if="contractPreviewMode === 'docx' && contractPreviewDocxHtml"
          class="contract-preview-docx"
          v-html="contractPreviewDocxHtml"
        />
        <img
          v-else-if="contractPreviewMode === 'image' && contractPreviewImageUrl"
          :src="contractPreviewImageUrl"
          alt="合同图片预览"
          class="contract-preview-image"
        />
        <div v-else-if="contractPreviewMode === 'other'" class="contract-preview-other">
          <p>当前为老版 .doc 或其它格式，无法在页面内预览。</p>
          <el-button type="primary" @click="downloadOrderContractPreviewFile" icon=Download>下载查看</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="contractPreviewOpen = false" icon=Close>关闭</el-button>
        <el-button
          v-if="perm('contract_management', 'contract_edit') || perm('contract_management', 'contract_generate')"
          type="primary"
          plain
          @click="goOrderContractByPreviewId"
         icon=Edit>
          编辑合同
        </el-button>
        <el-tooltip
          placement="top"
          content="若纸上出现日期、网址或页码，请在打印对话框「更多设置」中关闭「页眉和页脚」。"
          :show-after="300"
        >
          <span class="print-tooltip-trigger">
            <el-button
              type="primary"
              :disabled="
                contractPreviewMode === 'other' || (contractPreviewMode === 'html' && !contractPreviewHtml)
              "
              @click="printOrderContractPreview"
              icon=Printer
              >打印</el-button>
          </span>
        </el-tooltip>
      </template>
    </el-dialog>

    <el-dialog v-model="fieldManageOpen" title="录入表单字段管理" width="720px" @open="loadFieldDefinitionsAll">
      <el-button type="primary" size="small" class="mb8" @click="openNewField" icon=Plus>新增字段</el-button>
      <el-table :data="fieldAllList" border size="small" max-height="360">
        <el-table-column prop="field_key" label="字段键" width="120" />
        <el-table-column prop="label_zh" label="表头/标签" width="120" />
        <el-table-column prop="field_type" label="类型" width="100" />
        <el-table-column label="必填" width="72">
          <template #default="{ row }">{{ row.required ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column prop="sort_order" label="排序" width="72" />
        <el-table-column prop="maps_to" label="业务映射" width="120" />
        <el-table-column label="启用" width="72">
          <template #default="{ row }">{{ row.is_active ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link @click="editFieldRow(row)" icon=Edit>编辑</el-button>
            <el-button v-if="row.is_active" link type="danger" @click="removeFieldRow(row)" icon=Delete>删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog v-model="fieldEditOpen" :title="fieldEdit.id ? '编辑字段' : '新增字段'" width="480px">
      <el-form label-width="110px">
        <el-form-item label="字段键" required>
          <el-input v-model="fieldEdit.field_key" :disabled="!!fieldEdit.id" placeholder="小写字母开头，如 custom_a" />
        </el-form-item>
        <el-form-item label="显示名称" required>
          <el-input v-model="fieldEdit.label_zh" maxlength="128" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="fieldEdit.field_type" class="w-full">
            <el-option label="单行文本" value="text" />
            <el-option label="多行文本" value="textarea" />
            <el-option label="数字" value="number" />
            <el-option label="正数（＞0）" value="positive_number" />
            <el-option label="日期" value="date" />
          </el-select>
        </el-form-item>
        <el-form-item label="必填">
          <el-switch v-model="fieldEdit.required" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="fieldEdit.sort_order" :min="0" :max="9999" class="w-full" />
        </el-form-item>
        <el-form-item label="业务映射">
          <el-select v-model="fieldEdit.maps_to" clearable placeholder="可选，映射到系统列" class="w-full">
            <el-option label="（无）" :value="''" />
            <el-option v-for="m in mapsToOptions" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fieldEditOpen = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="fieldEditSaving" @click="saveFieldEdit" icon=Check>保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="qcBindOpen"
      title="绑定质检二维码"
      width="560px"
      destroy-on-close
      @open="fetchQcBindList"
    >
      <el-input
        v-model="qcBindSearch"
        placeholder="按报告品名、批号搜索"
        clearable
        class="qc-bind-search"
        @keyup.enter="fetchQcBindList"
      >
        <template #append>
          <el-button @click="fetchQcBindList">搜索</el-button>
        </template>
      </el-input>
      <el-scrollbar max-height="420px" class="qc-bind-scroll">
        <div v-if="qcBindLoading" class="muted qc-bind-pad">加载中…</div>
        <div v-else class="qc-bind-list">
          <div v-for="it in qcBindItems" :key="it.id" class="qc-bind-row">
            <img :src="it.qrThumbDataUrl" class="qc-bind-thumb" alt="">
            <div class="qc-bind-meta">
              <div class="qc-bind-id">二维码 #{{ it.id }}</div>
              <div class="qc-bind-tags text-muted">{{ formatQcBindTags(it.reportTags) }}</div>
            </div>
            <el-button type="primary" size="small" :loading="qcBindSaving" @click="confirmQcBind(it)">
              绑定
            </el-button>
          </div>
          <el-empty v-if="!qcBindItems.length && !qcBindLoading" description="暂无数据，请先在报告管理中生成二维码" />
        </div>
      </el-scrollbar>
    </el-dialog>

    <el-drawer
      v-model="messagesOpen"
      title="站内消息"
      size="420px"
      class="messages-drawer"
      @open="onMessagesOpen"
    >
      <div class="messages-toolbar messages-toolbar--top">
        <el-button size="small" @click="loadMessages" icon=Refresh>刷新</el-button>
        <el-button
          v-if="messages.length"
          size="small"
          type="danger"
          plain
          @click="clearMessageHistory"
        >
          清空历史
        </el-button>
        <span class="messages-hint">点击卡片标记已读</span>
      </div>
      <el-radio-group v-model="messageInboxFilter" size="small" class="msg-type-filter">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="notice">普通通知</el-radio-button>
        <el-radio-button value="todo">待办通知</el-radio-button>
        <el-radio-button value="system">系统消息</el-radio-button>
      </el-radio-group>
      <el-scrollbar class="messages-scroll" max-height="calc(100vh - 200px)">
        <div
          v-for="m in filteredMessages"
          :key="m.id"
          class="msg-card"
          :class="{ 'msg-card--unread': !m.read_at }"
          role="button"
          tabindex="0"
          @click="readMsg(m)"
          @keydown.enter="readMsg(m)"
        >
          <div class="msg-card__row">
            <div
              class="msg-card__icon-wrap"
              :class="{
                'msg-card__icon-wrap--reject': isFinanceRejectInboxMessage(m),
                'msg-card__icon-wrap--notice': messageKind(m) === 'notice' && !isFinanceRejectInboxMessage(m),
                'msg-card__icon-wrap--todo': messageKind(m) === 'todo',
                'msg-card__icon-wrap--system': messageKind(m) === 'system'
              }"
              aria-hidden="true"
            >
              <span v-if="isFinanceRejectInboxMessage(m)" class="msg-card__reject-x">×</span>
              <el-icon v-else-if="messageKind(m) === 'notice'" :size="22"><Bell /></el-icon>
              <el-icon v-else-if="messageKind(m) === 'todo'" :size="22"><Calendar /></el-icon>
              <el-icon v-else :size="22"><Cpu /></el-icon>
            </div>
            <div class="msg-card__main">
              <div class="msg-card__head">
                <span v-if="!m.read_at" class="msg-card__dot" aria-hidden="true" />
                <span class="msg-card__title">{{ m.title }}</span>
                <el-tag size="small" effect="plain" class="msg-card__type-tag">{{ messageKindLabel(m) }}</el-tag>
                <el-tag v-if="!m.read_at" type="danger" size="small" effect="plain" class="msg-card__badge">未读</el-tag>
              </div>
              <div class="msg-card__body">{{ m.body_text }}</div>
              <div class="msg-card__time">{{ $dt(m.created_at) }}</div>
            </div>
          </div>
        </div>
        <el-empty
          v-if="!filteredMessages.length"
          :description="messages.length ? '该分类暂无消息' : '暂无消息'"
          class="messages-empty"
        />
      </el-scrollbar>
    </el-drawer>
  </div>
</template>

<script>
import { perm, isSuperAdmin } from '../utils/permissions';
import {
  listSalesOrders,
  createSalesOrder,
  patchSalesOrder,
  submitSalesOrderReview,
  batchSubmitSalesOrderReview,
  withdrawSalesOrderReview,
  batchFinanceReviewSalesOrder,
  batchQcReviewSalesOrder,
  shipSalesOrder,
  batchShipSalesOrders,
  completeSalesOrder,
  cancelSalesOrder,
  deleteSalesOrder,
  batchDeleteSalesOrders,
  listSalesOrderStatusLogs,
  listSalesOrderEditLogs,
  listCustomerContracts,
  exportSalesOrdersXlsx,
  downloadSalesImportTemplate,
  importSalesOrdersXlsx,
  generateSalesContract,
  bindSalesOrderContract,
  listContractTemplates,
  listSalesContracts,
  listSalesMessages,
  markSalesMessageRead,
  clearSalesMessages,
  listSalesOrderFields,
  createSalesOrderField,
  updateSalesOrderField,
  deleteSalesOrderField,
  listSalesQrcodeBindCandidates,
  patchSalesOrderQcQrcode,
  getSalesContract,
  fetchSalesContractDocumentBlob,
  downloadSalesContractDocument
} from '../api';
import mammoth from 'mammoth';
import SalesStatusPill from '../components/SalesStatusPill.vue';
import WordDocumentIcon from '../components/WordDocumentIcon.vue';
import {
  finalizeContractBodyForPreview,
  downloadHtmlAsWordDoc,
  printHtmlDocumentInHiddenIframe,
  printContractPreviewFromHtml,
  escapeHtmlText
} from '../utils/contractPreviewHtml';
import { resolveInternalMessageRoute } from '../utils/internalMessageNavigate';
import { h } from 'vue';
import { ElButton } from 'element-plus';
import { zhMessageForApiError } from '../../../shared/apiErrorZh.js';
import { orderFlowStatusZh } from '../utils/salesStatusDisplay';
import { useAuthStore } from '../stores/auth';
import {
  createDefaultSalesOrderFilters,
  buildSalesOrderQueryParams,
  loadSalesOrderList
} from '../composables/useSalesOrderList';

export default {
  name: 'SalesOrders',
  components: { SalesStatusPill, WordDocumentIcon },
  data() {
    return {
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
      fieldDefinitions: [],
      formOpen: false,
      saving: false,
      /** 虚拟滚动表格（Element Plus TableV2），大量行时减轻 DOM 压力 */
      ordersVirtualTable: false,
      form: { id: null, row_version: 1 },
      formData: {},
      formErrors: {},
      fieldManageOpen: false,
      fieldAllList: [],
      fieldEditOpen: false,
      fieldEditSaving: false,
      fieldEdit: {
        id: null,
        field_key: '',
        label_zh: '',
        field_type: 'text',
        required: false,
        sort_order: 100,
        maps_to: ''
      },
      mapsToOptions: [
        { value: 'customer_code', label: '客户编号' },
        { value: 'customer_name', label: '客户名称' },
        { value: 'product_code', label: '商品编号' },
        { value: 'product_name', label: '商品名称' },
        { value: 'product_model', label: '标签型号' },
        { value: 'warehouse_model', label: '仓库型号' },
        { value: 'quantity', label: '数量' },
        { value: 'unit_price', label: '单价' },
        { value: 'amount', label: '金额' },
        { value: 'remark', label: '备注' }
      ],
      contractsOpen: false,
      contractRows: [],
      logsOpen: false,
      statusLogs: [],
      editLogs: [],
      financeOpen: false,
      financeLoading: false,
      financeRows: [],
      financeForm: { result: 'approved', comment: '' },
      qcReviewOpen: false,
      qcReviewLoading: false,
      qcReviewRows: [],
      qcReviewForm: { result: 'approved', comment: '' },
      shipOpen: false,
      shipRow: null,
      shipBatchList: [],
      shipNote: '',
      shipLoading: false,
      genOpen: false,
      /** 打开「生成合同」对话框时锁定的订单 id；关闭对话框时清空 */
      genOrderIds: [],
      genTemplateId: null,
      /** true：推荐版式+占位符，不套用已保存模板 */
      genUseBlankTemplate: false,
      genLoading: false,
      templates: [],
      bindContractOpen: false,
      bindContractOrderId: null,
      bindContractCustomerName: '',
      bindContractRows: [],
      bindContractLoading: false,
      bindContractSelectedId: null,
      bindContractSaving: false,
      contractPreviewOpen: false,
      contractPreviewLoading: false,
      contractPreviewHtml: '',
      /** html | pdf | docx | image | other */
      contractPreviewMode: 'html',
      contractPreviewPdfUrl: '',
      contractPreviewDocxHtml: '',
      contractPreviewImageUrl: '',
      contractPreviewDocName: '',
      previewContractId: null,
      contractPreviewTitle: '合同预览',
      exporting: false,
      messagesOpen: false,
      messages: [],
      /** all | notice | todo | system */
      messageInboxFilter: 'all',
      unreadCount: 0,
      /** When true, ignore el-table selection-change (clearSelection/toggleRowSelection would otherwise wipe `selected`). */
      ordersTableSelectionSync: false,
      /** @type {ReturnType<typeof setInterval> | null} */
      ordersAutoRefreshTimer: null,
      /** @type {ReturnType<typeof setInterval> | null} */
      inboxAutoRefreshTimer: null,
      /** @type {(() => void) | null} */
      pageVisibilityHandler: null,
      qcBindOpen: false,
      qcBindOrder: null,
      qcBindItems: [],
      qcBindLoading: false,
      qcBindSearch: '',
      qcBindSaving: false,
      /** 列表默认隐藏：订单号、销售、上传日期；发货人默认显示（企业微信 OAuth / 后台发货会写入） */
      orderListColVisible: {
        orderNo: false,
        sales: false,
        shipper: true,
        uploadedAt: false
      },
      statusOptions: [
        { value: 'pending_review', label: '待审核' },
        { value: 'pending_qc', label: '待质检审核' },
        { value: 'approved', label: '待发货' },
        { value: 'rejected', label: '驳回' },
        { value: 'shipped', label: '已发货' },
        { value: 'completed', label: '已完成' },
        { value: 'cancelled', label: '已取消' }
      ]
    };
  },
  computed: {
    isSuper() {
      return isSuperAdmin();
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
    genOrderIdCount() {
      return this.genOrderIds.length ? this.genOrderIds.length : this.selected.length;
    },
    batchSubmittableList() {
      return this.selected.filter((r) => this.canSubmit(r));
    },
    batchSubmitDisabled() {
      if (!this.selected.length) return true;
      return this.batchSubmittableList.length === 0 || this.batchSubmittableList.length !== this.selected.length;
    },
    batchSubmitTipDisabled() {
      return !perm('order_management', 'order_submit') || !this.selected.length || !this.batchSubmitDisabled;
    },
    batchShippableList() {
      return this.selected.filter((r) => this.canShip(r));
    },
    batchFinanceReviewableList() {
      return this.selected.filter((r) => this.canFinanceReview(r));
    },
    batchQcReviewableList() {
      return this.selected.filter((r) => this.canQcReview(r));
    },
    batchDeletableList() {
      return this.selected.filter((r) => this.canDelete(r));
    },
    batchDeleteDisabled() {
      if (!this.selected.length) return true;
      return this.batchDeletableList.length === 0 || this.batchDeletableList.length !== this.selected.length;
    },
    batchDeleteTipDisabled() {
      return !perm('order_management', 'order_delete') || !this.selected.length || !this.batchDeleteDisabled;
    },
    ordersV2Columns() {
      const cols = [];
      if (this.orderListColVisible.orderNo) {
        cols.push({
          key: 'order_no',
          dataKey: 'order_no',
          title: '订单号',
          width: 172,
          cellRenderer: ({ rowData }) =>
            h('span', { class: 'v2-cell-txt', title: rowData.order_no || '' }, rowData.order_no || '—')
        });
      }
      cols.push({
        key: 'status',
        dataKey: 'status',
        title: '状态',
        width: 200,
        align: 'center',
        cellRenderer: ({ rowData }) => h(SalesStatusPill, { kind: 'order', orderRow: rowData })
      });
      if (this.orderListColVisible.shipper) {
        cols.push({
          key: 'shipper',
          dataKey: 'shipped_by_name',
          title: '发货人',
          width: 92,
          cellRenderer: ({ rowData }) =>
            h(
              'span',
              { class: 'v2-cell-txt', title: rowData.shipped_by_name || '' },
              rowData.shipped_by_name || '—'
            )
        });
      }
      for (const col of this.fieldDefinitions) {
        const key = col.field_key;
        cols.push({
          key,
          dataKey: key,
          title: `${col.required ? '*' : ''}${col.label_zh}`,
          width: 112,
          cellRenderer: ({ rowData }) => {
            const text = this.displayCell(rowData, key);
            return h('span', { class: 'v2-cell-txt', title: text === '—' ? '' : String(text) }, text);
          }
        });
      }
      if (this.orderListColVisible.sales) {
        cols.push({
          key: 'sales',
          dataKey: 'created_by_username',
          title: '销售',
          width: 88,
          cellRenderer: ({ rowData }) =>
            h('span', { class: 'v2-cell-txt', title: rowData.created_by_username || '' }, rowData.created_by_username || '—')
        });
      }
      if (this.orderListColVisible.uploadedAt) {
        cols.push({
          key: 'uploaded',
          dataKey: 'created_at',
          title: '上传日期',
          width: 156,
          cellRenderer: ({ rowData }) =>
            h('span', { class: 'v2-cell-txt' }, this.$dt(rowData.created_at))
        });
      }
      cols.push({
        key: 'actions',
        dataKey: 'id',
        title: '操作',
        width: 340,
        align: 'right',
        cellRenderer: ({ rowData }) => {
          const chunks = [];
          if (perm('order_management', 'order_edit')) {
            chunks.push(
              h(
                ElButton,
                {
                  size: 'small',
                  type: 'primary',
                  plain: true,
                  disabled: !this.canEdit(rowData),
                  onClick: () => this.handleEditClick(rowData)
                },
                () => '编辑'
              )
            );
          }
          if (perm('order_management', 'order_delete')) {
            chunks.push(
              h(
                ElButton,
                {
                  size: 'small',
                  type: 'danger',
                  plain: true,
                  disabled: !this.canDelete(rowData),
                  onClick: () => this.doDeleteRow(rowData)
                },
                () => '删除'
              )
            );
          }
          if (perm('order_management', 'order_status_finance')) {
            chunks.push(
              h(
                ElButton,
                {
                  size: 'small',
                  type: 'success',
                  plain: true,
                  disabled: !this.canFinanceReview(rowData),
                  onClick: () => this.approveSingle(rowData)
                },
                () => '通过'
              )
            );
            chunks.push(
              h(
                ElButton,
                {
                  size: 'small',
                  type: 'danger',
                  plain: true,
                  disabled: !this.canFinanceReview(rowData),
                  onClick: () => this.rejectSingle(rowData)
                },
                () => '驳回'
              )
            );
          }
          if (perm('order_management', 'order_status_qc')) {
            chunks.push(
              h(
                ElButton,
                {
                  size: 'small',
                  type: 'success',
                  plain: true,
                  disabled: !this.canQcReview(rowData),
                  onClick: () => this.approveSingleQc(rowData)
                },
                () => '审核通过'
              )
            );
            chunks.push(
              h(
                ElButton,
                {
                  size: 'small',
                  type: 'danger',
                  plain: true,
                  disabled: !this.canQcReview(rowData),
                  onClick: () => this.rejectSingleQc(rowData)
                },
                () => '驳回'
              )
            );
          }
          if (this.canShip(rowData)) {
            chunks.push(
              h(
                ElButton,
                {
                  size: 'small',
                  type: 'primary',
                  plain: true,
                  onClick: () => this.openShip(rowData)
                },
                () => '发货'
              )
            );
          }
          return h(
            'div',
            { class: 'orders-v2-actions' },
            chunks.map((node, i) => h('span', { key: i, class: 'orders-v2-actions__btn' }, [node]))
          );
        }
      });
      return cols;
    },
    ordersV2TableWidth() {
      return this.ordersV2Columns.reduce((s, c) => s + (Number(c.width) || 0), 0);
    },
    financeDialogTitle() {
      const n = this.financeRows?.length || 0;
      return n > 1 ? `财务审核（${n}笔）` : '财务审核';
    },
    qcReviewDialogTitle() {
      const n = this.qcReviewRows?.length || 0;
      return n > 1 ? `质检审核（${n}笔）` : '质检审核';
    },
    shipDialogTitle() {
      if (this.shipBatchList.length > 1) return `批量发货（${this.shipBatchList.length}笔）`;
      return '发货';
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
      return this.orderDateRangeUsesSubmittedAt ? '提交审核开始' : '上传开始';
    },
    orderDateRangeEndPh() {
      if (this.orderDateRangeUsesFinancePassedAt) return '财务通过结束';
      return this.orderDateRangeUsesSubmittedAt ? '提交审核结束' : '上传结束';
    },
    filteredMessages() {
      const list = this.messages || [];
      const f = this.messageInboxFilter;
      if (f === 'all') return list;
      return list.filter((m) => this.messageKind(m) === f);
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
    }
  },
  mounted() {
    this.applyQuickViewFromRoute();
    this.applyFocusOrderFromRoute();
    if (!this.isBlockedByPasswordPolicy()) this.load();
    // 移除纯财务用户默认选中「仅待财务审核」的逻辑
    if (!perm('order_management', 'order_query') && perm('order_management', 'order_input')) {
      listSalesOrderFields()
        .then((d) => {
          this.fieldDefinitions = d.items || [];
        })
        .catch(() => {});
    }
    if (!this.isBlockedByPasswordPolicy()) this.refreshMessages();
    this.inboxAutoRefreshTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (this.isBlockedByPasswordPolicy()) return;
      if (this.showMessages) this.refreshMessages();
    }, 2000);
    this.ordersAutoRefreshTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (this.isBlockedByPasswordPolicy()) return;
      if (perm('order_management', 'order_query')) this.load({ silent: true });
    }, 2000);
    this.pageVisibilityHandler = () => {
      if (document.visibilityState !== 'visible') return;
      if (this.isBlockedByPasswordPolicy()) return;
      if (this.showMessages) this.refreshMessages();
      if (perm('order_management', 'order_query')) this.load({ silent: true });
    };
    document.addEventListener('visibilitychange', this.pageVisibilityHandler);
  },
  beforeUnmount() {
    if (this.inboxAutoRefreshTimer) clearInterval(this.inboxAutoRefreshTimer);
    if (this.ordersAutoRefreshTimer) clearInterval(this.ordersAutoRefreshTimer);
    if (this.pageVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.pageVisibilityHandler);
      this.pageVisibilityHandler = null;
    }
  },
  methods: {
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
    contractStatusButtonType(status) {
      if (status === 'draft') return 'info';
      if (status === 'pending_review') return 'warning';
      if (status === 'approved') return 'success';
      if (status === 'rejected') return 'danger';
      return 'info';
    },
    goOrderContract(row) {
      const id = row && row.contract_id;
      if (!id) return;
      this.$router.push(`/sales/contracts/editor/${id}`);
    },
    goOrderContractByPreviewId() {
      const id = this.previewContractId;
      if (!id) return;
      this.contractPreviewOpen = false;
      this.$router.push(`/sales/contracts/editor/${id}`);
    },
    salesContractPreviewVars(c) {
      if (!c) return null;
      return {
        CUSTOMER_NAME: c.customer_name != null ? String(c.customer_name) : '',
        CUSTOMER_ADDRESS: c.customer_address != null ? String(c.customer_address) : '',
        CUSTOMER_CONTACT: c.customer_contact != null ? String(c.customer_contact) : '',
        CUSTOMER_PHONE: c.customer_phone != null ? String(c.customer_phone) : '',
        CONTRACT_NO: c.contract_no != null ? String(c.contract_no) : '',
        COMPANY_NAME_ZH: c.company_name_zh != null ? String(c.company_name_zh) : ''
      };
    },
    async openOrderContractPreview(row) {
      const id = row && row.contract_id;
      if (!id) return;
      await this.openContractPreview({
        id,
        contract_no: null
      });
    },
    async openContractPreview(row) {
      if (!row?.id) return;
      this.contractPreviewTitle = `合同预览 · ${row.contract_no || row.id}`;
      this.contractPreviewOpen = true;
      this.contractPreviewLoading = true;
      this.contractPreviewHtml = '';
      this.contractPreviewDocxHtml = '';
      this.contractPreviewMode = 'html';
      if (this.contractPreviewPdfUrl) {
        URL.revokeObjectURL(this.contractPreviewPdfUrl);
        this.contractPreviewPdfUrl = '';
      }
      if (this.contractPreviewImageUrl) {
        URL.revokeObjectURL(this.contractPreviewImageUrl);
        this.contractPreviewImageUrl = '';
      }
      this.contractPreviewDocName = '';
      this.previewContractId = row.id;
      try {
        const d = await getSalesContract(row.id);
        const c = d?.contract;
        if (row.contract_no == null && c?.contract_no) {
          this.contractPreviewTitle = `合同预览 · ${c.contract_no}`;
        }
        if (c?.contract_source === 'upload') {
          const mime = String(c.document_mime_type || '').toLowerCase();
          const fn = String(c.document_original_filename || '').toLowerCase();
          this.contractPreviewDocName = c.document_original_filename || '合同文件';
          if (mime.includes('pdf') || fn.endsWith('.pdf')) {
            const blob = await fetchSalesContractDocumentBlob(row.id);
            this.contractPreviewPdfUrl = URL.createObjectURL(blob);
            this.contractPreviewMode = 'pdf';
            return;
          }
          const isDocx =
            mime.includes('wordprocessingml') ||
            fn.endsWith('.docx') ||
            (mime.includes('officedocument') && mime.includes('word'));
          if (isDocx) {
            try {
              const blob = await fetchSalesContractDocumentBlob(row.id);
              const ab = await blob.arrayBuffer();
              const { value: html } = await mammoth.convertToHtml({ arrayBuffer: ab });
              this.contractPreviewDocxHtml = html || '<p>（暂无解析内容）</p>';
              this.contractPreviewMode = 'docx';
            } catch {
              this.contractPreviewMode = 'other';
            }
            return;
          }
          if (mime.startsWith('image/')) {
            const blob = await fetchSalesContractDocumentBlob(row.id);
            this.contractPreviewImageUrl = URL.createObjectURL(blob);
            this.contractPreviewMode = 'image';
            return;
          }
          this.contractPreviewMode = 'other';
          return;
        }
        const vars = this.salesContractPreviewVars(c);
        this.contractPreviewHtml = finalizeContractBodyForPreview(c?.body_html, d?.orders || [], vars);
        this.contractPreviewMode = 'html';
      } catch {
        this.$message.error('加载失败');
        this.contractPreviewOpen = false;
      } finally {
        this.contractPreviewLoading = false;
      }
    },
    onOrderContractPreviewClosed() {
      this.contractPreviewHtml = '';
      this.contractPreviewDocxHtml = '';
      this.contractPreviewMode = 'html';
      if (this.contractPreviewPdfUrl) {
        URL.revokeObjectURL(this.contractPreviewPdfUrl);
        this.contractPreviewPdfUrl = '';
      }
      if (this.contractPreviewImageUrl) {
        URL.revokeObjectURL(this.contractPreviewImageUrl);
        this.contractPreviewImageUrl = '';
      }
      this.previewContractId = null;
    },
    async downloadOrderContractPreviewFile() {
      if (!this.previewContractId) return;
      try {
        await downloadSalesContractDocument(
          this.previewContractId,
          this.contractPreviewDocName || '合同文件'
        );
      } catch {
        this.$message.error('下载失败');
      }
    },
    async downloadOrderContractFile(row) {
      const id = row && row.contract_id;
      if (!id) return;
      try {
        const d = await getSalesContract(id);
        const c = d?.contract;
        if (c?.contract_source === 'upload') {
          await downloadSalesContractDocument(id, c.document_original_filename || '合同文件');
          return;
        }
        const vars = this.salesContractPreviewVars(c);
        const html = finalizeContractBodyForPreview(c?.body_html, d?.orders || [], vars);
        const no = (c?.contract_no || `contract-${id}`).replace(/[/\\?%*:|"<>]/g, '-');
        downloadHtmlAsWordDoc(html, `${no}.doc`);
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '下载失败'));
      }
    },
    printOrderContractPreview() {
      const docTitle = (this.contractPreviewTitle && String(this.contractPreviewTitle).trim()) || '合同打印';
      if (this.contractPreviewMode === 'pdf' && this.contractPreviewPdfUrl) {
        const w = window.open(this.contractPreviewPdfUrl, '_blank');
        if (!w) this.$message.warning('请允许弹窗后重试打印');
        return;
      }
      if (this.contractPreviewMode === 'docx' && this.contractPreviewDocxHtml) {
        const docHtml = this.contractPreviewDocxHtml;
        const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtmlText(
          docTitle
        )}</title><style>
          body{margin:0;padding:16px;font-family:SimSun,宋体,Segoe UI,sans-serif;font-size:14px;line-height:1.65;color:#111;}
          table{border-collapse:collapse;} td,th{border:1px solid #ccc;padding:4px 8px;}
          @media print{@page{margin:0;}body{padding:12mm;}}
          </style></head><body>${docHtml}</body></html>`;
        printHtmlDocumentInHiddenIframe(full);
        return;
      }
      if (this.contractPreviewMode === 'image' && this.contractPreviewImageUrl) {
        const src = this.contractPreviewImageUrl;
        const srcEsc = String(src)
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
        const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtmlText(
          docTitle
        )}</title><style>
          body{margin:0;text-align:center;padding:12px;} img{max-width:100%;height:auto;}
          @media print{@page{margin:0;} body{padding:10mm;} img{max-width:100%;}}
          </style></head><body><img src="${srcEsc}" alt="" /></body></html>`;
        printHtmlDocumentInHiddenIframe(full);
        return;
      }
      const html = this.contractPreviewHtml;
      if (!html) return;
      printContractPreviewFromHtml(html, docTitle);
    },
    canAddContractForRow(row) {
      if (!row || row.contract_id) return false;
      return perm('contract_management', 'contract_generate');
    },
    bindContractOptionLabel(c) {
      if (!c) return '';
      const no = c.contract_no != null ? String(c.contract_no) : `#${c.id}`;
      const title = c.title != null && String(c.title).trim() ? String(c.title).trim() : '—';
      const st = this.contractStatusLabel(c.status);
      return `${no} · ${title}（${st}）`;
    },
    onBindContractDialogClosed() {
      this.bindContractOrderId = null;
      this.bindContractCustomerName = '';
      this.bindContractRows = [];
      this.bindContractSelectedId = null;
      this.bindContractLoading = false;
      this.bindContractSaving = false;
    },
    async openBindContractForRow(row) {
      if (!this.canAddContractForRow(row)) return;
      this.bindContractOrderId = row.id;
      this.bindContractCustomerName = row.customer_name || '';
      this.bindContractSelectedId = null;
      this.bindContractRows = [];
      this.bindContractOpen = true;
      this.bindContractLoading = true;
      try {
        const d = await listSalesContracts({
          customer_id: row.customer_id,
          limit: 100,
          offset: 0
        });
        this.bindContractRows = d.items || [];
        if (this.bindContractRows.length === 1) {
          this.bindContractSelectedId = this.bindContractRows[0].id;
        }
      } catch {
        this.$message.error('加载合同列表失败');
        this.bindContractOpen = false;
      } finally {
        this.bindContractLoading = false;
      }
    },
    async submitBindContract() {
      const oid = this.bindContractOrderId;
      const cid = this.bindContractSelectedId;
      if (!oid || !cid) return;
      const errText = (code) => {
        if (code === 'ORDER_ALREADY_LINKED') return '该订单已关联合同';
        if (code === 'CUSTOMER_MISMATCH') return '合同与订单客户不一致';
        if (code === 'CONTRACT_NOT_FOUND') return '合同不存在';
        if (code === 'ORDER_NOT_FOUND') return '订单不存在';
        if (code === 'FORBIDDEN') return '无权限';
        return null;
      };
      this.bindContractSaving = true;
      try {
        await bindSalesOrderContract(oid, { contract_id: cid });
        this.$message.success('已绑定合同');
        this.bindContractOpen = false;
        await this.load();
      } catch (e) {
        const code = e?.response?.data?.error;
        this.$message.error(errText(code) || zhMessageForApiError(code) || this.$apiUserMsg(e, '绑定失败'));
      } finally {
        this.bindContractSaving = false;
      }
    },
    async prepareContractGenDialog(orderIds) {
      try {
        const d = await listContractTemplates();
        this.templates = d.items || [];
        this.genOrderIds = orderIds.slice();
        if (this.templates.length) {
          this.genTemplateId = this.templates[0]?.id;
          this.genUseBlankTemplate = false;
        } else {
          this.genTemplateId = null;
          this.genUseBlankTemplate = true;
          this.$message.info('暂无已保存模板，将使用「从空白模板创建」推荐版式');
        }
        this.genOpen = true;
      } catch (e) {
        this.$message.error('加载模板失败');
      }
    },
    onGenDialogClosed() {
      this.genOrderIds = [];
      this.genUseBlankTemplate = false;
    },
    isFinanceRejectInboxMessage(m) {
      if (!m) return false;
      if (m.title === '订单审核驳回') return true;
      if (m.ref_type === 'order_batch_rejected') return true;
      return false;
    },
    messageKind(m) {
      const c = m && m.category;
      if (c === 'todo' || c === 'system') return c;
      return 'notice';
    },
    messageKindLabel(m) {
      const k = this.messageKind(m);
      if (k === 'todo') return '待办';
      if (k === 'system') return '系统';
      return '普通';
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
    canWithdraw(row) {
      return row.status === 'pending_review' && row.submitted_for_review_at;
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
        focusOrderId: this.focusOrderId
      });
    },
    resetFilters() {
      this.filters = createDefaultSalesOrderFilters();
      this.dateRange = null;
      this.page = 1;
      this.load();
    },
    applyQuickViewFromRoute() {
      const view = this.$route?.query?.view;
      if (view) {
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
      } else {
        // 默认视图：状态下拉框不默认选中
        // 移除财务账号默认仅待财务审核的逻辑
      }
      const cc = this.$route?.query?.customer_code;
      if (cc) {
        this.filters.customer_code = cc;
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
      this.selected = rows || [];
    },
    async load(options = {}) {
      if (this.isBlockedByPasswordPolicy()) {
        this.items = [];
        this.total = 0;
        return;
      }
      const silent = options.silent === true;
      try {
        const d = await loadSalesOrderList({
          listApi: listSalesOrders,
          params: this.queryParams(),
          silent
        });
        this.items = d.items || [];
        this.total = d.total || 0;
        if (d.field_definitions?.length) this.fieldDefinitions = d.field_definitions;
        // 定时静默刷新会用新对象替换列表行；若不同步选中行，selection 仍指向旧引用，条件（如是否已提交）会过期，导致批量操作的笔数与结果错乱
        const selIds = new Set(
          (this.selected || []).map((r) => r && r.id).filter((id) => id != null)
        );
        const nextSelected = (this.items || []).filter((r) => selIds.has(r.id));
        this.ordersTableSelectionSync = true;
        this.selected = nextSelected;
        await this.$nextTick();
        const tb = this.$refs.ordersTable;
        if (tb && selIds.size) {
          tb.clearSelection();
          for (const row of this.selected) tb.toggleRowSelection(row, true);
        }
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
        await this.$nextTick();
        this.ordersTableSelectionSync = false;
        await this.maybeScrollToFocusOrder();
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
          '解除绑定后，若标签型号与报告品名一致将恢复自动关联。是否继续？',
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
      this.qcBindOrder = row;
      this.qcBindSearch = '';
      this.qcBindItems = [];
      this.qcBindOpen = true;
    },
    async fetchQcBindList() {
      this.qcBindLoading = true;
      try {
        const d = await listSalesQrcodeBindCandidates({
          q: this.qcBindSearch || undefined,
          limit: 80
        });
        this.qcBindItems = d.items || [];
      } catch {
        this.qcBindItems = [];
        this.$message.error('加载二维码列表失败');
      } finally {
        this.qcBindLoading = false;
      }
    },
    formatQcBindTags(tags) {
      if (!tags?.length) return '—';
      return tags
        .slice(0, 5)
        .map((t) => [t.productName, t.batchNo].filter(Boolean).join(' / ') || '—')
        .join('；');
    },
    async confirmQcBind(it) {
      if (!this.qcBindOrder) return;
      this.qcBindSaving = true;
      try {
        await patchSalesOrderQcQrcode(this.qcBindOrder.id, { qrcodeId: it.qrcodeId ?? it.id });
        this.$message.success('已绑定');
        this.qcBindOpen = false;
        this.qcBindOrder = null;
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '绑定失败'));
      } finally {
        this.qcBindSaving = false;
      }
    },
    displayCell(row, key) {
      const v = row.display_data?.[key];
      if (v === undefined || v === null || v === '') return '—';
      return v;
    },
    initEmptyFormData() {
      const o = {};
      for (const col of this.fieldDefinitions) {
        if (col.field_type === 'number' || col.field_type === 'positive_number') o[col.field_key] = undefined;
        else o[col.field_key] = '';
      }
      return o;
    },
    openCreate() {
      this.form = { id: null, row_version: 1 };
      this.formErrors = {};
      this.formData = this.initEmptyFormData();
      this.formOpen = true;
    },
    openEdit(row) {
      const rv = Number(row.row_version);
      this.form = { id: row.id, row_version: Number.isFinite(rv) && rv >= 1 ? rv : 1 };
      this.formErrors = {};
      this.formData = { ...this.initEmptyFormData(), ...(row.display_data || {}) };
      this.formOpen = true;
    },
    handleEditClick(row) {
      if (this.canEdit(row)) {
        this.openEdit(row);
        return;
      }
      if (row.status === 'approved') {
        this.$message.warning('该订单待发货，不能编辑');
        return;
      }
      if (row.status === 'shipped') {
        this.$message.warning('该订单已发货，不能编辑');
        return;
      }
      this.$message.warning('当前订单状态不支持编辑');
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
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `order-${row.order_no || row.id}-qrcode.${ext}`;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch {
        this.$message.error('下载失败');
      }
    },
    previewQcThumb(row) {
      this.openQcPublic(row);
    },
    clearFieldError(key) {
      if (this.formErrors[key]) {
        const next = { ...this.formErrors };
        delete next[key];
        this.formErrors = next;
      }
    },
    resetForm() {
      this.formErrors = {};
    },
    async saveForm() {
      this.formErrors = {};
      const payload = { data: {} };
      for (const col of this.fieldDefinitions) {
        let v = this.formData[col.field_key];
        if (v === undefined) v = null;
        payload.data[col.field_key] = v;
      }
      if (this.form.id) {
        payload.row_version = this.form.row_version;
      }
      this.saving = true;
      try {
        if (this.form.id) {
          await patchSalesOrder(this.form.id, payload);
          this.$message.success('已保存');
        } else {
          const r = await createSalesOrder(payload);
          this.$message.success(`已创建，订单号 ${r.order_no || ''}`);
          this.page = 1;
        }
        this.formOpen = false;
        this.load();
      } catch (e) {
        const d = e?.response?.data;
        if (d?.error === 'VALIDATION_FAILED' && Array.isArray(d.details)) {
          const fe = {};
          for (const x of d.details) fe[x.field_key] = x.message;
          this.formErrors = fe;
          this.$message.error('请根据下方提示修正表单');
        } else if (d?.error === 'CONCURRENT_UPDATE') {
          this.$message.error(d?.message || zhMessageForApiError('CONCURRENT_UPDATE'));
        } else {
          this.$message.error(this.$apiUserMsg(e, '保存失败'));
        }
      } finally {
        this.saving = false;
      }
    },
    onOrdersVirtualToggle() {
      this.selected = [];
      this.ordersTableSelectionSync = true;
      this.$nextTick(() => {
        try {
          this.$refs.ordersTable?.clearSelection?.();
        } catch {
          /* ignore */
        }
        this.ordersTableSelectionSync = false;
      });
    },
    async openFieldManage() {
      this.fieldManageOpen = true;
    },
    async loadFieldDefinitionsAll() {
      try {
        const d = await listSalesOrderFields({ all: '1' });
        this.fieldAllList = d.items || [];
      } catch {
        this.fieldAllList = [];
      }
    },
    openNewField() {
      this.fieldEdit = {
        id: null,
        field_key: '',
        label_zh: '',
        field_type: 'text',
        required: false,
        sort_order: 100,
        maps_to: ''
      };
      this.fieldEditOpen = true;
    },
    editFieldRow(row) {
      this.fieldEdit = {
        id: row.id,
        field_key: row.field_key,
        label_zh: row.label_zh,
        field_type: row.field_type,
        required: !!row.required,
        sort_order: row.sort_order,
        maps_to: row.maps_to || ''
      };
      this.fieldEditOpen = true;
    },
    async removeFieldRow(row) {
      try {
        await this.$confirm('停用该字段？历史订单数据仍保留。', '提示', { type: 'warning' });
      } catch {
        return;
      }
      try {
        await deleteSalesOrderField(row.id);
        this.$message.success('已停用');
        await this.loadFieldDefinitionsAll();
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    async saveFieldEdit() {
      if (!this.fieldEdit.field_key?.trim() || !this.fieldEdit.label_zh?.trim()) {
        this.$message.warning('请填写字段键与显示名称');
        return;
      }
      this.fieldEditSaving = true;
      try {
        const mapsTo = this.fieldEdit.maps_to === '' ? null : this.fieldEdit.maps_to;
        if (this.fieldEdit.id) {
          await updateSalesOrderField(this.fieldEdit.id, {
            label_zh: this.fieldEdit.label_zh,
            field_type: this.fieldEdit.field_type,
            required: this.fieldEdit.required,
            sort_order: this.fieldEdit.sort_order,
            maps_to: mapsTo
          });
        } else {
          await createSalesOrderField({
            field_key: this.fieldEdit.field_key.trim(),
            label_zh: this.fieldEdit.label_zh.trim(),
            field_type: this.fieldEdit.field_type,
            required: this.fieldEdit.required,
            sort_order: this.fieldEdit.sort_order,
            maps_to: mapsTo
          });
        }
        this.$message.success('已保存');
        this.fieldEditOpen = false;
        await this.loadFieldDefinitionsAll();
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '保存失败'));
      } finally {
        this.fieldEditSaving = false;
      }
    },
    async openContracts(row) {
      try {
        const d = await listCustomerContracts(row.customer_id);
        this.contractRows = d.items || [];
        this.contractsOpen = true;
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载合同失败'));
      }
    },
    async openLogs(row) {
      try {
        const [s, e] = await Promise.all([
          listSalesOrderStatusLogs(row.id),
          listSalesOrderEditLogs(row.id)
        ]);
        this.statusLogs = s.items || [];
        this.editLogs = e.items || [];
        this.logsOpen = true;
      } catch (err) {
        this.$message.error(this.$apiUserMsg(err, '加载失败'));
      }
    },
    async submitReview(row) {
      try {
        await submitSalesOrderReview(row.id);
        this.$message.success('已提交财务审核');
        this.load();
        this.refreshMessages();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    async withdrawReview(row) {
      try {
        await withdrawSalesOrderReview(row.id);
        this.$message.success('已撤回');
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    orderRowSelectable(row) {
      if (perm('contract_management', 'contract_generate')) return true;
      if (perm('order_management', 'order_submit') && this.canSubmit(row)) return true;
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
        this.selected = [];
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '删除失败'));
      }
    },
    async batchDeleteOrders() {
      const rows = this.batchDeletableList;
      if (!rows.length) return;
      try {
        await this.$confirm(
          `确定永久删除已选的 ${rows.length} 条订单？删除后不可恢复。`,
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
        this.selected = [];
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '删除失败'));
      }
    },
    openFinance(row) {
      this.financeRows = [row];
      this.financeForm = { result: 'approved', comment: '' };
      this.financeOpen = true;
    },
    openFinanceBatch() {
      const rows = this.batchFinanceReviewableList;
      if (!rows.length) return;
      this.financeRows = [...rows];
      this.financeForm = { result: 'approved', comment: '' };
      this.financeOpen = true;
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
          this.refreshMessages();
        }
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    async batchSubmitReview() {
      const rows = this.batchSubmittableList;
      if (!rows.length) return;
      try {
        await this.$confirm(`将 ${rows.length} 笔订单一并提交财务审核，财务将收到 1 条站内信汇总通知。是否继续？`, '批量提交审核', {
          type: 'warning'
        });
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
        this.selected = [];
        this.load();
        this.refreshMessages();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    async submitFinance() {
      if (this.financeForm.result === 'rejected' && !this.financeForm.comment.trim()) {
        this.$message.warning('驳回请填写意见');
        return;
      }
      this.financeLoading = true;
      try {
        const r = await batchFinanceReviewSalesOrder({
          ids: this.financeRows.map((x) => x.id),
          result: this.financeForm.result,
          comment: this.financeForm.comment
        });
        if (r.failed?.length) {
          this.$message.warning(`已处理 ${r.ok} 笔，未处理 ${r.failed.length} 笔`);
        } else {
          this.$message.success(`已处理 ${r.ok} 笔`);
        }
        this.financeOpen = false;
        this.load();
        this.refreshMessages();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      } finally {
        this.financeLoading = false;
      }
    },
    openQcReviewBatch() {
      const rows = this.batchQcReviewableList;
      if (!rows.length) return;
      this.qcReviewRows = [...rows];
      this.qcReviewForm = { result: 'approved', comment: '' };
      this.qcReviewOpen = true;
    },
    async submitQcReview() {
      if (this.qcReviewForm.result === 'rejected' && !this.qcReviewForm.comment.trim()) {
        this.$message.warning('驳回请填写意见');
        return;
      }
      this.qcReviewLoading = true;
      try {
        const r = await batchQcReviewSalesOrder({
          ids: this.qcReviewRows.map((x) => x.id),
          result: this.qcReviewForm.result,
          comment: this.qcReviewForm.comment
        });
        if (r.failed?.length) {
          this.$message.warning(`已处理 ${r.ok} 笔，未处理 ${r.failed.length} 笔`);
        } else {
          this.$message.success(`已处理 ${r.ok} 笔`);
        }
        this.qcReviewOpen = false;
        this.load();
        this.refreshMessages();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      } finally {
        this.qcReviewLoading = false;
      }
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
          this.$message.success('订单已进入待发货');
        }
        this.load();
        this.refreshMessages();
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
        this.refreshMessages();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      } finally {
        this.qcReviewLoading = false;
      }
    },
    openShip(row) {
      this.shipBatchList = [];
      this.shipRow = row;
      this.shipNote = '';
      this.shipOpen = true;
    },
    openShipBatch() {
      const rows = this.batchShippableList;
      if (!rows.length) return;
      this.shipRow = null;
      this.shipBatchList = [...rows];
      this.shipNote = '';
      this.shipOpen = true;
    },
    resetShipDialog() {
      this.shipRow = null;
      this.shipBatchList = [];
      this.shipNote = '';
    },
    async approveSingle(row) {
      try {
        await this.$confirm(`确认财务通过订单 ${row.order_no}？通过后进入待质检审核。`, '财务通过', { type: 'warning' });
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
          this.$message.success('财务已通过，订单已进入待质检审核');
        }
        this.load();
        this.refreshMessages();
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
        this.refreshMessages();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      } finally {
        this.financeLoading = false;
      }
    },
    async submitShip() {
      this.shipLoading = true;
      try {
        if (this.shipBatchList.length) {
          const r = await batchShipSalesOrders({
            ids: this.shipBatchList.map((x) => x.id),
            shipping_instruction: this.shipNote || undefined
          });
          if (r.failed?.length) {
            const errLabel = (code) =>
              ({
                NOT_FOUND: '不存在',
                INVALID_STATUS: '状态不符'
              }[code] || zhMessageForApiError(code) || '未知原因');
            const parts = r.failed.slice(0, 5).map((f) => `订单#${f.id}：${errLabel(f.error)}`);
            const more = r.failed.length > 5 ? ` 等共 ${r.failed.length} 笔` : '';
            this.$message.warning(
              `成功 ${r.ok || 0} 笔，未处理 ${r.failed.length} 笔。${parts.join('；')}${more}`
            );
          } else {
            this.$message.success(`已标记发货 ${r.ok} 笔`);
          }
        } else if (this.shipRow) {
          await shipSalesOrder(this.shipRow.id, { shipping_instruction: this.shipNote });
          this.$message.success('已标记发货');
        } else {
          this.$message.warning('未选择订单');
          return;
        }
        this.shipOpen = false;
        this.resetShipDialog();
        this.selected = [];
        this.load();
        this.refreshMessages();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      } finally {
        this.shipLoading = false;
      }
    },
    async doComplete(row) {
      try {
        await completeSalesOrder(row.id);
        this.$message.success('已完结');
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '操作失败'));
      }
    },
    async doCancel(row) {
      try {
        await this.$confirm('确认取消该订单？', '提示', { type: 'warning' });
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
        const url = URL.createObjectURL(new Blob([blob]));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sales-import-template.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        this.$message.error('下载失败');
      }
    },
    async onImportFile(file) {
      const run = async (confirmDuplicate) => {
        const r = await importSalesOrdersXlsx(file, { confirmDuplicate });
        
        // 显示与已有订单重复的数据详情
        if (r.duplicates?.length) {
          const dupTable = `
            <div style="width:100%; max-height:70vh; overflow-y:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                  <tr style="background:#f5f7fa;">
                    <th style="border:1px solid #dcdfe6; padding:10px; text-align:left;">导入行</th>
                    <th style="border:1px solid #dcdfe6; padding:10px; text-align:left;">客户</th>
                    <th style="border:1px solid #dcdfe6; padding:10px; text-align:left;">产品</th>
                    <th style="border:1px solid #dcdfe6; padding:10px; text-align:left;">型号</th>
                    <th style="border:1px solid #dcdfe6; padding:10px; text-align:left;">批号</th>
                    <th style="border:1px solid #dcdfe6; padding:10px; text-align:left;">重复订单号</th>
                  </tr>
                </thead>
                <tbody>
                  ${r.duplicates.map((d) => `
                    <tr style="hover:background:#f0f9eb;">
                      <td style="border:1px solid #dcdfe6; padding:10px;">第${d.row}行</td>
                      <td style="border:1px solid #dcdfe6; padding:10px;">${d.imported_customer || '未知'}</td>
                      <td style="border:1px solid #dcdfe6; padding:10px;">${d.imported_product || '未知'}</td>
                      <td style="border:1px solid #dcdfe6; padding:10px;">${d.imported_model || '未知'}</td>
                      <td style="border:1px solid #dcdfe6; padding:10px;">${d.imported_batch_no || '未知'}</td>
                      <td style="border:1px solid #dcdfe6; padding:10px;">${d.existing_order_no || '未知'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
          
          await this.$alert(dupTable, `检测到 ${r.duplicates.length} 条与已有订单重复`, {
            confirmButtonText: '我知道了',
            dangerouslyUseHTMLString: true,
            customClass: 'import-duplicate-alert',
            width: '900px'
          });
        }
        
        if (r.errors?.length) {
          this.$message.warning(`成功 ${r.ok} 条，失败 ${r.errors.length} 条`);
          // eslint-disable-next-line no-console
          console.warn(r.errors);
        } else if (!r.duplicates?.length) {
          this.$message.success(`导入成功 ${r.ok} 条`);
        }
        if (r.ok > 0) this.page = 1;
        this.load();
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
      this.exporting = true;
      try {
        const blob = await exportSalesOrdersXlsx(this.queryParams());
        const url = URL.createObjectURL(new Blob([blob]));
        const a = document.createElement('a');
        a.href = url;
        a.download = `sales-orders-${Date.now()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        this.$message.error('导出失败');
      } finally {
        this.exporting = false;
      }
    },
    async openContractGen() {
      if (!this.selected.length) {
        this.$message.warning('请先勾选订单');
        return;
      }
      const cids = [...new Set(this.selected.map((r) => r.customer_id))];
      if (cids.length !== 1) {
        this.$message.warning('请选择同一客户的订单');
        return;
      }
      await this.prepareContractGenDialog(this.selected.map((r) => r.id));
    },
    async runGenerate() {
      if (!this.genUseBlankTemplate && !this.genTemplateId) {
        this.$message.warning('请选择模板，或改用「从空白模板创建」');
        return;
      }
      this.genLoading = true;
      try {
        const orderIds =
          this.genOrderIds.length > 0 ? this.genOrderIds : this.selected.map((x) => x.id);
        const payload = {
          orderIds,
          fromBlank: this.genUseBlankTemplate === true
        };
        if (!this.genUseBlankTemplate) payload.templateId = this.genTemplateId;
        const r = await generateSalesContract(payload);
        this.$message.success(`合同已生成 ${r.contract_no}`);
        this.genOpen = false;
        if (r.id != null) {
          this.$router.push(`/sales/contracts/editor/${r.id}`);
        } else {
          this.$router.push('/sales/contracts');
        }
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '生成失败'));
      } finally {
        this.genLoading = false;
      }
    },
    async refreshMessages() {
      if (!this.showMessages) return;
      if (this.isBlockedByPasswordPolicy()) {
        this.messages = [];
        this.unreadCount = 0;
        return;
      }
      try {
        const d = await listSalesMessages({});
        this.messages = d.items || [];
        const u = await listSalesMessages({ unread: 1 });
        this.unreadCount = (u.items || []).length;
      } catch {
        this.unreadCount = 0;
      }
    },
    async loadMessages() {
      await this.refreshMessages();
    },
    async onMessagesOpen() {
      // 打开站内信抽屉时，统一拉取并标记为已读，确保红点清零
      await this.loadMessages();
      await this.markAllMessagesRead();
    },
    async markAllMessagesRead() {
      const unread = this.messages.filter((m) => !m.read_at);
      if (!unread.length) {
        this.unreadCount = 0;
        return;
      }
      try {
        await Promise.all(
          unread.map((m) =>
            markSalesMessageRead(m.id).then(() => {
              // 本地同步状态，避免再次请求
              m.read_at = new Date().toISOString();
            })
          )
        );
        this.unreadCount = 0;
      } catch {
        // 若批量更新失败，则回退重新计算未读数
        this.refreshMessages();
      }
    },
    async readMsg(m) {
      if (!m.read_at) {
        try {
          await markSalesMessageRead(m.id);
          m.read_at = new Date().toISOString();
          this.refreshMessages();
        } catch {
          /* ignore */
          return;
        }
      }
      const target = resolveInternalMessageRoute(m);
      if (!target) return;
      this.messagesOpen = false;
      try {
        await this.$router.push(target);
      } catch (e) {
        if (e && e.name === 'NavigationDuplicated') return;
        throw e;
      }
    },
    async clearMessageHistory() {
      try {
        await this.$confirm(
          '将删除您账号下的全部站内信记录（含未读），且不可恢复。是否继续？',
          '清空历史',
          { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' }
        );
      } catch {
        return;
      }
      try {
        await clearSalesMessages();
        this.messages = [];
        this.unreadCount = 0;
        this.$message.success('站内信已清空');
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '清空失败'));
      }
    }
  }
};
</script>

<style scoped>
.sales-orders {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 100px);
  min-height: 320px;
  box-sizing: border-box;
}
.toolbar-card {
  margin-bottom: 12px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.left,
.right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.left {
  flex: 1;
  min-width: 0;
}
.right {
  justify-content: flex-end;
}
.batch-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid #eef2f7;
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
}
.field-date {
  width: 260px;
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
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.table-list-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-shrink: 0;
  padding-bottom: 10px;
  border-bottom: 1px solid #eef2f7;
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
.v2-cell-txt {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.orders-v2-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}
.orders-v2-actions__btn {
  display: inline-flex;
}
.ml8 {
  margin-left: 8px;
}
.orders-status-cell {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}
.orders-table :deep(.el-table__body .el-table__cell .cell) {
  white-space: normal;
  word-break: break-word;
  line-height: 1.35;
}
.orders-table :deep(.el-table-column--selection .cell),
.orders-table :deep(.orders-col-actions .cell) {
  white-space: nowrap;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0px;
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
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}
.qc-thumb-img {
  width: 56px;
  height: 56px;
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
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.52);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}
.qc-thumb-wrap:hover .qc-thumb-actions {
  opacity: 1;
  pointer-events: auto;
}
.qc-thumb-action {
  border: none !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18);
}
.qc-placeholder {
  font-size: 12px;
  max-width: 72px;
  line-height: 1.3;
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

@media (max-width: 992px) {
  .sales-orders {
    height: calc(100vh - 88px);
  }
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .left,
  .right {
    width: 100%;
    min-width: 0;
    justify-content: flex-start;
  }
  .left .field-input,
  .left .field-input-sm,
  .left .field-select,
  .left .field-date {
    width: 100% !important;
    min-width: 0;
  }
  .left .el-button,
  .right .el-button,
  .batch-actions .el-button {
    flex: 1 1 calc(50% - 6px);
    min-width: 120px;
  }
  .batch-actions {
    flex-wrap: wrap;
  }
  .selected-tip {
    width: fit-content;
  }
  .table-wrap {
    padding: 10px;
  }
  .table-list-toolbar {
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
    padding-bottom: 8px;
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
  margin-left: 4px;
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
.contract-thumb-wrap--icon:hover .contract-thumb-actions {
  opacity: 1;
  pointer-events: auto;
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
  text-align: justify;
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
.orders-table :deep(.el-table__body .el-table__cell .cell) {
  padding: 8px 12px;
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
