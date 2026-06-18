<template>
  <el-dialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    title="生成合同"
    width="520px"
    @closed="onClosed"
  >
    <el-form label-width="100px">
      <template v-if="onlyOneTemplate">
        <el-form-item label="模板">
          <span>{{ localTemplates[0]?.name }}</span>
        </el-form-item>
      </template>
      <template v-else>
        <el-form-item label="方式">
          <el-radio-group v-model="useBlankTemplate" class="gen-contract-mode">
            <el-radio :label="false" :disabled="!localTemplates.length">选用已保存模板</el-radio>
            <el-radio :label="true">从空白模板创建</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="!useBlankTemplate" label="模板">
          <el-select v-model="templateId" placeholder="选择模板" class="w-full" filterable>
            <el-option v-for="t in localTemplates" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <p v-if="useBlankTemplate" class="hint gen-contract-blank-hint">
          使用系统推荐版式，正文均为占位符，生成时按当前客户与订单填入买方全称、地址、联系方式及订单明细；避免选用其他客户模板中写死的名称。
        </p>
      </template>
      <div class="hint">
        已选 {{ orderIds.length }} 条订单；自列表勾选生成时须为同一客户。
      </div>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)" icon="Close">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleGenerate">生成</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { listContractTemplates, generateSalesContract } from '../../api';
import { useRouter } from 'vue-router';

const props = defineProps({
  visible: Boolean,
  orderIds: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:visible', 'success']);
const router = useRouter();

const loading = ref(false);
const localTemplates = ref([]);
const templateId = ref(null);
const useBlankTemplate = ref(false);

const onlyOneTemplate = computed(() => localTemplates.value.length === 1);

watch(() => props.visible, async (v) => {
  if (v) await loadTemplates();
});

async function loadTemplates() {
  try {
    const d = await listContractTemplates();
    localTemplates.value = d.items || [];
    if (localTemplates.value.length) {
      templateId.value = localTemplates.value[0]?.id;
      useBlankTemplate.value = false;
    } else {
      templateId.value = null;
      useBlankTemplate.value = true;
      ElMessage.info('暂无已保存模板，将使用「从空白模板创建」推荐版式');
    }
  } catch {
    ElMessage.error('加载模板失败');
  }
}

function onClosed() {
  useBlankTemplate.value = false;
}

async function handleGenerate() {
  if (!useBlankTemplate.value && !templateId.value) {
    ElMessage.warning('请选择模板，或改用「从空白模板创建」');
    return;
  }
  loading.value = true;
  try {
    const payload = {
      orderIds: props.orderIds,
      fromBlank: useBlankTemplate.value === true
    };
    if (!useBlankTemplate.value) payload.templateId = templateId.value;
    const { getCurrentOrderCalcRule, getCurrentTotalAmountTargetColIndex } = await import('../../utils/orderCalcRuleStore');
    const currentRule = getCurrentOrderCalcRule();
    if (currentRule && currentRule.formulas && currentRule.formulas.length > 0) {
      payload.currentFormulas = currentRule.formulas.map(f => ({
        formulaText: f.formulaText,
        targetColIndex: f.targetColIndex
      }));
    }
    payload.totalAmountTargetColIndex = getCurrentTotalAmountTargetColIndex();
    const r = await generateSalesContract(payload);
    ElMessage.success(`合同已生成 ${r.contract_no}`);
    emit('update:visible', false);
    if (r.id != null) {
      router.push(`/sales/contracts/editor/${r.id}`);
    } else {
      router.push('/sales/contracts');
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '生成失败');
  } finally {
    loading.value = false;
  }
}
</script>
