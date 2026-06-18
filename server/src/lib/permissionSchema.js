/**
 * 权限模型「单一来源」（前后端共享）
 *
 * 每个权限点都在此处声明：模块 → 操作 → 默认值（按账号类别）。
 * - emptyPermissions：所有操作 false（最小权限）
 * - defaultPermissionsForRole(roleCode)：根据 'qc' / 'cs' / 'chairman' / 'sales' 等返回该类别默认
 * - listPermissionSchema()：导出给前端的扁平结构（label + 模块/操作）
 *
 * 新增权限点只需要在此修改一处，前后端会自动一致。
 */

/** @typedef {{ key:string, label:string, defaults?: Record<string, boolean> }} PermissionItem */
/** @typedef {{ key:string, label:string, items: PermissionItem[] }} PermissionModule */

/** roles：内置类别角色代码（与 employee_categories.code 对齐） */
export const KNOWN_ROLE_CODES = [
  'qc',
  'cs',
  'chairman',
  'sales',
  'documentary',
  'finance',
  'warehouse',
  'sales_admin'
];

const ROLE_DEFAULT = (...rolesOn) => {
  const m = {};
  for (const r of KNOWN_ROLE_CODES) m[r] = false;
  for (const r of rolesOn) m[r] = true;
  return m;
};

/** @type {PermissionModule[]} */
export const PERMISSION_MODULES = [
  {
    key: 'reports',
    label: '报告管理',
    items: [
      { key: 'list', label: '列表查看', defaults: ROLE_DEFAULT('qc', 'cs', 'chairman', 'finance', 'sales_admin') },
      { key: 'view', label: '详情查看', defaults: ROLE_DEFAULT('qc', 'cs', 'chairman', 'finance', 'sales_admin') },
      { key: 'create', label: '新建', defaults: ROLE_DEFAULT('qc') },
      { key: 'edit', label: '编辑', defaults: ROLE_DEFAULT('qc') },
      { key: 'void', label: '作废', defaults: ROLE_DEFAULT('qc') },
      { key: 'activate', label: '激活', defaults: ROLE_DEFAULT('qc') },
      { key: 'bulkPass', label: '批量通过', defaults: ROLE_DEFAULT('qc') },
      { key: 'bulkVoid', label: '批量作废', defaults: ROLE_DEFAULT('qc') },
      { key: 'bulkActivate', label: '批量激活', defaults: ROLE_DEFAULT('qc') },
      { key: 'bulkDelete', label: '批量删除', defaults: ROLE_DEFAULT('qc') },
      { key: 'previewPrint', label: '预览/打印', defaults: ROLE_DEFAULT('qc', 'cs', 'chairman', 'sales_admin') },
      { key: 'seals', label: '盖章', defaults: ROLE_DEFAULT('qc') },
      { key: 'export', label: '导出', defaults: ROLE_DEFAULT('chairman') },
      { key: 'chairmanApprove', label: '董事长审批', defaults: ROLE_DEFAULT('chairman') }
    ]
  },
  {
    key: 'qrcodes',
    label: '二维码',
    items: [
      { key: 'list', label: '列表', defaults: ROLE_DEFAULT('qc', 'cs', 'chairman', 'finance', 'sales_admin') },
      { key: 'create', label: '生成', defaults: ROLE_DEFAULT('qc') },
      { key: 'viewDetail', label: '详情', defaults: ROLE_DEFAULT('qc', 'cs', 'chairman', 'finance', 'sales_admin') },
      { key: 'delete', label: '删除', defaults: ROLE_DEFAULT('qc') }
    ]
  },
  {
    key: 'templates',
    label: '报告模板',
    items: [
      { key: 'use', label: '使用', defaults: ROLE_DEFAULT('qc', 'chairman', 'sales_admin') }
    ]
  },
  {
    key: 'stamps',
    label: '公司章',
    items: [
      { key: 'manage', label: '维护' },
      { key: 'view', label: '查看', defaults: ROLE_DEFAULT('chairman') }
    ]
  },
  {
    key: 'company',
    label: '公司信息',
    items: [
      { key: 'manage', label: '维护' },
      { key: 'view', label: '查看', defaults: ROLE_DEFAULT('chairman', 'sales_admin') }
    ]
  },
  {
    key: 'audit',
    label: '安全日志',
    items: [
      { key: 'viewLogin', label: '登录日志', defaults: ROLE_DEFAULT('chairman', 'sales_admin') },
      { key: 'viewOperations', label: '操作日志', defaults: ROLE_DEFAULT('chairman', 'sales_admin') },
      { key: 'viewErrors', label: '错误日志', defaults: ROLE_DEFAULT('chairman') },
      { key: 'exportAudit', label: '导出', defaults: ROLE_DEFAULT('chairman') }
    ]
  },
  {
    key: 'wecom',
    label: '企业微信',
    items: [
      { key: 'manage', label: '维护' },
      { key: 'send', label: '发送' }
    ]
  },
  {
    key: 'order_management',
    label: '订单管理',
    items: [
      { key: 'order_input', label: '录入', defaults: ROLE_DEFAULT('sales', 'documentary', 'sales_admin') },
      { key: 'order_query', label: '查询', defaults: ROLE_DEFAULT('sales', 'documentary', 'finance', 'warehouse', 'qc', 'sales_admin') },
      { key: 'order_query_all', label: '查全部', defaults: ROLE_DEFAULT('sales', 'documentary', 'finance', 'warehouse', 'qc', 'sales_admin') },
      { key: 'order_edit', label: '编辑', defaults: ROLE_DEFAULT('sales', 'documentary', 'sales_admin') },
      { key: 'order_submit', label: '提交财务', defaults: ROLE_DEFAULT('sales', 'documentary', 'sales_admin') },
      { key: 'order_withdraw', label: '撤回审核', defaults: ROLE_DEFAULT('sales', 'documentary', 'sales_admin') },
      { key: 'order_status_finance', label: '财务审核', defaults: ROLE_DEFAULT('finance', 'sales_admin') },
      { key: 'order_status_qc', label: '品管审核', defaults: ROLE_DEFAULT('qc', 'sales_admin') },
      { key: 'order_status_warehouse', label: '仓库流程', defaults: ROLE_DEFAULT('warehouse', 'sales_admin') },
      { key: 'order_ship', label: '发货', defaults: ROLE_DEFAULT('warehouse', 'sales_admin') },
      { key: 'order_view_status_logs', label: '状态日志', defaults: ROLE_DEFAULT('sales', 'documentary', 'finance', 'warehouse', 'qc', 'sales_admin') },
      { key: 'order_cancel', label: '取消', defaults: ROLE_DEFAULT('sales', 'documentary', 'finance', 'sales_admin') },
      { key: 'order_delete', label: '删除', defaults: ROLE_DEFAULT('sales', 'documentary', 'finance', 'sales_admin') },
      { key: 'order_field_config', label: '字段配置', defaults: ROLE_DEFAULT('documentary', 'sales_admin') },
      { key: 'order_list_unit_price', label: '列表显示单价', defaults: ROLE_DEFAULT('sales', 'documentary', 'finance', 'sales_admin') },
      { key: 'order_list_contract', label: '列表显示合同', defaults: ROLE_DEFAULT('sales', 'documentary', 'finance', 'warehouse', 'sales_admin') },
      { key: 'order_list_qc_qrcode', label: '列表显示质检二维码', defaults: ROLE_DEFAULT('sales', 'documentary', 'qc', 'sales_admin') }
    ]
  },
  {
    key: 'contract_management',
    label: '合同管理',
    items: [
      { key: 'template_manage', label: '模板维护', defaults: ROLE_DEFAULT('sales', 'documentary', 'sales_admin') },
      { key: 'contract_generate', label: '生成', defaults: ROLE_DEFAULT('sales', 'documentary', 'sales_admin') },
      { key: 'contract_submit', label: '提交审核', defaults: ROLE_DEFAULT('sales', 'documentary', 'sales_admin') },
      { key: 'contract_review', label: '审核', defaults: ROLE_DEFAULT('finance', 'sales_admin') },
      { key: 'contract_view', label: '查看', defaults: ROLE_DEFAULT('sales', 'documentary', 'finance', 'warehouse', 'sales_admin') },
      { key: 'contract_edit', label: '编辑' },
      { key: 'contract_delete', label: '删除' },
      { key: 'invoice_delete', label: '删除开票申请', defaults: ROLE_DEFAULT('sales_admin') },
      { key: 'contract_edit_approved', label: '编辑已审核合同' },
      { key: 'contract_delete_approved', label: '删除已审核合同' },
      {
        key: 'contract_version_view',
        label: '版本查看',
        defaults: {
          qc: true,
          cs: true,
          chairman: true,
          sales: true,
          documentary: true,
          finance: true,
          warehouse: true,
          sales_admin: true
        }
      },
      {
        key: 'contract_multi_approve',
        label: '多人审批',
        defaults: {
          qc: true,
          cs: true,
          chairman: true,
          sales: true,
          documentary: true,
          finance: true,
          warehouse: true,
          sales_admin: true
        }
      }
    ]
  },
  {
    key: 'process_management',
    label: '流程',
    items: [
      { key: 'view_flow', label: '查看流程', defaults: ROLE_DEFAULT('sales', 'documentary', 'finance', 'warehouse', 'sales_admin') },
      { key: 'edit_flow', label: '配置审核流程', defaults: ROLE_DEFAULT('sales_admin') }
    ]
  },
  {
    key: 'data_management',
    label: '数据导出',
    items: [
      { key: 'data_export', label: '导出', defaults: ROLE_DEFAULT('finance', 'documentary', 'sales_admin') },
      { key: 'data_export_all', label: '全量导出', defaults: ROLE_DEFAULT('documentary', 'sales_admin') }
    ]
  },
  {
    key: 'customer_management',
    label: '客户管理',
    items: [
      { key: 'view', label: '查看', defaults: ROLE_DEFAULT('sales', 'documentary', 'finance', 'warehouse', 'sales_admin') },
      { key: 'create', label: '新建', defaults: ROLE_DEFAULT('sales', 'documentary', 'sales_admin') },
      { key: 'edit', label: '编辑', defaults: ROLE_DEFAULT('sales', 'documentary', 'sales_admin') },
      { key: 'disable', label: '停用', defaults: ROLE_DEFAULT('sales', 'documentary', 'sales_admin') }
    ]
  },
  {
    key: 'qc_yearbooks',
    label: '年度品质管控台账',
    items: [
      { key: 'view', label: '查看数据', defaults: ROLE_DEFAULT('qc', 'chairman', 'sales_admin') },
      { key: 'upload', label: '维护（年份与台账记录的增删改）', defaults: ROLE_DEFAULT('qc', 'sales_admin') }
    ]
  }
];

/** 报告字段编辑（reports.fieldEdit）默认全 true，结构由 lib/reportFieldEdit 维护；这里仅声明键名 */
export const REPORTS_FIELD_EDIT_KEY = 'fieldEdit';

/** 已知模块名集合，用于 mergePermissions 裁剪未知模块 */
export const ALLOWED_PERMISSION_MODULES = new Set(PERMISSION_MODULES.map((m) => m.key));

/** 已知 module → Set(keys)，用于裁剪未知操作（reports.fieldEdit 例外，结构动态） */
export const ALLOWED_PERMISSION_KEYS = (() => {
  const out = {};
  for (const m of PERMISSION_MODULES) {
    out[m.key] = new Set(m.items.map((i) => i.key));
    if (m.key === 'reports') out[m.key].add(REPORTS_FIELD_EDIT_KEY);
  }
  return out;
})();

/** 全 false 的扁平结构；reports.fieldEdit 为 {} */
export function emptyPermissions() {
  const out = {};
  for (const m of PERMISSION_MODULES) {
    out[m.key] = {};
    for (const it of m.items) out[m.key][it.key] = false;
    if (m.key === 'reports') out[m.key].fieldEdit = {};
  }
  return out;
}

/** 按内置 role code 取默认权限（qc / cs / chairman / sales / documentary / finance / warehouse / sales_admin） */
export function defaultPermissionsForRole(roleCode) {
  const out = emptyPermissions();
  const code = String(roleCode || '').toLowerCase();
  if (!KNOWN_ROLE_CODES.includes(code)) return out;
  for (const m of PERMISSION_MODULES) {
    for (const it of m.items) {
      if (it.defaults && it.defaults[code]) out[m.key][it.key] = true;
    }
  }
  return out;
}

/** 给前端渲染权限配置面板用：扁平 schema（不含字段编辑） */
export function listPermissionSchema() {
  return PERMISSION_MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    items: m.items.map((it) => ({ key: it.key, label: it.label }))
  }));
}
