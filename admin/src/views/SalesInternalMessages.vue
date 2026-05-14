<template>
  <div class="sales-internal-messages">
    <div class="messages-page-head">
      <div class="messages-page-head__text">
        <h1 class="messages-page-title">站内信</h1>
        <p class="messages-page-desc">系统通知与待办提醒；点击正文区域标记已读。左侧勾选后可批量删除。</p>
      </div>
      <div class="messages-page-head__actions">
        <el-button size="default" @click="loadMessages" icon=Refresh>刷新</el-button>
        <el-button
          v-if="filteredMessages.length"
          size="default"
          @click="toggleSelectAllFiltered"
        >
          {{ allFilteredSelected ? '取消全选' : '全选当前列表' }}
        </el-button>
        <el-button
          type="danger"
          plain
          :disabled="selectedIds.length === 0"
          @click="batchDeleteSelected"
         icon=Delete>
          批量删除{{ selectedIds.length ? ` (${selectedIds.length})` : '' }}
        </el-button>
        <el-button
          v-if="messages.length"
          type="danger"
          plain
          @click="clearMessageHistory"
        >
          清空历史
        </el-button>
      </div>
    </div>

    <el-radio-group v-model="messageInboxFilter" size="small" class="msg-type-filter">
      <el-radio-button value="all">全部</el-radio-button>
      <el-radio-button value="notice">普通通知</el-radio-button>
      <el-radio-button value="todo">待办通知</el-radio-button>
      <el-radio-button value="system">系统消息</el-radio-button>
    </el-radio-group>

    <el-scrollbar class="messages-scroll" max-height="calc(100vh - 220px)">
      <div
        v-for="m in filteredMessages"
        :key="m.id"
        class="msg-card"
        :class="{ 'msg-card--unread': !m.read_at }"
      >
        <div class="msg-card__layout">
          <el-checkbox
            class="msg-card__cb"
            :model-value="selectedIds.includes(m.id)"
            @click.stop
            @change="() => toggleSelect(m.id)"
          />
          <div class="msg-card__content" role="button" tabindex="0" @click="readMsg(m)" @keydown.enter="readMsg(m)">
            <div class="msg-card__row">
              <div
                class="msg-card__icon-wrap"
                :class="{
                  'msg-card__icon-wrap--reject': isFinanceRejectInboxMessage(m),
                  'msg-card__icon-wrap--notice': messageKind(m) === 'notice' && !isFinanceRejectInboxMessage(m),
                  'msg-card__icon-wrap--todo': messageKind(m) === 'todo',
                  'msg-card__icon-wrap--system': messageKind(m) === 'system'
                }"
                aria-hidden="true"
              >
                <span v-if="isFinanceRejectInboxMessage(m)" class="msg-card__reject-x">×</span>
                <el-icon v-else-if="messageKind(m) === 'notice'" :size="22"><Bell /></el-icon>
                <el-icon v-else-if="messageKind(m) === 'todo'" :size="22"><Calendar /></el-icon>
                <el-icon v-else :size="22"><Cpu /></el-icon>
              </div>
              <div class="msg-card__main">
                <div class="msg-card__head">
                  <span v-if="!m.read_at" class="msg-card__dot" aria-hidden="true" />
                  <span class="msg-card__title">{{ m.title }}</span>
                  <el-tag size="small" effect="plain" class="msg-card__type-tag">{{ messageKindLabel(m) }}</el-tag>
                  <el-tag v-if="!m.read_at" type="danger" size="small" effect="plain" class="msg-card__badge">未读</el-tag>
                </div>
                <div class="msg-card__body">{{ m.body_text }}</div>
                <div class="msg-card__time">{{ $dt(m.created_at) }}</div>
              </div>
            </div>
          </div>
          <el-button type="danger" link size="small" class="msg-card__del" @click.stop="deleteOne(m)" icon=Delete> 删除 </el-button>
        </div>
      </div>
      <el-empty
        v-if="!filteredMessages.length"
        :description="messages.length ? '该分类暂无消息' : '暂无消息'"
        class="messages-empty"
      />
    </el-scrollbar>
  </div>
</template>

<script>
import {
  listSalesMessages,
  markSalesMessageRead,
  clearSalesMessages,
  deleteSalesMessage,
  batchDeleteSalesMessages
} from '../api';
import { resolveInternalMessageRoute } from '../utils/internalMessageNavigate';

export default {
  name: 'SalesInternalMessages',
  data() {
    return {
      messages: [],
      selectedIds: [],
      /** all | notice | todo | system */
      messageInboxFilter: 'all',
      pollTimer: null,
      visibilityHandler: null
    };
  },
  computed: {
    filteredMessages() {
      const list = this.messages || [];
      const f = this.messageInboxFilter;
      if (f === 'all') return list;
      return list.filter((m) => this.messageKind(m) === f);
    },
    filteredIds() {
      return this.filteredMessages.map((m) => m.id);
    },
    allFilteredSelected() {
      const ids = this.filteredIds;
      if (!ids.length) return false;
      return ids.every((id) => this.selectedIds.includes(id));
    }
  },
  watch: {
    messageInboxFilter() {
      this.pruneSelection();
    },
    messages() {
      this.pruneSelection();
    }
  },
  async mounted() {
    await this.bootstrapInbox();
    this.pollTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      this.loadMessages();
    }, 2000);
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') this.loadMessages();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  },
  beforeUnmount() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  },
  methods: {
    pruneSelection() {
      const valid = new Set((this.messages || []).map((m) => m.id));
      this.selectedIds = this.selectedIds.filter((id) => valid.has(id));
    },
    toggleSelect(id) {
      const i = this.selectedIds.indexOf(id);
      if (i >= 0) this.selectedIds.splice(i, 1);
      else this.selectedIds.push(id);
    },
    toggleSelectAllFiltered() {
      const ids = this.filteredIds;
      if (!ids.length) return;
      if (this.allFilteredSelected) {
        const drop = new Set(ids);
        this.selectedIds = this.selectedIds.filter((id) => !drop.has(id));
      } else {
        const set = new Set(this.selectedIds);
        ids.forEach((id) => set.add(id));
        this.selectedIds = [...set];
      }
    },
    async bootstrapInbox() {
      await this.loadMessages();
      await this.markAllMessagesRead();
    },
    async loadMessages() {
      try {
        const d = await listSalesMessages({});
        this.messages = d.items || [];
      } catch {
        /* ignore */
      }
    },
    async markAllMessagesRead() {
      const unread = this.messages.filter((m) => !m.read_at);
      if (!unread.length) return;
      try {
        await Promise.all(
          unread.map((m) =>
            markSalesMessageRead(m.id).then(() => {
              m.read_at = new Date().toISOString();
            })
          )
        );
      } catch {
        this.loadMessages();
      }
    },
    isFinanceRejectInboxMessage(m) {
      if (!m) return false;
      if (m.title === '订单审核驳回') return true;
      if (m.ref_type === 'order_batch_rejected') return true;
      return false;
    },
    messageKind(m) {
      const c = m && m.category;
      if (c === 'todo' || c === 'system') return c;
      return 'notice';
    },
    messageKindLabel(m) {
      const k = this.messageKind(m);
      if (k === 'todo') return '待办';
      if (k === 'system') return '系统';
      return '普通';
    },
    async readMsg(m) {
      if (!m.read_at) {
        try {
          await markSalesMessageRead(m.id);
          m.read_at = new Date().toISOString();
          this.loadMessages();
        } catch {
          /* ignore */
          return;
        }
      }
      const target = resolveInternalMessageRoute(m);
      if (!target) return;
      try {
        await this.$router.push(target);
      } catch (e) {
        if (e && e.name === 'NavigationDuplicated') return;
        throw e;
      }
    },
    async deleteOne(m) {
      try {
        await this.$confirm('确定删除这条站内信？', '删除确认', {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消'
        });
      } catch {
        return;
      }
      try {
        await deleteSalesMessage(m.id);
        this.messages = this.messages.filter((x) => x.id !== m.id);
        this.selectedIds = this.selectedIds.filter((id) => id !== m.id);
        this.$message.success('已删除');
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '删除失败'));
      }
    },
    async batchDeleteSelected() {
      if (!this.selectedIds.length) return;
      try {
        await this.$confirm(
          `将删除已选中的 ${this.selectedIds.length} 条站内信，且不可恢复。是否继续？`,
          '批量删除',
          { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
        );
      } catch {
        return;
      }
      try {
        const r = await batchDeleteSalesMessages(this.selectedIds);
        const n = Number(r.deleted ?? 0);
        this.$message.success(n ? `已删除 ${n} 条` : '已处理');
        this.selectedIds = [];
        await this.loadMessages();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '批量删除失败'));
      }
    },
    async clearMessageHistory() {
      try {
        await this.$confirm(
          '将删除您账号下的全部站内信记录（含未读），且不可恢复。是否继续？',
          '清空历史',
          { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' }
        );
      } catch {
        return;
      }
      try {
        await clearSalesMessages();
        this.messages = [];
        this.selectedIds = [];
        this.$message.success('站内信已清空');
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '清空失败'));
      }
    }
  }
};
</script>

<style scoped>
.sales-internal-messages {
  max-width: 720px;
  margin: 0 auto;
}
.messages-page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.messages-page-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
  color: #0f172a;
}
.messages-page-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}
.messages-page-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.msg-type-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-bottom: 12px;
  width: 100%;
}
.msg-type-filter :deep(.el-radio-button__inner) {
  padding: 7px 10px;
}
.messages-scroll {
  padding-right: 4px;
}
.messages-empty {
  padding: 24px 0;
}
.msg-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px 10px;
  margin-bottom: 10px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.msg-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  background: #fff;
}
.msg-card--unread {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.06), #f8fafc);
  border-color: rgba(34, 197, 94, 0.35);
  border-left-width: 3px;
  border-left-color: #22c55e;
}
.msg-card__layout {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.msg-card__cb {
  flex-shrink: 0;
  margin-top: 4px;
}
.msg-card__content {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.msg-card__content:focus-visible {
  outline: 2px solid rgba(34, 197, 94, 0.45);
  outline-offset: 2px;
  border-radius: 8px;
}
.msg-card__del {
  flex-shrink: 0;
  margin-top: 2px;
}
.msg-card__row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.msg-card__icon-wrap {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.msg-card__icon-wrap--reject {
  background: #ef4444;
  border-color: #dc2626;
  box-shadow: 0 1px 3px rgba(220, 38, 38, 0.35);
}
.msg-card__reject-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 26px;
  font-weight: 600;
  line-height: 1;
  color: #fff;
  user-select: none;
}
.msg-card__icon-wrap--notice :deep(.el-icon) {
  color: #2563eb;
}
.msg-card__icon-wrap--todo :deep(.el-icon) {
  color: #d97706;
}
.msg-card__icon-wrap--system :deep(.el-icon) {
  color: #64748b;
}
.msg-card__main {
  flex: 1;
  min-width: 0;
}
.msg-card__head {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-bottom: 8px;
}
.msg-card__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: #ef4444;
}
.msg-card__title {
  flex: 1;
  min-width: 120px;
  font-weight: 600;
  font-size: 14px;
  color: #0f172a;
  line-height: 1.4;
}
.msg-card__type-tag {
  flex-shrink: 0;
  color: #64748b !important;
  border-color: #e2e8f0 !important;
  background: rgba(255, 255, 255, 0.9) !important;
}
.msg-card__badge {
  flex-shrink: 0;
}
.msg-card__body {
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-card__time {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 10px;
}
</style>
