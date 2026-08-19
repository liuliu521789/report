<template>
  <el-dialog
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    title="绑定质检二维码"
    width="560px"
    destroy-on-close
    @open="fetchList"
  >
    <el-input
      v-model="search"
      placeholder="按报告品名、批号、客户搜索"
      clearable
      class="qc-bind-search"
      @keyup.enter="fetchList"
    >
      <template #append>
        <el-button @click="fetchList">搜索</el-button>
      </template>
    </el-input>
    <el-scrollbar max-height="420px" class="qc-bind-scroll">
      <div v-if="listLoading" class="muted qc-bind-pad">加载中…</div>
      <div v-else class="qc-bind-list">
        <div v-for="it in items" :key="it.id" class="qc-bind-row">
          <img :src="it.qrThumbDataUrl" class="qc-bind-thumb" alt="">
          <div class="qc-bind-meta">
            <div class="qc-bind-id">{{ displayQrcodeUid(it) || '—' }}</div>
            <div class="qc-bind-tags text-muted">{{ formatTags(it.reportTags) }}</div>
          </div>
          <el-button type="primary" size="small" :loading="saving" @click="handleBind(it)">
            绑定
          </el-button>
        </div>
        <el-empty v-if="!items.length && !listLoading" description="暂无数据，请先在报告管理中生成二维码" />
      </div>
    </el-scrollbar>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { listSalesQrcodeBindCandidates, patchSalesOrderQcQrcode } from '../../api';
import { displayQrcodeUid } from '../../utils/qrcodeUid';

const props = defineProps({
  visible: Boolean,
  orderId: { type: Number, default: null }
});

const emit = defineEmits(['update:visible', 'success']);

const search = ref('');
const listLoading = ref(false);
const saving = ref(false);
const items = ref([]);

async function fetchList() {
  listLoading.value = true;
  try {
    const d = await listSalesQrcodeBindCandidates({ q: search.value || undefined, limit: 80 });
    items.value = d.items || [];
  } catch {
    items.value = [];
    ElMessage.error('加载二维码列表失败');
  } finally {
    listLoading.value = false;
  }
}

function formatCustomerTag(t) {
  const name = String(t?.customerName || '').trim();
  const contact = String(t?.customerContact || '').trim();
  if (name && contact && name !== contact) return `${name}（${contact}）`;
  return name || contact || '';
}

function formatTags(tags) {
  if (!tags?.length) return '—';
  return tags
    .slice(0, 5)
    .map((t) => {
      const parts = [formatCustomerTag(t), t.productName, t.batchNo].filter(Boolean);
      return parts.join(' / ') || '—';
    })
    .join('；');
}

async function handleBind(it) {
  if (!props.orderId) return;
  saving.value = true;
  try {
    await patchSalesOrderQcQrcode(props.orderId, { qrcodeId: it.qrcodeId ?? it.id });
    ElMessage.success('已绑定');
    emit('update:visible', false);
    emit('success');
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '绑定失败');
  } finally {
    saving.value = false;
  }
}
</script>
