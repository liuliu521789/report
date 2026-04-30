/**
 * 兼容层：保留历史 import 路径（lib/permissions.js）。
 * 真正的"单一来源"是 lib/permissionSchema.js。
 *
 * 仅保留：
 * - emptyPermissions / mergePermissions：被路由/服务复用
 * - effectiveEmployeePermissions：JWT 权限计算
 * - hasPermission / hasAnyPermission：中间件使用
 * - parsePermissionsJson：JSON 字段解析
 * - defaultPermissionsQc / defaultPermissionsCs：保留以兼容旧调用方
 */

import {
  ALLOWED_PERMISSION_KEYS,
  ALLOWED_PERMISSION_MODULES,
  KNOWN_ROLE_CODES,
  PERMISSION_MODULES as SCHEMA_MODULES,
  defaultPermissionsForRole,
  emptyPermissions as schemaEmptyPermissions
} from './permissionSchema.js';

export const PERMISSION_MODULES = SCHEMA_MODULES.map((m) => m.key);

export function emptyPermissions() {
  return schemaEmptyPermissions();
}

export function defaultPermissionsQc() {
  return defaultPermissionsForRole('qc');
}

export function defaultPermissionsCs() {
  return defaultPermissionsForRole('cs');
}

export function parsePermissionsJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * base + override 浅合并；同时裁剪未知模块/未知操作（避免历史脏数据残留）。
 * reports.fieldEdit 是动态字段表，不做枚举裁剪，仅强转为布尔。
 */
export function mergePermissions(base, override) {
  const out = JSON.parse(JSON.stringify(base || emptyPermissions()));
  /** 先裁剪 base 自身的未知模块 */
  for (const mod of Object.keys(out)) {
    if (!ALLOWED_PERMISSION_MODULES.has(mod)) delete out[mod];
  }
  const o = parsePermissionsJson(override);
  if (!o || typeof o !== 'object') return out;
  for (const mod of Object.keys(o)) {
    if (!ALLOWED_PERMISSION_MODULES.has(mod)) continue;
    if (!out[mod]) out[mod] = {};
    if (typeof o[mod] !== 'object' || o[mod] === null) continue;
    const allowedKeys = ALLOWED_PERMISSION_KEYS[mod];
    for (const k of Object.keys(o[mod])) {
      if (mod === 'reports' && k === 'fieldEdit') {
        if (typeof o[mod].fieldEdit === 'object' && o[mod].fieldEdit !== null) {
          if (!out.reports.fieldEdit) out.reports.fieldEdit = {};
          for (const fk of Object.keys(o[mod].fieldEdit)) {
            out.reports.fieldEdit[fk] = !!o[mod].fieldEdit[fk];
          }
        }
        continue;
      }
      if (!allowedKeys || !allowedKeys.has(k)) continue;
      out[mod][k] = !!o[mod][k];
    }
  }
  return out;
}

/**
 * 类别表 default_permissions_json 叠在「角色模板」之上时使用布尔 OR：
 * - 类别 JSON 只会「额外打开」某项，不能用显式 false 撤销内置角色（如 sales）在 schema 里已为 true 的权限；
 * - 避免后台勾选/保存出的历史脏数据（含大量 false）把 JWT 权限打没，导致「后台看起来有权限、前端路由与接口拒绝」。
 * 针对个人的收紧仍通过 users.permissions_json（最后一次 mergePermissions）完成。
 */
export function mergePermissionsUnionCategoryOverlay(schemaBase, categoryJson) {
  const out = JSON.parse(JSON.stringify(schemaBase || emptyPermissions()));
  const o = parsePermissionsJson(categoryJson);
  if (!o || typeof o !== 'object') return out;
  for (const mod of Object.keys(o)) {
    if (!ALLOWED_PERMISSION_MODULES.has(mod)) continue;
    if (!out[mod]) out[mod] = {};
    if (typeof o[mod] !== 'object' || o[mod] === null) continue;
    const allowedKeys = ALLOWED_PERMISSION_KEYS[mod];
    if (mod === 'reports' && o[mod].fieldEdit && typeof o[mod].fieldEdit === 'object') {
      if (!out.reports.fieldEdit) out.reports.fieldEdit = {};
      for (const fk of Object.keys(o[mod].fieldEdit)) {
        out.reports.fieldEdit[fk] = !!(out.reports.fieldEdit[fk] || o[mod].fieldEdit[fk]);
      }
    }
    for (const k of Object.keys(o[mod])) {
      if (mod === 'reports' && k === 'fieldEdit') continue;
      if (!allowedKeys || !allowedKeys.has(k)) continue;
      out[mod][k] = !!(out[mod][k] || o[mod][k]);
    }
  }
  return out;
}

/**
 * 员工最终权限：内置类别 code（employee_categories.code）先套用 schema 中该角色的完整默认，
 * 再叠加库里「类别默认 JSON」（OR 叠加）、「用户覆盖 JSON」（覆盖合并）。
 * 避免历史库里 default_permissions_json 缺 entire 模块时全部为 false。
 *
 * @param {unknown} categoryDefaultJson — employee_categories.default_permissions_json
 * @param {unknown} userOverrideJson — users.permissions_json
 * @param {string|null|undefined} employeeCategoryCode — employee_categories.code（如 sales / qc）
 */
export function effectiveEmployeePermissions(categoryDefaultJson, userOverrideJson, employeeCategoryCode = null) {
  const code = String(employeeCategoryCode || '')
    .trim()
    .toLowerCase();
  const schemaBase =
    code && KNOWN_ROLE_CODES.includes(code) ? defaultPermissionsForRole(code) : emptyPermissions();
  const base = mergePermissionsUnionCategoryOverlay(schemaBase, categoryDefaultJson);
  return mergePermissions(base, userOverrideJson);
}

export function hasPermission(effective, module, key) {
  if (effective == null || typeof effective !== 'object') return false;
  return !!(effective[module] && effective[module][key]);
}

export function hasAnyPermission(effective, module, keys) {
  if (effective == null || typeof effective !== 'object') return false;
  for (const k of keys) {
    if (hasPermission(effective, module, k)) return true;
  }
  return false;
}
