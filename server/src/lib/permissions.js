/** 员工权限结构（与 employee_categories.default_permissions_json / users.permissions_json 一致） */

export const PERMISSION_MODULES = [
  'reports',
  'qrcodes',
  'templates',
  'stamps',
  'company',
  'audit',
  'wecom',
  'order_management',
  'contract_management',
  'process_management',
  'data_management'
];

export function emptyPermissions() {
  return {
    reports: {
      list: false,
      view: false,
      create: false,
      edit: false,
      void: false,
      activate: false,
      bulkPass: false,
      bulkVoid: false,
      bulkActivate: false,
      bulkDelete: false,
      previewPrint: false,
      seals: false,
      export: false,
      chairmanApprove: false,
      fieldEdit: {}
    },
    qrcodes: {
      list: false,
      create: false,
      viewDetail: false,
      delete: false
    },
    templates: {
      use: false
    },
    stamps: {
      manage: false,
      view: false
    },
    company: {
      manage: false,
      view: false
    },
    audit: {
      viewLogin: false,
      viewOperations: false,
      viewErrors: false,
      exportAudit: false
    },
    wecom: {
      manage: false,
      send: false
    },
    order_management: {
      order_input: false,
      order_query: false,
      order_query_all: false,
      order_edit: false,
      order_submit: false,
      order_withdraw: false,
      order_status_finance: false,
      order_status_warehouse: false,
      order_ship: false,
      order_view_status_logs: false,
      order_cancel: false,
      order_delete: false,
      order_field_config: false
    },
    contract_management: {
      template_manage: false,
      contract_generate: false,
      contract_submit: false,
      contract_review: false,
      contract_view: false,
      contract_edit: false,
      contract_delete: false
    },
    process_management: {
      view_flow: false
    },
    data_management: {
      data_export: false,
      data_export_all: false
    }
  };
}

/** 品管默认：报告 + 二维码全流程；模板用于录入；无章/公司默认 */
export function defaultPermissionsQc() {
  return {
    reports: {
      list: true,
      view: true,
      create: true,
      edit: true,
      void: true,
      activate: true,
      bulkPass: true,
      bulkVoid: true,
      bulkActivate: true,
      bulkDelete: true,
      previewPrint: true,
      seals: true,
      export: false,
      chairmanApprove: false,
      fieldEdit: {}
    },
    qrcodes: {
      list: true,
      create: true,
      viewDetail: true,
      delete: true
    },
    templates: {
      use: true
    },
    stamps: {
      manage: false,
      view: false
    },
    company: {
      manage: false,
      view: false
    },
    audit: {
      viewLogin: false,
      viewOperations: false,
      viewErrors: false,
      exportAudit: false
    },
    wecom: {
      manage: false,
      send: false
    },
    order_management: {
      order_input: false,
      order_query: false,
      order_query_all: false,
      order_edit: false,
      order_submit: false,
      order_withdraw: false,
      order_status_finance: false,
      order_status_warehouse: false,
      order_ship: false,
      order_view_status_logs: false,
      order_cancel: false,
      order_delete: false,
      order_field_config: false
    },
    contract_management: {
      template_manage: false,
      contract_generate: false,
      contract_submit: false,
      contract_review: false,
      contract_view: false,
      contract_edit: false,
      contract_delete: false
    },
    process_management: {
      view_flow: false
    },
    data_management: {
      data_export: false,
      data_export_all: false
    }
  };
}

/** 客服默认：偏只读 + 预览；超管可再调 */
export function defaultPermissionsCs() {
  return {
    reports: {
      list: true,
      view: true,
      create: false,
      edit: false,
      void: false,
      activate: false,
      bulkPass: false,
      bulkVoid: false,
      bulkActivate: false,
      bulkDelete: false,
      previewPrint: true,
      seals: false,
      export: false,
      chairmanApprove: false,
      fieldEdit: {}
    },
    qrcodes: {
      list: true,
      create: false,
      viewDetail: true,
      delete: false
    },
    templates: {
      use: false
    },
    stamps: {
      manage: false,
      view: false
    },
    company: {
      manage: false,
      view: false
    },
    audit: {
      viewLogin: false,
      viewOperations: false,
      viewErrors: false,
      exportAudit: false
    },
    wecom: {
      manage: false,
      send: false
    },
    order_management: {
      order_input: false,
      order_query: false,
      order_query_all: false,
      order_edit: false,
      order_submit: false,
      order_withdraw: false,
      order_status_finance: false,
      order_status_warehouse: false,
      order_ship: false,
      order_view_status_logs: false,
      order_cancel: false,
      order_delete: false,
      order_field_config: false
    },
    contract_management: {
      template_manage: false,
      contract_generate: false,
      contract_submit: false,
      contract_review: false,
      contract_view: false,
      contract_edit: false,
      contract_delete: false
    },
    process_management: {
      view_flow: false
    },
    data_management: {
      data_export: false,
      data_export_all: false
    }
  };
}

export function parsePermissionsJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw;
  }
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/** 以 base 为底，用 override 覆盖同名键（浅合并各模块） */
export function mergePermissions(base, override) {
  const out = JSON.parse(JSON.stringify(base || emptyPermissions()));
  const o = parsePermissionsJson(override);
  if (!o || typeof o !== 'object') return out;
  for (const mod of Object.keys(o)) {
    if (!out[mod]) out[mod] = {};
    if (typeof o[mod] !== 'object' || o[mod] === null) continue;
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
      out[mod][k] = !!o[mod][k];
    }
  }
  return out;
}

/** 员工：类别默认 + 个人覆盖；超级管理员返回 null 表示不校验（全允许） */
export function effectiveEmployeePermissions(categoryDefaultJson, userOverrideJson) {
  const base = mergePermissions(emptyPermissions(), categoryDefaultJson);
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
