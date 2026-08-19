/**
 * 常用岗位类别与英文代码（新增员工类别时联想匹配）
 * 与 employee_categories 内置种子数据对齐，并补充常见扩展岗位。
 */

/** @type {Array<{ nameZh: string, code: string, aliases?: string[] }>} */
export const EMPLOYEE_CATEGORY_PRESETS = [
  { nameZh: '品管', code: 'qc', aliases: ['质检', '质量控制', 'QC', '品控'] },
  { nameZh: '客服', code: 'cs', aliases: ['客户服务', '客服专员'] },
  { nameZh: '董事长', code: 'chairman' },
  { nameZh: '总经理', code: 'general_manager', aliases: ['GM'] },
  { nameZh: '副总经理', code: 'deputy_general_manager', aliases: ['副总', '常务副总', 'DGM'] },
  { nameZh: '总监', code: 'director', aliases: ['销售总监', '财务总监', '技术总监', '生产总监', '运营总监', '市场总监'] },
  { nameZh: '总裁', code: 'president', aliases: ['CEO'] },
  { nameZh: '销售人员', code: 'sales', aliases: ['销售', '业务员', '销售专员'] },
  { nameZh: '跟单', code: 'documentary', aliases: ['跟单员', '跟单人员'] },
  { nameZh: '财务审核员', code: 'finance', aliases: ['财务', '会计', '出纳', '财务专员'] },
  { nameZh: '仓库人员', code: 'warehouse', aliases: ['仓库', '仓管', '发货', '仓库管理员'] },
  { nameZh: '系统管理员', code: 'sales_admin', aliases: ['管理员', '后台管理员'] },
  { nameZh: '采购', code: 'procurement', aliases: ['采购员', '采购专员', '采购人员'] },
  { nameZh: '人事', code: 'hr', aliases: ['人力资源', 'HR', '人事专员', '人事部', '人力'] },
  { nameZh: '部门负责人', code: 'department_head', aliases: ['部门长', '科室负责人', '负责人'] },
  { nameZh: '行政', code: 'admin', aliases: ['行政专员', '行政人员', '行政管理'] },
  { nameZh: '生产', code: 'production', aliases: ['生产部', '车间', '生产人员'] },
  { nameZh: '研发', code: 'rd', aliases: ['研发部', 'R&D', '研发人员'] },
  { nameZh: '运营', code: 'operations', aliases: ['运营专员', '运营人员'] },
  { nameZh: '市场', code: 'marketing', aliases: ['市场部', '市场营销', '市场专员'] },
  { nameZh: '法务', code: 'legal', aliases: ['法务部', '法务专员'] },
  { nameZh: '技术', code: 'technical', aliases: ['技术员', '技术支持', '技术人员'] },
  { nameZh: '经理', code: 'manager', aliases: ['部门经理', '项目经理'] },
  { nameZh: '主管', code: 'supervisor', aliases: ['部门主管', '业务主管'] }
];

/** @type {Map<string, string>} 规范化中文名 → code */
const NAME_TO_CODE = new Map();

function normName(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

for (const preset of EMPLOYEE_CATEGORY_PRESETS) {
  NAME_TO_CODE.set(normName(preset.nameZh), preset.code);
  for (const alias of preset.aliases || []) {
    NAME_TO_CODE.set(normName(alias), preset.code);
  }
}

/** 内置类别 code → 中文名（展示用，与种子数据一致） */
export const BUILTIN_CATEGORY_LABELS = Object.fromEntries(
  EMPLOYEE_CATEGORY_PRESETS.filter((p) =>
    [
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
      'sales_admin',
      'procurement',
      'hr',
      'admin',
      'production',
      'technical'
    ].includes(p.code)
  ).map((p) => [p.code, p.nameZh])
);

/** 按中文名（含别名）精确匹配英文代码 */
export function lookupEmployeeCategoryCode(nameZh) {
  const key = normName(nameZh);
  if (!key) return '';
  return NAME_TO_CODE.get(key) || '';
}

/**
 * 过滤岗位类别联想列表
 * @param {string} query
 * @param {{ limit?: number, emptyLimit?: number, excludeCodes?: Set<string>|string[] }} [opts]
 */
export function filterEmployeeCategoryPresets(query, opts = {}) {
  const limit = opts.limit ?? 20;
  const emptyLimit = opts.emptyLimit ?? 12;
  const excludeSource = opts.excludeCodes;
  const excludeList = excludeSource instanceof Set
    ? [...excludeSource]
    : Array.isArray(excludeSource)
      ? excludeSource
      : [];
  const exclude = new Set(
    excludeList.map((c) => String(c || '').trim().toLowerCase()).filter(Boolean)
  );
  const q = normName(query);

  let list = EMPLOYEE_CATEGORY_PRESETS.filter((p) => !exclude.has(p.code));
  if (q) {
    list = list.filter((p) => {
      if (normName(p.nameZh).includes(q) || p.code.includes(q)) return true;
      return (p.aliases || []).some((a) => normName(a).includes(q));
    });
  }
  const max = q ? limit : emptyLimit;
  return list.slice(0, max).map((p) => ({
    value: p.nameZh,
    code: p.code,
    label: `${p.nameZh}（${p.code}）`
  }));
}
