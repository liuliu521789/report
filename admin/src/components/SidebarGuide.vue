<template>
  <div class="sidebar-guide" :class="{ 'is-collapsed': collapsed }">
    <el-button
      class="guide-trigger"
      :class="{ 'is-collapsed': collapsed }"
      type="primary"
      plain
      @click="goGuide"
    >
      <el-icon class="guide-icon"><Reading /></el-icon>
      <span v-if="!collapsed" class="guide-label">操作指南</span>
    </el-button>
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
  padding: 10px 12px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 4px;
}

.sidebar-guide.is-collapsed {
  padding-left: 8px;
  padding-right: 8px;
}

.guide-trigger {
  width: 100%;
  justify-content: center;
  border-color: rgba(34, 197, 94, 0.45) !important;
  color: #86efac !important;
  background: rgba(34, 197, 94, 0.1) !important;
}

.guide-trigger:hover {
  border-color: rgba(34, 197, 94, 0.75) !important;
  color: #bbf7d0 !important;
  background: rgba(34, 197, 94, 0.18) !important;
}

.guide-trigger.is-collapsed {
  width: 100%;
  padding-left: 8px;
  padding-right: 8px;
  min-height: 40px;
}

.guide-icon {
  font-size: 18px;
}

.guide-label {
  margin-left: 6px;
}
</style>
