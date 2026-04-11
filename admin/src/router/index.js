import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

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
import SalesOrders from '../views/SalesOrders.vue';
import SalesContracts from '../views/SalesContracts.vue';
import ContractTemplateEdit from '../views/ContractTemplateEdit.vue';
import WecomNotifications from '../views/WecomNotifications.vue';

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
        { path: '/audit', redirect: '/audit/login-logs' },
        { path: '/audit/login-logs', component: AuditLoginLogs, meta: { needPerm: ['audit', 'viewLogin'] } },
        { path: '/audit/operations', component: AuditOperationLogs, meta: { needPerm: ['audit', 'viewOperations'] } },
        { path: '/audit/errors', component: AuditErrorLogs, meta: { needPerm: ['audit', 'viewErrors'] } },
        { path: '/security', component: SecuritySettings, meta: { superAdminOnly: true } },
        { path: '/my-operation-logs', component: MyOperationLogs },
        { path: '/operation-guide', component: OperationGuide },
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
              ['contract_management', 'template_manage'],
              ['process_management', 'view_flow']
            ]
          }
        }
      ]
    }
  ]
});

function canRoutePerm(mod, key) {
  const auth = useAuthStore();
  if (auth.accountType === 'super_admin') return true;
  const perms = auth.permissions || {};
  return !!(perms[mod] && perms[mod][key]);
}

function canRouteAnyPerm(pairs) {
  const auth = useAuthStore();
  if (auth.accountType === 'super_admin') return true;
  if (!Array.isArray(pairs) || pairs.length === 0) return false;
  const perms = auth.permissions || {};
  return pairs.some(([mod, key]) => !!(perms[mod] && perms[mod][key]));
}

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore();
  const token = auth.token;
  if (to.path === '/') return next(token ? '/dashboard' : '/login');
  if (to.path !== '/login' && !token) return next('/login');
  if (to.path === '/login' && token) return next('/dashboard');
  if (to.matched.some((r) => r.meta?.superAdminOnly) && auth.accountType !== 'super_admin') {
    return next('/dashboard');
  }
  const needAny = to.matched.find((r) => r.meta?.needAnyPerm)?.meta?.needAnyPerm;
  if (needAny && !canRouteAnyPerm(needAny)) return next('/dashboard');
  const need = to.matched.find((r) => r.meta?.needPerm)?.meta?.needPerm;
  if (need && !canRoutePerm(need[0], need[1])) return next('/dashboard');
  return next();
});

export default router;
