<template>
  <el-drawer
    :modelValue="visible"
    @update:modelValue="$emit('update:visible', $event)"
    title="站内消息"
    size="420px"
    class="messages-drawer"
    @open="onOpen"
  >
    <div class="messages-toolbar messages-toolbar--top">
      <el-button size="small" @click="load" icon="Refresh">刷新</el-button>
      <el-button
        v-if="messages.length"
        size="small"
        type="danger"
        plain
        @click="clearHistory"
      >
        清空历史
      </el-button>
      <span class="messages-hint">点击卡片标记已读</span>
    </div>
    <el-radio-group v-model="inboxFilter" size="small" class="msg-type-filter">
      <el-radio-button value="all">全部</el-radio-button>
      <el-radio-button value="notice">普通通知</el-radio-button>
      <el-radio-button value="todo">待办通知</el-radio-button>
      <el-radio-button value="system">系统消息</el-radio-button>
    </el-radio-group>
    <el-scrollbar class="messages-scroll" max-height="calc(100vh - 200px)">
      <div
        v-for="m in filteredMessages"
        :key="m.id"
        class="msg-card"
        :class="{ 'msg-card--unread': !m.read_at }"
        role="button"
        tabindex="0"
        @click="readMsg(m)"
        @keydown.enter="readMsg(m)"
      >
        <div class="msg-card__row">
          <div
            class="msg-card__icon-wrap"
            :class="{
              'msg-card__icon-wrap--reject': isFinanceReject(m),
              'msg-card__icon-wrap--notice': msgKind(m) === 'notice' && !isFinanceReject(m),
              'msg-card__icon-wrap--todo': msgKind(m) === 'todo',
              'msg-card__icon-wrap--system': msgKind(m) === 'system'
            }"
            aria-hidden="true"
          >
            <span v-if="isFinanceReject(m)" class="msg-card__reject-x">×</span>
            <el-icon v-else-if="msgKind(m) === 'notice'" :size="22"><Bell /></el-icon>
            <el-icon v-else-if="msgKind(m) === 'todo'" :size="22"><Calendar /></el-icon>
            <el-icon v-else :size="22"><Cpu /></el-icon>
          </div>
          <div class="msg-card__main">
            <div class="msg-card__head">
              <span v-if="!m.read_at" class="msg-card__dot" aria-hidden="true" />
              <span class="msg-card__title">{{ m.title }}</span>
              <el-tag size="small" effect="plain" class="msg-card__type-tag">{{ msgKindLabel(m) }}</el-tag>
              <el-tag v-if="!m.read_at" type="danger" size="small" effect="plain" class="msg-card__badge">未读</el-tag>
            </div>
            <div class="msg-card__body">{{ m.body_text }}</div>
            <div class="msg-card__time">{{ $dt(m.created_at) }}</div>
          </div>
        </div>
      </div>
      <el-empty
        v-if="!filteredMessages.length"
        :description="messages.length ? '该分类暂无消息' : '暂无消息'"
        class="messages-empty"
      />
    </el-scrollbar>
  </el-drawer>
</template>

<script setup>
import { ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRouter } from 'vue-router';
import { listSalesMessages, markSalesMessageRead, clearSalesMessages } from '../../api';
import { resolveInternalMessageRoute } from '../../utils/internalMessageNavigate';

const props = defineProps({
  visible: Boolean,
  showMessages: { type: Boolean, default: true }
});

const emit = defineEmits(['update:visible', 'unread-changed']);

const router = useRouter();
const messages = ref([]);
const inboxFilter = ref('all');
const unreadCount = ref(0);

const filteredMessages = computed(() => {
  const f = inboxFilter.value;
  if (f === 'all') return messages.value;
  return messages.value.filter((m) => msgKind(m) === f);
});

function isFinanceReject(m) {
  if (!m) return false;
  if (m.title === '订单审核驳回') return true;
  if (m.ref_type === 'order_batch_rejected') return true;
  return false;
}

function msgKind(m) {
  const c = m && m.category;
  if (c === 'todo' || c === 'system') return c;
  return 'notice';
}

function msgKindLabel(m) {
  const k = msgKind(m);
  if (k === 'todo') return '待办';
  if (k === 'system') return '系统';
  return '普通';
}

async function load() {
  if (!props.showMessages) return;
  try {
    const d = await listSalesMessages({});
    messages.value = d.items || [];
    const u = await listSalesMessages({ unread: 1 });
    unreadCount.value = (u.items || []).length;
    emit('unread-changed', unreadCount.value);
  } catch {
    messages.value = [];
    unreadCount.value = 0;
    emit('unread-changed', 0);
  }
}

async function markAllRead() {
  const unread = messages.value.filter((m) => !m.read_at);
  if (!unread.length) { unreadCount.value = 0; emit('unread-changed', 0); return; }
  try {
    await Promise.all(unread.map((m) => markSalesMessageRead(m.id).then(() => { m.read_at = new Date().toISOString(); })));
    unreadCount.value = 0;
    emit('unread-changed', 0);
  } catch { load(); }
}

async function onOpen() {
  await load();
  await markAllRead();
}

async function readMsg(m) {
  if (!m.read_at) {
    try {
      await markSalesMessageRead(m.id);
      m.read_at = new Date().toISOString();
      load();
    } catch { return; }
  }
  const target = resolveInternalMessageRoute(m);
  if (!target) return;
  emit('update:visible', false);
  try { await router.push(target); } catch (e) { if (e?.name !== 'NavigationDuplicated') throw e; }
}

async function clearHistory() {
  try {
    await ElMessageBox.confirm('将删除您账号下的全部站内信记录（含未读），且不可恢复。是否继续？', '清空历史', { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' });
  } catch { return; }
  try {
    await clearSalesMessages();
    messages.value = [];
    unreadCount.value = 0;
    emit('unread-changed', 0);
    ElMessage.success('站内信已清空');
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '清空失败');
  }
}

defineExpose({ refresh: load });
</script>
