/** 内置员工类别 code → 中文名（与 employee_categories 种子数据一致） */
const BUILTIN_CATEGORY_LABELS = {
  qc: '品管',
  cs: '客服',
  chairman: '董事长',
  sales: '销售人员',
  documentary: '跟单',
  finance: '财务审核员',
  warehouse: '仓库人员',
  sales_admin: '系统管理员'
};

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
