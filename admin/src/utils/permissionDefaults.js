/** 与后端 lib/permissions.js 结构一致，用于表单勾选 */

import { REPORT_FIELD_EDIT_DEFINITIONS } from './reportFieldEditDefinitions';

function defaultFieldEditShape() {
  const fieldEdit = {};
  for (const d of REPORT_FIELD_EDIT_DEFINITIONS) {
    fieldEdit[d.key] = true;
  }
  return fieldEdit;
}

export function emptyPermissionShape() {
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
      fieldEdit: defaultFieldEditShape()
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
      order_status_qc: false,
      order_status_warehouse: false,
      order_ship: false,
      order_view_status_logs: false,
      order_cancel: false,
      order_delete: false,
      order_field_config: false,
      order_list_unit_price: false,
      order_list_contract: false,
      order_list_qc_qrcode: false
    },
    contract_management: {
      template_manage: false,
      contract_generate: false,
      contract_submit: false,
      contract_review: false,
      contract_view: false,
      contract_edit: false,
      contract_delete: false,
      contract_version_view: false,
      contract_multi_approve: false
    },
    process_management: {
      view_flow: false,
      edit_flow: false
    },
    data_management: {
      data_export: false,
      data_export_all: false
    },
    customer_management: {
      view: false,
      create: false,
      edit: false,
      disable: false
    },
    qc_yearbooks: {
      view: false,
      upload: false
    }
  };
}

/** 与后端 KNOWN_ROLE_CODES 一致，有系统推荐默认权限的内置岗位 */
export const BUILTIN_ROLE_CODES = [
  'qc',
  'cs',
  'chairman',
  'manager',
  'general_manager',
  'deputy_general_manager',
  'director',
  'president',
  'supervisor',
  'department_head',
  'sales',
  'documentary',
  'finance',
  'warehouse',
  'sales_admin'
];

/** 统计已开启的权限项数量（不含 fieldEdit 子项单独计数，按布尔开关计） */
export function countEnabledPermissions(perms) {
  let n = 0;
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'fieldEdit') {
        walk(v);
        continue;
      }
      if (typeof v === 'boolean' && v) n += 1;
    }
  };
  walk(perms);
  return n;
}

export function mergeIntoShape(shape, partial) {
  const out = JSON.parse(JSON.stringify(shape));
  if (!partial || typeof partial !== 'object') return out;
  for (const mod of Object.keys(partial)) {
    if (!out[mod]) out[mod] = {};
    if (typeof partial[mod] !== 'object') continue;
    for (const k of Object.keys(partial[mod])) {
      if (mod === 'reports' && k === 'fieldEdit') {
        if (typeof partial[mod].fieldEdit === 'object' && partial[mod].fieldEdit !== null) {
          if (!out.reports.fieldEdit) out.reports.fieldEdit = {};
          for (const fk of Object.keys(partial[mod].fieldEdit)) {
            out.reports.fieldEdit[fk] = !!partial[mod].fieldEdit[fk];
          }
        }
        continue;
      }
      out[mod][k] = !!partial[mod][k];
    }
  }
  return out;
}
