<template>
  <div class="version-diff">
    <el-card>
      <template #header>
        <div class="diff-header">
          <span>版本对比：v{{ fromVersion }} → v{{ toVersion }}</span>
          <el-button size="small" @click="close">关闭</el-button>
        </div>
      </template>
      
      <div v-if="diff.changes && diff.changes.length > 0" class="diff-content">
        <el-table :data="diff.changes" stripe border style="width: 100%">
          <el-table-column label="字段" prop="field" width="180" />
          <el-table-column label="旧值">
            <template #default="{ row }">
              <span class="old-value">{{ formatValue(row.old) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="新值">
            <template #default="{ row }">
              <span class="new-value">{{ formatValue(row.new) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      
      <el-empty v-else description="无明显变更或数据无法对比" />
      
      <div class="summary" v-if="diff.changeSummary">
        <strong>变更摘要：</strong> {{ diff.changeSummary }}
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, defineProps, defineEmits } from 'vue'

const props = defineProps({
  diff: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close'])

const fromVersion = ref(props.diff.fromVersion || 1)
const toVersion = ref(props.diff.toVersion || 2)

function formatValue(val) {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
}

function close() {
  emit('close')
}
</script>

<style scoped>
.version-diff {
  margin-top: 16px;
}

.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.old-value {
  color: #f56c6c;
  text-decoration: line-through;
}

.new-value {
  color: #67c23a;
  font-weight: 500;
}

.summary {
  margin-top: 16px;
  padding: 12px;
  background: #f0f9eb;
  border-radius: 4px;
  font-size: 13px;
}
</style>
