import { defineStore, getActivePinia } from 'pinia';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '',
    accountType: '',
    /** 与后端 permissions 结构一致；超级管理员可为空对象 */
    permissions: {},
    idleTimeoutMinutes: 60,
    confirmSensitiveOperations: false
  }),
  getters: {
    isSuperAdmin: (s) => s.accountType === 'super_admin',
    isLoggedIn: (s) => !!s.token
  },
  actions: {
    hydrateFromStorage() {
      this.token = localStorage.getItem('token') || '';
      this.accountType = localStorage.getItem('accountType') || '';
      const raw = localStorage.getItem('permissions');
      if (raw) {
        try {
          this.permissions = JSON.parse(raw);
        } catch {
          this.permissions = {};
        }
      } else {
        this.permissions = {};
      }
      const idle = localStorage.getItem('idleTimeoutMinutes');
      if (idle != null && idle !== '') {
        const n = Number(idle);
        this.idleTimeoutMinutes = Number.isFinite(n) ? n : 60;
      } else {
        this.idleTimeoutMinutes = 60;
      }
      this.confirmSensitiveOperations = localStorage.getItem('confirmSensitiveOperations') === '1';
    },

    applyLoginResponse(data) {
      this.token = data.token || '';
      if (this.token) localStorage.setItem('token', this.token);
      else localStorage.removeItem('token');

      localStorage.removeItem('role');

      if (data.user?.accountType) {
        this.accountType = data.user.accountType;
        localStorage.setItem('accountType', data.user.accountType);
      }

      if (data.user?.permissions != null) {
        this.permissions = data.user.permissions;
        localStorage.setItem('permissions', JSON.stringify(data.user.permissions));
      } else {
        this.permissions = {};
        localStorage.removeItem('permissions');
      }

      if (data.idleTimeoutMinutes != null) {
        this.idleTimeoutMinutes = data.idleTimeoutMinutes;
        localStorage.setItem('idleTimeoutMinutes', String(data.idleTimeoutMinutes));
      }
    },

    /** Layout 内 getMe 成功后同步 */
    applyMeResponse(d) {
      if (d?.user?.accountType) {
        this.accountType = d.user.accountType;
        localStorage.setItem('accountType', d.user.accountType);
        if (d.user.permissions != null) {
          this.permissions = d.user.permissions;
          localStorage.setItem('permissions', JSON.stringify(d.user.permissions));
        } else {
          this.permissions = {};
          localStorage.removeItem('permissions');
        }
      }
      if (d.idleTimeoutMinutes != null) {
        this.idleTimeoutMinutes = d.idleTimeoutMinutes;
        localStorage.setItem('idleTimeoutMinutes', String(d.idleTimeoutMinutes));
      }
      if (d.confirmSensitiveOperations != null) {
        this.confirmSensitiveOperations = !!d.confirmSensitiveOperations;
        localStorage.setItem('confirmSensitiveOperations', d.confirmSensitiveOperations ? '1' : '0');
      }
    },

    /** 仅清 token（如 401），保留其它本地会话字段 */
    clearTokenOnly() {
      this.token = '';
      localStorage.removeItem('token');
    },

    /** 退出登录、空闲超时等 */
    clearSession() {
      this.token = '';
      this.accountType = '';
      this.permissions = {};
      this.idleTimeoutMinutes = 60;
      this.confirmSensitiveOperations = false;
      localStorage.removeItem('token');
      localStorage.removeItem('accountType');
      localStorage.removeItem('permissions');
      localStorage.removeItem('idleTimeoutMinutes');
      localStorage.removeItem('confirmSensitiveOperations');
    }
  }
});

/** 供 axios、非组件模块读取；无 Pinia 时回退 localStorage */
export function getAuthToken() {
  const p = getActivePinia();
  if (p) {
    const t = useAuthStore().token;
    if (t) return t;
  }
  return localStorage.getItem('token') || '';
}
