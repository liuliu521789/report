<template>
  <div class="invoice-apply-shell">
    <div v-if="showSummaryBanner" class="invoice-apply-summary">
      <div class="invoice-apply-summary__main">
        <span class="invoice-apply-summary__label">可申请余额</span>
        <span class="invoice-apply-summary__value">{{ money(summary.applicable_remaining_amount) }}</span>
      </div>
      <div v-if="hasExtendedSummary" class="invoice-apply-summary__meta">
        <span v-if="summary.contract_total != null">合同 {{ money(summary.contract_total) }}</span>
        <span v-if="summary.invoiced_amount != null">已开 {{ money(summary.invoiced_amount) }}</span>
        <span v-if="summary.pending_amount != null">待开 {{ money(summary.pending_amount) }}</span>
      </div>
    </div>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="96px"
      label-position="right"
      class="invoice-apply-form"
    >
      <section v-if="showContract" class="invoice-apply-section">
        <header class="invoice-apply-section__head">
          <span class="invoice-apply-section__title">关联合同</span>
          <span class="invoice-apply-section__hint">与合同列表同源，仅「已通过」可开票</span>
        </header>
        <div class="invoice-apply-section__body">
          <el-form-item label="合同" prop="contract_id" class="invoice-apply-field--full">
            <el-select
              :model-value="contractId"
              filterable
              clearable
              :disabled="contractDisabled"
              :loading="contractSearchLoading"
              placeholder="请选择合同"
              teleported
              popper-class="invoice-apply-contract-popper"
              class="w-full"
              no-data-text="暂无合同，请确认合同列表有数据"
              @update:model-value="onContractIdChange"
              @visible-change="onContractDropdownVisible"
            >
              <el-option
                v-for="c in contractOptions"
                :key="c.id"
                :label="contractOptionLabel(c)"
                :value="c.id"
                :disabled="c.status !== 'approved'"
              />
            </el-select>
            <p v-if="contractOptionsHint" class="invoice-contract-empty">{{ contractOptionsHint }}</p>
          </el-form-item>
        </div>
      </section>

      <section class="invoice-apply-section">
        <header class="invoice-apply-section__head">
          <span class="invoice-apply-section__title">金额与类型</span>
          <span class="invoice-apply-section__hint">提交后由财务开具发票并回填号码</span>
        </header>
        <div class="invoice-apply-section__body invoice-apply-grid">
          <el-form-item label="开票金额" prop="amount">
            <el-input-number
              v-model="form.amount"
              :min="0.01"
              :max="maxApplicableAmount"
              :precision="2"
              :step="100"
              controls-position="right"
              class="w-full"
            />
          </el-form-item>
          <el-form-item label="发票类型" prop="invoice_type">
            <el-select v-model="form.invoice_type" class="w-full">
              <el-option label="增值税专用发票" value="special" />
              <el-option label="增值税普通发票" value="normal" />
              <el-option label="电子普通发票" value="electronic" />
            </el-select>
          </el-form-item>
          <el-form-item label="税率">
            <el-select v-model="form.tax_rate" clearable placeholder="可选" class="w-full">
              <el-option label="13%" :value="0.13" />
              <el-option label="9%" :value="0.09" />
              <el-option label="6%" :value="0.06" />
              <el-option label="3%" :value="0.03" />
              <el-option label="0%" :value="0" />
            </el-select>
          </el-form-item>
          <el-form-item label="税额">
            <el-input :model-value="taxAmountDisplay" disabled placeholder="自动计算">
              <template v-if="taxAmountDisplay !== '—'" #suffix>
                <span class="invoice-apply-tax-tag">自动</span>
              </template>
            </el-input>
          </el-form-item>
        </div>
      </section>

      <section class="invoice-apply-section">
        <header class="invoice-apply-section__head">
          <span class="invoice-apply-section__title">购方信息</span>
        </header>
        <div class="invoice-apply-section__body invoice-apply-grid">
          <el-form-item label="购方名称" class="invoice-apply-field--full">
            <el-input v-model="form.buyer_name" maxlength="256" clearable placeholder="发票抬头" />
          </el-form-item>
          <el-form-item label="购方税号" class="invoice-apply-field--full">
            <el-input v-model="form.buyer_tax_id" maxlength="64" clearable placeholder="统一社会信用代码" />
          </el-form-item>
          <el-form-item label="注册地址" class="invoice-apply-field--full">
            <el-input v-model="form.buyer_address" maxlength="512" clearable />
          </el-form-item>
          <el-form-item label="联系电话">
            <el-input v-model="form.buyer_phone" maxlength="64" clearable />
          </el-form-item>
          <el-form-item label="开户行">
            <el-input v-model="form.buyer_bank_name" maxlength="256" clearable />
          </el-form-item>
          <el-form-item label="银行账号" class="invoice-apply-field--full">
            <el-input v-model="form.buyer_bank_account" maxlength="128" clearable />
          </el-form-item>
        </div>
      </section>

      <section class="invoice-apply-section">
        <header class="invoice-apply-section__head">
          <span class="invoice-apply-section__title">商品明细</span>
        </header>
        <div class="invoice-apply-section__body invoice-apply-grid invoice-apply-grid--items">
          <el-form-item label="商品/服务" class="invoice-apply-field--full">
            <el-input v-model="form.item_name" maxlength="512" clearable placeholder="商品或服务名称" />
          </el-form-item>
          <el-form-item label="计量单位">
            <el-input v-model="form.item_unit" maxlength="32" clearable placeholder="吨、千克、件" />
          </el-form-item>
          <el-form-item label="数量">
            <el-input-number
              v-model="form.item_quantity"
              :min="0.0001"
              :precision="4"
              controls-position="right"
              class="w-full"
            />
          </el-form-item>
          <el-form-item label="单价">
            <el-input-number
              v-model="form.item_unit_price"
              :min="0.0001"
              :precision="4"
              controls-position="right"
              class="w-full"
            />
          </el-form-item>
        </div>
      </section>

      <section class="invoice-apply-section invoice-apply-section--last">
        <header class="invoice-apply-section__head">
          <span class="invoice-apply-section__title">备注</span>
          <span class="invoice-apply-section__hint">可选</span>
        </header>
        <div class="invoice-apply-section__body invoice-apply-remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            maxlength="1024"
            show-word-limit
            placeholder="补充说明给财务"
          />
        </div>
      </section>
    </el-form>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { contractStatusShortLabel } from '../utils/salesStatusDisplay';

const props = defineProps({
  form: { type: Object, required: true },
  rules: { type: Object, default: () => ({}) },
  maxApplicableAmount: { type: Number, default: 0.01 },
  taxAmountDisplay: { type: String, default: '—' },
  showContract: { type: Boolean, default: false },
  contractDisabled: { type: Boolean, default: false },
  contractId: { type: Number, default: null },
  contractOptions: { type: Array, default: () => [] },
  contractOptionsHint: { type: String, default: '' },
  contractSearchLoading: { type: Boolean, default: false },
  summary: {
    type: Object,
    default: () => ({ applicable_remaining_amount: 0 })
  },
  showSummary: { type: Boolean, default: true }
});

const emit = defineEmits(['update:contractId', 'contract-dropdown-visible']);

const formRef = ref(null);

const showSummaryBanner = computed(() => {
  if (!props.showSummary) return false;
  const room = Number(props.summary?.applicable_remaining_amount ?? NaN);
  return Number.isFinite(room) && room >= 0;
});

const hasExtendedSummary = computed(() => {
  const s = props.summary || {};
  return s.contract_total != null || s.invoiced_amount != null || s.pending_amount != null;
});

function money(v) {
  const n = Number(v || 0);
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeContractId(id) {
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function contractOptionLabel(c) {
  const no = c?.contract_no || '—';
  const customer = c?.customer_name || '';
  const status = contractStatusShortLabel(c?.status);
  const base = customer ? `${no} / ${customer}` : no;
  return c?.status === 'approved' ? base : `${base}（${status}，不可开票）`;
}

function onContractIdChange(value) {
  emit('update:contractId', normalizeContractId(value));
}

function onContractDropdownVisible(visible) {
  emit('contract-dropdown-visible', visible);
}

async function validate() {
  return formRef.value?.validate();
}

defineExpose({ validate, formRef });
</script>

<style scoped>
.invoice-apply-shell {
  max-height: min(68vh, 640px);
  overflow: auto;
  padding-right: 2px;
}

.invoice-apply-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  margin-bottom: 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(34, 197, 94, 0.03));
  border: 1px solid rgba(34, 197, 94, 0.18);
}

.invoice-apply-summary__main {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.invoice-apply-summary__label {
  font-size: 13px;
  color: #64748b;
}

.invoice-apply-summary__value {
  font-size: 20px;
  font-weight: 700;
  color: #15803d;
  letter-spacing: 0.02em;
}

.invoice-apply-summary__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  font-size: 12px;
  color: #64748b;
}

.invoice-apply-section {
  margin-bottom: 14px;
  border: 1px solid rgba(15, 23, 42, 0.07);
  border-radius: 12px;
  background: #fff;
}

.invoice-apply-section--last {
  margin-bottom: 0;
}

.invoice-apply-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  background: #f8fafc;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}

.invoice-apply-section__title {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.invoice-apply-section__hint {
  font-size: 12px;
  color: #94a3b8;
}

.invoice-apply-section__body {
  padding: 14px 14px 2px;
}

.invoice-apply-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 16px;
}

.invoice-apply-grid--items {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.invoice-apply-field--full {
  grid-column: 1 / -1;
}

.invoice-apply-remark :deep(.el-textarea__inner) {
  min-height: 72px;
}

.invoice-apply-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.invoice-apply-form :deep(.el-form-item__label) {
  white-space: nowrap;
  font-size: 13px;
  color: #475569;
  line-height: 32px;
  padding-right: 10px;
}

.invoice-apply-form :deep(.el-input-number) {
  width: 100%;
}

.invoice-apply-form :deep(.el-input-number .el-input__inner) {
  text-align: left;
}

.invoice-apply-tax-tag {
  font-size: 11px;
  color: #94a3b8;
}

.w-full {
  width: 100%;
}

@media (max-width: 720px) {
  .invoice-apply-grid,
  .invoice-apply-grid--items {
    grid-template-columns: 1fr;
  }

  .invoice-apply-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    line-height: 1.4;
    padding-bottom: 4px;
  }

  .invoice-apply-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }
}
</style>

<style>
.invoice-apply-dialog.el-dialog .el-dialog__body {
  padding-top: 14px;
  padding-bottom: 8px;
}

.invoice-apply-contract-popper {
  z-index: 5000 !important;
}

.invoice-apply-section__body {
  padding: 14px 14px 2px;
}

.invoice-apply-field--full {
  width: 100%;
}

.invoice-apply-field--full :deep(.el-form-item__content) {
  width: 100%;
}

.invoice-contract-empty {
  margin: 6px 0 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}
</style>
