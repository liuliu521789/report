import { BUILTIN_CATEGORY_LABELS } from './employeeCategoryPresets.js';

/**
 * 展示员工类别中文名，绝不回退为 code（如 chairman）。
 * @param {{ nameZh?: string, employeeCategoryName?: string, code?: string, employeeCategoryCode?: string }} opts
 */
export function formatEmployeeCategoryLabel(opts = {}) {
  const nameZh = String(opts.nameZh || opts.employeeCategoryName || '').trim();
  if (nameZh) return nameZh;
  const code = String(opts.code || opts.employeeCategoryCode || '')
    .trim()
    .toLowerCase();
  if (!code) return '';
  return BUILTIN_CATEGORY_LABELS[code] || '员工';
}
