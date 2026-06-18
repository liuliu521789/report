<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    width="960px"
    top="5vh"
    destroy-on-close
    @update:model-value="$emit('update:visible', $event)"
  >
    <div v-loading="loading" class="invoice-dialog-inner">
      <div class="invoice-summary">
        <div class="invoice-summary-item">
          <span class="label">合同金额</span>
          <span class="value">{{ money(summary.contract_total) }}</span>
        </div>
        <div class="invoice-summary-item">
          <span class="label">已开票</span>
          <span class="value value--ok">{{ money(summary.invoiced_amount) }}</span>
        </div>
        <div class="invoice-summary-item">
          <span class="label">待开票</span>
          <span class="value value--warn">{{ money(summary.pending_amount) }}</span>
        </div>
        <div class="invoice-summary-item">
          <span class="label">可开余额</span>
          <span class="value">{{ money(summary.remaining_amount) }}</span>
        </div>
        <div class="invoice-summary-item">
          <span class="label">可申请余额</span>
          <span class="value">{{ money(summary.applicable_remaining_amount) }}</span>
        </div>
        <div class="invoice-summary-item">
          <span class="label">开票状态</span>
          <el-tag :type="invoiceStatusTagType(summary.invoice_status)" effect="light">
            {{ invoiceStatusLabel(summary.invoice_status) }}
          </el-tag>
        </div>
      </div>

      <div class="invoice-toolbar">
        <span class="hint">销售提交开票申请后由财务开具发票并回填号码、代码与链接，无需审批。</span>
        <el-button
          v-if="canManage"
          type="primary"
          icon="Plus"
          @click="openCreateForm"
        >新增开票申请</el-button>
      </div>

      <el-table :data="invoices" border size="small" class="invoice-table">
        <el-table-column label="开票金额" width="120" align="right">
          <template #default="{ row }">{{ money(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="发票类型" width="120">
          <template #default="{ row }">{{ invoiceTypeLabel(row.invoice_type) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <span
              class="invoice-status-hit"
              role="button"
              tabindex="0"
              title="点击查看处理记录"
              @click="openAudits(row)"
              @keydown.enter.prevent="openAudits(row)"
            >
              <SalesStatusPill kind="invoice" :status="row.status" />
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="invoice_no" label="发票号码" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.invoice_no || '—' }}</template>
        </el-table-column>
        <el-table-column prop="invoice_code" label="发票代码" width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.invoice_code || '—' }}</template>
        </el-table-column>
        <el-table-column label="发票链接" min-width="100">
          <template #default="{ row }">
            <el-link v-if="row.invoice_url" :href="row.invoice_url" target="_blank" type="primary">查看</el-link>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="开票日期" width="110">
          <template #default="{ row }">{{ row.invoice_date || '—' }}</template>
        </el-table-column>
        <el-table-column label="申请人" width="90">
          <template #default="{ row }">{{ row.created_by_real_name || row.created_by_username || '—' }}</template>
        </el-table-column>
        <el-table-column label="回填人" width="90">
          <template #default="{ row }">{{ row.issued_by_real_name || row.issued_by_username || '—' }}</template>
        </el-table-column>
        <el-table-column label="回填时间" width="160">
          <template #default="{ row }">{{ row.issued_at ? formatTime(row.issued_at) : '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canEdit(row)" link type="primary" @click="openEditForm(row)">编辑</el-button>
            <el-button v-if="canSubmit(row)" link type="primary" @click="onSubmit(row)">提交财务</el-button>
            <el-button v-if="canWithdraw(row)" link type="warning" @click="onWithdraw(row)">撤销</el-button>
            <el-button v-if="canFulfillRow(row)" link type="success" @click="openFulfill(row)">回填发票</el-button>
            <el-button v-if="canDeleteRow(row)" link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !invoices.length" description="暂无开票记录" :image-size="60" />
    </div>

    <!-- 新增/编辑申请表单（不含发票号码，由财务回填） -->
    <el-dialog
      v-model="formOpen"
      :title="editingId ? '编辑开票申请' : '新增开票申请'"
      width="720px"
      top="6vh"
      append-to-body
      destroy-on-close
      class="invoice-apply-dialog"
    >
      <SalesInvoiceApplyForm
        ref="invoiceFormRef"
        :form="form"
        :rules="formRules"
        :max-applicable-amount="maxApplicableAmountForForm"
        :tax-amount-display="formTaxAmountDisplay"
        :summary="summary"
      />
      <template #footer>
        <div class="invoice-apply-dialog__footer">
          <el-button icon="Close" @click="formOpen = false">取消</el-button>
          <div class="invoice-apply-dialog__actions">
            <el-button :loading="formSubmitting" @click="saveForm(false)">保存草稿</el-button>
            <el-button type="primary" :loading="formSubmitting" icon="Check" @click="saveForm(true)">提交财务</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 财务回填发票 -->
    <el-dialog v-model="fulfillOpen" title="财务回填发票" width="480px" append-to-body destroy-on-close>
      <p class="hint mb12">请填写已开具发票的号码、代码与下载/查看链接。</p>
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
          <el-input v-model="fulfillForm.invoice_no" maxlength="64" clearable />
        </el-form-item>
        <el-form-item label="发票代码" prop="invoice_code">
          <el-input v-model="fulfillForm.invoice_code" maxlength="64" clearable />
        </el-form-item>
        <el-form-item label="发票链接" prop="invoice_url">
          <el-input
            v-model="fulfillForm.invoice_url"
            maxlength="512"
            clearable
            placeholder="PDF 或电子发票地址，可省略 https://"
          />
        </el-form-item>
        <el-form-item label="开票日期">
          <el-date-picker v-model="fulfillForm.invoice_date" type="date" value-format="YYYY-MM-DD" class="w-full" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button icon="Close" @click="fulfillOpen = false">取消</el-button>
        <el-button type="primary" :loading="fulfillLoading" icon="Check" @click="doFulfill">确认已开票</el-button>
      </template>
    </el-dialog>

    <!-- 处理记录时间轴 -->
    <el-dialog v-model="auditsOpen" title="开票处理记录" width="440px" append-to-body destroy-on-close>
      <div v-loading="auditsLoading" class="audits-panel">
        <el-timeline v-if="audits.length">
          <el-timeline-item
            v-for="a in audits"
            :key="a.id"
            :timestamp="formatTime(a.created_at)"
            :type="auditDotType(a)"
          >
            <div class="audit-title">{{ auditTitle(a) }}</div>
            <div class="audit-actor">{{ a.actor_real_name || a.actor_username || '—' }}</div>
            <div v-if="a.comment_text" class="audit-comment">{{ a.comment_text }}</div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else-if="!auditsLoading" description="暂无记录" :image-size="56" />
      </div>
    </el-dialog>

    <template #footer>
      <el-button icon="Close" @click="$emit('update:visible', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SalesStatusPill from '../../components/SalesStatusPill.vue';
import SalesInvoiceApplyForm from '../../components/SalesInvoiceApplyForm.vue';
import { axiosUserMessage } from '../../utils/apiUserMessage';
import { isValidInvoiceHttpUrl, normalizeInvoiceUrl } from '../../../../shared/invoiceUrl.js';
import {
  listContractInvoices,
  createContractInvoice,
  updateContractInvoice,
  deleteContractInvoice,
  submitContractInvoice,
  withdrawContractInvoice,
  fulfillContractInvoice,
  getContractInvoiceAudits
} from '../../api';

const props = defineProps({
  visible: Boolean,
  contractId: { type: [Number, String], default: null },
  contractNo: { type: String, default: '' }
});

const emit = defineEmits(['update:visible', 'changed']);

const loading = ref(false);
const invoices = ref([]);
const summary = reactive({
  contract_total: 0,
  invoiced_amount: 0,
  pending_amount: 0,
  remaining_amount: 0,
  applicable_remaining_amount: 0,
  invoice_status: 'none'
});
const canManage = ref(false);
const canFulfill = ref(false);
const canDelete = ref(false);
const isSuper = ref(false);
const contractInfo = ref(null);
const defaults = ref({});

const dialogTitle = computed(() => `合同开票${props.contractNo ? ' · ' + props.contractNo : ''}`);
const maxApplicableAmountForForm = computed(() => {
  const v = Number(summary.applicable_remaining_amount || 0);
  return v > 0 ? Number(v.toFixed(2)) : 0.01;
});
const formTaxAmountDisplay = computed(() => {
  const amt = Number(form.amount || 0);
  const rate = form.tax_rate == null ? NaN : Number(form.tax_rate);
  if (!(amt > 0) || !Number.isFinite(rate) || rate < 0) return '—';
  return money(amt * rate);
});

function money(v) {
  const n = Number(v || 0);
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function invoiceStatusLabel(s) {
  if (s === 'full') return '已开票';
  if (s === 'partial') return '部分开票';
  return '未开票';
}
function invoiceStatusTagType(s) {
  if (s === 'full') return 'success';
  if (s === 'partial') return 'warning';
  return 'info';
}
function invoiceTypeLabel(t) {
  if (t === 'normal') return '增值税普通发票';
  if (t === 'electronic') return '电子普通发票';
  return '增值税专用发票';
}

function normStatus(row) {
  const s = row?.status || 'draft';
  if (s === 'pending_review') return 'pending_finance';
  if (s === 'approved') return 'issued';
  if (s === 'rejected') return 'draft';
  return s;
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
  const uid = myUserId();
  return uid != null && row?.created_by != null && Number(row.created_by) === Number(uid);
}

function canEdit(row) {
  return canManage.value && isMine(row) && normStatus(row) === 'draft';
}
function canSubmit(row) {
  return canManage.value && isMine(row) && normStatus(row) === 'draft';
}
function canWithdraw(row) {
  return canManage.value && isMine(row) && normStatus(row) === 'pending_finance';
}
function canDeleteRow(row) {
  if (!canDelete.value || !isDeletableInvoiceStatus(row)) return false;
  return isSuper.value || isMine(row);
}

function isDeletableInvoiceStatus(row) {
  const st = normStatus(row?.status);
  return st === 'draft' || st === 'pending_finance' || st === 'issued' || st === 'cancelled';
}

function deleteConfirmText(row) {
  const st = normStatus(row?.status);
  if (st === 'issued') return `该开票申请（${money(row.amount)}）已开票，删除后无法恢复（测试清理），确认删除？`;
  return `确定删除该开票申请（${money(row.amount)}）？`;
}
function canFulfillRow(row) {
  return canFulfill.value && normStatus(row) === 'pending_finance';
}

async function loadInvoices() {
  const cid = Number(props.contractId);
  if (!Number.isFinite(cid) || cid < 1) return;
  loading.value = true;
  try {
    const d = await listContractInvoices(cid);
    invoices.value = d.items || [];
    Object.assign(summary, d.summary || {});
    canManage.value = !!d.can_manage;
    canFulfill.value = !!d.can_fulfill;
    canDelete.value = !!d.can_delete;
    isSuper.value = !!d.is_super;
    contractInfo.value = d.contract || null;
    defaults.value = d.defaults || {};
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '加载开票记录失败'));
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.visible, props.contractId],
  async ([vis, cid]) => {
    if (!vis) return;
    await nextTick();
    if (cid == null || cid === '') return;
    await loadInvoices();
  }
);

/* ---------- 新增/编辑表单 ---------- */
const formOpen = ref(false);
const formSubmitting = ref(false);
const editingId = ref(null);
const invoiceFormRef = ref(null);
const form = reactive({
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
const formRules = {
  amount: [
    { required: true, message: '请填写开票金额', trigger: 'change' },
    {
      validator: (_rule, value, cb) => {
        const n = Number(value || 0);
        const max = Number(summary.applicable_remaining_amount || 0);
        if (!(n > 0)) return cb(new Error('请填写开票金额'));
        if (n > max + 0.0001) return cb(new Error('开票金额超过可申请余额'));
        return cb();
      },
      trigger: 'change'
    }
  ],
  invoice_type: [{ required: true, message: '请选择发票类型', trigger: 'change' }]
};

function strOrDefault(val, fallback) {
  const s = val != null ? String(val).trim() : '';
  return s || (fallback != null ? String(fallback).trim() : '') || '';
}

function resetForm() {
  const d = defaults.value || {};
  const c = contractInfo.value || {};
  form.amount = null;
  form.invoice_type = 'special';
  form.tax_rate = d.tax_rate == null ? null : Number(d.tax_rate);
  form.buyer_name = strOrDefault(d.buyer_name, c.customer_name);
  form.buyer_tax_id = strOrDefault(d.buyer_tax_id, c.customer_tax_id);
  form.buyer_address = strOrDefault(d.buyer_address, c.customer_address);
  form.buyer_phone = strOrDefault(d.buyer_phone, c.customer_phone);
  form.buyer_bank_name = strOrDefault(d.buyer_bank_name, c.customer_bank);
  form.buyer_bank_account = strOrDefault(d.buyer_bank_account, c.customer_account);
  form.item_name = d.item_name || '';
  form.item_unit = d.item_unit || '';
  form.item_quantity = d.item_quantity ?? null;
  form.item_unit_price = d.item_unit_price ?? null;
  if (form.amount == null) {
    const room = Number(summary.applicable_remaining_amount || 0);
    if (room > 0) form.amount = Number(room.toFixed(2));
  }
  form.remark = '';
}

async function openCreateForm() {
  if (contractInfo.value && contractInfo.value.status !== 'approved') {
    ElMessage.warning('仅「已审核通过」的合同可开票');
    return;
  }
  await loadInvoices();
  editingId.value = null;
  resetForm();
  formOpen.value = true;
}

function openEditForm(row) {
  const d = defaults.value || {};
  editingId.value = row.id;
  form.amount = Number(row.amount);
  form.invoice_type = row.invoice_type || 'special';
  form.tax_rate = row.tax_rate == null ? null : Number(row.tax_rate);
  form.buyer_name = strOrDefault(row.buyer_name, d.buyer_name) || contractInfo.value?.customer_name || '';
  form.buyer_tax_id = strOrDefault(row.buyer_tax_id, d.buyer_tax_id);
  form.buyer_address = strOrDefault(row.buyer_address, d.buyer_address);
  form.buyer_phone = strOrDefault(row.buyer_phone, d.buyer_phone);
  form.buyer_bank_name = strOrDefault(row.buyer_bank_name, d.buyer_bank_name);
  form.buyer_bank_account = strOrDefault(row.buyer_bank_account, d.buyer_bank_account);
  form.item_name = strOrDefault(row.item_name, d.item_name);
  form.item_unit = strOrDefault(row.item_unit, d.item_unit);
  form.item_quantity =
    row.item_quantity == null ? (d.item_quantity ?? null) : Number(row.item_quantity);
  form.item_unit_price =
    row.item_unit_price == null ? (d.item_unit_price ?? null) : Number(row.item_unit_price);
  form.remark = row.remark || '';
  formOpen.value = true;
}

async function saveForm(submitToFinance) {
  try {
    await invoiceFormRef.value?.validate();
  } catch {
    return;
  }
  formSubmitting.value = true;
  try {
    if (editingId.value) {
      await updateContractInvoice(editingId.value, {
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
      });
      if (submitToFinance) await submitContractInvoice(editingId.value);
      ElMessage.success(submitToFinance ? '已提交财务' : '已保存');
    } else {
      await createContractInvoice(props.contractId, {
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
        remark: form.remark || undefined,
        submit_to_finance: !!submitToFinance
      });
      ElMessage.success(submitToFinance ? '已提交财务' : '已保存草稿');
    }
    formOpen.value = false;
    await loadInvoices();
    emit('changed');
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '保存失败'));
  } finally {
    formSubmitting.value = false;
  }
}

async function onDelete(row) {
  if (!canDeleteRow(row)) {
    ElMessage.warning('无删除权限或该记录不可删除');
    return;
  }
  try {
    await ElMessageBox.confirm(deleteConfirmText(row), '删除开票', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await deleteContractInvoice(row.id);
    ElMessage.success('已删除');
    await loadInvoices();
    emit('changed');
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '删除失败'));
  }
}

async function onSubmit(row) {
  try {
    await ElMessageBox.confirm('提交后财务将收到开票待办，是否继续？', '提交财务开票', { type: 'info' });
  } catch {
    return;
  }
  try {
    await submitContractInvoice(row.id);
    ElMessage.success('已提交财务');
    await loadInvoices();
    emit('changed');
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '提交失败'));
  }
}

async function onWithdraw(row) {
  try {
    await ElMessageBox.confirm('撤销后可继续编辑，是否继续？', '撤销开票申请', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await withdrawContractInvoice(row.id);
    ElMessage.success('已撤销');
    await loadInvoices();
    emit('changed');
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '撤销失败'));
  }
}

/* ---------- 财务回填 ---------- */
const fulfillOpen = ref(false);
const fulfillLoading = ref(false);
const fulfillRow = ref(null);
const fulfillFormRef = ref(null);
const fulfillForm = reactive({
  invoice_no: '',
  invoice_code: '',
  invoice_url: '',
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

function openFulfill(row) {
  fulfillRow.value = row;
  fulfillForm.invoice_no = '';
  fulfillForm.invoice_code = '';
  fulfillForm.invoice_url = '';
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
      invoice_no: fulfillForm.invoice_no.trim(),
      invoice_code: fulfillForm.invoice_code.trim(),
      invoice_url: normalizeInvoiceUrl(fulfillForm.invoice_url.trim()),
      invoice_date: fulfillForm.invoice_date || undefined
    });
    ElMessage.success('发票信息已回填');
    fulfillOpen.value = false;
    await loadInvoices();
    emit('changed');
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '回填失败'));
  } finally {
    fulfillLoading.value = false;
  }
}

/* ---------- 处理记录 ---------- */
const auditsOpen = ref(false);
const auditsLoading = ref(false);
const audits = ref([]);
async function openAudits(row) {
  auditsOpen.value = true;
  auditsLoading.value = true;
  audits.value = [];
  try {
    const d = await getContractInvoiceAudits(row.id);
    audits.value = d.audits || [];
  } catch {
    audits.value = [];
  } finally {
    auditsLoading.value = false;
  }
}
function formatTime(t) {
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return String(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function auditTitle(a) {
  if (a.action === 'submit_finance' || a.action === 'submit') return '提交财务';
  if (a.action === 'withdraw_submit') return '撤销申请';
  if (a.action === 'fulfill') return '财务已开票';
  if (a.action === 'review') return a.result === 'rejected' ? '审批不通过' : '审批通过';
  return a.action || '操作';
}
function auditDotType(a) {
  if (a.action === 'fulfill') return 'success';
  if (a.action === 'withdraw_submit') return 'warning';
  return 'primary';
}
</script>

<style scoped>
.invoice-dialog-inner {
  min-height: 200px;
}
.invoice-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  padding: 12px 16px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 12px;
}
.invoice-summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.invoice-summary-item .label {
  font-size: 12px;
  color: #64748b;
}
.invoice-summary-item .value {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}
.invoice-summary-item .value--ok {
  color: #16a34a;
}
.invoice-summary-item .value--warn {
  color: #d97706;
}
.invoice-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.invoice-toolbar .hint {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}
.invoice-table {
  width: 100%;
}
.invoice-status-hit {
  display: inline-flex;
  cursor: pointer;
  outline: none;
}
.audits-panel {
  min-height: 120px;
}
.audit-title {
  font-weight: 600;
  font-size: 13px;
}
.audit-actor {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}
.audit-comment {
  font-size: 12px;
  color: #475569;
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-word;
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
.mb12 {
  margin-bottom: 12px;
}
.hint {
  font-size: 12px;
  color: #64748b;
}
</style>
