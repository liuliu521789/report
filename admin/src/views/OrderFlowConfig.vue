<template>
  <div class="order-flow-config-page">
    <div class="page-title-row">
      <div>
        <h2>订单审核流程配置</h2>
        <p class="text-muted">配置审核节点顺序与审核人（员工类别或指定人员）。保存后，新提交的订单按此流程流转；已在审订单仍按提交时锁定的版本。</p>
      </div>
      <div class="page-title-actions">
        <el-button @click="goBack">返回订单</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存配置</el-button>
      </div>
    </div>

    <el-card v-loading="loading" class="flow-card">
      <div class="section-header">审核节点</div>
      <p class="section-hint">可增删、调整顺序。每种节点类型（财务审核 / 品管审核）最多配置一次。</p>

      <div v-if="!steps.length" class="empty-steps">
        <el-empty description="尚未配置审核节点">
          <el-button type="primary" @click="addStep">添加节点</el-button>
        </el-empty>
      </div>

      <div v-for="(step, idx) in steps" :key="step.id" class="flow-step-row">
        <div class="flow-step-row__order">{{ idx + 1 }}</div>
        <div class="flow-step-row__body">
          <el-form label-width="88px" class="flow-step-form">
            <el-form-item label="节点名称">
              <el-input v-model="step.label" placeholder="例如：财务审核" maxlength="32" />
            </el-form-item>
            <el-form-item label="节点类型">
              <el-select v-model="step.node_type" @change="onNodeTypeChange(step)">
                <el-option
                  v-for="opt in availableNodeTypes(step)"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="审核人">
              <el-radio-group v-model="step.assignee_type">
                <el-radio label="category">按员工类别</el-radio>
                <el-radio label="users">指定人员</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="step.assignee_type === 'category'" label="员工类别">
              <el-select v-model="step.assignee_category" placeholder="选择类别">
                <el-option
                  v-for="c in meta.assignee_categories"
                  :key="c.value"
                  :label="c.label"
                  :value="c.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item v-else label="指定人员">
              <el-select
                v-model="step.assignee_user_ids"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                placeholder="选择审核人"
                class="w-full"
              >
                <el-option
                  v-for="u in reviewers"
                  :key="u.id"
                  :label="reviewerLabel(u)"
                  :value="u.id"
                />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
        <div class="flow-step-row__actions">
          <el-button text :disabled="idx === 0" @click="moveStep(idx, -1)">上移</el-button>
          <el-button text :disabled="idx === steps.length - 1" @click="moveStep(idx, 1)">下移</el-button>
          <el-button text type="danger" @click="removeStep(idx)">删除</el-button>
        </div>
      </div>

      <div v-if="steps.length && canAddStep" class="flow-step-add">
        <el-button @click="addStep">+ 添加审核节点</el-button>
      </div>

      <div class="section-header mt24">固定后续环节</div>
      <p class="section-hint">以下环节不可删除，发货与完结仍由仓库 / 财务在订单列表操作。</p>
      <div class="terminal-flow">
        <div v-for="node in meta.terminal_nodes" :key="node.key" class="terminal-flow__item">
          <span class="terminal-flow__dot" />
          <span>{{ node.label }}</span>
          <el-tag size="small" type="info">系统固定</el-tag>
        </div>
      </div>

      <div v-if="version" class="version-foot">当前版本：v{{ version }}（保存后自动 +1）</div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  getSalesOrderFlowConfig,
  saveSalesOrderFlowConfig,
  listFinanceReviewers
} from '../api';

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const version = ref(1);
const steps = ref([]);
const reviewers = ref([]);
const meta = ref({
  node_types: [],
  assignee_categories: [],
  terminal_nodes: []
});

const usedNodeTypes = computed(() => new Set(steps.value.map((s) => s.node_type)));
const canAddStep = computed(() => {
  const all = meta.value.node_types?.length || 0;
  return steps.value.length < all;
});

function reviewerLabel(u) {
  const name = String(u?.displayName || u?.realName || u?.username || '').trim();
  const dept = String(u?.departmentNameZh || '').trim();
  if (dept && name) return `${name}（${dept}）`;
  return name || `用户#${u?.id}`;
}

function availableNodeTypes(currentStep) {
  return (meta.value.node_types || []).filter(
    (opt) => opt.value === currentStep.node_type || !usedNodeTypes.value.has(opt.value)
  );
}

function defaultStep(nodeType) {
  const isQc = nodeType === 'qc_review';
  return {
    id: `${nodeType}_${Date.now()}`,
    node_type: nodeType,
    label: isQc ? '品管审核' : '财务审核',
    assignee_type: 'category',
    assignee_category: isQc ? 'qc' : 'finance',
    assignee_user_ids: []
  };
}

function onNodeTypeChange(step) {
  if (step.node_type === 'qc_review') {
    if (!step.label || step.label === '财务审核') step.label = '品管审核';
    if (step.assignee_type === 'category' && !step.assignee_category) step.assignee_category = 'qc';
  } else if (step.node_type === 'finance_review') {
    if (!step.label || step.label === '品管审核') step.label = '财务审核';
    if (step.assignee_type === 'category' && !step.assignee_category) step.assignee_category = 'finance';
  }
}

function addStep() {
  const remaining = (meta.value.node_types || []).find((t) => !usedNodeTypes.value.has(t.value));
  if (!remaining) {
    ElMessage.warning('已无可用节点类型');
    return;
  }
  steps.value.push(defaultStep(remaining.value));
}

function removeStep(idx) {
  steps.value.splice(idx, 1);
}

function moveStep(idx, delta) {
  const to = idx + delta;
  if (to < 0 || to >= steps.value.length) return;
  const next = [...steps.value];
  const [cur] = next.splice(idx, 1);
  next.splice(to, 0, cur);
  steps.value = next;
}

function goBack() {
  router.push('/sales/orders');
}

async function load() {
  loading.value = true;
  try {
    const [cfg, rev] = await Promise.all([
      getSalesOrderFlowConfig(),
      listFinanceReviewers()
    ]);
    const payload = cfg?.data ?? cfg;
    version.value = payload.version || 1;
    meta.value = payload.meta || meta.value;
    steps.value = (payload.definition?.steps || []).map((s) => ({
      ...s,
      assignee_user_ids: [...(s.assignee_user_ids || [])]
    }));
    reviewers.value = rev?.items || rev?.data?.items || [];
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载流程配置失败');
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!steps.value.length) {
    ElMessage.warning('请至少保留一个审核节点');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      version: version.value,
      steps: steps.value.map((s) => ({
        id: s.id,
        node_type: s.node_type,
        label: String(s.label || '').trim(),
        assignee_type: s.assignee_type,
        assignee_category: s.assignee_type === 'category' ? s.assignee_category : '',
        assignee_user_ids: s.assignee_type === 'users' ? s.assignee_user_ids : []
      }))
    };
    const res = await saveSalesOrderFlowConfig(payload);
    const saved = res?.data ?? res;
    version.value = saved.version || version.value + 1;
    if (saved.definition?.steps) {
      steps.value = saved.definition.steps.map((s) => ({
        ...s,
        assignee_user_ids: [...(s.assignee_user_ids || [])]
      }));
    }
    ElMessage.success('流程配置已保存');
  } catch (e) {
    const d = e?.response?.data;
    const details = d?.details || d?.data?.details;
    if (Array.isArray(details) && details.length) {
      ElMessage.error(details.join('；'));
    } else {
      ElMessage.error(d?.message || '保存失败');
    }
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.order-flow-config-page {
  padding: 16px 20px 32px;
  max-width: 920px;
}
.page-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.page-title-row h2 {
  margin: 0 0 6px;
  font-size: 20px;
}
.text-muted {
  color: #64748b;
  font-size: 13px;
  margin: 0;
  line-height: 1.6;
}
.page-title-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.flow-card {
  border-radius: 12px;
}
.section-header {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 4px;
}
.section-hint {
  font-size: 12px;
  color: #94a3b8;
  margin: 0 0 16px;
}
.flow-step-row {
  display: flex;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #eef2f7;
}
.flow-step-row__order {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #eff6ff;
  color: #2563eb;
  font-weight: 700;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 6px;
}
.flow-step-row__body {
  flex: 1;
  min-width: 0;
}
.flow-step-form :deep(.el-form-item) {
  margin-bottom: 10px;
}
.flow-step-row__actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
}
.flow-step-add {
  margin-top: 12px;
}
.mt24 {
  margin-top: 24px;
}
.terminal-flow {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.terminal-flow__item {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #475569;
  font-size: 14px;
}
.terminal-flow__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #cbd5e1;
}
.version-foot {
  margin-top: 20px;
  font-size: 12px;
  color: #94a3b8;
}
.w-full {
  width: 100%;
}
</style>
