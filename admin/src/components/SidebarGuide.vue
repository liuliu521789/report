<template>
  <div class="sidebar-guide" :class="{ 'is-collapsed': collapsed }">
    <div class="guide-grid">
      <el-tooltip
        :disabled="!collapsed"
        content="操作指南"
        placement="right"
        :show-after="280"
      >
        <button
          type="button"
          class="guide-item guide-item--guide"
          :class="{ 'is-active': isGuideActive, 'is-collapsed': collapsed }"
          @click="goGuide"
        >
          <el-icon class="guide-icon"><Reading /></el-icon>
          <span v-if="!collapsed" class="guide-label">操作指南</span>
        </button>
      </el-tooltip>
    </div>
  </div>
</template>

<script>
import { Reading } from '@element-plus/icons-vue';

export default {
  name: 'SidebarGuide',
  components: { Reading },
  props: {
    collapsed: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    isGuideActive() {
      return this.$route.path === '/operation-guide';
    }
  },
  methods: {
    goGuide() {
      this.$router.push('/operation-guide');
    }
  }
};
</script>

<style scoped>
.sidebar-guide {
  flex-shrink: 0;
  padding: 10px 12px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-guide.is-collapsed {
  padding: 8px 8px 10px;
}

.guide-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.guide-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 56px;
  padding: 8px 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.82);
  font-size: 12px;
  line-height: 1.25;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.guide-item.is-collapsed {
  flex-direction: row;
  min-height: 40px;
  padding: 0;
  border-radius: 8px;
}

.guide-item:focus-visible {
  outline: 2px solid rgba(34, 197, 94, 0.55);
  outline-offset: 2px;
}

.guide-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.guide-label {
  max-width: 100%;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.guide-item--guide {
  border-color: rgba(34, 197, 94, 0.22);
  background: rgba(34, 197, 94, 0.08);
  color: #86efac;
}

.guide-item--guide:hover {
  border-color: rgba(34, 197, 94, 0.55);
  background: rgba(34, 197, 94, 0.16);
  color: #bbf7d0;
}

.guide-item--guide.is-active {
  border-color: rgba(34, 197, 94, 0.65);
  background: rgba(34, 197, 94, 0.2);
  color: #dcfce7;
  box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.15);
}

.sidebar-guide.is-collapsed :deep(.el-tooltip__trigger) {
  display: block;
  width: 100%;
}
</style>
