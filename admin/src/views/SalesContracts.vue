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
            <el-button type="primary" @click="goNewTemplate">新建模板</el-button>
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
                <el-button link @click="goEditTemplate(row)">编辑</el-button>
                <el-button link type="danger" @click="removeTpl(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
      <el-tab-pane v-if="perm('contract_management', 'contract_view')" label="合同列表" name="list">
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
            <el-button type="primary" @click="onContractSearch">查询</el-button>
            <el-button
              v-if="perm('contract_management', 'contract_delete')"
              type="danger"
              plain
              :disabled="!selectedContracts.length"
              @click="confirmBulkDeleteContracts"
            >批量删除</el-button>
          </div>
          <div class="right">
            <el-button
              v-if="perm('contract_management', 'contract_generate')"
              type="primary"
              @click="openUploadDocDialog"
            >上传文档合同</el-button>
            <el-button
              v-if="perm('contract_management', 'contract_generate')"
              plain
              type="primary"
              @click="$router.push('/sales/orders')"
            >去订单生成合同</el-button>
            <el-button @click="loadContracts">刷新</el-button>
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
                <div class="contracts-status-cell">
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
                <el-button link type="primary" @click="openContractPreview(row)">预览</el-button>
                <el-button link @click="openDetail(row)">详情</el-button>
                <el-button v-if="canEditContract(row)" link type="primary" @click="goContractEditor(row)">编辑</el-button>
                <el-button v-if="canDeleteContract(row)" link type="danger" @click="removeContract(row)">删除</el-button>
                <el-button
                  v-if="perm('contract_management', 'contract_submit') && row.status === 'draft' && isMine(row)"
                  link
                  @click="openSubmit(row)"
                >提交审核</el-button>
                <el-button
                  v-if="perm('contract_management', 'contract_review') && row.status === 'pending_review' && isReviewer(row)"
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
            <el-button size="small" @click="loadFlow">刷新</el-button>
            <span class="hint inline-hint">按订单汇总，与合同列表分开；展开查看状态时间线。</span>
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
                <el-timeline>
                  <el-timeline-item v-for="l in g.logs" :key="l.id" :timestamp="$dt(l.created_at)">
                    {{ l.from_status || '—' }} → {{ l.to_status }} · {{ l.actor_username || '—' }} ·
                    {{ l.remark || '' }}
                  </el-timeline-item>
                </el-timeline>
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
              <el-timeline class="flow-mobile-timeline">
                <el-timeline-item v-for="l in g.logs" :key="l.id" :timestamp="$dt(l.created_at)">
                  {{ l.from_status || '—' }} → {{ l.to_status }} · {{ l.actor_username || '—' }} · {{ l.remark || '' }}
                </el-timeline-item>
              </el-timeline>
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
            <SalesStatusPill kind="contract" :status="detail.contract.status" :reject-reason="contractRejectReason(detail)" />
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
            <el-button type="primary" size="small" @click="downloadDetailContractFile">下载合同文件</el-button>
          </div>
        </template>
        <div v-else class="html-preview" v-html="detailBodyPreviewHtml" />
        <div class="sub">关联订单</div>
        <el-table :data="detail.orders" border size="small">
          <el-table-column prop="order_no" label="订单号" />
          <el-table-column prop="product_name" label="商品" />
          <el-table-column prop="amount" label="金额" />
        </el-table>
        <div class="sub">审核记录</div>
        <el-timeline>
          <el-timeline-item v-for="a in detail.audits" :key="a.id" :timestamp="$dt(a.created_at)">
            {{ a.action }} · {{ a.actor_username || '—' }} · {{ a.result || '' }} {{ a.comment_text || '' }}
          </el-timeline-item>
        </el-timeline>
      </template>
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
        <el-button @click="uploadDocOpen = false">取消</el-button>
        <el-button type="primary" :loading="uploadDocSubmitting" @click="submitUploadDoc">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="submitOpen" title="提交合同审核" width="480px">
      <div class="submit-hint">可先选部门（含子部门）缩小名单，再选择具备合同审核权限的审批人。</div>
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
      <el-select v-model="submitReviewerId" placeholder="选择审批人" filterable class="w-full">
        <el-option v-for="u in reviewers" :key="u.id" :label="reviewerOptionLabel(u)" :value="u.id" />
      </el-select>
      <template #footer>
        <el-button @click="submitOpen = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="doSubmit">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="reviewOpen" title="合同审核" width="440px">
      <el-radio-group v-model="reviewForm.result" class="mb12">
        <el-radio label="approved">通过</el-radio>
        <el-radio label="rejected">驳回</el-radio>
      </el-radio-group>
      <el-input v-model="reviewForm.comment" type="textarea" rows="3" placeholder="驳回必填意见" />
      <template #footer>
        <el-button @click="reviewOpen = false">取消</el-button>
        <el-button type="primary" :loading="reviewLoading" @click="doReview">确定</el-button>
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
          <el-button type="primary" @click="downloadPreviewContractFile">下载查看</el-button>
        </div>
      </div>
      <template #footer>
        <el-button @click="contractPreviewOpen = false">关闭</el-button>
        <el-button
          type="primary"
          :disabled="contractPreviewMode === 'other' || (contractPreviewMode === 'html' && !contractPreviewHtml)"
          @click="printContractPreview"
        >打印</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script>
import { perm, isSuperAdmin } from '../utils/permissions';
import {
  listContractTemplates,
  deleteContractTemplate,
  listSalesContracts,
  getSalesContract,
  deleteSalesContract,
  bulkDeleteSalesContracts,
  submitSalesContract,
  reviewSalesContract,
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
import { finalizeContractBodyForPreview, buildContractPreviewPrintWindowHtml } from '../utils/contractPreviewHtml';

export default {
  name: 'SalesContracts',
  components: { SalesStatusPill },
  data() {
    return {
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
      submitOpen: false,
      submitLoading: false,
      submitRow: null,
      submitReviewerId: null,
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
      uploadDocSubmitting: false
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
    }
  },
  watch: {
    '$route.query.tab'() {
      this.syncTabFromQuery();
    },
    '$route.path'(p) {
      if (p === '/sales/contracts') {
        this.syncTabFromQuery();
        this.loadTemplates();
      }
    }
  },
  mounted() {
    if (perm('contract_management', 'contract_view')) this.tab = 'list';
    else if (perm('contract_management', 'template_manage')) this.tab = 'tpl';
    else if (perm('process_management', 'view_flow')) this.tab = 'flow';
    this.syncTabFromQuery();
    this.loadTemplates();
    this.loadContracts();
    this.loadFlow();
  },
  methods: {
    perm,
    syncTabFromQuery() {
      const t = this.$route.query.tab;
      if (t === 'tpl' && perm('contract_management', 'template_manage')) this.tab = 'tpl';
      else if (t === 'list' && perm('contract_management', 'contract_view')) this.tab = 'list';
      else if (t === 'flow' && perm('process_management', 'view_flow')) this.tab = 'flow';
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
      return row.created_by === this.myUserId();
    },
    isReviewer(row) {
      return row.reviewer_user_id === this.myUserId();
    },
    canEditContract(row) {
      if (!row || !perm('contract_management', 'contract_edit')) return false;
      if (isSuperAdmin()) return true;
      if (!this.isMine(row)) return false;
      return row.status === 'draft' || row.status === 'rejected';
    },
    canDeleteContract(row) {
      if (!row || !perm('contract_management', 'contract_delete')) return false;
      if (isSuperAdmin()) return true;
      if (!this.isMine(row)) return false;
      return row.status === 'draft' || row.status === 'rejected';
    },
    contractRowSelectable(row) {
      return this.canDeleteContract(row);
    },
    reviewerOptionLabel(u) {
      if (u.departmentNameZh) return `${u.username}（${u.departmentNameZh}）`;
      return u.username;
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
      if (!perm('contract_management', 'contract_view')) return;
      try {
        const d = await listSalesContracts({
          q: this.contractQ || undefined,
          status: this.contractStatus || undefined,
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
      } catch {
        this.contracts = [];
        this.contractTotal = 0;
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
      if (this.contractPreviewMode === 'pdf' && this.contractPreviewPdfUrl) {
        const w = window.open(this.contractPreviewPdfUrl, '_blank');
        if (!w) this.$message.warning('请允许弹窗后重试打印');
        return;
      }
      if (this.contractPreviewMode === 'docx' && this.contractPreviewDocxHtml) {
        const w = window.open('', '_blank');
        if (!w) {
          this.$message.warning('浏览器阻止了弹窗，请允许后重试');
          return;
        }
        const docHtml = this.contractPreviewDocxHtml;
        w.document.open();
        w.document.write(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>打印</title><style>
          body{margin:0;padding:16px;font-family:SimSun,宋体,Segoe UI,sans-serif;font-size:14px;line-height:1.65;color:#111;}
          table{border-collapse:collapse;} td,th{border:1px solid #ccc;padding:4px 8px;}
          @media print{@page{margin:12mm;}body{padding:0;}}
          </style></head><body>${docHtml}</body></html>`
        );
        w.document.close();
        const triggerPrint = () => {
          w.focus();
          try {
            w.print();
          } catch {
            /* ignore */
          }
        };
        if (w.document.readyState === 'complete') triggerPrint();
        else w.onload = triggerPrint;
        return;
      }
      if (this.contractPreviewMode === 'image' && this.contractPreviewImageUrl) {
        const w = window.open('', '_blank');
        if (!w) {
          this.$message.warning('浏览器阻止了弹窗，请允许后重试');
          return;
        }
        const src = this.contractPreviewImageUrl;
        w.document.open();
        w.document.write(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>打印</title><style>
          body{margin:0;text-align:center;padding:12px;} img{max-width:100%;height:auto;}
          @media print{@page{margin:10mm;} body{padding:0;} img{max-width:100%;}}
          </style></head><body><img src="${src}" alt="" /></body></html>`
        );
        w.document.close();
        const triggerPrint = () => {
          w.focus();
          try {
            w.print();
          } catch {
            /* ignore */
          }
        };
        if (w.document.readyState === 'complete') triggerPrint();
        else w.onload = triggerPrint;
        return;
      }
      const html = this.contractPreviewHtml;
      if (!html) return;
      const w = window.open('', '_blank');
      if (!w) {
        this.$message.warning('浏览器阻止了弹窗，请允许后重试');
        return;
      }
      w.document.open();
      w.document.write(buildContractPreviewPrintWindowHtml(html, ''));
      w.document.close();
      const triggerPrint = () => {
        w.focus();
        try {
          w.print();
        } catch {
          /* ignore */
        }
      };
      if (w.document.readyState === 'complete') triggerPrint();
      else w.onload = triggerPrint;
    },
    async loadFlow() {
      if (!perm('process_management', 'view_flow')) return;
      this.flowLoading = true;
      try {
        const d = await listSalesProcessLogs({ limit: 500 });
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
      if (!this.submitReviewerId) {
        this.$message.warning('请选择审核人');
        return;
      }
      this.submitLoading = true;
      try {
        await submitSalesContract(this.submitRow.id, { reviewer_user_id: this.submitReviewerId });
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
.contract-preview-html {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  max-height: 70vh;
  overflow: auto;
  font-size: 13px;
  line-height: 1.5;
}
.contract-preview-html :deep(table) {
  border-collapse: collapse;
  width: 100%;
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
.contracts-status-cell {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 2px 0;
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
.flow-body {
  min-height: 120px;
}
.flow-expand-inner {
  padding: 8px 12px 8px 4px;
  max-width: 920px;
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
.flow-mobile-timeline {
  padding-left: 4px;
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
}
</style>
