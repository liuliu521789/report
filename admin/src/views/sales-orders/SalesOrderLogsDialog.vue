<template>
  <el-dialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    :title="dialogTitle"
    :width="mode === 'contracts' ? '640px' : '760px'"
  >
    <!-- 合同列表模式 -->
    <template v-if="mode === 'contracts'">
      <el-table v-if="contractRows.length" :data="contractRows" border size="small">
        <el-table-column prop="contract_no" label="合同编号" width="160" />
        <el-table-column prop="status" label="状态" min-width="200" align="center">
          <template #default="{ row }">
            <div class="orders-status-cell">
              <SalesStatusPill kind="contract" :status="row.status" :reject-reason="row.last_reject_comment || ''" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="审核人" width="100">
          <template #default="{ row }">{{ actorDisplay(row, { realKey: 'reviewer_real_name', userKey: 'reviewer_username' }) }}</template>
        </el-table-column>
        <el-table-column label="生成时间" min-width="160">
          <template #default="{ row }">{{ $dt(row.created_at) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无合同" />
    </template>

    <!-- 订单追溯模式 -->
    <template v-else>
      <div class="log-block">状态变更</div>
      <el-timeline v-if="statusLogs.length">
        <el-timeline-item v-for="l in statusLogs" :key="l.id" :timestamp="$dt(l.created_at)">
          {{ orderFlowStatusZh(l.from_status) }} → {{ orderFlowStatusZh(l.to_status, { fromStatus: l.from_status }) }} · 操作人：{{ actorDisplay(l) }}<template v-if="l.remark"> · 备注：{{ l.remark }}</template>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else description="暂无状态变更" :image-size="48" />

      <div class="log-block mt">修改记录</div>
      <el-table v-if="editLogs.length" :data="editLogs" border size="small">
        <el-table-column label="时间" width="168">
          <template #default="{ row }">{{ $dt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作人" width="100">
          <template #default="{ row }">{{ actorDisplay(row) }}</template>
        </el-table-column>
        <el-table-column label="变更内容" min-width="320">
          <template #default="{ row }">
            <ul v-if="editChanges(row).length" class="edit-diff-list">
              <li v-for="c in editChanges(row)" :key="c.field_key" class="edit-diff-item">
                <span class="edit-diff-label">{{ c.label }}：</span>
                <span class="edit-diff-old">{{ c.before }}</span>
                <span class="edit-diff-arrow">→</span>
                <span class="edit-diff-new">{{ c.after }}</span>
              </li>
            </ul>
            <span v-else class="edit-diff-empty">（无字段变更）</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无修改记录" :image-size="48" />
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue';
import SalesStatusPill from '../../components/SalesStatusPill.vue';
import { orderFlowStatusZh } from '../../utils/salesStatusDisplay';
import { actorDisplay } from '../../utils/userActorDisplay';
import { diffSalesOrderEditLog } from '../../utils/salesOrderDisplayMerge';

const props = defineProps({
  visible: Boolean,
  mode: { type: String, default: 'logs' }, // 'contracts' | 'logs'
  contractRows: { type: Array, default: () => [] },
  statusLogs: { type: Array, default: () => [] },
  editLogs: { type: Array, default: () => [] },
  fieldDefinitions: { type: Array, default: () => [] }
});

defineEmits(['update:visible']);

const dialogTitle = computed(() => (props.mode === 'contracts' ? '客户相关合同' : '订单追溯'));

function parseLogJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function editChanges(row) {
  const before = parseLogJson(row?.before_json);
  const after = parseLogJson(row?.after_json);
  if (!before || !after) return [];
  return diffSalesOrderEditLog(before, after, props.fieldDefinitions);
}
</script>

<style scoped>
.log-block {
  font-weight: 600;
  margin-bottom: 8px;
}
.log-block.mt {
  margin-top: 16px;
}
.edit-diff-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.edit-diff-item {
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
}
.edit-diff-item + .edit-diff-item {
  margin-top: 4px;
}
.edit-diff-label {
  color: #475569;
  font-weight: 500;
}
.edit-diff-old {
  color: #94a3b8;
  text-decoration: line-through;
}
.edit-diff-arrow {
  margin: 0 4px;
  color: #64748b;
}
.edit-diff-new {
  color: #0f172a;
  font-weight: 500;
}
.edit-diff-empty {
  color: #94a3b8;
  font-size: 12px;
}
</style>
