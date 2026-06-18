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

/**
 * 与后端 sales.js `canAccessSalesContractWorkspace` 一致：能参与合同生成/改/审/删的账号也应看到合同列表（不仅 contract_view）。
 */
export function canAccessSalesContractWorkspace() {
  if (isSuperAdmin()) return true;
  return (
    perm('contract_management', 'contract_view') ||
    perm('contract_management', 'contract_generate') ||
    perm('contract_management', 'contract_submit') ||
    perm('contract_management', 'contract_edit') ||
    perm('contract_management', 'contract_delete') ||
    perm('contract_management', 'contract_review')
  );
}

/** 与后端 sales.js canManageContractInvoice 一致：可新建/编辑开票申请 */
export function canManageContractInvoice() {
  if (isSuperAdmin()) return true;
  return (
    perm('contract_management', 'contract_submit') ||
    perm('contract_management', 'contract_generate')
  );
}

/** 与后端 sales.js canFulfillContractInvoice 一致：财务回填发票 */
export function canFulfillContractInvoice() {
  if (isSuperAdmin()) return true;
  return perm('order_management', 'order_status_finance');
}

/** 与后端 sales.js canDeleteContractInvoice 一致：删除开票申请 */
export function canDeleteContractInvoice() {
  if (isSuperAdmin()) return true;
  return perm('contract_management', 'invoice_delete');
}

/** 开票中心菜单：销售申请 + 财务处理 */
export function canAccessInvoiceCenter() {
  return canManageContractInvoice() || canFulfillContractInvoice();
}

/** 编辑已有报告时按 permissions.reports.fieldEdit 控制；新建报告不限制（避免无法通过必填校验） */
export function canEditReportFieldKey(input) {
  // Backward compatibility: allow old string signature canEditReportFieldKey('field_key')
  const opts = (input && typeof input === 'object')
    ? input
    : { fieldKey: input };
  const fieldKey = opts?.fieldKey;
  const effectivePermissions = opts?.effectivePermissions;
  if (isSuperAdmin()) return true;
  const effective = effectivePermissions != null ? effectivePermissions : getPermissions();
  return canEditReportFieldKeyFromPermissions(effective, fieldKey);
}
