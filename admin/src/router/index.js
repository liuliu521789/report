import Vue from 'vue';
import Router from 'vue-router';
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
import SecuritySettings from '../views/SecuritySettings.vue';
import AuditLoginLogs from '../views/AuditLoginLogs.vue';
import AuditOperationLogs from '../views/AuditOperationLogs.vue';
import AuditErrorLogs from '../views/AuditErrorLogs.vue';
import MyOperationLogs from '../views/MyOperationLogs.vue';

Vue.use(Router);

const router = new Router({
  mode: 'hash',
  routes: [
    { path: '/login', component: Login },
    {
      path: '/',
      component: Layout,
      children: [
        { path: '', redirect: '/reports' },
        { path: '/reports', component: ReportsList },
        { path: '/reports/new', component: ReportEdit, meta: { needPerm: ['reports', 'create'] } },
        {
          path: '/reports/:id',
          component: ReportEdit,
          props: true,
          meta: { needAnyPerm: [['reports', 'view'], ['reports', 'edit'], ['reports', 'previewPrint']] }
        },
        { path: '/qrcodes', component: Qrcodes },
        { path: '/stamps', component: Stamps },
        { path: '/company', component: CompanySettings },
        { path: '/employee-categories', component: EmployeeCategories, meta: { superAdminOnly: true } },
        { path: '/users', component: UsersManage, meta: { superAdminOnly: true } },
        { path: '/audit', redirect: '/audit/login-logs', meta: { superAdminOnly: true } },
        { path: '/audit/login-logs', component: AuditLoginLogs, meta: { superAdminOnly: true } },
        { path: '/audit/operations', component: AuditOperationLogs, meta: { superAdminOnly: true } },
        { path: '/audit/errors', component: AuditErrorLogs, meta: { superAdminOnly: true } },
        { path: '/security', component: SecuritySettings, meta: { superAdminOnly: true } },
        { path: '/my-operation-logs', component: MyOperationLogs }
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

/** 满足任一 (module,key) 即可，用于「查看详情」与「编辑」共用路由 */
function canRouteAnyPerm(pairs) {
  const auth = useAuthStore();
  if (auth.accountType === 'super_admin') return true;
  if (!Array.isArray(pairs) || pairs.length === 0) return false;
  const perms = auth.permissions || {};
  return pairs.some(([mod, key]) => !!(perms[mod] && perms[mod][key]));
}

router.beforeEach((to, from, next) => {
  const auth = useAuthStore();
  const token = auth.token;
  if (to.path !== '/login' && !token) return next('/login');
  if (to.path === '/login' && token) return next('/reports');
  if (to.matched.some((r) => r.meta?.superAdminOnly) && auth.accountType !== 'super_admin') {
    return next('/reports');
  }
  const needAny = to.matched.find((r) => r.meta?.needAnyPerm)?.meta?.needAnyPerm;
  if (needAny && !canRouteAnyPerm(needAny)) return next('/reports');
  const need = to.matched.find((r) => r.meta?.needPerm)?.meta?.needPerm;
  if (need && !canRoutePerm(need[0], need[1])) return next('/reports');
  return next();
});

export default router;

