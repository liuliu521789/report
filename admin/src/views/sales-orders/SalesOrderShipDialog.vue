<template>
  <el-dialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    :title="dialogTitle"
    width="440px"
    @close="reset"
  >
    <p v-if="batchList.length > 1" class="ship-batch-hint">
      已选 {{ batchList.length }} 笔「财务与质检均已通过」的订单，将一并标记为已发货；以下说明会写入每笔订单并发站内信通知销售与财务。
    </p>
    <el-input v-model="note" type="textarea" rows="3" placeholder="发货指令 / 备注（可选）" />
    <template #footer>
      <el-button @click="$emit('update:visible', false)" icon="Close">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit" icon="Check">确认发货</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { shipSalesOrder, batchShipSalesOrders } from '../../api';

const props = defineProps({
  visible: Boolean,
  row: { type: Object, default: null },
  batchList: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:visible', 'success']);

const loading = ref(false);
const note = ref('');

watch(() => props.visible, (v) => {
  if (v) note.value = '';
});

const dialogTitle = computed(() => {
  if (props.batchList.length > 1) return `批量发货（${props.batchList.length}笔）`;
  return '发货';
});

function reset() {
  note.value = '';
}

async function handleSubmit() {
  loading.value = true;
  try {
    if (props.batchList.length > 1) {
      await batchShipSalesOrders({
        ids: props.batchList.map((x) => x.id),
        shipping_instruction: note.value
      });
    } else if (props.row) {
      await shipSalesOrder(props.row.id, { shipping_instruction: note.value });
    }
    ElMessage.success('发货成功');
    emit('update:visible', false);
    emit('success');
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '发货失败');
  } finally {
    loading.value = false;
  }
}
</script>
