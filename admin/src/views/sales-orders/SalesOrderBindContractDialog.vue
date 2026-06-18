<template>
  <el-dialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    title="绑定已有合同"
    width="520px"
    :close-on-click-modal="false"
    @closed="onClosed"
  >
    <p v-if="customerName" class="form-hint">
      当前订单客户：<strong>{{ customerName }}</strong>；仅可绑定同一客户下的合同。
    </p>
    <div v-loading="loading">
      <el-form label-width="88px">
        <el-form-item label="合同">
          <el-select
            v-model="selectedId"
            class="w-full"
            filterable
            placeholder="从合同列表中选择"
            :disabled="!rows.length"
          >
            <el-option
              v-for="c in rows"
              :key="c.id"
              :label="optionLabel(c)"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <el-empty v-if="!loading && !rows.length" description="该客户暂无合同，请先在「销售合同」中创建" />
    </div>
    <template #footer>
      <el-button @click="$emit('update:visible', false)" icon="Close">取消</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!selectedId"
        @click="handleSubmit"
      >
        绑定
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { listSalesContracts, bindSalesOrderContract } from '../../api';
import { zhMessageForApiError } from '../../../../shared/apiErrorZh.js';

const props = defineProps({
  visible: Boolean,
  orderId: { type: Number, default: null },
  customerName: { type: String, default: '' },
  customerId: { type: [Number, String], default: null }
});

const emit = defineEmits(['update:visible', 'success']);

const loading = ref(false);
const saving = ref(false);
const rows = ref([]);
const selectedId = ref(null);

watch(() => props.visible, async (v) => {
  if (v && props.customerId) {
    loading.value = true;
    try {
      const d = await listSalesContracts({ customer_id: props.customerId, limit: 100, offset: 0 });
      rows.value = d.items || [];
      if (rows.value.length === 1) selectedId.value = rows.value[0].id;
    } catch {
      ElMessage.error('加载合同列表失败');
      emit('update:visible', false);
    } finally {
      loading.value = false;
    }
  }
});

function onClosed() {
  rows.value = [];
  selectedId.value = null;
  loading.value = false;
  saving.value = false;
}

function statusLabel(status) {
  const map = { draft: '草稿', pending_review: '待审核', approved: '已通过', rejected: '已驳回' };
  return map[status] || status || '—';
}

function optionLabel(c) {
  const no = c.contract_no != null ? String(c.contract_no) : `#${c.id}`;
  const title = c.title != null && String(c.title).trim() ? String(c.title).trim() : '—';
  return `${no} · ${title}（${statusLabel(c.status)}）`;
}

async function handleSubmit() {
  if (!props.orderId || !selectedId.value) return;
  const errMap = {
    ORDER_ALREADY_LINKED: '该订单已关联合同',
    CUSTOMER_MISMATCH: '合同与订单客户不一致',
    CONTRACT_NOT_FOUND: '合同不存在',
    ORDER_NOT_FOUND: '订单不存在',
    FORBIDDEN: '无权限'
  };
  saving.value = true;
  try {
    await bindSalesOrderContract(props.orderId, { contract_id: selectedId.value });
    ElMessage.success('已绑定合同');
    emit('update:visible', false);
    emit('success');
  } catch (e) {
    const code = e?.response?.data?.error;
    ElMessage.error(errMap[code] || zhMessageForApiError(code) || '绑定失败');
  } finally {
    saving.value = false;
  }
}
</script>
