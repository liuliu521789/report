import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { usePageTabsStore } from '../stores/pageTabs';
import { getMe } from '../api';

import Login from '../views/Login.vue';
import Layout from '../views/Layout.vue';
import ReportsList from '../views/ReportsList.vue';
import ReportEdit from '../views/ReportEdit.vue';
import Qrcodes from '../views/Qrcodes.vue';
import Stamps from '../views/Stamps.vue';
import CompanySettings from '../views/CompanySettings.vue';
import UsersManage from '../views/UsersManage.vue';
import EmployeeCategories from '../views/EmployeeCategories.vue';
import Departments from '../views/Departments.vue';
import SecuritySettings from '../views/SecuritySettings.vue';
import AuditLoginLogs from '../views/AuditLoginLogs.vue';
import AuditOperationLogs from '../views/AuditOperationLogs.vue';
import AuditErrorLogs from '../views/AuditErrorLogs.vue';
import MyOperationLogs from '../views/MyOperationLogs.vue';
import SupportContactSettings from '../views/SupportContactSettings.vue';
import OperationGuide from '../views/OperationGuide.vue';
import Dashboard from '../views/Dashboard.vue';
import ReportDesigner from '../views/ReportDesigner.vue';
import ImageLibrary from '../views/ImageLibrary.vue';
import ReportTemplates from '../views/ReportTemplates.vue';
const SalesOrders = () => import('../views/SalesOrders.vue');
import SalesInternalMessages from '../views/SalesInternalMessages.vue';
import SalesContracts from '../views/SalesContracts.vue';
import SalesInvoiceCenter from '../views/SalesInvoiceCenter.vue';
import CustomerManagement from '../views/CustomerManagement.vue';
import CustomerModels from '../views/CustomerModels.vue';
import InternalModels from '../views/InternalModels.vue';
import ContractTemplateEdit from '../views/ContractTemplateEdit.vue';
import OrderCalcRules from '../views/OrderCalcRules.vue';
import OrderFlowConfig from '../views/OrderFlowConfig.vue';
import WecomNotifications from '../views/WecomNotifications.vue';
import Backups from '../views/Backups.vue';
import QcYearbooks from '../views/QcYearbooks.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: Login },
    {
      path: '/',
      component: Layout,
      children: [
        { path: '', redirect: '/dashboard' },
        { path: '/dashboard', component: Dashboard },
        { path: '/reports', component: ReportsList },
        { path: '/report-templates', component: ReportTemplates, meta: { needPerm: ['templates', 'use'] } },
        {
          path: '/qc-yearbooks',
          component: QcYearbooks,
          meta: { needAnyPerm: [['qc_yearbooks', 'view'], ['qc_yearbooks', 'upload']] }
        },
        { path: '/reports/designer', component: ReportDesigner, meta: { needPerm: ['reports', 'create'] } },
        {
          path: '/reports/image-library',
          component: ImageLibrary,
          meta: { superAdminOnly: true }
        },
        { path: '/reports/new', component: ReportEdit, meta: { needPerm: ['reports', 'create'] } },
        {
          path: '/reports/:id',
          component: ReportEdit,
          props: true,
          meta: { needAnyPerm: [['reports', 'view'], ['reports', 'edit'], ['reports', 'previewPrint']] }
        },
        { path: '/qrcodes', component: Qrcodes },
        { path: '/stamps', component: Stamps, meta: { needAnyPerm: [['stamps', 'manage'], ['stamps', 'view']] } },
        {
          path: '/company',
          component: CompanySettings,
          meta: { needAnyPerm: [['company', 'manage'], ['company', 'view']] }
        },
        {
          path: '/wecom-notifications',
          component: WecomNotifications,
          meta: { needPerm: ['wecom', 'manage'] }
        },
        { path: '/employee-categories', component: EmployeeCategories, meta: { superAdminOnly: true } },
        { path: '/departments', component: Departments, meta: { superAdminOnly: true } },
        { path: '/users', component: UsersManage, meta: { superAdminOnly: true } },
        { path: '/support-contact', component: SupportContactSettings, meta: { superAdminOnly: true } },
        { path: '/backups', component: Backups, meta: { superAdminOnly: true } },
        { path: '/audit', redirect: '/audit/login-logs' },
        { path: '/audit/login-logs', component: AuditLoginLogs, meta: { needPerm: ['audit', 'viewLogin'] } },
        { path: '/audit/operations', component: AuditOperationLogs, meta: { needPerm: ['audit', 'viewOperations'] } },
        { path: '/audit/errors', component: AuditErrorLogs, meta: { needPerm: ['audit', 'viewErrors'] } },
        { path: '/security', component: SecuritySettings, meta: { superAdminOnly: true } },
        { path: '/my-operation-logs', component: MyOperationLogs },
        { path: '/operation-guide', component: OperationGuide },
        {
          path: '/sales/messages',
          component: SalesInternalMessages
        },
        {
          path: '/sales/orders',
          component: SalesOrders,
          meta: {
            needAnyPerm: [
              ['order_management', 'order_query'],
              ['order_management', 'order_input']
            ]
          }
        },
        {
          path: '/sales/orders/flow-config',
          component: OrderFlowConfig,
          meta: {
            needAnyPerm: [
              ['process_management', 'edit_flow'],
              ['process_management', 'view_flow']
            ]
          }
        },
        {
          path: '/sales/customers',
          component: CustomerManagement,
          meta: { needPerm: ['customer_management', 'view'] }
        },
        {
          path: '/sales/customers/models/:customerId',
          component: CustomerModels,
          meta: { needPerm: ['customer_management', 'view'] }
        },
        {
          path: '/sales/internal-models',
          component: InternalModels,
          meta: { needPerm: ['order_management', 'order_field_config'] }
        },
        {
          path: '/sales/contracts/editor/:contractId',
          component: ContractTemplateEdit,
          props: (route) => ({ contractId: route.params.contractId, id: null }),
          meta: {
            needAnyPerm: [
              ['contract_management', 'contract_edit'],
              ['contract_management', 'contract_generate']
            ]
          }
        },
        {
          path: '/sales/contracts/rule-settings',
          component: OrderCalcRules,
          meta: {
            needAnyPerm: [
              ['contract_management', 'template_manage'],
              ['contract_management', 'contract_edit']
            ]
          }
        },
        {
          path: '/sales/contracts/templates/new',
          component: ContractTemplateEdit,
          props: () => ({ id: null }),
          meta: { needPerm: ['contract_management', 'template_manage'] }
        },
        {
          path: '/sales/contracts/templates/:id',
          component: ContractTemplateEdit,
          props: true,
          meta: { needPerm: ['contract_management', 'template_manage'] }
        },
        {
          path: '/sales/contracts',
          component: SalesContracts,
          meta: {
            needAnyPerm: [
              ['contract_management', 'contract_view'],
              ['contract_management', 'contract_generate'],
              ['contract_management', 'contract_submit'],
              ['contract_management', 'contract_edit'],
              ['contract_management', 'contract_review'],
              ['contract_management', 'contract_delete'],
              ['contract_management', 'template_manage'],
              ['process_management', 'view_flow']
            ]
          }
        },
        {
          path: '/sales/invoices',
          component: SalesInvoiceCenter,
          meta: {
            needAnyPerm: [
              ['order_management', 'order_status_finance'],
              ['contract_management', 'contract_submit'],
              ['contract_management', 'contract_generate']
            ]
          }
        }
      ]
    }
  ]
});

async function hydrateAuthIfStale(auth) {
  if (!auth?.token) return;
  const noAccountType = !String(auth.accountType || '').trim();
  const noPermissions =
    auth.accountType !== 'super_admin' &&
    (!auth.permissions || Object.keys(auth.permissions).length === 0);
  if (!noAccountType && !noPermissions) return;
  try {
    const d = await getMe();
    auth.applyMeResponse(d);
  } catch {
    /* ignore */
  }
}

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore();
  const token = auth.token;
  if (to.path === '/') return next(token ? '/dashboard' : '/login');
  if (to.path !== '/login' && !token) return next('/login');
  if (to.path === '/login' && token) return next('/dashboard');
  await hydrateAuthIfStale(auth);
  if (to.matched.some((r) => r.meta?.superAdminOnly) && auth.accountType !== 'super_admin') {
    return next('/dashboard');
  }
  /**
   * 前端权限对象可能因本地缓存/初始化时序短暂不一致导致误拦截；
   * 统一以后端接口鉴权为准，这里不再做 needPerm / needAnyPerm 的前置拦截。
   */
  return next();
});

/** 在 router-view 渲染前同步页签，避免 keep-alive include 滞后导致页面不切换 */
router.afterEach((to) => {
  if (to.path === '/login') {
    usePageTabsStore().reset();
    return;
  }
  if (to.path) {
    usePageTabsStore().syncFromRoute(to);
  }
});

export default router;
