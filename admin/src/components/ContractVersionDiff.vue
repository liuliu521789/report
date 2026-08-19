<template>
  <div class="version-diff">
    <div class="diff-header">
      <span>版本对比：v{{ fromVersion }} → v{{ toVersion }}</span>
    </div>

    <div v-if="diff.changeSummary" class="summary">
      <strong>变更摘要：</strong> {{ diff.changeSummary }}
    </div>

    <div v-if="diff.changes && diff.changes.length > 0" class="diff-content">
      <el-table :data="diff.changes" stripe border style="width: 100%">
        <el-table-column label="字段" width="140">
          <template #default="{ row }">
            {{ row.label || row.field }}
          </template>
        </el-table-column>
        <el-table-column label="旧值" min-width="220">
          <template #default="{ row }">
            <pre class="value-block old-value">{{ formatValue(row.old) }}</pre>
          </template>
        </el-table-column>
        <el-table-column label="新值" min-width="220">
          <template #default="{ row }">
            <pre class="value-block new-value">{{ formatValue(row.new) }}</pre>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-empty v-else description="这两版在结构化字段上无差异（可能仅元数据变更，或历史版本未写入 data_json）" />
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  diff: {
    type: Object,
    required: true
  }
});

defineEmits(['close']);

const fromVersion = computed(() => props.diff.fromVersion || 1);
const toVersion = computed(() => props.diff.toVersion || 2);

function formatValue(val) {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'string') {
    // 正文 HTML 过长时截断展示，避免弹窗卡死
    const text = val.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (val.includes('<') && text) {
      return text.length > 800 ? `${text.slice(0, 800)}…` : text;
    }
    return val.length > 1200 ? `${val.slice(0, 1200)}…` : val;
  }
  if (typeof val === 'object') {
    try {
      const s = JSON.stringify(val, null, 2);
      return s.length > 1200 ? `${s.slice(0, 1200)}…` : s;
    } catch {
      return String(val);
    }
  }
  return String(val);
}
</script>

<style scoped>
.version-diff {
  min-height: 120px;
}

.diff-header {
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 600;
  color: #1e3a5f;
}

.value-block {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.45;
  max-height: 220px;
  overflow: auto;
}

.old-value {
  color: #f56c6c;
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.new-value {
  color: #67c23a;
  font-weight: 500;
  text-decoration: none;
}

.summary {
  margin-bottom: 14px;
  padding: 12px;
  background: #f0f9eb;
  border-radius: 6px;
  font-size: 13px;
  color: #334155;
}

.diff-content {
  margin-top: 4px;
}
</style>
