<template>
  <div class="invoice-center">
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span>开票中心</span>
          <div class="head-actions">
            <el-button v-if="canManage" type="primary" icon="Plus" @click="openCreate">新增</el-button>
            <el-button :loading="loading" @click="loadList" icon="Refresh">刷新</el-button>
          </div>
        </div>
      </template>

      <div class="toolbar">
        <el-select v-model="status" style="width: 180px" @change="onSearch">
          <el-option label="全部" value="all" />
          <el-option label="待开票" value="pending_finance" />
          <el-option label="已开票" value="issued" />
          <el-option label="草稿" value="draft" />
          <el-option label="已取消" value="cancelled" />
        </el-select>
        <el-input
          v-model.trim="q"
          placeholder="搜合同号/客户/发票号"
          clearable
          style="width: 280px"
          @keyup.enter="onSearch"
          @clear="onSearch"
        />
        <el-button type="primary" icon="Search" @click="onSearch">查询</el-button>
        <template v-if="canManage">
          <el-button :disabled="!selectedRows.length" @click="onBatchSubmit">批量提交财务</el-button>
          <el-button :disabled="!selectedRows.length" type="warning" @click="onBatchWithdraw">批量撤销</el-button>
        </template>
        <el-button v-if="canDelete" :disabled="!selectedDeletableCount" type="danger" @click="onBatchDelete">
          批量删除
        </el-button>
        <span v-if="selectedRows.length" class="batch-tip">已选 {{ selectedRows.length }} 条</span>
      </div>

      <el-table
        ref="tableRef"
        class="desktop-table"
        :data="rows"
        border
        size="small"
        v-loading="loading"
        :selectable="canManage || canDelete ? rowSelectable : undefined"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="contract_no" label="合同号" min-width="140" />
        <el-table-column prop="customer_name" label="客户" min-width="140" />
        <el-table-column label="开票金额" width="120" align="right">
          <template #default="{ row }">{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <SalesStatusPill kind="invoice" :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column prop="invoice_no" label="发票号码" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.invoice_no || '—' }}</template>
        </el-table-column>
        <el-table-column prop="invoice_code" label="发票代码" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.invoice_code || '—' }}</template>
        </el-table-column>
        <el-table-column prop="buyer_name" label="公司全称" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.buyer_name || '—' }}</template>
        </el-table-column>
        <el-table-column prop="buyer_tax_id" label="统一社会信用代码" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.buyer_tax_id || '—' }}</template>
        </el-table-column>
        <el-table-column label="发票链接" width="110">
          <template #default="{ row }">
            <el-link v-if="row.invoice_url" :href="row.invoice_url" target="_blank" type="primary">查看</el-link>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="申请人" width="100">
          <template #default="{ row }">{{ row.created_by_real_name || row.created_by_username || '—' }}</template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <template v-if="canManage">
              <el-button v-if="normStatus(row.status) === 'draft'" link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button v-if="normStatus(row.status) === 'draft'" link type="primary" @click="onSubmit(row)">提交财务</el-button>
              <el-button v-if="normStatus(row.status) === 'pending_finance'" link type="warning" @click="onWithdraw(row)">撤销</el-button>
            </template>
            <el-button v-if="canDeleteRow(row)" link type="danger" @click="onDelete(row)">删除</el-button>
            <el-button
              v-if="canFulfill && normStatus(row.status) === 'pending_finance'"
              link
              type="success"
              @click="openFulfill(row)"
            >回填发票</el-button>
            <el-button link type="primary" @click="openDetail(row)">开票信息</el-button>
            <el-button link type="primary" @click="openAudits(row)">记录</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="mobile-list" v-loading="loading">
        <div v-for="row in rows" :key="'m-' + row.id" class="mobile-card">
          <div class="mobile-head">
            <div class="mobile-head-main">
              <strong class="mobile-contract">{{ row.contract_no || '—' }}</strong>
              <span class="mobile-customer">{{ row.customer_name || '—' }}</span>
            </div>
            <SalesStatusPill kind="invoice" :status="row.status" />
          </div>
          <div class="mobile-line">
            <span>开票金额</span>
            <span class="mobile-amount">{{ money(row.amount) }}</span>
          </div>
          <div v-if="row.invoice_no || row.invoice_code" class="mobile-line">
            <span>发票号/代码</span>
            <span>{{ row.invoice_no || '—' }} / {{ row.invoice_code || '—' }}</span>
          </div>
          <div v-if="row.buyer_name" class="mobile-line">
            <span>公司全称</span>
            <span>{{ row.buyer_name }}</span>
          </div>
          <div class="mobile-line">
            <span>申请人</span>
            <span>{{ row.created_by_real_name || row.created_by_username || '—' }}</span>
          </div>
          <div class="mobile-line">
            <span>更新时间</span>
            <span>{{ formatTime(row.updated_at) }}</span>
          </div>
          <div class="mobile-actions">
            <template v-if="canManage">
              <el-button v-if="normStatus(row.status) === 'draft'" size="small" @click="openEdit(row)">编辑</el-button>
              <el-button v-if="normStatus(row.status) === 'draft'" size="small" type="primary" @click="onSubmit(row)">提交</el-button>
              <el-button v-if="normStatus(row.status) === 'pending_finance'" size="small" type="warning" @click="onWithdraw(row)">撤销</el-button>
            </template>
            <el-button
              v-if="canFulfill && normStatus(row.status) === 'pending_finance'"
              size="small"
              type="success"
              @click="openFulfill(row)"
            >回填发票</el-button>
            <el-button size="small" type="primary" plain @click="openDetail(row)">开票信息</el-button>
            <el-button v-if="canDeleteRow(row)" size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
            <el-button size="small" @click="openAudits(row)">记录</el-button>
          </div>
        </div>
        <el-empty v-if="!rows.length && !loading" description="暂无开票记录" :image-size="56" />
      </div>

      <div class="pager">
        <el-pagination
          background
          layout="total, prev, pager, next, sizes"
          :total="total"
          :page-size="limit"
          :current-page="page"
          :page-sizes="[20, 50, 100]"
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="formOpen"
      :title="editingId ? '编辑开票申请' : '新增开票申请'"
      width="720px"
      top="6vh"
      destroy-on-close
      class="invoice-apply-dialog"
    >
      <SalesInvoiceApplyForm
        ref="formRef"
        :form="form"
        :rules="formRules"
        :max-applicable-amount="maxApplicableAmountForForm"
        :tax-amount-display="formTaxAmountDisplay"
        :summary="invoiceFormSummary"
        show-contract
        :contract-id="form.contract_id"
        :contract-disabled="!!editingId"
        :contract-options="contractPickerOptions"
        :contract-options-hint="contractOptionsHint"
        :contract-search-loading="contractSearchLoading"
        @update:contract-id="onInvoiceContractIdChange"
        @contract-dropdown-visible="onContractSelectVisible"
      />
      <template #footer>
        <div class="invoice-apply-dialog__footer">
          <el-button icon="Close" @click="formOpen = false">取消</el-button>
          <div class="invoice-apply-dialog__actions">
            <el-button :loading="formSaving" @click="saveForm(false)">保存草稿</el-button>
            <el-button type="primary" :loading="formSaving" icon="Check" @click="saveForm(true)">提交财务</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="fulfillOpen" title="财务回填发票" width="480px" destroy-on-close>
      <div v-if="fulfillRow" class="fulfill-item-summary">
        <div v-if="fulfillRow.item_name"><span class="label">商品/服务：</span>{{ fulfillRow.item_name }}</div>
        <div v-if="fulfillRow.item_unit || fulfillRow.item_quantity != null || fulfillRow.item_unit_price != null">
          <span class="label">明细：</span>
          <template v-if="fulfillRow.item_quantity != null">{{ fulfillRow.item_quantity }}</template>
          <template v-if="fulfillRow.item_unit">{{ fulfillRow.item_unit }}</template>
          <template v-if="fulfillRow.item_unit_price != null"> × {{ money(fulfillRow.item_unit_price) }}</template>
        </div>
      </div>
      <el-form ref="fulfillFormRef" :model="fulfillForm" :rules="fulfillRules" label-width="92px">
        <el-form-item label="发票号码" prop="invoice_no">
          <el-input v-model.trim="fulfillForm.invoice_no" maxlength="64" />
        </el-form-item>
        <el-form-item label="发票代码" prop="invoice_code">
          <el-input v-model.trim="fulfillForm.invoice_code" maxlength="64" />
        </el-form-item>
        <el-form-item label="发票链接" prop="invoice_url">
          <el-input
            v-model.trim="fulfillForm.invoice_url"
            maxlength="512"
            placeholder="可填完整链接或域名路径，缺少 https:// 将自动补全"
          />
        </el-form-item>
        <el-form-item label="公司全称">
          <el-input v-model.trim="fulfillForm.buyer_name" maxlength="256" />
        </el-form-item>
        <el-form-item label="统一信用代码">
          <el-input v-model.trim="fulfillForm.buyer_tax_id" maxlength="64" />
        </el-form-item>
        <el-form-item label="注册地址">
          <el-input v-model.trim="fulfillForm.buyer_address" maxlength="512" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model.trim="fulfillForm.buyer_phone" maxlength="64" />
        </el-form-item>
        <el-form-item label="开户行">
          <el-input v-model.trim="fulfillForm.buyer_bank_name" maxlength="256" />
        </el-form-item>
        <el-form-item label="银行账号">
          <el-input v-model.trim="fulfillForm.buyer_bank_account" maxlength="128" />
        </el-form-item>
        <el-form-item label="商品/服务">
          <el-input v-model.trim="fulfillForm.item_name" maxlength="512" />
        </el-form-item>
        <el-form-item label="开票日期">
          <el-date-picker v-model="fulfillForm.invoice_date" type="date" value-format="YYYY-MM-DD" class="w-full" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fulfillOpen = false">取消</el-button>
        <el-button type="primary" :loading="fulfillLoading" @click="doFulfill">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailOpen" title="开票信息" width="580px" destroy-on-close append-to-body>
      <div v-if="detailRow" class="invoice-detail">
        <div class="detail-head">
          <div class="detail-head-title">
            <span class="contract">{{ detailRow.contract_no || '—' }}</span>
            <SalesStatusPill kind="invoice" :status="detailRow.status" />
          </div>
          <el-button type="primary" size="small" :icon="DocumentCopy" @click="copyAllDetailFields">
            复制全部
          </el-button>
        </div>
        <div class="detail-list">
          <div v-for="f in detailFieldList" :key="f.label" class="detail-row">
            <span class="detail-label">{{ f.label }}</span>
            <span class="detail-value" :title="f.display">{{ f.display }}</span>
            <el-button
              link
              type="primary"
              :icon="DocumentCopy"
              class="detail-copy"
              title="复制"
              @click="copyDetailField(f)"
            />
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailOpen = false">关闭</el-button>
        <el-button v-if="canFulfill && detailRow && normStatus(detailRow.status) === 'pending_finance'" type="success" @click="openFulfillFromDetail">
          回填发票
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="auditsOpen" title="开票处理记录" width="440px" destroy-on-close>
      <div v-loading="auditsLoading">
        <el-timeline v-if="audits.length">
          <el-timeline-item
            v-for="a in audits"
            :key="a.id"
            :timestamp="formatTime(a.created_at)"
            :type="a.action === 'fulfill' ? 'success' : a.action === 'withdraw_submit' ? 'warning' : 'primary'"
          >
            <div class="title">{{ auditTitle(a) }}</div>
            <div class="actor">{{ a.actor_real_name || a.actor_username || '—' }}</div>
            <div v-if="a.comment_text" class="comment">{{ a.comment_text }}</div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="暂无记录" :image-size="56" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { DocumentCopy } from '@element-plus/icons-vue';
import SalesStatusPill from '../components/SalesStatusPill.vue';
import SalesInvoiceApplyForm from '../components/SalesInvoiceApplyForm.vue';
import { invoiceStatusDisplay } from '../utils/salesStatusDisplay';
import { axiosUserMessage } from '../utils/apiUserMessage';
import {
  canManageContractInvoice,
  canFulfillContractInvoice,
  canDeleteContractInvoice,
  isSuperAdmin
} from '../utils/permissions';
import { isValidInvoiceHttpUrl, normalizeInvoiceUrl } from '../../../shared/invoiceUrl.js';
import {
  listAllContractInvoices,
  listContractInvoices,
  fulfillContractInvoice,
  getContractInvoiceAudits,
  listSalesContracts,
  createContractInvoice,
  updateContractInvoice,
  deleteContractInvoice,
  submitContractInvoice,
  withdrawContractInvoice
} from '../api';

const route = useRoute();
const loading = ref(false);
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const limit = ref(20);
const q = ref('');
const status = ref('all');
const tableRef = ref(null);
const selectedRows = ref([]);
const canManage = ref(canManageContractInvoice());
const canFulfill = ref(canFulfillContractInvoice());
const canDelete = ref(canDeleteContractInvoice());
const editingRowAmount = ref(0);

const selectedDeletableCount = computed(() =>
  selectedRows.value.filter((r) => canDeleteRow(r)).length
);

const formOpen = ref(false);
const formSaving = ref(false);
const formRef = ref(null);
const editingId = ref(null);
const contractSearchLoading = ref(false);
const contractOptions = ref([]);
const invoiceFormSummary = ref({ applicable_remaining_amount: 0 });
const form = reactive({
  contract_id: null,
  amount: null,
  invoice_type: 'special',
  tax_rate: null,
  buyer_name: '',
  buyer_tax_id: '',
  buyer_address: '',
  buyer_phone: '',
  buyer_bank_name: '',
  buyer_bank_account: '',
  item_name: '',
  item_unit: '',
  item_quantity: null,
  item_unit_price: null,
  remark: ''
});
const maxApplicableAmountForForm = computed(() => {
  const v = Number(invoiceFormSummary.value.applicable_remaining_amount || 0);
  const bonus = editingId.value ? Number(editingRowAmount.value || 0) : 0;
  const max = v + bonus;
  return max > 0 ? Number(max.toFixed(2)) : 0.01;
});
const formTaxAmountDisplay = computed(() => {
  const amt = Number(form.amount || 0);
  const rate = form.tax_rate == null ? NaN : Number(form.tax_rate);
  if (!(amt > 0) || !Number.isFinite(rate) || rate < 0) return '—';
  return money(amt * rate);
});
const contractPickerOptions = computed(() => {
  const list = [...contractOptions.value];
  list.sort((a, b) => {
    const aOk = a.status === 'approved' ? 0 : 1;
    const bOk = b.status === 'approved' ? 0 : 1;
    if (aOk !== bOk) return aOk - bOk;
    return String(b.contract_no || '').localeCompare(String(a.contract_no || ''), 'zh-CN');
  });
  return list;
});
const contractOptionsHint = computed(() => {
  if (contractSearchLoading.value) return '';
  if (!contractOptions.value.length) {
    return '未加载到合同，请确认合同列表有数据且当前账号有合同查看权限';
  }
  const approvedCount = contractOptions.value.filter((c) => c.status === 'approved').length;
  if (!approvedCount) {
    return `已加载 ${contractOptions.value.length} 条合同，但尚无「已通过」状态，需审核通过后才可开票`;
  }
  return `共 ${contractOptions.value.length} 条，其中 ${approvedCount} 条可开票`;
});
const formRules = {
  contract_id: [{ required: true, message: '请选择合同', trigger: 'change' }],
  amount: [
    { required: true, message: '请填写开票金额', trigger: 'change' },
    {
      validator: (_rule, value, cb) => {
        const n = Number(value || 0);
        const max = Number(maxApplicableAmountForForm.value || 0);
        if (!(n > 0)) return cb(new Error('请填写开票金额'));
        if (n > max + 0.0001) return cb(new Error('开票金额超过可申请余额'));
        return cb();
      },
      trigger: 'change'
    }
  ],
  invoice_type: [{ required: true, message: '请选择发票类型', trigger: 'change' }]
};

const fulfillOpen = ref(false);
const fulfillLoading = ref(false);
const fulfillFormRef = ref(null);
const fulfillRow = ref(null);
const fulfillForm = reactive({
  invoice_no: '',
  invoice_code: '',
  invoice_url: '',
  buyer_name: '',
  buyer_tax_id: '',
  buyer_address: '',
  buyer_phone: '',
  buyer_bank_name: '',
  buyer_bank_account: '',
  item_name: '',
  invoice_date: ''
});
const fulfillRules = {
  invoice_no: [{ required: true, message: '请填写发票号码', trigger: 'blur' }],
  invoice_code: [{ required: true, message: '请填写发票代码', trigger: 'blur' }],
  invoice_url: [
    { required: true, message: '请填写发票链接', trigger: 'blur' },
    {
      validator: (_rule, value, cb) => {
        if (isValidInvoiceHttpUrl(value)) return cb();
        cb(new Error('请填写有效链接（http/https，可省略协议头）'));
      },
      trigger: 'blur'
    }
  ]
};

const auditsOpen = ref(false);
const auditsLoading = ref(false);
const audits = ref([]);

const detailOpen = ref(false);
const detailRow = ref(null);

const detailFieldList = computed(() => buildDetailFieldList(detailRow.value));

function money(v) {
  const n = Number(v || 0);
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function invoiceTypeLabel(t) {
  if (t === 'normal') return '增值税普通发票';
  if (t === 'electronic') return '电子普通发票';
  return '增值税专用发票';
}

function fmtQty(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

function buildDetailFieldList(row) {
  if (!row) return [];
  const rate = row.tax_rate == null ? null : Number(row.tax_rate);
  let taxAmt = row.tax_amount;
  if (taxAmt == null && rate != null && Number(row.amount) > 0) {
    taxAmt = Number(row.amount) * rate;
  }
  const statusLabel = invoiceStatusDisplay(row.status).label;
  const applicant = row.created_by_real_name || row.created_by_username || '';
  const defs = [
    { label: '合同号', value: row.contract_no },
    { label: '客户', value: row.customer_name },
    { label: '状态', value: statusLabel },
    { label: '开票金额', value: row.amount == null ? '' : money(row.amount) },
    { label: '发票类型', value: invoiceTypeLabel(row.invoice_type) },
    { label: '税率', value: rate == null ? '' : `${(rate * 100).toFixed(0)}%` },
    { label: '税额', value: taxAmt == null ? '' : money(taxAmt) },
    { label: '购方名称', value: row.buyer_name },
    { label: '购方税号', value: row.buyer_tax_id },
    { label: '注册地址', value: row.buyer_address },
    { label: '联系电话', value: row.buyer_phone },
    { label: '开户行', value: row.buyer_bank_name },
    { label: '银行账号', value: row.buyer_bank_account },
    { label: '商品/服务名称', value: row.item_name },
    { label: '计量单位', value: row.item_unit },
    { label: '数量', value: fmtQty(row.item_quantity) },
    { label: '单价', value: row.item_unit_price == null ? '' : money(row.item_unit_price) },
    { label: '备注', value: row.remark },
    { label: '申请人', value: applicant },
    { label: '发票号码', value: row.invoice_no },
    { label: '发票代码', value: row.invoice_code },
    { label: '发票链接', value: row.invoice_url },
    { label: '开票日期', value: row.invoice_date },
    { label: '更新时间', value: formatTime(row.updated_at) }
  ];
  return defs.map(({ label, value }) => {
    const text = value == null ? '' : String(value).trim();
    return {
      label,
      display: text || '—',
      copyText: text
    };
  });
}

async function copyToClipboard(text, okMsg = '已复制') {
  const s = String(text ?? '');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s);
    } else {
      const ta = document.createElement('textarea');
      ta.value = s;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    ElMessage.success(okMsg);
  } catch {
    ElMessage.error('复制失败');
  }
}

function copyDetailField(field) {
  if (!field?.copyText) {
    ElMessage.warning(`${field?.label || '字段'}为空，无法复制`);
    return;
  }
  copyToClipboard(field.copyText);
}

function copyAllDetailFields() {
  const text = detailFieldList.value.map((f) => `${f.label}：${f.copyText || ''}`).join('\n');
  copyToClipboard(text, '已复制全部字段');
}

function openDetail(row) {
  detailRow.value = row;
  detailOpen.value = true;
}

function openFulfillFromDetail() {
  if (!detailRow.value) return;
  detailOpen.value = false;
  openFulfill(detailRow.value);
}

function normStatus(s) {
  if (s === 'pending_review') return 'pending_finance';
  if (s === 'approved') return 'issued';
  if (s === 'rejected') return 'draft';
  return s || 'draft';
}

function myUserId() {
  const raw = localStorage.getItem('token');
  if (!raw) return null;
  try {
    const part = raw.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)).userId ?? null;
  } catch {
    return null;
  }
}

function isMine(row) {
  if (isSuperAdmin()) return true;
  const uid = myUserId();
  return uid != null && row?.created_by != null && Number(row.created_by) === Number(uid);
}

function isDeletableInvoiceStatus(row) {
  const st = normStatus(row?.status);
  return st === 'draft' || st === 'pending_finance' || st === 'issued' || st === 'cancelled';
}

function canDeleteRow(row) {
  if (!canDelete.value || !isDeletableInvoiceStatus(row)) return false;
  return isMine(row);
}

function deleteConfirmText(row) {
  const st = normStatus(row?.status);
  if (st === 'issued') return '该记录已开票，删除后无法恢复（测试清理），确认删除？';
  if (st === 'pending_finance') return '该记录待开票，确认删除？';
  return '确认删除该开票申请？';
}

function formatTime(t) {
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return String(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function auditTitle(a) {
  if (a.action === 'submit_finance' || a.action === 'submit') return '提交财务';
  if (a.action === 'withdraw_submit') return '撤销申请';
  if (a.action === 'fulfill') return '财务已开票';
  return a.action || '操作';
}

async function loadList() {
  loading.value = true;
  try {
    const d = await listAllContractInvoices({
      status: status.value,
      q: q.value || undefined,
      limit: limit.value,
      offset: (page.value - 1) * limit.value
    });
    rows.value = d.items || [];
    total.value = Number(d.total || 0);
    if (d.can_manage != null) canManage.value = !!d.can_manage;
    if (d.can_fulfill != null) canFulfill.value = !!d.can_fulfill;
    if (d.can_delete != null) canDelete.value = !!d.can_delete;
    selectedRows.value = [];
    tableRef.value?.clearSelection?.();
  } catch (e) {
    const statusCode = Number(e?.response?.status || 0);
    const fallback =
      statusCode === 404
        ? '开票中心接口未生效，请重启后端服务'
        : statusCode === 403
          ? '当前账号无开票中心权限'
          : '加载开票中心失败';
    ElMessage.error(axiosUserMessage(e, fallback));
  } finally {
    loading.value = false;
  }
}

function onSelectionChange(list) {
  selectedRows.value = Array.isArray(list) ? list : [];
}

function onSearch() {
  page.value = 1;
  loadList();
}

function onPageChange(p) {
  page.value = p;
  loadList();
}

function onSizeChange(s) {
  limit.value = s;
  page.value = 1;
  loadList();
}

async function loadContractOptions() {
  contractSearchLoading.value = true;
  try {
    const d = await listSalesContracts({
      limit: 100,
      offset: 0
    });
    contractOptions.value = (d.items || [])
      .map((c) => ({
        ...c,
        id: Number(c.id)
      }))
      .filter((c) => Number.isFinite(c.id) && c.id > 0);
    ensureSelectedContractOption();
  } catch (e) {
    contractOptions.value = [];
    ElMessage.error(axiosUserMessage(e, '加载合同列表失败'));
  } finally {
    contractSearchLoading.value = false;
  }
}

function onInvoiceContractIdChange(contractId) {
  form.contract_id = contractId;
}

function ensureSelectedContractOption() {
  const id = Number(form.contract_id);
  if (!Number.isFinite(id) || id < 1) return;
  if (contractOptions.value.some((c) => Number(c.id) === id)) return;
  const hit = rows.value.find((r) => Number(r.contract_id) === id);
  if (hit) {
    contractOptions.value.unshift({
      id,
      contract_no: hit.contract_no,
      customer_name: hit.customer_name
    });
  }
}

function onContractSelectVisible(visible) {
  if (!visible || editingId.value) return;
  if (!contractOptions.value.length) loadContractOptions();
}

function strOrDefault(val, fallback) {
  const s = val != null ? String(val).trim() : '';
  return s || (fallback != null ? String(fallback).trim() : '') || '';
}

function resetForm() {
  form.contract_id = null;
  form.amount = null;
  form.invoice_type = 'special';
  form.tax_rate = null;
  form.buyer_name = '';
  form.buyer_tax_id = '';
  form.buyer_address = '';
  form.buyer_phone = '';
  form.buyer_bank_name = '';
  form.buyer_bank_account = '';
  form.item_name = '';
  form.item_unit = '';
  form.item_quantity = null;
  form.item_unit_price = null;
  form.remark = '';
  invoiceFormSummary.value = { applicable_remaining_amount: 0 };
}

async function applyContractDefaultsToForm(contractId, { replaceBuyerFields = false } = {}) {
  const cid = Number(contractId);
  if (!Number.isFinite(cid) || cid < 1) return;
  try {
    const d = await listContractInvoices(cid);
    invoiceFormSummary.value = d.summary || { applicable_remaining_amount: 0 };
    const defs = d.defaults || {};
    const contract = d.contract || {};
    const customerName = contract.customer_name || '';
    if (replaceBuyerFields || form.tax_rate == null) {
      form.tax_rate = defs.tax_rate == null ? null : Number(defs.tax_rate);
    }
    const base = replaceBuyerFields ? '' : undefined;
    form.buyer_name = strOrDefault(base ?? form.buyer_name, defs.buyer_name) || customerName;
    form.buyer_tax_id = strOrDefault(base ?? form.buyer_tax_id, defs.buyer_tax_id || contract.customer_tax_id);
    form.buyer_address = strOrDefault(base ?? form.buyer_address, defs.buyer_address || contract.customer_address);
    form.buyer_phone = strOrDefault(base ?? form.buyer_phone, defs.buyer_phone || contract.customer_phone);
    form.buyer_bank_name = strOrDefault(base ?? form.buyer_bank_name, defs.buyer_bank_name || contract.customer_bank);
    form.buyer_bank_account = strOrDefault(
      base ?? form.buyer_bank_account,
      defs.buyer_bank_account || contract.customer_account
    );
    if (replaceBuyerFields || !String(form.item_name || '').trim()) form.item_name = defs.item_name || '';
    if (replaceBuyerFields || !String(form.item_unit || '').trim()) form.item_unit = defs.item_unit || '';
    if (replaceBuyerFields || form.item_quantity == null) {
      form.item_quantity = defs.item_quantity == null ? null : Number(defs.item_quantity);
    }
    if (replaceBuyerFields || form.item_unit_price == null) {
      form.item_unit_price = defs.item_unit_price == null ? null : Number(defs.item_unit_price);
    }
    const room = Number(d.summary?.applicable_remaining_amount || 0);
    if ((replaceBuyerFields || form.amount == null) && room > 0) form.amount = Number(room.toFixed(2));
  } catch {
    /* 带出失败不阻断表单 */
  }
}

watch(
  () => form.contract_id,
  (cid) => {
    if (!formOpen.value || editingId.value) return;
    applyContractDefaultsToForm(cid, { replaceBuyerFields: true });
  }
);

watch(formOpen, async (open) => {
  if (!open || editingId.value) return;
  await loadContractOptions();
});

function rowSelectable(row) {
  if (canDeleteRow(row)) return true;
  if (!canManage.value) return false;
  const st = normStatus(row.status);
  return st === 'draft' || st === 'pending_finance';
}

async function openCreate() {
  if (!canManage.value) {
    ElMessage.warning('当前账号无开票申请权限');
    return;
  }
  editingId.value = null;
  editingRowAmount.value = 0;
  resetForm();
  await loadContractOptions();
  formOpen.value = true;
}

async function openEdit(row) {
  if (!canManage.value) {
    ElMessage.warning('当前账号无开票申请权限');
    return;
  }
  editingId.value = row.id;
  editingRowAmount.value = Number(row.amount || 0);
  form.contract_id = Number(row.contract_id);
  form.amount = Number(row.amount || 0);
  form.invoice_type = row.invoice_type || 'special';
  form.tax_rate = row.tax_rate == null ? null : Number(row.tax_rate);
  form.buyer_name = row.buyer_name || '';
  form.buyer_tax_id = row.buyer_tax_id || '';
  form.buyer_address = row.buyer_address || '';
  form.buyer_phone = row.buyer_phone || '';
  form.buyer_bank_name = row.buyer_bank_name || '';
  form.buyer_bank_account = row.buyer_bank_account || '';
  form.item_name = row.item_name || '';
  form.item_unit = row.item_unit || '';
  form.item_quantity = row.item_quantity == null ? null : Number(row.item_quantity);
  form.item_unit_price = row.item_unit_price == null ? null : Number(row.item_unit_price);
  form.remark = row.remark || '';
  contractOptions.value = [{
    id: Number(row.contract_id),
    contract_no: row.contract_no,
    customer_name: row.customer_name,
    status: 'approved'
  }];
  formOpen.value = true;
  let defs = {};
  let customerName = row.customer_name || '';
  try {
    const d = await listContractInvoices(row.contract_id);
    invoiceFormSummary.value = d.summary || { applicable_remaining_amount: 0 };
    defs = d.defaults || {};
    customerName = d.contract?.customer_name || customerName;
  } catch {
    /* 使用开票记录已有字段 */
  }
  form.buyer_name = strOrDefault(row.buyer_name, defs.buyer_name) || customerName;
  form.buyer_tax_id = strOrDefault(row.buyer_tax_id, defs.buyer_tax_id);
  form.buyer_address = strOrDefault(row.buyer_address, defs.buyer_address);
  form.buyer_phone = strOrDefault(row.buyer_phone, defs.buyer_phone);
  form.buyer_bank_name = strOrDefault(row.buyer_bank_name, defs.buyer_bank_name);
  form.buyer_bank_account = strOrDefault(row.buyer_bank_account, defs.buyer_bank_account);
  form.item_name = strOrDefault(row.item_name, defs.item_name);
  form.item_unit = strOrDefault(row.item_unit, defs.item_unit);
  if (row.item_quantity == null && defs.item_quantity != null) form.item_quantity = Number(defs.item_quantity);
  if (row.item_unit_price == null && defs.item_unit_price != null) {
    form.item_unit_price = Number(defs.item_unit_price);
  }
}

async function saveForm(submitToFinance) {
  if (!canManage.value) {
    ElMessage.warning('当前账号无开票申请权限');
    return;
  }
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  formSaving.value = true;
  try {
    const payload = {
      amount: form.amount,
      invoice_type: form.invoice_type,
      tax_rate: form.tax_rate,
      buyer_name: form.buyer_name || undefined,
      buyer_tax_id: form.buyer_tax_id || undefined,
      buyer_address: form.buyer_address || undefined,
      buyer_phone: form.buyer_phone || undefined,
      buyer_bank_name: form.buyer_bank_name || undefined,
      buyer_bank_account: form.buyer_bank_account || undefined,
      item_name: form.item_name || undefined,
      item_unit: form.item_unit || undefined,
      item_quantity: form.item_quantity ?? undefined,
      item_unit_price: form.item_unit_price ?? undefined,
      remark: form.remark || undefined
    };
    if (editingId.value) {
      await updateContractInvoice(editingId.value, payload);
      if (submitToFinance) await submitContractInvoice(editingId.value);
    } else {
      await createContractInvoice(form.contract_id, { ...payload, submit_to_finance: !!submitToFinance });
    }
    ElMessage.success(submitToFinance ? '已提交财务' : '已保存草稿');
    formOpen.value = false;
    loadList();
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '保存失败'));
  } finally {
    formSaving.value = false;
  }
}

async function onSubmit(row) {
  try {
    await ElMessageBox.confirm('确认提交该开票申请给财务？', '提交财务', { type: 'info' });
  } catch {
    return;
  }
  try {
    await submitContractInvoice(row.id);
    ElMessage.success('已提交财务');
    loadList();
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '提交失败'));
  }
}

async function onWithdraw(row) {
  try {
    await ElMessageBox.confirm('确认撤销该开票申请？', '撤销', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await withdrawContractInvoice(row.id);
    ElMessage.success('已撤销');
    loadList();
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '撤销失败'));
  }
}

async function onDelete(row) {
  if (!canDeleteRow(row)) {
    ElMessage.warning('无删除权限或该记录不可删除');
    return;
  }
  try {
    await ElMessageBox.confirm(deleteConfirmText(row), '删除', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await deleteContractInvoice(row.id);
    ElMessage.success('已删除');
    loadList();
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '删除失败'));
  }
}

async function runBatchWithStatus(statusKey, actionLabel, apiFn) {
  const ids = selectedRows.value
    .filter((r) => normStatus(r.status) === statusKey)
    .map((r) => Number(r.id))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) {
    ElMessage.warning(`所选记录中没有可${actionLabel}的数据`);
    return;
  }
  try {
    await ElMessageBox.confirm(`确认${actionLabel} ${ids.length} 条记录？`, `批量${actionLabel}`, { type: 'warning' });
  } catch {
    return;
  }
  let success = 0;
  let fail = 0;
  let firstErr = '';
  for (const id of ids) {
    try {
      await apiFn(id);
      success += 1;
    } catch (e) {
      fail += 1;
      if (!firstErr) firstErr = axiosUserMessage(e, `${actionLabel}失败`);
    }
  }
  if (fail) {
    ElMessage.warning(`${actionLabel}完成：成功 ${success}，失败 ${fail}${firstErr ? `（${firstErr}）` : ''}`);
  } else {
    ElMessage.success(`已${actionLabel} ${success} 条`);
  }
  loadList();
}

async function onBatchSubmit() {
  await runBatchWithStatus('draft', '提交财务', submitContractInvoice);
}

async function onBatchWithdraw() {
  await runBatchWithStatus('pending_finance', '撤销', withdrawContractInvoice);
}

async function onBatchDelete() {
  const ids = selectedRows.value
    .filter((r) => canDeleteRow(r))
    .map((r) => Number(r.id))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) {
    ElMessage.warning('所选记录中没有可删除的数据（需有删除权限、为本人申请，且状态为草稿/待开票/已开票/已取消）');
    return;
  }
  try {
    await ElMessageBox.confirm(`确认删除 ${ids.length} 条开票申请？`, '批量删除', { type: 'warning' });
  } catch {
    return;
  }
  let success = 0;
  let fail = 0;
  let firstErr = '';
  for (const id of ids) {
    try {
      await deleteContractInvoice(id);
      success += 1;
    } catch (e) {
      fail += 1;
      if (!firstErr) firstErr = axiosUserMessage(e, '删除失败');
    }
  }
  if (fail) {
    ElMessage.warning(`删除完成：成功 ${success}，失败 ${fail}${firstErr ? `（${firstErr}）` : ''}`);
  } else {
    ElMessage.success(`已删除 ${success} 条`);
  }
  loadList();
}

function openFulfill(row) {
  fulfillRow.value = row;
  fulfillForm.invoice_no = '';
  fulfillForm.invoice_code = '';
  fulfillForm.invoice_url = '';
  fulfillForm.buyer_name = row.buyer_name || '';
  fulfillForm.buyer_tax_id = row.buyer_tax_id || '';
  fulfillForm.buyer_address = row.buyer_address || '';
  fulfillForm.buyer_phone = row.buyer_phone || '';
  fulfillForm.buyer_bank_name = row.buyer_bank_name || '';
  fulfillForm.buyer_bank_account = row.buyer_bank_account || '';
  fulfillForm.item_name = row.item_name || '';
  fulfillForm.invoice_date = '';
  fulfillOpen.value = true;
}

async function doFulfill() {
  try {
    await fulfillFormRef.value?.validate();
  } catch {
    return;
  }
  fulfillLoading.value = true;
  try {
    await fulfillContractInvoice(fulfillRow.value.id, {
      invoice_no: fulfillForm.invoice_no,
      invoice_code: fulfillForm.invoice_code,
      invoice_url: normalizeInvoiceUrl(fulfillForm.invoice_url),
      buyer_name: fulfillForm.buyer_name || undefined,
      buyer_tax_id: fulfillForm.buyer_tax_id || undefined,
      buyer_address: fulfillForm.buyer_address || undefined,
      buyer_phone: fulfillForm.buyer_phone || undefined,
      buyer_bank_name: fulfillForm.buyer_bank_name || undefined,
      buyer_bank_account: fulfillForm.buyer_bank_account || undefined,
      item_name: fulfillForm.item_name || undefined,
      invoice_date: fulfillForm.invoice_date || undefined
    });
    ElMessage.success('回填成功');
    fulfillOpen.value = false;
    loadList();
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '回填失败'));
  } finally {
    fulfillLoading.value = false;
  }
}

async function openAudits(row) {
  auditsOpen.value = true;
  auditsLoading.value = true;
  audits.value = [];
  try {
    const d = await getContractInvoiceAudits(row.id);
    audits.value = d.audits || [];
  } finally {
    auditsLoading.value = false;
  }
}

onMounted(() => {
  const qs = route.query || {};
  if (qs.status != null && String(qs.status).trim()) status.value = String(qs.status).trim();
  const focusId = Number(qs.focus_invoice_id);
  loadList().then(() => {
    if (!Number.isFinite(focusId) || focusId < 1) return;
    const row = rows.value.find((r) => Number(r.id) === focusId);
    if (row) openDetail(row);
  });
});
</script>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.head-actions {
  display: flex;
  gap: 8px;
}
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.batch-tip {
  font-size: 12px;
  color: #64748b;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.w-full {
  width: 100%;
}
.fulfill-item-summary {
  padding: 10px 12px;
  margin-bottom: 12px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 13px;
  color: #334155;
  line-height: 1.6;
}
.fulfill-item-summary .label {
  color: #64748b;
}
.invoice-detail {
  max-height: 62vh;
  overflow: auto;
}
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e2e8f0;
}
.detail-head-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.detail-head-title .contract {
  font-weight: 600;
  color: #0f172a;
}
.detail-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.detail-row {
  display: grid;
  grid-template-columns: 108px 1fr 32px;
  gap: 8px;
  align-items: start;
  padding: 6px 0;
  border-bottom: 1px dashed #f1f5f9;
}
.detail-label {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
  white-space: nowrap;
}
.detail-value {
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
  word-break: break-all;
}
.detail-copy {
  padding: 0;
  height: 24px;
}
.invoice-apply-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.invoice-apply-dialog__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title {
  font-weight: 600;
}
.actor,
.comment {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}
.mobile-list {
  display: none;
}
.mobile-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  margin-bottom: 10px;
}
.mobile-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.mobile-head-main {
  min-width: 0;
  flex: 1;
}
.mobile-contract {
  display: block;
  font-size: 14px;
  color: #0f172a;
  word-break: break-all;
}
.mobile-customer {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
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
.mobile-amount {
  font-weight: 600;
  color: #0f172a;
}
.mobile-actions {
  margin-top: 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
@media (max-width: 992px) {
  .head {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .head-actions {
    justify-content: flex-end;
  }
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar .el-select,
  .toolbar .el-input {
    width: 100% !important;
  }
  .toolbar .el-button {
    flex: 1 1 calc(50% - 5px);
    min-width: 0;
    margin-left: 0 !important;
  }
  .desktop-table {
    display: none;
  }
  .mobile-list {
    display: block;
  }
  .pager {
    justify-content: center;
  }
  .pager :deep(.el-pagination) {
    flex-wrap: wrap;
    justify-content: center;
    row-gap: 8px;
  }
  .invoice-center :deep(.invoice-apply-dialog) {
    width: calc(100vw - 24px) !important;
    max-width: 100%;
    margin: 12px auto !important;
  }
}
</style>
