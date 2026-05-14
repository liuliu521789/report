<template>
  <div class="sales-contracts reports-style-page">
    <el-tabs v-model="tab">
      <el-tab-pane v-if="perm('contract_management', 'template_manage')" label="合同模板" name="tpl">
        <div class="toolbar">
          <div class="left">
            <el-input v-model="tplFilterQ" placeholder="筛选模板名称" clearable class="field-tpl-q" />
            <el-button
              v-if="perm('company', 'manage') || perm('company', 'view')"
              plain
              type="primary"
              @click="$router.push('/company')"
            >企业信息</el-button>
            <span class="hint inline-hint">卖方公司名称等来自企业信息，对应报告中「公司信息」页。</span>
          </div>
          <div class="right">
            <el-button type="primary" @click="goNewTemplate" icon=Plus>新建模板</el-button>
          </div>
        </div>
        <div class="table-wrap">
          <el-table :data="filteredTemplates" border>
            <el-table-column prop="name" label="模板名称" min-width="160" />
            <el-table-column label="更新时间" width="180">
              <template #default="{ row }">{{ $dt(row.updated_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button link @click="goEditTemplate(row)" icon=Edit>编辑</el-button>
                <el-button link type="danger" @click="removeTpl(row)" icon=Delete>删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
      <el-tab-pane v-if="canAccessSalesContractWorkspace()" label="合同列表" name="list">
        <div class="toolbar">
          <div class="left">
            <el-input
              v-model="contractQ"
              placeholder="合同编号 / 客户 / 标题"
              clearable
              class="field-q"
              @keyup.enter="onContractSearch"
            />
            <el-select v-model="contractStatus" placeholder="状态" clearable class="field-status" @change="onContractSearch">
              <el-option label="草稿" value="draft" />
              <el-option label="待审核" value="pending_review" />
              <el-option label="已通过" value="approved" />
              <el-option label="已驳回" value="rejected" />
            </el-select>
            <el-button type="primary" @click="onContractSearch" icon=Search>查询</el-button>
            <el-button
              v-if="perm('contract_management', 'contract_delete')"
              type="danger"
              plain
              :disabled="!selectedContracts.length"
              @click="confirmBulkDeleteContracts"
             icon=Delete>批量删除</el-button>
          </div>
          <div class="right">
            <el-button
              v-if="perm('contract_management', 'contract_generate')"
              type="primary"
              @click="openUploadDocDialog"
             icon=Upload>上传文档合同</el-button>
            <el-button
              v-if="perm('contract_management', 'contract_generate')"
              plain
              type="primary"
              @click="$router.push('/sales/orders')"
            >去订单生成合同</el-button>
            <el-button @click="loadContracts" icon=Refresh>刷新</el-button>
          </div>
        </div>
        <div class="table-wrap">
          <el-table
            ref="contractsTableRef"
            :data="contracts"
            border
            class="contracts-list-table"
            row-key="id"
            @selection-change="onContractSelectionChange"
          >
            <el-table-column
              v-if="perm('contract_management', 'contract_delete')"
              type="selection"
              width="48"
              :selectable="contractRowSelectable"
            />
            <el-table-column prop="contract_no" label="合同编号" width="168" />
            <el-table-column prop="title" label="标题" min-width="140" show-overflow-tooltip />
            <el-table-column prop="customer_name" label="客户" min-width="120" />
            <el-table-column label="类型" width="92" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.contract_source === 'upload'" type="info" size="small">文档</el-tag>
                <el-tag v-else type="success" size="small">模板</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="审核状态" min-width="168" align="center">
              <template #default="{ row }">
                <div
                  class="contracts-status-cell contracts-status-cell--flow"
                  title="点击查看审批流程"
                  role="button"
                  tabindex="0"
                  @click.stop="openApprovalFlowDrawer(row)"
                  @keydown.enter.prevent.stop="openApprovalFlowDrawer(row)"
                >
                  <SalesStatusPill kind="contract" :status="row.status" :reject-reason="row.last_reject_comment || ''" />
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="created_by_username" label="创建人" width="100" />
            <el-table-column label="创建时间" width="170">
              <template #default="{ row }">{{ $dt(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="400" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openContractPreview(row)" icon=View>预览</el-button>
                <el-button link @click="openDetail(row)">详情</el-button>
                <el-tooltip
                  v-if="isEditDisabled(row)"
                  content="已审核通过的合同需要超级管理员授权才能编辑"
                  placement="top"
                >
                  <el-button link type="info" disabled icon=Edit>编辑</el-button>
                </el-tooltip>
                <el-button v-else-if="canEditContract(row)" link type="primary" @click="goContractEditor(row)" icon=Edit>编辑</el-button>
                <el-tooltip
                  v-if="isDeleteDisabled(row)"
                  content="已审核通过的合同需要超级管理员授权才能删除"
                  placement="top"
                >
                  <el-button link type="info" disabled icon=Delete>删除</el-button>
                </el-tooltip>
                <el-button v-else-if="canDeleteContract(row)" link type="danger" @click="removeContract(row)" icon=Delete>删除</el-button>
                <el-button
                  v-if="contractSubmitToolbarAction(row) === 'submit'"
                  link
                  @click="openSubmit(row)"
                  icon=Check
                >提交审核</el-button>
                <el-button
                  v-else-if="contractSubmitToolbarAction(row) === 'withdraw'"
                  link
                  type="danger"
                  @click="confirmWithdrawContractReview(row)"
                >撤销审核</el-button>
                <el-button
                  v-if="row.status === 'pending_review' && (isSuperAdmin() || isReviewer(row))"
                  link
                  type="warning"
                  @click="openReview(row)"
                >审核</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div class="pagination-wrap">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next, jumper"
            :current-page="contractPage"
            :page-sizes="[10, 20, 50, 100]"
            :page-size="contractPageSize"
            :total="contractTotal"
            @current-change="onContractPageChange"
            @size-change="onContractSizeChange"
          />
        </div>
      </el-tab-pane>
      <el-tab-pane v-if="perm('process_management', 'view_flow')" label="流程追溯" name="flow">
        <div class="toolbar flow-toolbar-wrap">
          <div class="left">
            <el-input
              v-model="flowOrderNo"
              placeholder="订单号"
              clearable
              class="field-flow-order-no"
              @keyup.enter="loadFlow"
            />
            <el-button size="small" type="primary" @click="loadFlow" icon=Search>查询</el-button>
            <el-button size="small" @click="loadFlow" icon=Refresh>刷新</el-button>
            <span class="hint inline-hint">按订单汇总，与合同列表分开；展开查看流程步骤。</span>
          </div>
        </div>
        <div v-loading="flowLoading" class="flow-body">
        <el-table
          v-if="flowOrderGroups.length"
          :data="flowOrderGroups"
          row-key="order_id"
          border
          class="flow-orders-table desktop-table"
        >
          <el-table-column type="expand" width="44">
            <template #default="{ row: g }">
              <div class="flow-expand-inner">
                <el-steps
                  v-if="g.logs.length"
                  direction="vertical"
                  :active="g.logs.length"
                  finish-status="success"
                  class="flow-order-steps"
                >
                  <el-step
                    v-for="l in g.logs"
                    :key="l.id"
                    :title="`${orderFlowStatusZh(l.from_status)} → ${orderFlowStatusZh(l.to_status)}`"
                  >
                    <template #description>
                      <div class="flow-step-desc">
                        <div class="flow-step-time">{{ $dt(l.created_at) }}</div>
                        <div>操作人：{{ l.actor_username || '—' }}</div>
                        <div v-if="l.remark">备注：{{ l.remark }}</div>
                      </div>
                    </template>
                  </el-step>
                </el-steps>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="order_no" label="订单号" min-width="168" />
          <el-table-column label="当前状态" min-width="160" align="center">
            <template #default="{ row: g }">
              <div class="flow-status-cell">
                <SalesStatusPill kind="order" :order-row="flowOrderStatusRow(g)" />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="节点数" width="88" align="center">
            <template #default="{ row: g }">{{ g.stepCount }}</template>
          </el-table-column>
          <el-table-column label="最近变更" width="180">
            <template #default="{ row: g }">{{ $dt(g.latestAt) }}</template>
          </el-table-column>
        </el-table>
        <div v-if="flowOrderGroups.length" class="flow-mobile-list">
          <el-collapse>
            <el-collapse-item v-for="g in flowOrderGroups" :key="'m-' + g.order_id" :name="String(g.order_id)">
              <template #title>
                <div class="flow-mobile-title">
                  <span class="flow-mobile-no">{{ g.order_no }}</span>
                  <span class="flow-mobile-meta">{{ g.stepCount }} 步 · {{ $dt(g.latestAt) }}</span>
                </div>
              </template>
              <div class="flow-mobile-status">
                <SalesStatusPill kind="order" :order-row="flowOrderStatusRow(g)" />
              </div>
              <el-steps
                v-if="g.logs.length"
                direction="vertical"
                :active="g.logs.length"
                finish-status="success"
                class="flow-order-steps flow-order-steps--mobile"
              >
                <el-step
                  v-for="l in g.logs"
                  :key="l.id"
                  :title="`${orderFlowStatusZh(l.from_status)} → ${orderFlowStatusZh(l.to_status)}`"
                >
                  <template #description>
                    <div class="flow-step-desc">
                      <div class="flow-step-time">{{ $dt(l.created_at) }}</div>
                      <div>操作人：{{ l.actor_username || '—' }}</div>
                      <div v-if="l.remark">备注：{{ l.remark }}</div>
                    </div>
                  </template>
                </el-step>
              </el-steps>
            </el-collapse-item>
          </el-collapse>
        </div>
        <el-empty v-if="!flowOrderGroups.length && !flowLoading" description="暂无记录" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="detailOpen" title="合同详情" size="60%">
      <template v-if="detail">
        <div class="meta">
          <div>编号：{{ detail.contract.contract_no }}</div>
          <div>客户：{{ detail.contract.customer_name }}</div>
          <div class="meta-status">
            <span class="meta-status-label">审核状态</span>
            <span
              class="meta-status-pill-hit"
              title="点击查看审批流程"
              role="button"
              tabindex="0"
              @click.stop="openApprovalFlowDrawerFromDetail"
              @keydown.enter.prevent.stop="openApprovalFlowDrawerFromDetail"
            >
              <SalesStatusPill kind="contract" :status="detail.contract.status" :reject-reason="contractRejectReason(detail)" />
            </span>
          </div>
        </div>
        <template v-if="detail.contract?.contract_source === 'upload'">
          <div class="upload-doc-meta">
            <div>
              本合同为上传的电子文档（正文以文件为准）
              <span v-if="detail.contract.document_original_filename" class="doc-name">
                · {{ detail.contract.document_original_filename }}
              </span>
            </div>
            <el-button type="primary" size="small" @click="downloadDetailContractFile" icon=Download>下载合同文件</el-button>
          </div>
        </template>
        <div v-else class="html-preview" v-html="detailBodyPreviewHtml" />
        <div class="sub">关联订单</div>
        <el-table :data="detail.orders" border size="small">
          <el-table-column prop="order_no" label="订单号" />
          <el-table-column prop="product_name" label="商品" />
          <el-table-column prop="amount" label="金额" />
        </el-table>
        <div class="sub">审批流程</div>
        <div v-if="canUrgeContractReviewer(detail.contract)" class="approval-flow-urge-banner">
          <el-button type="primary" link :loading="urgeSubmitting" @click="doUrgeReviewer(detail.contract.id)">
            催一下当前审批人
          </el-button>
          <span class="hint">将向审批人发送站内信与企业微信；15 分钟内同一合同仅可催一次</span>
        </div>
        <div class="approval-flow-panel">
          <template v-if="detailApprovalTimelineSteps.length">
            <div
              v-for="(step, idx) in detailApprovalTimelineSteps"
              :key="'detail-flow-' + step.key"
              class="approval-flow-row"
            >
              <div class="approval-flow-axis">
                <span class="approval-flow-dot" :class="step.dotClass" />
                <span v-if="idx < detailApprovalTimelineSteps.length - 1" class="approval-flow-line" />
              </div>
              <div class="approval-flow-main">
                <div class="approval-flow-step-title">{{ step.stepTitle }}</div>
                <div class="approval-flow-card">
                  <div class="approval-flow-user-line">
                    <span class="approval-flow-user-name">{{ step.actorName }}</span>
                  </div>
                  <div class="approval-flow-time-row">{{ step.timeText }}</div>
                  <div class="approval-flow-status-text" :class="step.statusTextClass">{{ step.statusText }}</div>
                  <div v-if="step.opinionText" class="approval-flow-opinion">
                    <div class="approval-flow-opinion-label">{{ step.opinionLabel }}</div>
                    <div class="approval-flow-opinion-body">{{ step.opinionText }}</div>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <el-empty v-else description="暂无审批记录" :image-size="64" />
        </div>
      </template>
    </el-drawer>

    <el-drawer v-model="approvalFlowDrawerOpen" title="审批流程" direction="rtl" size="420px" destroy-on-close>
      <div v-loading="approvalFlowLoading" class="approval-flow-drawer-inner">
        <template v-if="approvalFlowContract">
          <div class="approval-flow-drawer-meta">
            <div class="approval-flow-drawer-meta-no">{{ approvalFlowContract.contract_no }}</div>
            <div v-if="approvalFlowContract.customer_name" class="approval-flow-drawer-meta-sub">
              客户：{{ approvalFlowContract.customer_name }}
            </div>
            <div class="approval-flow-drawer-meta-sub">{{ approvalFlowContract.title || '—' }}</div>
            <div v-if="canUrgeContractReviewer(approvalFlowContract)" class="approval-flow-urge-row">
              <el-button type="primary" link :loading="urgeSubmitting" @click="doUrgeReviewer()">催一下</el-button>
              <span class="hint">15 分钟内同一合同仅可催一次</span>
            </div>
          </div>
        </template>
        <template v-if="approvalFlowTimelineSteps.length">
          <div
            v-for="(step, idx) in approvalFlowTimelineSteps"
            :key="'flow-' + step.key"
            class="approval-flow-row"
          >
            <div class="approval-flow-axis">
              <span class="approval-flow-dot" :class="step.dotClass" />
              <span v-if="idx < approvalFlowTimelineSteps.length - 1" class="approval-flow-line" />
            </div>
            <div class="approval-flow-main">
              <div class="approval-flow-step-title">{{ step.stepTitle }}</div>
              <div class="approval-flow-card">
                <div class="approval-flow-user-line">
                  <span class="approval-flow-user-name">{{ step.actorName }}</span>
                </div>
                <div class="approval-flow-time-row">{{ step.timeText }}</div>
                <div class="approval-flow-status-text" :class="step.statusTextClass">{{ step.statusText }}</div>
                <div v-if="step.opinionText" class="approval-flow-opinion">
                  <div class="approval-flow-opinion-label">{{ step.opinionLabel }}</div>
                  <div class="approval-flow-opinion-body">{{ step.opinionText }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>
        <el-empty v-else-if="!approvalFlowLoading" description="暂无审批记录" :image-size="72" />
      </div>
    </el-drawer>

    <el-dialog v-model="uploadDocOpen" title="上传文档合同" width="480px" destroy-on-close @open="onUploadDocDialogOpen">
      <div class="upload-doc-form">
        <div class="hint mb12">将保存为合同列表中的草稿，可提交审核、驳回后修改，与模板生成的合同流程一致。需选择已关联您订单的客户。</div>
        <el-form label-width="88px">
          <el-form-item label="客户" required>
            <el-select
              v-model="uploadDocCustomerId"
              filterable
              clearable
              placeholder="选择客户"
              class="w-full"
              :loading="uploadDocCustomersLoading"
            >
              <el-option
                v-for="cu in uploadDocCustomers"
                :key="cu.id"
                :label="`${cu.customer_name}${cu.customer_code ? ' (' + cu.customer_code + ')' : ''}`"
                :value="cu.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="标题">
            <el-input v-model="uploadDocTitle" placeholder="可选，默认用文件名" clearable />
          </el-form-item>
          <el-form-item label="文件" required>
            <el-upload
              ref="uploadDocRef"
              :limit="1"
              :auto-upload="false"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif"
              @change="onUploadDocFileChange"
            >
              <el-button type="primary">选择文件</el-button>
            </el-upload>
            <div class="hint">PDF、Word、图片；单文件最大 20MB</div>
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="uploadDocOpen = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="uploadDocSubmitting" @click="submitUploadDoc" icon=Check>确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="submitOpen" title="提交合同审核" width="480px">
      <div class="submit-hint">可先选部门（含子部门）缩小名单，再按顺序添加审批人。</div>
      <el-tree-select
        v-model="submitDeptFilter"
        :data="submitDeptTree"
        :props="{ label: 'nameZh', value: 'id', children: 'children' }"
        clearable
        filterable
        check-strictly
        :render-after-expand="false"
        @change="fetchSubmitReviewers"
        placeholder="可选：按部门筛选"
        class="w-full mb12"
      />
      <div class="submit-approver-builder">
        <el-select v-model="submitReviewerId" placeholder="选择审批人后点击添加" filterable class="w-full">
          <el-option v-for="u in reviewers" :key="u.id" :label="reviewerOptionLabel(u)" :value="u.id" />
        </el-select>
        <el-button type="primary" plain @click="addSubmitReviewer" :disabled="!submitReviewerId">添加审批人</el-button>
      </div>
      <div class="submit-approver-list">
        <div class="submit-approver-title">审批顺序（从上到下）</div>
        <el-empty v-if="!submitReviewerIds.length" description="请至少添加 1 位审批人" :image-size="56" />
        <div v-else class="submit-approver-items">
          <div v-for="(id, idx) in submitReviewerIds" :key="`submit-reviewer-${id}-${idx}`" class="submit-approver-item">
            <div class="submit-approver-label">{{ idx + 1 }}. {{ reviewerLabelById(id) }}</div>
            <div class="submit-approver-actions">
              <el-button link :disabled="idx === 0" @click="moveSubmitReviewer(idx, -1)">上移</el-button>
              <el-button link :disabled="idx === submitReviewerIds.length - 1" @click="moveSubmitReviewer(idx, 1)">下移</el-button>
              <el-button link type="danger" @click="removeSubmitReviewer(idx)">移除</el-button>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="submitOpen = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="doSubmit" icon=Check>提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="reviewOpen" title="合同审核" width="440px">
      <el-radio-group v-model="reviewForm.result" class="mb12">
        <el-radio label="approved">通过</el-radio>
        <el-radio label="rejected">驳回</el-radio>
      </el-radio-group>
      <el-input v-model="reviewForm.comment" type="textarea" rows="3" placeholder="驳回必填意见" />
      <template #footer>
        <el-button @click="reviewOpen = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="reviewLoading" @click="doReview" icon=Check>确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="contractPreviewOpen"
      :title="contractPreviewTitle"
      width="920px"
      top="4vh"
      class="contract-preview-dialog"
      :close-on-click-modal="false"
      @closed="onContractPreviewClosed"
    >
      <div v-loading="contractPreviewLoading" class="contract-preview-dialog-inner">
        <div v-if="contractPreviewMode === 'html' && contractPreviewHtml" class="contract-preview-html" v-html="contractPreviewHtml" />
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
          <el-button type="primary" @click="downloadPreviewContractFile" icon=Download>下载查看</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="contractPreviewOpen = false" icon=Close>关闭</el-button>
        <el-tooltip
          placement="top"
          content="若纸上出现日期、网址或页码，请在打印对话框「更多设置」中关闭「页眉和页脚」。"
          :show-after="300"
        >
          <span class="print-tooltip-trigger">
            <el-button
              type="primary"
              :disabled="contractPreviewMode === 'other' || (contractPreviewMode === 'html' && !contractPreviewHtml)"
              @click="printContractPreview"
              icon=Printer
              >打印</el-button>
          </span>
        </el-tooltip>
      </template>
    </el-dialog>

  </div>
</template>

<script>
import { mapState } from 'pinia';
import { useAuthStore } from '../stores/auth';
import { perm, isSuperAdmin, canAccessSalesContractWorkspace } from '../utils/permissions';
import {
  getMe,
  listContractTemplates,
  deleteContractTemplate,
  listSalesContracts,
  getSalesContract,
  deleteSalesContract,
  bulkDeleteSalesContracts,
  submitSalesContract,
  reviewSalesContract,
  withdrawSalesContractReview,
  remindSalesContractReviewer,
  listFinanceReviewers,
  listDepartmentsTree,
  listSalesProcessLogs,
  listSalesCustomers,
  uploadSalesContractDocument,
  downloadSalesContractDocument,
  fetchSalesContractDocumentBlob
} from '../api';
import mammoth from 'mammoth';
import SalesStatusPill from '../components/SalesStatusPill.vue';
import {
  finalizeContractBodyForPreview,
  printHtmlDocumentInHiddenIframe,
  printContractPreviewFromHtml,
  escapeHtmlText
} from '../utils/contractPreviewHtml';
import { orderFlowStatusZh } from '../utils/salesStatusDisplay';

export default {
  name: 'SalesContracts',
  components: { SalesStatusPill },
  data() {
    return {
      /** 首屏前在 created 中按权限设为 tpl | list | flow，避免仅有模板/流程权时 v-model=list 无对应 pane */
      tab: 'list',
      templates: [],
      tplFilterQ: '',
      contracts: [],
      contractQ: '',
      contractStatus: '',
      contractPage: 1,
      contractPageSize: 20,
      contractTotal: 0,
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
      detailOpen: false,
      detail: null,
      approvalFlowDrawerOpen: false,
      approvalFlowLoading: false,
      approvalFlowContract: null,
      approvalFlowAudits: [],
      urgeSubmitting: false,
      submitOpen: false,
      submitLoading: false,
      submitRow: null,
      submitReviewerId: null,
      submitReviewerIds: [],
      submitDeptFilter: null,
      submitDeptTree: [],
      reviewers: [],
      reviewOpen: false,
      reviewLoading: false,
      reviewRow: null,
      reviewForm: { result: 'approved', comment: '' },
      flowLogs: [],
      flowLoading: false,
      selectedContracts: [],
      uploadDocOpen: false,
      uploadDocCustomerId: null,
      uploadDocTitle: '',
      uploadDocFile: null,
      uploadDocCustomers: [],
      uploadDocCustomersLoading: false,
      uploadDocSubmitting: false,
      flowOrderNo: ''
    };
  },
  computed: {
    filteredTemplates() {
      const q = (this.tplFilterQ || '').trim().toLowerCase();
      if (!q) return this.templates;
      return this.templates.filter((t) => String(t.name || '').toLowerCase().includes(q));
    },
    /** 将扁平日志按订单分组，组内时间正序（流程从早到晚） */
    flowOrderGroups() {
      const byId = new Map();
      for (const l of this.flowLogs) {
        const id = l.order_id;
        if (id == null) continue;
        if (!byId.has(id)) {
          byId.set(id, {
            order_id: id,
            order_no: l.order_no || `#${id}`,
            logs: []
          });
        }
        byId.get(id).logs.push(l);
      }
      const groups = [...byId.values()];
      for (const g of groups) {
        g.logs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const last = g.logs[g.logs.length - 1];
        g.latestAt = last?.created_at || '';
        g.latestStatus = last?.to_status || '';
        g.stepCount = g.logs.length;
      }
      groups.sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt));
      return groups;
    },
    detailBodyPreviewHtml() {
      if (!this.detail?.contract) return '';
      if (this.detail.contract.contract_source === 'upload') return '';
      const c = this.detail.contract;
      const vars = {
        CUSTOMER_NAME: c.customer_name != null ? String(c.customer_name) : '',
        CUSTOMER_ADDRESS: c.customer_address != null ? String(c.customer_address) : '',
        CUSTOMER_CONTACT: c.customer_contact != null ? String(c.customer_contact) : '',
        CUSTOMER_PHONE: c.customer_phone != null ? String(c.customer_phone) : '',
        CONTRACT_NO: c.contract_no != null ? String(c.contract_no) : '',
        COMPANY_NAME_ZH: c.company_name_zh != null ? String(c.company_name_zh) : ''
      };
      return finalizeContractBodyForPreview(this.detail.contract.body_html, this.detail.orders || [], vars);
    },
    /** 列表点击「审核状态」抽屉：审批时间轴 */
    approvalFlowTimelineSteps() {
      return this.buildApprovalTimelineSteps(this.approvalFlowAudits);
    },
    /** 合同详情内嵌审批时间轴 */
    detailApprovalTimelineSteps() {
      return this.buildApprovalTimelineSteps(this.detail?.audits);
    },
    ...mapState(useAuthStore, ['permissions', 'accountType'])
  },
  watch: {
    /** Layout.getMe 在子组件 mounted 之后才执行；此处权限更新后补拉列表，否则永不发起 GET /contracts */
    permissions: {
      deep: true,
      handler() {
        if (this.$route.path !== '/sales/contracts') return;
        if (!canAccessSalesContractWorkspace()) return;
        this.loadContracts();
      }
    },
    accountType() {
      if (this.$route.path !== '/sales/contracts') return;
      if (!canAccessSalesContractWorkspace()) return;
      this.loadContracts();
    },
    tab(t) {
      if (t === 'list' && this.$route.path === '/sales/contracts') this.loadContracts();
    },
    '$route.query.tab'() {
      this.syncTabFromQuery();
    },
    '$route.query.customer_code'() {
      this.tab = 'list';
      this.clampActiveTab();
      this.loadContracts();
    },
    '$route.query.review_contract_id'(n) {
      if (this.$route.path !== '/sales/contracts') return;
      if (n == null || String(n).trim() === '') return;
      this.$nextTick(async () => {
        await this.loadContracts();
        await this.tryOpenReviewFromRouteQuery();
      });
    },
    '$route.path'(p) {
      if (p === '/sales/contracts') {
        this.syncTabFromQuery();
        this.loadTemplates();
        this.loadContracts();
      }
    }
  },
  created() {
    if (canAccessSalesContractWorkspace()) this.tab = 'list';
    else if (perm('contract_management', 'template_manage')) this.tab = 'tpl';
    else if (perm('process_management', 'view_flow')) this.tab = 'flow';
    this.syncTabFromQuery();
  },
  async mounted() {
    const auth = useAuthStore();
    if (auth.token && !canAccessSalesContractWorkspace()) {
      try {
        const d = await getMe();
        auth.applyMeResponse(d);
      } catch {
        /* ignore：仍可能由 Layout.getMe 稍后写入权限，靠 permissions 监听补拉 */
      }
    }
    this.loadTemplates();
    await this.loadContracts();
    this.loadFlow();
    await this.tryOpenReviewFromRouteQuery();
  },
  beforeUnmount() {
    this.detailOpen = false;
    this.approvalFlowDrawerOpen = false;
    this.uploadDocOpen = false;
    this.submitOpen = false;
    this.reviewOpen = false;
    this.contractPreviewOpen = false;
    if (this.contractPreviewPdfUrl) {
      try {
        URL.revokeObjectURL(this.contractPreviewPdfUrl);
      } catch {
        /* ignore */
      }
    }
    if (this.contractPreviewImageUrl) {
      try {
        URL.revokeObjectURL(this.contractPreviewImageUrl);
      } catch {
        /* ignore */
      }
    }
  },
  methods: {
    orderFlowStatusZh,
    perm,
    isSuperAdmin,
    canAccessSalesContractWorkspace,
    syncTabFromQuery() {
      const t = this.$route.query.tab;
      const openReview = this.$route.query.review_contract_id;
      if (openReview != null && String(openReview).trim() !== '' && canAccessSalesContractWorkspace()) {
        this.tab = 'list';
      } else if (t === 'tpl' && perm('contract_management', 'template_manage')) this.tab = 'tpl';
      else if (t === 'list' && canAccessSalesContractWorkspace()) this.tab = 'list';
      else if (t === 'flow' && perm('process_management', 'view_flow')) this.tab = 'flow';
      this.clampActiveTab();
    },
    clampActiveTab() {
      const canTpl = perm('contract_management', 'template_manage');
      const canList = canAccessSalesContractWorkspace();
      const canFlow = perm('process_management', 'view_flow');
      const ok =
        (this.tab === 'tpl' && canTpl) ||
        (this.tab === 'list' && canList) ||
        (this.tab === 'flow' && canFlow);
      if (ok) return;
      if (canList) this.tab = 'list';
      else if (canTpl) this.tab = 'tpl';
      else if (canFlow) this.tab = 'flow';
    },
    goContractEditor(row) {
      if (!row?.id || !this.canEditContract(row)) return;
      if (!perm('contract_management', 'contract_edit')) {
        this.$message.warning('无合同编辑权限');
        return;
      }
      this.$router.push(`/sales/contracts/editor/${row.id}`);
    },
    goNewTemplate() {
      this.$router.push('/sales/contracts/templates/new');
    },
    goEditTemplate(row) {
      if (!row?.id) return;
      this.$router.push(`/sales/contracts/templates/${row.id}`);
    },
    contractRejectReason(detail) {
      if (!detail?.contract || detail.contract.status !== 'rejected') return '';
      const audits = detail.audits || [];
      for (let i = audits.length - 1; i >= 0; i--) {
        const a = audits[i];
        if (a.result === 'rejected' && String(a.comment_text || '').trim()) {
          return String(a.comment_text).trim();
        }
      }
      return '';
    },
    auditActionLabel(action) {
      const map = {
        submit: '提交审核',
        review: '审批处理',
        urge_review: '催办',
        withdraw_submit: '撤销审核',
        create: '创建合同',
        update: '修改合同'
      };
      return map[action] || action || '操作';
    },
    auditActionTagType(action) {
      if (action === 'submit') return 'warning';
      if (action === 'review') return 'primary';
      return 'info';
    },
    auditResultLabel(result) {
      if (result === 'approved') return '通过';
      if (result === 'rejected') return '驳回';
      return result || '';
    },
    auditResultTagType(result) {
      if (result === 'approved') return 'success';
      if (result === 'rejected') return 'danger';
      return 'info';
    },
    /** 审批意见展示：去掉数字用户 ID、登录名括号等，与时间轴「只显示姓名」一致 */
    approvalFlowOpinionDisplay(comment) {
      let s = String(comment || '').trim();
      if (!s) return '';
      s = s.replace(/流转至用户ID\s*\d+/gi, '流转至下一审批人');
      s = s.replace(/用户ID\s*\d+/gi, '');
      s = s.replace(/用户\s*#\s*\d+/g, '审批人');
      // 服务端「姓名(登录账号)」仅保留姓名
      s = s.replace(/\(([A-Za-z0-9_.@+-]+)\)/g, '');
      s = s.replace(/\s{2,}/g, ' ').trim();
      return s;
    },
    /** 审批节点操作人：优先真实姓名，不展示数值型用户 ID */
    approvalFlowActorDisplay(auditRow) {
      const rn = String(auditRow.actor_real_name || '').trim();
      if (rn) return rn;
      const un = String(auditRow.actor_username || '').trim();
      return un || '—';
    },
    /** 将审核日志转为纵向审批流程步骤（参考钉钉式时间轴） */
    buildApprovalTimelineSteps(audits) {
      const raw = Array.isArray(audits) ? [...audits] : [];
      raw.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return raw.map((a, idx) => {
        const timeText = this.$dt(a.created_at);
        const actorName = this.approvalFlowActorDisplay(a);
        const idKey = a.id != null ? String(a.id) : `idx-${idx}`;
        const commentRaw = String(a.comment_text || '').trim();
        const comment = this.approvalFlowOpinionDisplay(commentRaw);
        if (a.action === 'urge_review') {
          return {
            key: `urge-${idKey}`,
            stepTitle: '催办',
            actorName,
            timeText,
            statusText: '已提醒审批人',
            statusTextClass: 'approval-flow-status-text--warn',
            dotClass: 'approval-flow-dot--warn',
            opinionLabel: '说明',
            opinionText: comment
          };
        }
        if (a.action === 'submit') {
          return {
            key: `submit-${idKey}`,
            stepTitle: '提交申请',
            actorName,
            timeText,
            statusText: '发起审批',
            statusTextClass: 'approval-flow-status-text--success',
            dotClass: 'approval-flow-dot--primary',
            opinionLabel: '说明',
            opinionText: comment
          };
        }
        if (a.action === 'withdraw_submit') {
          return {
            key: `withdraw-${idKey}`,
            stepTitle: '撤销申请',
            actorName,
            timeText,
            statusText: '已退回草稿',
            statusTextClass: 'approval-flow-status-text--warn',
            dotClass: 'approval-flow-dot--warn',
            opinionLabel: '说明',
            opinionText: comment
          };
        }
        if (a.action === 'review') {
          const rejected = a.result === 'rejected';
          const isChainStep =
            !rejected &&
            comment &&
            (comment.includes('流转至') ||
              (comment.includes('第 ') && comment.includes('位审批通过')));
          return {
            key: `review-${idKey}`,
            stepTitle: '审批节点',
            actorName,
            timeText,
            statusText: rejected ? '审批不通过' : isChainStep ? '通过（待后续节点）' : '通过',
            statusTextClass: rejected ? 'approval-flow-status-text--danger' : 'approval-flow-status-text--success',
            dotClass: rejected ? 'approval-flow-dot--danger' : 'approval-flow-dot--primary',
            opinionLabel: '审批意见',
            opinionText: comment
          };
        }
        return {
          key: `other-${idKey}`,
          stepTitle: this.auditActionLabel(a.action),
          actorName,
          timeText,
          statusText: a.result ? this.auditResultLabel(a.result) : '—',
          statusTextClass: 'approval-flow-status-text--muted',
          dotClass: 'approval-flow-dot--muted',
          opinionLabel: '备注',
          opinionText: comment
        };
      });
    },
    canUrgeContractReviewer(c) {
      if (!c) return false;
      if (c.status !== 'pending_review') return false;
      const rid = c.reviewer_user_id;
      if (rid == null || rid === '' || !Number(rid)) return false;
      if (!perm('contract_management', 'contract_submit')) return false;
      const uid = this.myUserId();
      if (uid != null && Number(rid) === Number(uid)) return false;
      if (isSuperAdmin()) return true;
      return Number(c.created_by) === Number(uid);
    },
    async doUrgeReviewer(explicitId) {
      const id = Number(explicitId ?? this.approvalFlowContract?.id ?? this.detail?.contract?.id);
      if (!Number.isFinite(id) || id < 1) return;
      try {
        await this.$confirm(
          '将向当前审批人发送站内信与企业微信提醒（对方须已绑定企业微信账号）。每人每合同 15 分钟内仅可催一次。',
          '催一下',
          { type: 'info', confirmButtonText: '发送', cancelButtonText: '取消' }
        );
      } catch {
        return;
      }
      this.urgeSubmitting = true;
      try {
        await remindSalesContractReviewer(id);
        this.$message.success('已发送催办');
        const d = await getSalesContract(id);
        if (this.approvalFlowDrawerOpen) {
          this.approvalFlowContract = d.contract || null;
          this.approvalFlowAudits = d.audits || [];
        }
        if (this.detailOpen && this.detail?.contract?.id === id) {
          this.detail = d;
        }
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '催办失败'));
      } finally {
        this.urgeSubmitting = false;
      }
    },
    async openApprovalFlowDrawer(row) {
      if (!row?.id) return;
      this.approvalFlowDrawerOpen = true;
      this.approvalFlowLoading = true;
      this.approvalFlowContract = null;
      this.approvalFlowAudits = [];
      try {
        const d = await getSalesContract(row.id);
        this.approvalFlowContract = d.contract || null;
        this.approvalFlowAudits = d.audits || [];
      } catch {
        this.$message.error('加载审批流程失败');
        this.approvalFlowDrawerOpen = false;
      } finally {
        this.approvalFlowLoading = false;
      }
    },
    openApprovalFlowDrawerFromDetail() {
      const id = this.detail?.contract?.id;
      if (!id) return;
      this.approvalFlowContract = this.detail.contract;
      this.approvalFlowAudits = this.detail.audits || [];
      this.approvalFlowDrawerOpen = true;
      this.approvalFlowLoading = false;
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
    isMine(row) {
      const uid = this.myUserId();
      if (uid == null || row?.created_by == null) return false;
      return Number(row.created_by) === Number(uid);
    },
    isReviewer(row) {
      const uid = this.myUserId();
      if (uid == null || row?.reviewer_user_id == null) return false;
      return Number(row.reviewer_user_id) === Number(uid);
    },
    /** 提交审核与撤销审核同一位置互斥：草稿/驳回可提交，待审且创建人（或超管）可撤销 */
    contractSubmitToolbarAction(row) {
      if (!row || !perm('contract_management', 'contract_submit')) return null;
      if (row.status === 'pending_review' && (isSuperAdmin() || this.isMine(row))) return 'withdraw';
      if ((row.status === 'draft' || row.status === 'rejected') && this.canEditContract(row)) return 'submit';
      return null;
    },
    async confirmWithdrawContractReview(row) {
      if (!row?.id) return;
      try {
        await this.$confirm(
          '撤销后合同将退回草稿，当前审批人不再处理该申请。是否继续？',
          '撤销审核',
          { type: 'warning', confirmButtonText: '撤销', cancelButtonText: '取消' }
        );
      } catch {
        return;
      }
      try {
        await withdrawSalesContractReview(row.id);
        this.$message.success('已撤销审核');
        this.loadContracts();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '撤销失败'));
      }
    },
    canEditContract(row) {
      if (!row || !perm('contract_management', 'contract_edit')) return false;
      if (isSuperAdmin()) return true;
      if (!this.isMine(row)) return false;
      if (row.status === 'draft' || row.status === 'rejected') return true;
      if (row.status === 'approved' && perm('contract_management', 'contract_edit_approved')) return true;
      return false;
    },
    canDeleteContract(row) {
      if (!row || !perm('contract_management', 'contract_delete')) return false;
      if (isSuperAdmin()) return true;
      if (!this.isMine(row)) return false;
      if (row.status === 'draft' || row.status === 'rejected') return true;
      if (row.status === 'approved' && perm('contract_management', 'contract_delete_approved')) return true;
      return false;
    },
    isEditDisabled(row) {
      if (!row) return false;
      if (row.status === 'approved' && !this.canEditContract(row)) return true;
      return false;
    },
    isDeleteDisabled(row) {
      if (!row) return false;
      if (row.status === 'approved' && !this.canDeleteContract(row)) return true;
      return false;
    },
    contractRowSelectable(row) {
      return this.canDeleteContract(row);
    },
    reviewerOptionLabel(u) {
      const name = String(u?.displayName || u?.realName || u?.username || '').trim();
      const account = String(u?.username || '').trim();
      const dept = String(u?.departmentNameZh || '').trim();
      const main = name || account || `用户#${u?.id ?? ''}`;
      if (dept && account && account !== main) return `${main}（${account}｜${dept}）`;
      if (dept) return `${main}（${dept}）`;
      if (account && account !== main) return `${main}（${account}）`;
      return main;
    },
    /** 审批流程时间轴 / 已选顺序：只展示姓名（无登录名、无用户 ID） */
    reviewerNameOnly(u) {
      const rn = String(u?.realName || '').trim();
      if (rn) return rn;
      const dn = String(u?.displayName || '').trim();
      if (dn) return dn;
      return String(u?.username || '').trim() || '—';
    },
    reviewerLabelById(id) {
      const hit = (this.reviewers || []).find((u) => Number(u.id) === Number(id));
      if (hit) return this.reviewerNameOnly(hit);
      return '—';
    },
    addSubmitReviewer() {
      const id = Number(this.submitReviewerId);
      if (!Number.isFinite(id) || id < 1) return;
      if (this.submitReviewerIds.includes(id)) {
        this.$message.warning('该审批人已在流程中');
        return;
      }
      this.submitReviewerIds.push(id);
    },
    moveSubmitReviewer(idx, delta) {
      const to = idx + delta;
      if (idx < 0 || idx >= this.submitReviewerIds.length) return;
      if (to < 0 || to >= this.submitReviewerIds.length) return;
      const next = [...this.submitReviewerIds];
      const [cur] = next.splice(idx, 1);
      next.splice(to, 0, cur);
      this.submitReviewerIds = next;
    },
    removeSubmitReviewer(idx) {
      if (idx < 0 || idx >= this.submitReviewerIds.length) return;
      const next = [...this.submitReviewerIds];
      next.splice(idx, 1);
      this.submitReviewerIds = next;
    },
    async fetchSubmitReviewers() {
      try {
        const params = {};
        if (this.submitDeptFilter != null && this.submitDeptFilter !== '') {
          params.departmentId = this.submitDeptFilter;
        }
        const d = await listFinanceReviewers(params);
        this.reviewers = d.items || [];
        const ids = new Set((this.reviewers || []).map((r) => r.id));
        if (this.reviewers.length === 1) {
          this.submitReviewerId = this.reviewers[0].id;
        } else if (!ids.has(this.submitReviewerId)) {
          this.submitReviewerId = null;
        }
      } catch {
        this.reviewers = [];
        this.submitReviewerId = null;
      }
    },
    async loadTemplates() {
      if (!perm('contract_management', 'template_manage') && !perm('contract_management', 'contract_generate')) return;
      try {
        const d = await listContractTemplates();
        this.templates = d.items || [];
      } catch {
        this.templates = [];
      }
    },
    onContractSelectionChange(rows) {
      this.selectedContracts = rows || [];
    },
    async loadContracts() {
      if (!canAccessSalesContractWorkspace()) return;
      try {
        const cc = this.$route?.query?.customer_code;
        const d = await listSalesContracts({
          q: this.contractQ || undefined,
          status: this.contractStatus || undefined,
          customer_code: cc || undefined,
          limit: this.contractPageSize,
          offset: (this.contractPage - 1) * this.contractPageSize
        });
        this.contracts = d.items || [];
        this.contractTotal = Number(d.total || 0);
        if (this.contractTotal > 0 && this.contracts.length === 0 && this.contractPage > 1) {
          this.contractPage -= 1;
          await this.loadContracts();
        }
        this.$nextTick(() => {
          this.$refs.contractsTableRef?.clearSelection?.();
        });
        this.selectedContracts = [];
      } catch (e) {
        this.contracts = [];
        this.contractTotal = 0;
        this.$message.error(this.$apiUserMsg(e, '加载合同列表失败'));
      }
    },
    onContractSearch() {
      this.contractPage = 1;
      return this.loadContracts();
    },
    async onContractPageChange(p) {
      this.contractPage = p;
      await this.loadContracts();
    },
    async onContractSizeChange(size) {
      this.contractPageSize = size;
      this.contractPage = 1;
      await this.loadContracts();
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
        const vars = c
          ? {
              CUSTOMER_NAME: c.customer_name != null ? String(c.customer_name) : '',
              CUSTOMER_ADDRESS: c.customer_address != null ? String(c.customer_address) : '',
              CUSTOMER_CONTACT: c.customer_contact != null ? String(c.customer_contact) : '',
              CUSTOMER_PHONE: c.customer_phone != null ? String(c.customer_phone) : '',
              CONTRACT_NO: c.contract_no != null ? String(c.contract_no) : '',
              COMPANY_NAME_ZH: c.company_name_zh != null ? String(c.company_name_zh) : ''
            }
          : null;
        this.contractPreviewHtml = finalizeContractBodyForPreview(
          c?.body_html,
          d?.orders || [],
          vars
        );
        this.contractPreviewMode = 'html';
      } catch {
        this.$message.error('加载失败');
        this.contractPreviewOpen = false;
      } finally {
        this.contractPreviewLoading = false;
      }
    },
    onContractPreviewClosed() {
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
    async downloadPreviewContractFile() {
      if (!this.previewContractId) return;
      try {
        await downloadSalesContractDocument(this.previewContractId, this.contractPreviewDocName || '合同文件');
      } catch {
        this.$message.error('下载失败');
      }
    },
    async downloadDetailContractFile() {
      const id = this.detail?.contract?.id;
      if (!id) return;
      const name = this.detail.contract.document_original_filename || '合同文件';
      try {
        await downloadSalesContractDocument(id, name);
      } catch {
        this.$message.error('下载失败');
      }
    },
    printContractPreview() {
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
    async loadFlow() {
      if (!perm('process_management', 'view_flow')) return;
      this.flowLoading = true;
      try {
        const params = { limit: 500 };
        if (this.flowOrderNo && this.flowOrderNo.trim() !== '') {
          params.order_no = this.flowOrderNo;
        }
        const d = await listSalesProcessLogs(params);
        this.flowLogs = d.items || [];
      } catch {
        this.flowLogs = [];
      } finally {
        this.flowLoading = false;
      }
    },
    flowOrderStatusRow(g) {
      const row = { status: g.latestStatus || '' };
      if (row.status === 'pending_review' && g.latestAt) {
        row.submitted_for_review_at = g.latestAt;
      }
      if (row.status === 'rejected' && g.logs?.length) {
        for (let i = g.logs.length - 1; i >= 0; i--) {
          const l = g.logs[i];
          if (l.to_status === 'rejected' && String(l.remark || '').trim()) {
            row.finance_comment = String(l.remark).trim();
            break;
          }
        }
      }
      return row;
    },
    async removeTpl(row) {
      try {
        await this.$confirm('删除该模板？', '提示', { type: 'warning' });
      } catch {
        return;
      }
      try {
        await deleteContractTemplate(row.id);
        this.$message.success('已删除');
        this.loadTemplates();
      } catch {
        this.$message.error('删除失败');
      }
    },
    async openDetail(row) {
      const id = row.id || row.contract?.id;
      if (!id) return;
      try {
        const d = await getSalesContract(id);
        this.detail = d;
        this.detailOpen = true;
      } catch {
        this.$message.error('加载失败');
      }
    },
    async removeContract(row) {
      if (!row?.id || !this.canDeleteContract(row)) return;
      try {
        await this.$confirm(
          `确定永久删除合同「${row.contract_no || row.id}」？删除后不可恢复。`,
          '删除合同',
          { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' }
        );
      } catch {
        return;
      }
      try {
        await deleteSalesContract(row.id);
        this.$message.success('已删除');
        await this.loadContracts();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '删除失败'));
      }
    },
    async confirmBulkDeleteContracts() {
      const rows = this.selectedContracts || [];
      if (!rows.length) return;
      const ids = rows.map((r) => r.id).filter(Boolean);
      if (!ids.length) return;
      try {
        await this.$confirm(
          `将永久删除选中的 ${ids.length} 份合同，删除后不可恢复。是否继续？`,
          '批量删除（1/2）',
          { type: 'warning', confirmButtonText: '继续', cancelButtonText: '取消' }
        );
      } catch {
        return;
      }
      try {
        await this.$confirm(
          `最后确认：确定删除这 ${ids.length} 份合同？`,
          '批量删除（2/2）',
          { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' }
        );
      } catch {
        return;
      }
      try {
        await bulkDeleteSalesContracts({ ids });
        this.$message.success(`已删除 ${ids.length} 份合同`);
        this.$refs.contractsTableRef?.clearSelection?.();
        await this.loadContracts();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '批量删除失败'));
      }
    },
    async openSubmit(row) {
      this.submitRow = row;
      this.submitReviewerId = null;
      this.submitReviewerIds = [];
      this.submitDeptFilter = null;
      try {
        if (!this.submitDeptTree.length) {
          const t = await listDepartmentsTree();
          this.submitDeptTree = t.tree || [];
        }
      } catch {
        this.submitDeptTree = [];
      }
      await this.fetchSubmitReviewers();
      this.submitOpen = true;
    },
    async doSubmit() {
      if (!this.submitReviewerIds.length && this.submitReviewerId) {
        this.addSubmitReviewer();
      }
      if (!this.submitReviewerIds.length) {
        this.$message.warning('请至少添加 1 位审批人');
        return;
      }
      this.submitLoading = true;
      try {
        await submitSalesContract(this.submitRow.id, {
          reviewer_user_ids: this.submitReviewerIds
        });
        this.$message.success('已提交');
        this.submitOpen = false;
        this.loadContracts();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '失败'));
      } finally {
        this.submitLoading = false;
      }
    },
    openReview(row) {
      this.reviewRow = row;
      this.reviewForm = { result: 'approved', comment: '' };
      this.reviewOpen = true;
    },
    async tryOpenReviewFromRouteQuery() {
      const raw = this.$route.query.review_contract_id;
      if (raw == null || String(raw).trim() === '') return;
      if (!canAccessSalesContractWorkspace()) return;
      const id = Number(raw);
      if (!Number.isFinite(id) || id < 1) return;

      this.tab = 'list';
      this.clampActiveTab();

      let row = (this.contracts || []).find((c) => Number(c.id) === id);
      if (!row) {
        try {
          const d = await getSalesContract(id);
          const c = d?.contract;
          if (c) row = c;
        } catch {
          row = null;
        }
      }

      const restQuery = { ...this.$route.query };
      delete restQuery.review_contract_id;

      const stripReviewParam = () => {
        this.$router.replace({ path: '/sales/contracts', query: restQuery });
      };

      if (!row) {
        this.$message.warning('未找到该合同');
        stripReviewParam();
        return;
      }
      if (row.status !== 'pending_review' || (!isSuperAdmin() && !this.isReviewer(row))) {
        this.$message.warning('当前合同无需您审核或状态已变更');
        stripReviewParam();
        return;
      }
      this.openReview(row);
      stripReviewParam();
    },
    async doReview() {
      if (this.reviewForm.result === 'rejected' && !this.reviewForm.comment.trim()) {
        this.$message.warning('驳回请填写意见');
        return;
      }
      this.reviewLoading = true;
      try {
        await reviewSalesContract(this.reviewRow.id, {
          result: this.reviewForm.result,
          comment: this.reviewForm.comment
        });
        this.$message.success('已审核');
        this.reviewOpen = false;
        this.loadContracts();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '失败'));
      } finally {
        this.reviewLoading = false;
      }
    },
    async onUploadDocDialogOpen() {
      this.uploadDocCustomerId = null;
      this.uploadDocTitle = '';
      this.uploadDocFile = null;
      this.uploadDocCustomersLoading = true;
      try {
        const d = await listSalesCustomers();
        this.uploadDocCustomers = d.items || [];
      } catch {
        this.uploadDocCustomers = [];
      } finally {
        this.uploadDocCustomersLoading = false;
      }
    },
    onUploadDocFileChange(uploadFile) {
      const f = uploadFile?.raw;
      this.uploadDocFile = f instanceof File ? f : null;
    },
    openUploadDocDialog() {
      if (!perm('contract_management', 'contract_generate')) {
        this.$message.warning('无权限');
        return;
      }
      this.uploadDocOpen = true;
    },
    async submitUploadDoc() {
      if (!this.uploadDocCustomerId) {
        this.$message.warning('请选择客户');
        return;
      }
      if (!this.uploadDocFile) {
        this.$message.warning('请选择文件');
        return;
      }
      this.uploadDocSubmitting = true;
      try {
        const r = await uploadSalesContractDocument({
          customerId: this.uploadDocCustomerId,
          title: this.uploadDocTitle || undefined,
          file: this.uploadDocFile
        });
        this.$message.success('已创建文档合同草稿');
        this.uploadDocOpen = false;
        await this.loadContracts();
        if (r?.id) {
          this.$router.push(`/sales/contracts/editor/${r.id}`);
        }
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '上传失败'));
      } finally {
        this.uploadDocSubmitting = false;
      }
    }
  }
};
</script>

<style scoped>
.sales-contracts.reports-style-page {
  background: #fff;
  padding: 12px;
  border-radius: 8px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 10px;
  align-items: flex-start;
}
.toolbar .left,
.toolbar .right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.field-q {
  width: 260px;
}
.field-tpl-q {
  width: 220px;
}
.field-status {
  width: 140px;
}
.field-flow-order-no {
  width: 180px;
}
.table-wrap {
  width: 100%;
  overflow-x: auto;
}
.table-wrap :deep(.contracts-list-table) {
  min-width: 920px;
}
.upload-doc-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  line-height: 1.5;
}
.upload-doc-meta .doc-name {
  color: #64748b;
}
.upload-doc-form .w-full {
  width: 100%;
}
.contract-preview-pdf {
  width: 100%;
  min-height: 62vh;
  border: none;
  border-radius: 8px;
  background: #f1f5f9;
}
.contract-preview-other {
  padding: 24px;
  text-align: center;
  color: #475569;
}
.pagination-wrap {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.hint {
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}
.hint.inline-hint {
  max-width: 420px;
}
.flow-toolbar-wrap {
  margin-bottom: 10px;
}
.contract-preview-dialog-inner {
  min-height: 50vh;
}
:deep(.el-table__row) {
  cursor: pointer;
}
:deep(.el-table__row:hover) {
  background-color: #f5f7fa;
}
:deep(.el-button + .el-button) {
  margin-left: 8px;
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
.meta {
  margin-bottom: 12px;
  font-size: 13px;
  line-height: 1.6;
}
.meta-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin-top: 4px;
}
.meta-status-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  letter-spacing: 0.02em;
}
.meta-status-pill-hit {
  display: inline-flex;
  cursor: pointer;
  border-radius: 10px;
  outline: none;
}
.meta-status-pill-hit:focus-visible {
  box-shadow: 0 0 0 2px var(--el-color-primary-light-5);
}
.contracts-status-cell {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 2px 0;
}
.contracts-status-cell--flow {
  cursor: pointer;
  border-radius: 10px;
  outline: none;
}
.contracts-status-cell--flow:hover :deep(.sales-status-pill) {
  filter: brightness(0.97);
}
.contracts-status-cell--flow:focus-visible {
  box-shadow: 0 0 0 2px var(--el-color-primary-light-5);
}
.print-tooltip-trigger {
  display: inline-block;
}
.html-preview {
  border: 1px solid #eee;
  padding: 12px;
  margin-bottom: 16px;
  max-height: 360px;
  overflow: auto;
}
.sub {
  font-weight: 600;
  margin: 12px 0 8px;
}
.approval-flow-panel {
  padding-top: 4px;
}
.approval-flow-drawer-inner {
  min-height: 120px;
}
.approval-flow-drawer-meta {
  margin: -6px 0 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid #ebeef5;
}
.approval-flow-drawer-meta-no {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}
.approval-flow-drawer-meta-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
  line-height: 1.45;
}
.approval-flow-urge-row {
  margin-top: 12px;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 12px;
}
.approval-flow-urge-row .hint {
  flex: 1;
  min-width: 200px;
}
.approval-flow-urge-banner {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.approval-flow-urge-banner .hint {
  flex: 1;
  min-width: 220px;
  margin: 0;
}
.approval-flow-row {
  display: flex;
  gap: 14px;
  align-items: stretch;
}
.approval-flow-axis {
  position: relative;
  width: 12px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.approval-flow-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  z-index: 1;
  box-sizing: border-box;
}
.approval-flow-dot--primary {
  background: #409eff;
  border: 2px solid #d9ecff;
}
.approval-flow-dot--danger {
  background: #f56c6c;
  border: 2px solid #fde2e2;
}
.approval-flow-dot--muted {
  background: #c0c4cc;
}
.approval-flow-dot--warn {
  background: #e6a23c;
  border: 2px solid #faecd8;
}
.approval-flow-line {
  flex: 1;
  width: 2px;
  min-height: 12px;
  margin-top: 2px;
  background: linear-gradient(180deg, #c6e2ff 0%, #dcdfe6 100%);
  border-radius: 1px;
}
.approval-flow-main {
  flex: 1;
  min-width: 0;
  padding-bottom: 22px;
}
.approval-flow-step-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
  letter-spacing: 0.02em;
}
.approval-flow-card {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 12px 14px;
}
.approval-flow-user-line {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}
.approval-flow-user-name {
  word-break: break-word;
}
.approval-flow-time-row {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
}
.approval-flow-status-text {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
}
.approval-flow-status-text--success {
  color: #67c23a;
}
.approval-flow-status-text--danger {
  color: #f56c6c;
}
.approval-flow-status-text--muted {
  color: #909399;
}
.approval-flow-status-text--warn {
  color: #e6a23c;
}
.approval-flow-opinion {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #e4e7ed;
}
.approval-flow-opinion-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}
.approval-flow-opinion-body {
  font-size: 13px;
  color: #606266;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 680px;
}
.flow-body {
  min-height: 120px;
}
.flow-expand-inner {
  padding: 8px 12px 8px 4px;
  max-width: 920px;
}
.flow-order-steps {
  max-width: 720px;
}
.flow-order-steps :deep(.el-step__title) {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  padding-right: 8px;
}
.flow-order-steps :deep(.el-step__description) {
  padding-right: 8px;
}
.flow-step-desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.55;
}
.flow-step-time {
  color: #909399;
  margin-bottom: 4px;
}
.flow-order-steps--mobile {
  padding-left: 4px;
}
.flow-status-cell {
  display: flex;
  justify-content: center;
  width: 100%;
}
.flow-mobile-list {
  display: none;
}
.flow-mobile-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding-right: 8px;
}
.flow-mobile-no {
  font-weight: 600;
  font-size: 14px;
}
.flow-mobile-meta {
  font-size: 12px;
  color: #909399;
}
.flow-mobile-status {
  margin-bottom: 10px;
}
@media (max-width: 768px) {
  .flow-orders-table {
    display: none;
  }
  .flow-mobile-list {
    display: block;
  }
}
.mb8 {
  margin-bottom: 8px;
}
.mb12 {
  margin-bottom: 12px;
}
.w-full {
  width: 100%;
}
.upload-doc-form .hint {
  margin-top: 6px;
}
.submit-hint {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 10px;
  line-height: 1.45;
}
.submit-approver-builder {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.submit-approver-list {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  background: #fafafa;
}
.submit-approver-title {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 8px;
}
.submit-approver-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.submit-approver-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 10px;
}
.submit-approver-label {
  font-size: 13px;
}
.submit-approver-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
@media (max-width: 992px) {
  .sales-contracts .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .sales-contracts .toolbar .left,
  .sales-contracts .toolbar .right {
    width: 100%;
  }
  .field-q,
  .field-tpl-q,
  .field-status {
    width: 100%;
  }
  .hint.inline-hint {
    max-width: none;
  }
  .pagination-wrap {
    justify-content: center;
  }
  .submit-approver-builder {
    flex-direction: column;
  }
}
</style>
