<template>
  <el-dialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    :title="title"
    width="900px"
    destroy-on-close
    @closed="$emit('update:visible', false)"
  >
    <p v-if="summary" class="import-dup-summary muted">{{ summary }}</p>
    <el-table :data="rows" border max-height="62vh" size="small">
      <el-table-column label="导入行" width="100">
        <template #default="{ row }">第 {{ row.row }} 行</template>
      </el-table-column>
      <el-table-column prop="imported_customer" label="客户" min-width="140" show-overflow-tooltip />
      <el-table-column prop="imported_product" label="产品" min-width="140" show-overflow-tooltip />
      <el-table-column prop="imported_model" label="型号" min-width="120" show-overflow-tooltip />
      <el-table-column prop="imported_batch_no" label="批号" min-width="100" show-overflow-tooltip />
      <el-table-column prop="existing_order_no" label="重复订单号" min-width="140" show-overflow-tooltip />
    </el-table>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  visible: Boolean,
  summary: { type: String, default: '' },
  rows: { type: Array, default: () => [] }
});

defineEmits(['update:visible']);

const title = computed(() => {
  const n = props.rows?.length || 0;
  return n > 0 ? `导入重复订单（${n}条）` : '导入重复订单';
});
</script>
