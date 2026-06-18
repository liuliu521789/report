<template>
  <div v-if="tabs.length" class="page-tabs">
    <button
      v-show="canScrollLeft"
      type="button"
      class="page-tabs__nav page-tabs__nav--prev"
      aria-label="向左滚动标签"
      @click="scrollBy(-220)"
    >
      <el-icon :size="14"><ArrowLeft /></el-icon>
    </button>

    <div
      ref="scrollWrapRef"
      class="page-tabs__scroll"
      @scroll="updateScrollState"
    >
      <div class="page-tabs__list">
        <div
          v-for="tab in tabs"
          :key="tab.fullPath"
          class="page-tabs__item"
        >
          <div
            class="page-tab"
            :class="{ 'page-tab--active': tab.fullPath === activeFullPath }"
            @click="activateTab(tab)"
            @contextmenu.prevent="openContextMenu($event, tab)"
          >
            <span v-if="tab.affix" class="page-tab__pin" aria-hidden="true">
              <el-icon :size="11"><HomeFilled /></el-icon>
            </span>
            <span class="page-tab__title" :title="tab.title">{{ tab.title }}</span>
            <button
              v-if="!tab.affix || tabs.length > 1"
              type="button"
              class="page-tab__close"
              aria-label="关闭页签"
              @click.stop="closeTab(tab)"
            >
              <el-icon :size="12"><Close /></el-icon>
            </button>
          </div>
        </div>
      </div>
    </div>

    <button
      v-show="canScrollRight"
      type="button"
      class="page-tabs__nav page-tabs__nav--next"
      aria-label="向右滚动标签"
      @click="scrollBy(220)"
    >
      <el-icon :size="14"><ArrowRight /></el-icon>
    </button>

    <el-dropdown
      ref="contextDropdownRef"
      trigger="contextmenu"
      :virtual-ref="contextTriggerEl"
      virtual-triggering
      @command="onContextCommand"
    >
      <span class="page-tabs__ctx-anchor" aria-hidden="true" />
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="close">关闭当前页面</el-dropdown-item>
          <el-dropdown-item command="closeOthers" :disabled="tabs.length <= 1">
            关闭其他页面
          </el-dropdown-item>
          <el-dropdown-item command="closeLeft" :disabled="!contextTab || !canCloseLeft(contextTab)">
            关闭左侧所有
          </el-dropdown-item>
          <el-dropdown-item command="closeRight" :disabled="!contextTab || !canCloseRight(contextTab)">
            关闭右侧所有
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script>
import { mapState } from 'pinia';
import { ArrowLeft, ArrowRight, Close, HomeFilled } from '@element-plus/icons-vue';
import { usePageTabsStore } from '../stores/pageTabs';

export default {
  name: 'PageTabs',
  components: { ArrowLeft, ArrowRight, Close, HomeFilled },
  data() {
    return {
      contextTriggerEl: null,
      contextTab: null,
      canScrollLeft: false,
      canScrollRight: false,
      resizeObserver: null
    };
  },
  computed: {
    ...mapState(usePageTabsStore, ['tabs', 'activeFullPath'])
  },
  watch: {
    tabs() {
      this.$nextTick(() => {
        this.updateScrollState();
        this.scrollActiveTabIntoView();
      });
    },
    activeFullPath() {
      this.$nextTick(() => this.scrollActiveTabIntoView());
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.updateScrollState();
      this.scrollActiveTabIntoView();
      this.initResizeObserver();
    });
  },
  beforeUnmount() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  },
  methods: {
    getScrollWrap() {
      return this.$refs.scrollWrapRef || null;
    },
    updateScrollState() {
      const wrap = this.getScrollWrap();
      if (!wrap) {
        this.canScrollLeft = false;
        this.canScrollRight = false;
        return;
      }
      const maxScroll = wrap.scrollWidth - wrap.clientWidth;
      if (maxScroll <= 1) {
        this.canScrollLeft = false;
        this.canScrollRight = false;
        return;
      }
      this.canScrollLeft = wrap.scrollLeft > 1;
      this.canScrollRight = wrap.scrollLeft < maxScroll - 1;
    },
    scrollBy(delta) {
      const wrap = this.getScrollWrap();
      if (!wrap) return;
      wrap.scrollBy({ left: delta, behavior: 'smooth' });
    },
    scrollActiveTabIntoView() {
      const wrap = this.getScrollWrap();
      const active = this.$el?.querySelector('.page-tab--active');
      if (!wrap || !active) return;

      const wrapRect = wrap.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const padding = 12;

      if (activeRect.right > wrapRect.right - padding) {
        wrap.scrollLeft += activeRect.right - wrapRect.right + padding;
      } else if (activeRect.left < wrapRect.left + padding) {
        wrap.scrollLeft -= wrapRect.left - activeRect.left + padding;
      }
      this.updateScrollState();
    },
    initResizeObserver() {
      const wrap = this.getScrollWrap();
      if (!wrap || typeof ResizeObserver === 'undefined') return;
      this.resizeObserver = new ResizeObserver(() => {
        this.updateScrollState();
        this.scrollActiveTabIntoView();
      });
      this.resizeObserver.observe(wrap);
      const list = wrap.querySelector('.page-tabs__list');
      if (list) this.resizeObserver.observe(list);
    },
    tabIndex(tab) {
      return this.tabs.findIndex((t) => t.fullPath === tab.fullPath);
    },
    canCloseLeft(tab) {
      const idx = this.tabIndex(tab);
      if (idx <= 0) return false;
      return this.tabs.slice(0, idx).some((t) => !t.affix);
    },
    canCloseRight(tab) {
      const idx = this.tabIndex(tab);
      return idx >= 0 && idx < this.tabs.length - 1;
    },
    openContextMenu(event, tab) {
      this.contextTriggerEl = event.currentTarget;
      this.contextTab = tab;
      this.$nextTick(() => {
        this.$refs.contextDropdownRef?.handleOpen?.();
      });
    },
    activateTab(tab) {
      const target = String(tab?.fullPath || '');
      if (!target || target === this.$route.fullPath) return;
      const resolved = this.$router.resolve(target);
      this.$router.push(resolved).catch((err) => {
        if (err?.name !== 'NavigationDuplicated') {
          console.warn('[PageTabs] navigation failed', err);
        }
      });
    },
    async navigateAfterClose(targetFullPath) {
      if (!targetFullPath || targetFullPath === this.$route.fullPath) return;
      const resolved = this.$router.resolve(targetFullPath);
      await this.$router.push(resolved).catch((err) => {
        if (err?.name !== 'NavigationDuplicated') {
          console.warn('[PageTabs] navigation failed', err);
        }
      });
    },
    async closeTab(tab) {
      const target = usePageTabsStore().closeTab(tab.fullPath);
      await this.navigateAfterClose(target);
    },
    async onContextCommand(command) {
      const tab = this.contextTab;
      if (!tab) return;
      const store = usePageTabsStore();
      let target = null;
      if (command === 'close') {
        target = store.closeTab(tab.fullPath);
      } else if (command === 'closeOthers') {
        target = store.closeOthers(tab.fullPath);
      } else if (command === 'closeLeft') {
        target = store.closeLeft(tab.fullPath);
      } else if (command === 'closeRight') {
        target = store.closeRight(tab.fullPath);
      }
      await this.navigateAfterClose(target);
    }
  }
};
</script>

<style scoped>
.page-tabs {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
  width: 100%;
  position: relative;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border, rgba(15, 23, 42, 0.08));
}

.page-tabs__nav {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 34px;
  margin-bottom: -1px;
  border: none;
  background: rgba(255, 255, 255, 0.9);
  color: #64748b;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.page-tabs__nav--prev {
  border-right: 1px solid var(--border, rgba(15, 23, 42, 0.08));
}

.page-tabs__nav--next {
  border-left: 1px solid var(--border, rgba(15, 23, 42, 0.08));
}

.page-tabs__nav:hover {
  color: var(--primary, #22c55e);
  background: rgba(34, 197, 94, 0.06);
}

.page-tabs__scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(15, 23, 42, 0.2) transparent;
}

.page-tabs__scroll::-webkit-scrollbar {
  height: 4px;
}

.page-tabs__scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.15);
}

.page-tabs__scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(15, 23, 42, 0.28);
}

.page-tabs__list {
  display: flex;
  align-items: flex-end;
  width: max-content;
  min-width: 100%;
  gap: 4px;
  padding: 0 14px;
}

.page-tabs__item {
  flex-shrink: 0;
}

.page-tabs__ctx-anchor {
  position: fixed;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}

.page-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 200px;
  height: 34px;
  padding: 0 12px;
  margin-bottom: -1px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  background: transparent;
  color: var(--muted, #64748b);
  cursor: pointer;
  user-select: none;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.page-tab::before {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 0;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--primary, #22c55e);
  opacity: 0;
  transform: scaleX(0.6);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.page-tab:hover {
  background: rgba(34, 197, 94, 0.06);
  color: #334155;
}

.page-tab:hover .page-tab__close {
  opacity: 1;
  width: 18px;
  margin-left: 0;
}

.page-tab--active {
  background: var(--bg, #f6f7fb);
  border-color: var(--border, rgba(15, 23, 42, 0.08));
  color: var(--text, #0f172a);
  font-weight: 600;
  box-shadow: 0 1px 0 var(--bg, #f6f7fb);
  z-index: 1;
}

.page-tab--active::before {
  opacity: 1;
  transform: scaleX(1);
}

.page-tab--active .page-tab__close {
  opacity: 1;
  width: 18px;
}

.page-tab__pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--primary, #22c55e);
  opacity: 0.85;
}

.page-tab__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 1.2;
  letter-spacing: 0.01em;
}

.page-tab__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0;
  height: 18px;
  padding: 0;
  margin-left: -2px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    opacity 0.15s ease,
    width 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.page-tab__close:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
</style>
