<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="440px"
    destroy-on-close
  >
    <el-form label-width="80px">
      <el-form-item label="结果">
        <el-radio-group v-model="form.result">
          <el-radio :label="approvedLabel">{{ approvedText }}</el-radio>
          <el-radio label="rejected">驳回</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="意见">
        <el-input v-model="form.comment" type="textarea" rows="3" placeholder="驳回必填" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false" icon="Close">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit" icon="Check">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { batchFinanceReviewSalesOrder, batchQcReviewSalesOrder } from '../../api';

const visible = defineModel('visible', { type: Boolean, default: false });

const props = defineProps({
  kind: { type: String, default: 'finance' }, // 'finance' | 'qc'
  rows: { type: Array, default: () => [] }
});

const emit = defineEmits(['success']);

const loading = ref(false);
const form = ref({ result: 'approved', comment: '' });

watch(visible, (v) => {
  if (v) form.value = { result: 'approved', comment: '' };
});

const approvedLabel = computed(() => 'approved');
const approvedText = computed(() => props.kind === 'finance' ? '通过' : '审核通过');

const dialogTitle = computed(() => {
  const n = props.rows?.length || 0;
  const prefix = props.kind === 'finance' ? '财务审核' : '质检审核';
  return n > 1 ? `${prefix}（${n}笔）` : prefix;
});

async function handleSubmit() {
  if (form.value.result === 'rejected' && !form.value.comment.trim()) {
    ElMessage.warning('驳回请填写意见');
    return;
  }
  loading.value = true;
  try {
    const ids = props.rows.map((x) => x.id);
    const payload = { ids, result: form.value.result, comment: form.value.comment };
    const r = props.kind === 'finance'
      ? await batchFinanceReviewSalesOrder(payload)
      : await batchQcReviewSalesOrder(payload);
    const payloadData = r?.data ?? r;
    const ok = Number(payloadData?.ok) || 0;
    const failed = Array.isArray(payloadData?.failed) ? payloadData.failed : [];
    if (failed.length) {
      ElMessage.warning(`已处理 ${ok} 笔，未处理 ${failed.length} 笔`);
    } else if (form.value.result === 'rejected') {
      ElMessage.success(ok > 1 ? `已驳回 ${ok} 笔订单` : '已驳回订单');
    } else {
      ElMessage.success(ok > 1 ? `已通过 ${ok} 笔订单` : '已通过订单');
    }
    visible.value = false;
    emit('success');
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '操作失败');
  } finally {
    loading.value = false;
  }
}
</script>
