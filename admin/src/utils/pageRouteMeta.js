import { canManageContractInvoice } from './permissions';

/** 根据路由 path 解析页签/顶栏标题 */
export function resolvePageTitle(path) {
  const p = String(path || '');
  if (p === '/dashboard') return '控制台';
  if (p === '/reports/image-library') return '系统图片库';
  if (p === '/reports/designer') return '报告样式设计器';
  if (p === '/report-templates') return '报告模板管理';
  if (p === '/qc-yearbooks') return '品质管控数据台账';
  if (p.startsWith('/reports')) return '报告管理';
  if (p.startsWith('/qrcodes')) return '二维码管理';
  if (p.startsWith('/stamps')) return '公司章管理';
  if (p.startsWith('/company')) return '公司信息';
  if (p.startsWith('/wecom-notifications')) return '企业微信通知';
  if (p === '/sales/messages') return '站内信';
  if (p.startsWith('/sales/orders')) return '销售数据 · 订单管理';
  if (p.startsWith('/sales/customers/models')) return '销售数据 · 客户型号';
  if (p.startsWith('/sales/customers')) return '销售数据 · 客户管理';
  if (p.startsWith('/sales/internal-models')) return '销售数据 · 内部型号管理';
  if (p.startsWith('/sales/contracts/rule-settings')) return '销售数据 · 订单计算规则';
  if (p.startsWith('/sales/contracts/templates')) return '销售数据 · 合同模板';
  if (p.startsWith('/sales/contracts/editor')) return '销售数据 · 编辑合同';
  if (p.startsWith('/sales/contracts')) return '销售数据 · 合同管理';
  if (p.startsWith('/sales/invoices')) return '销售数据 · 开票中心';
  if (p.startsWith('/employee-categories')) return '账号管理 · 员工类别';
  if (p.startsWith('/departments')) return '账号管理 · 部门管理';
  if (p.startsWith('/users')) return '账号管理 · 员工账号';
  if (p.startsWith('/support-contact')) return '账号管理 · 技术支持联系';
  if (p.startsWith('/backups')) return '安全中心 · 备份与恢复';
  if (p === '/security') return '系统安全';
  if (p.startsWith('/audit/login-logs')) return '安全中心 · 登录日志';
  if (p.startsWith('/audit/operations')) return '安全中心 · 操作日志';
  if (p.startsWith('/audit/errors')) return '安全中心 · 错误日志';
  if (p.startsWith('/my-operation-logs')) return '我的操作日志';
  if (p === '/operation-guide') return '操作指南';
  return '控制台';
}

/** 根据路由 path 解析顶栏副标题 */
export function resolvePageDesc(path) {
  const p = String(path || '');
  if (p === '/dashboard') return '工作台：按权限展示快捷入口、业务待办与数据概览';
  if (p === '/reports') return '查询、编辑、作废报告，批量生成二维码';
  if (p === '/reports/designer') return '拖拽排版 A4 报告样式，保存后供新建报告套用';
  if (p === '/report-templates') return '统一管理报告模板，支持新增、编辑、删除与克隆';
  if (p === '/qc-yearbooks') return '按年维护成品检验台账，支持 Excel 导入与结构化编辑';
  if (p === '/reports/image-library') return '仅超级管理员维护，供报告样式设计器选用（服务器存储）';
  if (p.startsWith('/reports')) return '录入报告与自定义字段';
  if (p.startsWith('/qrcodes')) return '查看二维码与绑定报告';
  if (p.startsWith('/stamps')) return '上传公司章并设置激活章';
  if (p.startsWith('/company')) return '管理logo、描述语、公司名与报告标题';
  if (p.startsWith('/wecom-notifications'))
    return '绑定企业微信应用、维护成员 UserID 与模板，生成 HTTP 调用示例';
  if (p === '/sales/messages') return '查看通知与待办，管理收件箱';
  if (p.startsWith('/sales/orders')) return '销售订单录入、审核、发货与质检二维码关联';
  if (p.startsWith('/sales/customers/models')) return '维护客户型号映射与价格建议';
  if (p.startsWith('/sales/customers')) return '维护客户档案、合同买方信息与型号关联';
  if (p.startsWith('/sales/internal-models'))
    return '维护销售内部型号编码、客户型号、状态与备注，支持订单字段配置权限下的CRUD操作';
  if (p.startsWith('/sales/contracts/templates'))
    return '参考新建报告：套用已有模板或推荐版式，编辑正文与预览后保存（与报告编辑页同类操作习惯）';
  if (p.startsWith('/sales/contracts/editor'))
    return '修改已生成合同的标题与正文 HTML，右侧预览版式；保存后更新合同草稿';
  if (p.startsWith('/sales/contracts/rule-settings')) return '配置订单金额、吨位等计算公式与规则';
  if (p.startsWith('/sales/contracts'))
    return '参照报告管理：查询与分页浏览合同，正文预览与打印；模板维护对应报告的版式配置，「订单流程追溯」展示关联订单的流转记录（区别于合同审批流程）';
  if (p.startsWith('/sales/invoices')) {
    return canManageContractInvoice()
      ? '销售提交开票申请，财务回填发票号码、代码与链接'
      : '财务统一查看待开票申请，回填发票号码、代码与链接';
  }
  if (p.startsWith('/employee-categories')) return '维护品管、客服等类别及各类别默认权限';
  if (p.startsWith('/departments')) return '多级部门架构，供员工归档与合同等环节选人';
  if (p.startsWith('/users')) return '创建用户编号、分配岗位与权限；双击行可快速编辑';
  if (p.startsWith('/support-contact')) return '配置技术工程师企业微信，供全员在操作指南中发送求助通知';
  if (p.startsWith('/backups')) return '数据库与文件备份包导出、完整性校验与注意事项';
  if (p === '/security') return '密码策略、登录锁定、会话超时、日志保留';
  if (p.startsWith('/audit/login-logs')) return '全部账号登录记录，不可删改';
  if (p.startsWith('/audit/operations')) return '全站操作审计';
  if (p.startsWith('/audit/errors')) return '服务端错误，可导出';
  if (p.startsWith('/my-operation-logs')) return '仅本人操作记录';
  if (p === '/operation-guide') return '功能说明、常见问题与联系技术工程师';
  return '';
}

/** 从 matched 记录解析组件 name，供 keep-alive include 使用 */
export function resolveRouteComponentName(route) {
  const matched = route?.matched?.[route.matched.length - 1];
  const comp = matched?.components?.default;
  if (!comp) return '';
  if (typeof comp === 'function') {
    const resolved = comp.__asyncResolved;
    if (resolved) return resolved.name || resolved.__name || '';
    return comp.name || comp.displayName || '';
  }
  return comp.name || comp.__name || '';
}
