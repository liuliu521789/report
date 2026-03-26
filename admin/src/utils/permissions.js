/** 与后端 JWT permissions 结构一致；超级管理员本地无 permissions 或 accountType=super_admin 时视为全 true */

import { getActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import { canEditReportFieldKeyFromPermissions } from './reportFieldEditDefinitions';

function authStore() {
  const p = getActivePinia();
  return p ? useAuthStore() : null;
}

export function getAccountType() {
  const s = authStore();
  if (s) return s.accountType || '';
  return localStorage.getItem('accountType') || '';
}

export function isSuperAdmin() {
  return getAccountType() === 'super_admin';
}

export function getPermissions() {
  if (isSuperAdmin()) return null;
  const s = authStore();
  if (s) {
    const p = s.permissions;
    return p && typeof p === 'object' ? { ...p } : {};
  }
  const raw = localStorage.getItem('permissions');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function perm(module, key) {
  if (isSuperAdmin()) return true;
  const p = getPermissions();
  return !!(p[module] && p[module][key]);
}

/** 编辑已有报告时按 permissions.reports.fieldEdit 控制；新建报告不限制（避免无法通过必填校验） */
export function canEditReportFieldKey(fieldKey) {
  if (isSuperAdmin()) return true;
  return canEditReportFieldKeyFromPermissions(getPermissions(), fieldKey);
}
