<template>
  <el-dialog
    v-model="dialogOpen"
    :title="editRow ? '修改订单' : '录入订单'"
    width="min(760px, 96vw)"
    top="4vh"
    class="order-form-dialog"
    destroy-on-close
    @close="onDialogClose"
    @opened="onDialogOpened"
  >
    <div class="order-form-dialog__hotkey-scope" @keydown="onFormKeydown">
    <el-collapse v-model="hintOpen" class="form-hint-collapse">
      <el-collapse-item name="hint">
        <template #title>
          <span class="form-hint-collapse__title">填写说明</span>
          <span class="form-hint-collapse__brief">订单号自动生成 · 金额随数量/规格/单价自动计算 · 单价按元/kg 录入</span>
        </template>
        <p class="form-hint">
          订单号由系统自动生成，保存后出现。发货日期为您填写的业务日期；上传日期在首次保存时自动记录。
          金额（价税合计）= 含税单价（元/吨）× 吨数；吨数 = 数量（桶/吨桶）× 规格（KG，自动换算为吨）。
          规格只需填写千克数值，数量与剩余只需填写数值并分别选择「桶」或「吨桶」。单价以（元/kg）输入。
          支持 Ctrl+Enter 快捷保存。
        </p>
      </el-collapse-item>
    </el-collapse>

    <div ref="formBodyRef" class="order-form-body">
      <div v-for="section in formSections" :key="section.key" class="order-form-section">
        <div class="order-form-section__title">{{ section.title }}</div>
        <el-form :model="formData" label-width="108px" class="order-form-grid">
          <el-form-item
            v-for="col in section.fields"
            :key="col.field_key"
            :label="col.label_zh"
            :required="!!col.required"
            :error="formErrors[col.field_key]"
            :class="fieldItemClass(col)"
          >
            <!-- 厂家：联想搜索 -->
            <el-autocomplete
              v-if="col.maps_to === 'customer_name'"
              :ref="(el) => setFieldRef(col.field_key, el)"
              v-model="formData[col.field_key]"
              :fetch-suggestions="fetchCustomerSuggestions"
              :trigger-on-focus="showCustomerAddLink"
              :debounce="300"
              clearable
              placeholder="输入厂家名称，可联想已有客户"
              class="w-full"
              value-key="value"
              @select="(item) => onCustomerPick(item, col)"
              @input="onFieldInput(col)"
            >
              <template #default="{ item }">
                <div
                  v-if="item.isAddFooter"
                  class="ac-add-footer"
                  @mousedown.prevent
                  @click.stop="goAddCustomer"
                >
                  没找到厂家？<span class="ac-add-link">去添加</span>
                </div>
                <div v-else class="ac-item">
                  <span class="ac-item__main">{{ item.value }}</span>
                  <span v-if="item.contact_name && item.contact_name !== item.value" class="ac-item__sub">{{ item.contact_name }}</span>
                  <span
                    v-else-if="showCustomerEditLink && customerMissingContactName(item)"
                    class="ac-item__action ac-add-link"
                    @mousedown.prevent
                    @click.stop="goEditCustomer(item)"
                  >去编辑</span>
                </div>
              </template>
            </el-autocomplete>

            <!-- 标签型号：联想搜索 -->
            <el-autocomplete
              v-else-if="col.maps_to === 'product_model'"
              :ref="(el) => setFieldRef(col.field_key, el)"
              v-model="formData[col.field_key]"
              :fetch-suggestions="fetchProductModelSuggestions"
              :trigger-on-focus="!!productSuggestions.length || showProductModelAddLink"
              :debounce="200"
              clearable
              popper-class="product-model-ac-popper"
              :placeholder="productSuggestions.length ? '选择或输入标签型号' : '输入标签型号'"
              class="w-full"
              value-key="value"
              @select="(item) => onProductModelPick(item, col)"
              @input="onProductModelInput(col)"
              @clear="onProductModelClear(col)"
            >
              <template #default="{ item }">
                <div
                  v-if="item.isAddFooter"
                  class="ac-add-footer"
                  @mousedown.prevent
                  @click.stop="goAddProductModel"
                >
                  没找到标签型号？<span class="ac-add-link">去添加</span>
                </div>
                <div v-else class="ac-item">
                  <span class="ac-item__main">{{ item.value }}</span>
                  <span v-if="item.unit_price != null" class="ac-item__sub">{{ formatPriceHint(item.unit_price) }}</span>
                </div>
              </template>
            </el-autocomplete>

            <!-- 发货日期 -->
            <el-date-picker
              v-else-if="col.field_type === 'date'"
              :ref="(el) => setFieldRef(col.field_key, el)"
              v-model="formData[col.field_key]"
              type="date"
              value-format="YYYY-MM-DD"
              format="YYYY-MM-DD"
              placeholder="选择日期"
              class="w-full"
              clearable
              @change="onFieldInput(col)"
            />

            <!-- 金额：自动计算只读 -->
            <el-input
              v-else-if="col.maps_to === 'amount'"
              v-model="formData[col.field_key]"
              readonly
              placeholder="填写数量、规格、单价后自动计算"
              class="w-full is-readonly"
            >
              <template #suffix>
                <span class="field-suffix">元</span>
              </template>
            </el-input>

            <!-- 单价 -->
            <div v-else-if="isUnitPriceField(col)" class="order-price-wrap">
              <el-input-number
                :ref="(el) => setFieldRef(col.field_key, el)"
                v-model="formData[col.field_key]"
                :precision="2"
                :step="0.01"
                :controls="false"
                class="order-price-input"
                placeholder="请输入"
                @change="onNumberChange(col)"
              />
              <span class="order-price-unit">元/kg</span>
            </div>

            <!-- 规格：仅填数值，单位 KG -->
            <div v-else-if="isSpecField(col)" class="order-field-with-unit">
              <el-input-number
                :ref="(el) => setFieldRef(col.field_key, el)"
                v-model="formData[col.field_key]"
                :precision="2"
                :step="0.01"
                :controls="false"
                class="order-field-input"
                placeholder="请输入"
                @change="onNumberChange(col)"
              />
              <span class="order-field-unit">KG</span>
            </div>

            <!-- 数量：仅填数值，单位 桶/吨桶 -->
            <div v-else-if="isQuantityField(col)" class="order-field-with-unit">
              <el-input-number
                :ref="(el) => setFieldRef(col.field_key, el)"
                v-model="formData[col.field_key]"
                :precision="2"
                :step="0.01"
                :controls="false"
                class="order-field-input"
                placeholder="请输入"
                @change="onNumberChange(col)"
              />
              <el-select
                v-model="quantityUnit"
                class="order-qty-unit-select"
                @change="onQuantityUnitChange(col)"
              >
                <el-option label="桶" value="桶" />
                <el-option label="吨桶" value="吨桶" />
              </el-select>
            </div>

            <!-- 剩余：仅填数值，单位 桶/吨桶 -->
            <div v-else-if="isRemainingField(col)" class="order-field-with-unit">
              <el-input-number
                :ref="(el) => setFieldRef(col.field_key, el)"
                v-model="formData[col.field_key]"
                :precision="2"
                :step="0.01"
                :controls="false"
                class="order-field-input"
                placeholder="请输入"
                @change="onNumberChange(col)"
              />
              <el-select
                v-model="remainingUnit"
                class="order-qty-unit-select"
                @change="onRemainingUnitChange(col)"
              >
                <el-option label="桶" value="桶" />
                <el-option label="吨桶" value="吨桶" />
              </el-select>
            </div>

            <el-input
              v-else-if="col.field_type === 'text'"
              :ref="(el) => setFieldRef(col.field_key, el)"
              v-model="formData[col.field_key]"
              clearable
              @input="onFieldInput(col)"
            />

            <el-input
              v-else-if="col.field_type === 'textarea'"
              v-model="formData[col.field_key]"
              type="textarea"
              :rows="2"
              @input="onFieldInput(col)"
            />

            <el-input-number
              v-else-if="col.field_type === 'number' || col.field_type === 'positive_number'"
              v-model="formData[col.field_key]"
              :min="col.field_type === 'positive_number' ? 0.0001 : undefined"
              :precision="4"
              :controls="false"
              class="w-full"
              @change="onNumberChange(col)"
            />
          </el-form-item>
        </el-form>
      </div>
    </div>
    </div>

    <template #footer>
      <div class="order-form-footer" @keydown="onFormKeydown">
        <span class="order-form-footer__tip">Ctrl + Enter 保存</span>
        <div class="order-form-footer__actions">
          <el-button @click="dialogOpen = false" icon="Close">取消</el-button>
          <el-button
            v-if="!editRow"
            type="primary"
            plain
            :loading="saving"
            @click="saveForm(true)"
            icon="Plus"
          >保存并继续</el-button>
          <el-button type="primary" :loading="saving" @click="saveForm(false)" icon="Check">保存</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, nextTick, computed, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  createSalesOrder,
  patchSalesOrder,
  lookupCustomerPrice,
  listSalesCustomers,
  listCustomerPrices,
  listCustomerPriceSuggestions,
  listCustomerModelMappings
} from '../../api';
import { perm } from '../../utils/permissions.js';
import { zhMessageForApiError } from '../../../../shared/apiErrorZh.js';
import { grossAmountFromQtySpecUnitPrice, roundOrderDecimal4, parseQuantityToLegacyNumber } from '../../utils/salesOrderTonAmount';

const router = useRouter();
const PRODUCT_MODEL_ADD_FOOTER = '__product_model_add_footer__';
const CUSTOMER_ADD_FOOTER = '__customer_add_footer__';

const props = defineProps({
  editRow: { type: Object, default: null },
  fieldDefinitions: { type: Array, default: () => [] }
});

const dialogOpen = defineModel({ type: Boolean, default: false });
const emit = defineEmits(['success']);

const SECTION_ORDER = ['basic', 'product', 'price', 'other'];
const SECTION_TITLES = {
  basic: '基本信息',
  product: '产品明细',
  price: '价格',
  other: '其他信息'
};
const MAPS_SECTION = {
  order_date: 'basic',
  customer_name: 'basic',
  customer_code: 'basic',
  product_model: 'product',
  warehouse_model: 'product',
  product_name: 'product',
  product_code: 'product',
  quantity: 'product',
  unit_price: 'price',
  amount: 'price'
};

const saving = ref(false);
const hintOpen = ref([]);
const form = ref({ id: null, row_version: 1 });
const formData = ref({});
const formErrors = ref({});
const formBodyRef = ref(null);
const fieldRefs = ref({});
const selectedCustomerId = ref(null);
const productSuggestions = ref([]);
const modelMappingByCustomerModel = ref({});
/** 数量单位：桶 / 吨桶（仅 UI，保存时拼接到数量字段） */
const quantityUnit = ref('桶');
/** 剩余单位：桶 / 吨桶（独立选择，保存时拼接到剩余字段） */
const remainingUnit = ref('桶');
let _priceLookupAbort = null;
let _customerSearchAbort = null;
let _productModelSyncTimer = null;

const formSections = computed(() => {
  const buckets = { basic: [], product: [], price: [], other: [] };
  for (const col of effectiveFieldDefinitions.value) {
    const sec = (col.maps_to && MAPS_SECTION[col.maps_to]) || 'other';
    buckets[sec].push(col);
  }
  return SECTION_ORDER.filter((k) => buckets[k].length).map((k) => ({
    key: k,
    title: SECTION_TITLES[k],
    fields: buckets[k]
  }));
});

const firstFieldKey = computed(() => {
  for (const sec of formSections.value) {
    const col = sec.fields[0];
    if (col) return col.field_key;
  }
  return null;
});

const showProductModelAddLink = computed(() => perm('customer_management', 'view'));
const showCustomerAddLink = computed(() => perm('customer_management', 'create'));
const showCustomerEditLink = computed(() => perm('customer_management', 'edit'));

watch(dialogOpen, (v) => {
  if (v) {
    initForm();
    bindShortcutListener();
  } else {
    unbindShortcutListener();
  }
});

function isShortcutSaveEvent(e) {
  if (!e || e.isComposing) return false;
  if (!(e.ctrlKey || e.metaKey)) return false;
  const key = e.key || '';
  const code = e.code || '';
  return key === 'Enter' || code === 'Enter' || code === 'NumpadEnter';
}

function triggerShortcutSave() {
  if (!dialogOpen.value || saving.value) return;
  saveForm(false);
}

function onFormKeydown(e) {
  if (!isShortcutSaveEvent(e)) return;
  e.preventDefault();
  e.stopPropagation();
  triggerShortcutSave();
}

function onDocumentKeydown(e) {
  if (!dialogOpen.value || saving.value) return;
  if (!isShortcutSaveEvent(e)) return;
  e.preventDefault();
  e.stopPropagation();
  triggerShortcutSave();
}

function bindShortcutListener() {
  unbindShortcutListener();
  document.addEventListener('keydown', onDocumentKeydown, true);
}

function unbindShortcutListener() {
  document.removeEventListener('keydown', onDocumentKeydown, true);
}

function closeDialog() {
  dialogOpen.value = false;
}

function onDialogClose() {
  unbindShortcutListener();
  resetForm();
}

function onDialogOpened() {
  bindShortcutListener();
  nextTick(() => focusFirstField());
}

function todayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function resolveUnitPriceFieldKeyFrom(defs) {
  const list = defs || [];
  const byMap = list.find((d) => d.maps_to === 'unit_price');
  if (byMap) return byMap.field_key;
  const byLabel = list.find((d) => isUnitPriceField(d));
  if (byLabel) return byLabel.field_key;
  for (const k of ['unit_price', 'price']) {
    if (list.some((d) => d.field_key === k)) return k;
  }
  return null;
}

function resolveUnitPriceFieldKey() {
  return resolveUnitPriceFieldKeyFrom(effectiveFieldDefinitions.value);
}

function normalizeProductModel(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[()（）\[\]【】]/g, '')
    .replace(/[-－—_/／\\]/g, '');
}

const effectiveFieldDefinitions = computed(() => {
  const defs = [...(props.fieldDefinitions || [])];
  if (resolveUnitPriceFieldKeyFrom(defs)) return defs;
  return [
    ...defs,
    {
      field_key: '__form_unit_price',
      label_zh: '单价',
      field_type: 'positive_number',
      maps_to: 'unit_price',
      required: false,
      sort_order: 960,
      is_active: true
    }
  ];
});

function fieldKeyForMapsTo(m) {
  return effectiveFieldDefinitions.value.find((d) => d.maps_to === m)?.field_key;
}

function isUnitPriceField(col) {
  if (!col) return false;
  if (col.maps_to === 'unit_price') return true;
  return /单价|价格|售价|price/i.test(String(col.label_zh || col.field_key || ''));
}

function isSpecField(col) {
  if (!col) return false;
  if (col.maps_to === 'product_name') return true;
  return /规格/i.test(String(col.label_zh || col.field_key || ''));
}

function isQuantityField(col) {
  if (!col) return false;
  if (col.maps_to === 'quantity') return true;
  return /数量/i.test(String(col.label_zh || col.field_key || ''));
}

function isRemainingField(col) {
  if (!col) return false;
  if (col.field_key === 'remaining') return true;
  return /^剩余$/i.test(String(col.label_zh || '').trim());
}

function parseSpecKgNumber(raw) {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  const n = parseQuantityToLegacyNumber(raw);
  return n > 0 ? n : undefined;
}

function formatSpecForSave(n) {
  if (n == null || n === '') return '';
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return '';
  return `${num}kg`;
}

function parseQuantityParts(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { n: undefined, unit: '桶' };
  const n = parseQuantityToLegacyNumber(s);
  const unit = /吨桶/.test(s) ? '吨桶' : '桶';
  return { n: n > 0 ? n : undefined, unit };
}

function formatQuantityForSave(n, unit) {
  if (n == null || n === '') return '';
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return '';
  return `${num}${unit === '吨桶' ? '吨桶' : '桶'}`;
}

function normalizeQuantityAndSpecFields() {
  const qtyKey = fieldKeyForMapsTo('quantity');
  const specKey = fieldKeyForMapsTo('product_name');
  const remainingKey = effectiveFieldDefinitions.value.find((d) => isRemainingField(d))?.field_key;
  if (qtyKey) {
    const { n, unit } = parseQuantityParts(formData.value[qtyKey]);
    formData.value[qtyKey] = n;
    quantityUnit.value = unit;
  } else {
    quantityUnit.value = '桶';
  }
  if (specKey) {
    formData.value[specKey] = parseSpecKgNumber(formData.value[specKey]);
  }
  if (remainingKey) {
    const parsed = parseQuantityParts(formData.value[remainingKey]);
    formData.value[remainingKey] = parsed.n;
    remainingUnit.value = parsed.unit;
  } else {
    remainingUnit.value = '桶';
  }
}

function getQuantityTextForCalc() {
  const kq = fieldKeyForMapsTo('quantity');
  if (!kq) return '';
  return formatQuantityForSave(formData.value[kq], quantityUnit.value);
}

function getSpecTextForCalc() {
  const ks = fieldKeyForMapsTo('product_name');
  if (!ks) return '';
  return formatSpecForSave(formData.value[ks]);
}

function findProductSuggestion(model) {
  const raw = String(model || '').trim();
  if (!raw) return null;
  const exact = productSuggestions.value.find((p) => String(p.product_model).trim() === raw);
  if (exact) return exact;
  const target = normalizeProductModel(raw);
  if (!target) return null;
  return productSuggestions.value.find((p) => {
    const sn = normalizeProductModel(p.product_model);
    return sn && (sn === target || sn.includes(target) || target.includes(sn));
  }) || null;
}

function unwrapApiPayload(res) {
  if (res && typeof res === 'object' && res.data != null && typeof res.data === 'object' && !Array.isArray(res.data)) {
    return res.data;
  }
  return res;
}

function applyUnitPriceKg(priceKg) {
  const ku = resolveUnitPriceFieldKey();
  if (!ku) return false;
  const n = roundUnitPriceKg(priceKg);
  if (n == null) return false;
  formData.value[ku] = n;
  syncAmountFromTonsPricing();
  return true;
}

function fieldItemClass(col) {
  if (col.field_type === 'textarea') return 'field-span-full';
  if (col.maps_to === 'customer_name' || col.maps_to === 'remark') return 'field-span-full';
  return '';
}

function setFieldRef(key, el) {
  if (el) fieldRefs.value[key] = el;
}

function initEmptyFormData() {
  const o = {};
  for (const col of effectiveFieldDefinitions.value) {
    if (
      isUnitPriceField(col)
      || isSpecField(col)
      || isQuantityField(col)
      || isRemainingField(col)
      || col.field_type === 'number'
      || col.field_type === 'positive_number'
    ) {
      o[col.field_key] = undefined;
    } else {
      o[col.field_key] = '';
    }
  }
  return o;
}

function initForm() {
  formErrors.value = {};
  selectedCustomerId.value = null;
  productSuggestions.value = [];
  modelMappingByCustomerModel.value = {};
  if (props.editRow) {
    const row = props.editRow;
    const rv = Number(row.row_version);
    form.value = { id: row.id, row_version: Number.isFinite(rv) && rv >= 1 ? rv : 1 };
    formData.value = { ...initEmptyFormData(), ...(row.display_data || {}) };
    const ku = resolveUnitPriceFieldKey();
    if (ku) {
      const v = formData.value[ku];
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) {
        const kg = roundUnitPriceKg(n / 1000);
        if (kg != null) formData.value[ku] = kg;
      }
    }
    resolveCustomerContext(String(formData.value[fieldKeyForMapsTo('customer_name')] || '').trim());
  } else {
    form.value = { id: null, row_version: 1 };
    formData.value = initEmptyFormData();
    const dateKey = fieldKeyForMapsTo('order_date') || effectiveFieldDefinitions.value.find((d) => d.field_key === 'order_date')?.field_key;
    if (dateKey && !formData.value[dateKey]) formData.value[dateKey] = todayYmd();
  }
  normalizeQuantityAndSpecFields();
  nextTick(() => syncAmountFromTonsPricing());
}

function resetForm() {
  formErrors.value = {};
  selectedCustomerId.value = null;
  productSuggestions.value = [];
  modelMappingByCustomerModel.value = {};
  fieldRefs.value = {};
  quantityUnit.value = '桶';
  remainingUnit.value = '桶';
}

function focusFirstField() {
  const key = firstFieldKey.value;
  if (!key) return;
  const ref = fieldRefs.value[key];
  if (!ref) return;
  ref.focus?.();
  ref.$el?.querySelector?.('input')?.focus?.();
}

function clearFieldError(key) {
  if (formErrors.value[key]) {
    const next = { ...formErrors.value };
    delete next[key];
    formErrors.value = next;
  }
}

function onFieldInput(col) {
  clearFieldError(col.field_key);
  maybeSyncAmount(col.maps_to);
  if (col.maps_to === 'customer_name') {
    selectedCustomerId.value = null;
    productSuggestions.value = [];
    modelMappingByCustomerModel.value = {};
  }
}

function onNumberChange(col) {
  clearFieldError(col.field_key);
  if (isUnitPriceField(col) || isSpecField(col) || isQuantityField(col)) {
    nextTick(() => syncAmountFromTonsPricing());
    return;
  }
  maybeSyncAmount(col.maps_to);
}

function onQuantityUnitChange(col) {
  clearFieldError(col.field_key);
  nextTick(() => syncAmountFromTonsPricing());
}

function onRemainingUnitChange(col) {
  clearFieldError(col.field_key);
}

function maybeSyncAmount(mapsTo) {
  if (!dialogOpen.value) return;
  if (mapsTo === 'quantity' || mapsTo === 'product_name' || mapsTo === 'unit_price') {
    nextTick(() => syncAmountFromTonsPricing());
  }
}

function syncAmountFromTonsPricing() {
  if (!dialogOpen.value || !effectiveFieldDefinitions.value?.length) return;
  const kq = fieldKeyForMapsTo('quantity');
  const ks = fieldKeyForMapsTo('product_name');
  const ku = resolveUnitPriceFieldKey();
  const ka = fieldKeyForMapsTo('amount');
  if (!ka || !kq || !ks || !ku) return;
  const unitPrice = formData.value[ku];
  const unitPricePerTon = unitPrice != null && unitPrice !== '' ? Number(unitPrice) * 1000 : unitPrice;
  const g = grossAmountFromQtySpecUnitPrice(
    getQuantityTextForCalc(),
    getSpecTextForCalc(),
    unitPricePerTon
  );
  if (g == null) return;
  const next = roundOrderDecimal4(g);
  const cur = formData.value[ka];
  if (cur !== next && Number(cur) !== next) formData.value[ka] = next;
}

function formatPriceHint(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${n.toFixed(2)} 元/kg`;
}

function roundUnitPriceKg(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  return Math.round(x * 100) / 100;
}

function customerMissingContactName(item) {
  return !String(item?.contact_name || '').trim();
}

function appendCustomerAddFooter(rows) {
  if (!showCustomerAddLink.value) return rows;
  return [...rows, { value: CUSTOMER_ADD_FOOTER, isAddFooter: true }];
}

async function fetchCustomerSuggestions(queryString, cb) {
  const q = String(queryString || '').trim();
  if (q.length < 1) {
    cb(appendCustomerAddFooter([]));
    return;
  }
  if (_customerSearchAbort) _customerSearchAbort();
  let cancelled = false;
  _customerSearchAbort = () => { cancelled = true; };
  try {
    const res = await listSalesCustomers({ q, page: 1, pageSize: 20, only_active: 1 });
    if (cancelled) return;
    const items = Array.isArray(res?.items) ? res.items : [];
    cb(appendCustomerAddFooter(items.map((c) => ({
      value: c.customer_name || c.contact_name || '',
      id: c.id,
      customer_code: c.customer_code || '',
      contact_name: c.contact_name || '',
      customer_name: c.customer_name || '',
      contact_person: c.contact_person || '',
      phone: c.phone || '',
      fax: c.fax || '',
      address: c.address || '',
      bank_name: c.bank_name || '',
      bank_account: c.bank_account || '',
      tax_id: c.tax_id || ''
    })).filter((x) => x.value)));
  } catch {
    if (!cancelled) cb(appendCustomerAddFooter([]));
  } finally {
    if (!cancelled) _customerSearchAbort = null;
  }
}

function goAddCustomer() {
  if (!showCustomerAddLink.value) {
    ElMessage.warning('暂无客户新增权限');
    return;
  }
  const kc = fieldKeyForMapsTo('customer_name');
  const customerName = kc ? String(formData.value[kc] || '').trim() : '';
  closeDialog();
  router.push({
    path: '/sales/customers',
    query: {
      action: 'create',
      ...(customerName ? { customerName } : {})
    }
  });
}

function goEditCustomer(item) {
  if (!showCustomerEditLink.value) {
    ElMessage.warning('暂无客户编辑权限');
    return;
  }
  const id = Number(item?.id);
  if (!id) return;
  try {
    sessionStorage.setItem('pendingCustomerEdit', JSON.stringify(item));
  } catch { /* ignore */ }
  closeDialog();
  router.push({
    path: '/sales/customers',
    query: { action: 'edit', customerId: String(id) }
  });
}

async function onCustomerPick(item, col) {
  if (item?.isAddFooter) {
    goAddCustomer();
    return;
  }
  if (!item?.value) return;
  formData.value[col.field_key] = item.value;
  clearFieldError(col.field_key);
  if (item.id) {
    selectedCustomerId.value = item.id;
    await loadCustomerAssistData(item.id);
  } else {
    await resolveCustomerContext(item.value);
  }
}

async function resolveCustomerContext(name) {
  if (!name) return;
  try {
    const res = await listSalesCustomers({ q: name, page: 1, pageSize: 5, only_active: 1 });
    const items = Array.isArray(res?.items) ? res.items : [];
    const hit = items.find((c) => c.customer_name === name || c.contact_name === name);
    if (hit?.id) {
      selectedCustomerId.value = hit.id;
      await loadCustomerAssistData(hit.id);
    }
  } catch { /* ignore */ }
}

async function loadCustomerAssistData(customerId) {
  if (!customerId) return;
  try {
    const [pricesRes, suggestRes, mappingRes] = await Promise.all([
      listCustomerPrices(customerId).catch(() => ({ items: [] })),
      listCustomerPriceSuggestions(customerId).catch(() => ({ items: [] })),
      listCustomerModelMappings(customerId).catch(() => ({ items: [] }))
    ]);
    const byModel = new Map();
    for (const p of suggestRes?.items || []) {
      if (p?.product_model) byModel.set(p.product_model, { product_model: p.product_model, unit_price: p.unit_price });
    }
    for (const p of pricesRes?.items || []) {
      if (p?.product_model) byModel.set(p.product_model, { product_model: p.product_model, unit_price: p.unit_price });
    }
    productSuggestions.value = Array.from(byModel.values()).sort((a, b) =>
      String(a.product_model).localeCompare(String(b.product_model), 'zh')
    );
    const mapObj = {};
    for (const m of mappingRes?.items || []) {
      if (m?.customer_model) mapObj[m.customer_model] = m.internal_model || '';
    }
    modelMappingByCustomerModel.value = mapObj;
    const km = fieldKeyForMapsTo('product_model');
    if (km) {
      const model = String(formData.value[km] || '').trim();
      if (model) syncProductModelLinkedFields(model);
    }
  } catch { /* ignore */ }
}

function fetchProductModelSuggestions(queryString, cb) {
  const q = String(queryString || '').trim().toLowerCase();
  const list = productSuggestions.value;
  const filtered = q
    ? list.filter((m) => String(m.product_model).toLowerCase().includes(q))
    : list;
  const rows = filtered.slice(0, 30).map((m) => ({
    value: m.product_model,
    unit_price: m.unit_price
  }));
  if (showProductModelAddLink.value) {
    rows.push({ value: PRODUCT_MODEL_ADD_FOOTER, isAddFooter: true });
  }
  cb(rows);
}

function goAddProductModel() {
  if (!showProductModelAddLink.value) {
    ElMessage.warning('暂无客户型号管理权限');
    return;
  }
  const kc = fieldKeyForMapsTo('customer_name');
  const customerName = kc ? String(formData.value[kc] || '').trim() : '';
  if (!selectedCustomerId.value) {
    ElMessage.warning('请先选择厂家');
    return;
  }
  closeDialog();
  router.push({
    path: `/sales/customers/models/${selectedCustomerId.value}`,
    query: customerName ? { customerName } : {}
  });
}

function onProductModelPick(item, col) {
  if (item?.isAddFooter) {
    goAddProductModel();
    return;
  }
  if (!item?.value) return;
  formData.value[col.field_key] = item.value;
  clearFieldError(col.field_key);
  syncProductModelLinkedFields(item.value, { unitPriceKg: item.unit_price });
}

function onProductModelClear(col) {
  formData.value[col.field_key] = '';
  syncProductModelLinkedFields('');
}

function onProductModelInput(col) {
  clearFieldError(col.field_key);
  const model = String(formData.value[col.field_key] ?? '').trim();
  if (!model) {
    syncProductModelLinkedFields('');
    return;
  }
  const exactHit = productSuggestions.value.some((p) => String(p.product_model) === model);
  const hasMapping = Object.prototype.hasOwnProperty.call(modelMappingByCustomerModel.value, model);
  if (exactHit || hasMapping) {
    syncProductModelLinkedFields(model);
    return;
  }
  if (_productModelSyncTimer) clearTimeout(_productModelSyncTimer);
  _productModelSyncTimer = setTimeout(() => {
    const latest = String(formData.value[col.field_key] ?? '').trim();
    syncProductModelLinkedFields(latest);
  }, 400);
}

function syncProductModelLinkedFields(productModel, hints = {}) {
  const whKey = fieldKeyForMapsTo('warehouse_model');
  const ku = resolveUnitPriceFieldKey();
  const model = String(productModel || '').trim();

  if (!model) {
    if (whKey) formData.value[whKey] = '';
    if (ku) formData.value[ku] = undefined;
    syncAmountFromTonsPricing();
    return;
  }

  if (whKey) {
    formData.value[whKey] = modelMappingByCustomerModel.value[model] || '';
    if (!formData.value[whKey]) {
      const mapKey = Object.keys(modelMappingByCustomerModel.value).find(
        (k) => normalizeProductModel(k) === normalizeProductModel(model)
      );
      if (mapKey) formData.value[whKey] = modelMappingByCustomerModel.value[mapKey] || '';
    }
  }

  const hinted = hints.unitPriceKg != null ? Number(hints.unitPriceKg) : null;
  if (Number.isFinite(hinted) && hinted > 0) {
    applyUnitPriceKg(hinted);
    return;
  }

  const hit = findProductSuggestion(model);
  if (hit?.unit_price != null && Number(hit.unit_price) > 0) {
    applyUnitPriceKg(hit.unit_price);
    return;
  }

  if (ku) formData.value[ku] = undefined;
  syncAmountFromTonsPricing();
  lookupUnitPriceForModel(model);
}

async function lookupUnitPriceForModel(productModel) {
  const kc = fieldKeyForMapsTo('customer_name');
  const km = fieldKeyForMapsTo('product_model');
  const ku = resolveUnitPriceFieldKey();
  if (!kc || !km || !ku) return;
  const customerName = String(formData.value[kc] || '').trim();
  const model = String(productModel || '').trim();
  if (!model) return;

  if (_priceLookupAbort) _priceLookupAbort();
  let cancelled = false;
  _priceLookupAbort = () => { cancelled = true; };
  await new Promise((r) => setTimeout(r, 300));
  if (cancelled) return;
  _priceLookupAbort = null;

  if (String(formData.value[km] || '').trim() !== model) return;

  try {
    const res = await lookupCustomerPrice({
      customerName,
      productModel: model,
      customerId: selectedCustomerId.value || undefined
    });
    if (cancelled || String(formData.value[km] || '').trim() !== model) return;
    const payload = unwrapApiPayload(res);
    const price = payload?.unit_price ?? res?.unit_price;
    if (price != null && Number(price) > 0) {
      applyUnitPriceKg(price);
    }
  } catch { /* ignore */ }
}

function preserveForContinue() {
  const keep = {};
  const kc = fieldKeyForMapsTo('customer_name');
  const kd = fieldKeyForMapsTo('order_date') || props.fieldDefinitions.find((d) => d.field_key === 'order_date')?.field_key;
  if (kc) keep[kc] = formData.value[kc];
  if (kd) keep[kd] = formData.value[kd];
  return keep;
}

async function saveForm(continueAfter = false) {
  if (saving.value) return;
  syncAmountFromTonsPricing();
  formErrors.value = {};
  const payload = { data: {} };
  for (const col of effectiveFieldDefinitions.value) {
    let v = formData.value[col.field_key];
    if (v === undefined) v = null;
    if (col.maps_to === 'unit_price' || isUnitPriceField(col)) {
      if (v != null && v !== '') v = Number(v) * 1000;
    } else if (isQuantityField(col)) {
      v = formatQuantityForSave(v, quantityUnit.value);
    } else if (isRemainingField(col)) {
      v = formatQuantityForSave(v, remainingUnit.value);
    } else if (isSpecField(col)) {
      v = formatSpecForSave(v);
    }
    payload.data[col.field_key] = v;
  }
  // 虚拟单价字段：服务端字段配置未启用时，写入 maps_to=unit_price 的 inactive 键名以便落库
  if (formData.value.__form_unit_price != null && formData.value.__form_unit_price !== '') {
    const serverPriceKey = props.fieldDefinitions.find((d) => d.maps_to === 'unit_price')?.field_key
      || props.fieldDefinitions.find((d) => isUnitPriceField(d))?.field_key;
    if (serverPriceKey && serverPriceKey !== '__form_unit_price') {
      payload.data[serverPriceKey] = Number(formData.value.__form_unit_price) * 1000;
    }
  }
  if (form.value.id) payload.row_version = form.value.row_version;
  saving.value = true;
  try {
    if (form.value.id) {
      await patchSalesOrder(form.value.id, payload);
      ElMessage.success('已保存');
      closeDialog();
      emit('success');
    } else {
      const r = await createSalesOrder(payload);
      const orderNo = r?.order_no ?? r?.data?.order_no ?? '';
      ElMessage.success(`已创建，订单号 ${orderNo}`);
      if (continueAfter) {
        emit('success');
        const kept = preserveForContinue();
        const customerId = selectedCustomerId.value;
        form.value = { id: null, row_version: 1 };
        formData.value = { ...initEmptyFormData(), ...kept };
        normalizeQuantityAndSpecFields();
        if (!formData.value[fieldKeyForMapsTo('order_date')]) {
          const dateKey = fieldKeyForMapsTo('order_date') || 'order_date';
          formData.value[dateKey] = todayYmd();
        }
        formErrors.value = {};
        if (customerId) {
          selectedCustomerId.value = customerId;
          loadCustomerAssistData(customerId);
        }
        nextTick(() => {
          syncAmountFromTonsPricing();
          const modelKey = fieldKeyForMapsTo('product_model');
          if (modelKey) {
            const ref = fieldRefs.value[modelKey];
            ref?.focus?.();
            ref?.$el?.querySelector?.('input')?.focus?.();
          } else {
            focusFirstField();
          }
        });
      } else {
        closeDialog();
        emit('success');
      }
    }
  } catch (e) {
    const d = e?.response?.data;
    if (d?.error === 'VALIDATION_FAILED' && Array.isArray(d.details)) {
      const fe = {};
      for (const x of d.details) fe[x.field_key] = x.message;
      formErrors.value = fe;
      ElMessage.error('请根据下方提示修正表单');
    } else if (d?.error === 'CONCURRENT_UPDATE') {
      ElMessage.error(d?.message || zhMessageForApiError('CONCURRENT_UPDATE'));
    } else {
      ElMessage.error(e?.response?.data?.message || '保存失败');
    }
  } finally {
    saving.value = false;
  }
}

onBeforeUnmount(() => {
  unbindShortcutListener();
  if (_priceLookupAbort) _priceLookupAbort();
  if (_customerSearchAbort) _customerSearchAbort();
  if (_productModelSyncTimer) clearTimeout(_productModelSyncTimer);
});
</script>

<style scoped>
.form-hint-collapse {
  margin-bottom: 12px;
  border: none;
}
.form-hint-collapse :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 36px;
  line-height: 1.4;
  padding: 4px 0;
  border: none;
  background: transparent;
}
.form-hint-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}
.form-hint-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 0;
}
.form-hint-collapse__title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-right: 8px;
}
.form-hint-collapse__brief {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 400;
}
.form-hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 4px;
  line-height: 1.6;
}
.order-form-body {
  max-height: min(68vh, 640px);
  overflow-y: auto;
  padding-right: 4px;
}
.order-form-section + .order-form-section {
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}
.order-form-section__title {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 10px;
}
.order-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}
.order-form-grid :deep(.el-form-item) {
  margin-bottom: 14px;
}
.order-form-grid :deep(.field-span-full) {
  grid-column: 1 / -1;
}
.order-form-grid :deep(.el-form-item__label) {
  font-size: 13px;
}
.w-full {
  width: 100%;
}
.is-readonly :deep(.el-input__wrapper) {
  background: #f8fafc;
}
.field-suffix {
  font-size: 12px;
  color: #94a3b8;
}
.order-price-wrap {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
}
.order-field-with-unit {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
}
.order-field-with-unit .order-field-input,
.order-price-wrap .order-price-input {
  flex: 1;
  min-width: 0;
}
.order-field-unit,
.order-price-unit {
  flex-shrink: 0;
  font-size: 13px;
  color: #64748b;
  white-space: nowrap;
}
.order-qty-unit-select {
  width: 88px;
  flex-shrink: 0;
}
.order-price-input :deep(.el-input__inner) {
  text-align: left;
}
.ac-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  line-height: 1.4;
  padding: 2px 0;
}
.ac-item__main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ac-item__sub {
  flex-shrink: 0;
  font-size: 12px;
  color: #94a3b8;
}
.ac-item__action {
  flex-shrink: 0;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
.ac-item__action:hover {
  text-decoration: underline;
}
.ac-add-footer {
  padding: 10px 12px;
  margin: 4px -12px -6px;
  border-top: 1px solid #e2e8f0;
  font-size: 12px;
  color: #64748b;
  text-align: center;
  cursor: pointer;
  user-select: none;
  line-height: 1.4;
}
.ac-add-footer:hover {
  background: #f8fafc;
}
.ac-add-link {
  color: #409eff;
}
.ac-add-footer:hover .ac-add-link {
  text-decoration: underline;
}
.order-form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.order-form-footer__tip {
  font-size: 12px;
  color: #94a3b8;
}
.order-form-footer__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
@media (max-width: 640px) {
  .order-form-grid {
    grid-template-columns: 1fr;
  }
  .order-form-footer {
    flex-direction: column;
    align-items: stretch;
  }
  .order-form-footer__tip {
    text-align: center;
  }
  .order-form-footer__actions {
    justify-content: stretch;
  }
  .order-form-footer__actions .el-button {
    flex: 1;
  }
}
</style>
