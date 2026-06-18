<template>
  <el-dialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    :title="title"
    width="720px"
    destroy-on-close
    @closed="$emit('update:visible', false)"
  >
    <p class="import-errors-summary muted">
      以下行未能导入，请对照 Excel 修正后重新上传。失败原因仅作展示，不会执行任何代码。
    </p>
    <el-table :data="rows" border max-height="62vh" size="small">
      <el-table-column label="Excel 行" width="100">
        <template #default="{ row }">第 {{ row.row }} 行</template>
      </el-table-column>
      <el-table-column prop="reason" label="失败原因" min-width="320" show-overflow-tooltip />
    </el-table>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  visible: Boolean,
  rows: { type: Array, default: () => [] }
});

defineEmits(['update:visible']);

const title = computed(() => {
  const n = props.rows?.length || 0;
  return n > 0 ? `导入失败明细（${n} 行）` : '导入失败明细';
});
</script>

<style scoped>
.import-errors-summary {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.5;
}
.muted {
  color: #64748b;
}
</style>
