import { defineStore, getActivePinia } from 'pinia';

const IMPERSONATION_BACKUP_KEY = 'qc_report_admin_impersonation_backup';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '',
    accountType: '',
    /** 与后端 permissions 结构一致；超级管理员可为空对象 */
    permissions: {},
    idleTimeoutMinutes: 60,
    confirmSensitiveOperations: false,
    /** 存在超管会话备份（模拟登录中），用于顶栏「恢复超级管理员」 */
    impersonationBackupActive: false
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
      try {
        this.impersonationBackupActive = !!sessionStorage.getItem(IMPERSONATION_BACKUP_KEY);
      } catch {
        this.impersonationBackupActive = false;
      }
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

    /** 超管快捷入口：备份当前超管会话后切换为员工 JWT */
    beginImpersonationFromLoginResponse(data) {
      if (this.accountType !== 'super_admin' || !this.token) {
        this.applyLoginResponse(data);
        return;
      }
      try {
        const backup = {
          token: this.token,
          accountType: this.accountType,
          permissions: this.permissions,
          idleTimeoutMinutes: this.idleTimeoutMinutes,
          confirmSensitiveOperations: this.confirmSensitiveOperations
        };
        sessionStorage.setItem(IMPERSONATION_BACKUP_KEY, JSON.stringify(backup));
        this.impersonationBackupActive = true;
      } catch {
        /* sessionStorage 不可用时仍切换身份，但无法一键恢复超管 */
      }
      this.applyLoginResponse(data);
    },

    /** 从 sessionStorage 恢复超管 token */
    restoreImpersonationBackup() {
      let raw = '';
      try {
        raw = sessionStorage.getItem(IMPERSONATION_BACKUP_KEY) || '';
      } catch {
        return false;
      }
      if (!raw) return false;
      let backup;
      try {
        backup = JSON.parse(raw);
      } catch {
        return false;
      }
      if (!backup?.token || backup.accountType !== 'super_admin') return false;
      this.token = backup.token;
      localStorage.setItem('token', backup.token);
      this.accountType = 'super_admin';
      localStorage.setItem('accountType', 'super_admin');
      if (backup.permissions && typeof backup.permissions === 'object' && Object.keys(backup.permissions).length) {
        this.permissions = backup.permissions;
        localStorage.setItem('permissions', JSON.stringify(backup.permissions));
      } else {
        this.permissions = {};
        localStorage.removeItem('permissions');
      }
      const idle = Number(backup.idleTimeoutMinutes);
      this.idleTimeoutMinutes = Number.isFinite(idle) && idle >= 1 ? idle : 60;
      localStorage.setItem('idleTimeoutMinutes', String(this.idleTimeoutMinutes));
      this.confirmSensitiveOperations = !!backup.confirmSensitiveOperations;
      localStorage.setItem('confirmSensitiveOperations', this.confirmSensitiveOperations ? '1' : '0');
      try {
        sessionStorage.removeItem(IMPERSONATION_BACKUP_KEY);
      } catch {
        /* no-op */
      }
      this.impersonationBackupActive = false;
      return true;
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
      this.impersonationBackupActive = false;
      localStorage.removeItem('token');
      localStorage.removeItem('accountType');
      localStorage.removeItem('permissions');
      localStorage.removeItem('idleTimeoutMinutes');
      localStorage.removeItem('confirmSensitiveOperations');
      try {
        sessionStorage.removeItem(IMPERSONATION_BACKUP_KEY);
      } catch {
        /* no-op */
      }
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
