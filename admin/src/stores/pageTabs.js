import { defineStore } from 'pinia';
import { resolvePageTitle, resolveRouteComponentName } from '../utils/pageRouteMeta';

const AFFIX_PATHS = new Set(['/dashboard']);

function buildTabFromRoute(route) {
  const path = route.path;
  const fullPath = route.fullPath;
  return {
    path,
    fullPath,
    title: resolvePageTitle(path),
    componentName: resolveRouteComponentName(route),
    affix: AFFIX_PATHS.has(path)
  };
}

function rebuildCachedNames(tabs) {
  const names = new Set();
  for (const tab of tabs) {
    if (tab.componentName) names.add(tab.componentName);
  }
  return [...names];
}

export const usePageTabsStore = defineStore('pageTabs', {
  state: () => ({
    tabs: [],
    activeFullPath: '',
    cachedComponentNames: []
  }),
  actions: {
    syncFromRoute(route) {
      if (!route?.path || route.path === '/login') return;
      const fullPath = route.fullPath;
      const existing = this.tabs.find((t) => t.fullPath === fullPath);
      if (existing) {
        existing.title = resolvePageTitle(route.path);
        existing.componentName = resolveRouteComponentName(route);
      } else {
        this.tabs.push(buildTabFromRoute(route));
      }
      this.activeFullPath = fullPath;
      this.cachedComponentNames = rebuildCachedNames(this.tabs);
    },

    /** @returns {string|null} 关闭后应跳转的 fullPath */
    closeTab(fullPath) {
      const idx = this.tabs.findIndex((t) => t.fullPath === fullPath);
      if (idx < 0) return null;
      const tab = this.tabs[idx];
      if (tab.affix && this.tabs.length === 1) return null;

      this.tabs.splice(idx, 1);
      this.cachedComponentNames = rebuildCachedNames(this.tabs);

      if (this.activeFullPath !== fullPath) return null;

      if (!this.tabs.length) {
        this.ensureDashboardTab();
        return '/dashboard';
      }

      const next = this.tabs[idx] || this.tabs[idx - 1];
      this.activeFullPath = next.fullPath;
      return next.fullPath;
    },

    closeOthers(fullPath) {
      const keep = this.tabs.filter((t) => t.fullPath === fullPath || t.affix);
      this.tabs = keep.length ? keep : this.tabs.filter((t) => t.fullPath === fullPath);
      this.cachedComponentNames = rebuildCachedNames(this.tabs);
      if (!this.tabs.some((t) => t.fullPath === this.activeFullPath)) {
        this.activeFullPath = fullPath;
        return fullPath;
      }
      return null;
    },

    closeLeft(fullPath) {
      const idx = this.tabs.findIndex((t) => t.fullPath === fullPath);
      if (idx <= 0) return null;
      const left = this.tabs.slice(0, idx).filter((t) => !t.affix);
      if (!left.length) return null;
      const removeSet = new Set(left.map((t) => t.fullPath));
      this.tabs = this.tabs.filter((t) => !removeSet.has(t.fullPath));
      this.cachedComponentNames = rebuildCachedNames(this.tabs);
      if (!this.tabs.some((t) => t.fullPath === this.activeFullPath)) {
        this.activeFullPath = fullPath;
        return fullPath;
      }
      return null;
    },

    closeRight(fullPath) {
      const idx = this.tabs.findIndex((t) => t.fullPath === fullPath);
      if (idx < 0 || idx >= this.tabs.length - 1) return null;
      const removeSet = new Set(this.tabs.slice(idx + 1).map((t) => t.fullPath));
      this.tabs = this.tabs.filter((t) => !removeSet.has(t.fullPath));
      this.cachedComponentNames = rebuildCachedNames(this.tabs);
      if (!this.tabs.some((t) => t.fullPath === this.activeFullPath)) {
        this.activeFullPath = fullPath;
        return fullPath;
      }
      return null;
    },

    setActive(fullPath) {
      this.activeFullPath = fullPath;
    },

    ensureDashboardTab() {
      if (this.tabs.some((t) => t.path === '/dashboard')) return;
      this.tabs.unshift({
        path: '/dashboard',
        fullPath: '/dashboard',
        title: resolvePageTitle('/dashboard'),
        componentName: 'Dashboard',
        affix: true
      });
      this.cachedComponentNames = rebuildCachedNames(this.tabs);
    },

    reset() {
      this.tabs = [];
      this.activeFullPath = '';
      this.cachedComponentNames = [];
    }
  }
});
