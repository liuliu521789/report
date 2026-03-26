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
      manage: false
    },
    company: {
      manage: false
    }
  };
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
