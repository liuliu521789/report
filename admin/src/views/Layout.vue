<template>
  <el-container class="app-shell" style="height: 100%">
    <el-aside width="240px" class="aside">
      <div class="brand">
        <div class="logo">QC</div>
        <div class="brand-text">
          <div class="name">质检报告系统</div>
          <div class="sub">员工端后台</div>
        </div>
      </div>
      <el-menu
        :default-active="$route.path"
        :default-openeds="menuDefaultOpeneds"
        router
        class="menu"
      >
        <el-menu-item v-if="perm('reports', 'list')" index="/reports">
          <span>报告管理</span>
        </el-menu-item>
        <el-menu-item v-if="perm('qrcodes', 'list')" index="/qrcodes">
          <span>二维码管理</span>
        </el-menu-item>
        <el-menu-item v-if="perm('stamps', 'manage')" index="/stamps">
          <span>公司章管理</span>
        </el-menu-item>
        <el-menu-item v-if="perm('company', 'manage')" index="/company">
          <span>公司信息</span>
        </el-menu-item>
        <el-submenu v-if="isSuperAdminUser" index="account-submenu">
          <template slot="title">
            <span>账号管理</span>
          </template>
          <el-menu-item index="/employee-categories">员工类别</el-menu-item>
          <el-menu-item index="/users">员工账号</el-menu-item>
        </el-submenu>
        <el-submenu v-if="isSuperAdminUser" index="audit-submenu">
          <template slot="title">
            <span>安全日志</span>
          </template>
          <el-menu-item index="/audit/login-logs">登录日志</el-menu-item>
          <el-menu-item index="/audit/operations">操作日志</el-menu-item>
          <el-menu-item index="/audit/errors">错误日志</el-menu-item>
          <el-menu-item index="/security">系统安全</el-menu-item>
        </el-submenu>
        <el-menu-item v-if="!isSuperAdminUser" index="/my-operation-logs">
          <span>我的操作日志</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header height="64px" class="header">
        <div class="header-left">
          <div class="page-title">{{ pageTitle }}</div>
          <div class="text-muted">{{ pageDesc }}</div>
        </div>
        <div class="header-right">
          <el-dropdown trigger="click">
            <span class="user">
              <span class="dot" />
              <span class="text">已登录</span>
            </span>
            <el-dropdown-menu slot="dropdown">
              <el-dropdown-item @click.native="openChangePassword">修改密码</el-dropdown-item>
              <el-dropdown-item divided @click.native="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
    <el-dialog title="修改密码" :visible.sync="pwDialog" width="420px" @close="resetPw">
      <el-form :model="pwForm" label-width="100px">
        <el-form-item label="当前密码">
          <el-input v-model="pwForm.oldPassword" type="password" show-password autocomplete="off" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="pwForm.newPassword" type="password" show-password autocomplete="off" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="pwForm.newPassword2" type="password" show-password autocomplete="off" />
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="pwDialog = false">取消</el-button>
        <el-button type="primary" :loading="pwSaving" @click="submitPassword">保存</el-button>
      </span>
    </el-dialog>
  </el-container>
</template>

<script>
import { isSuperAdmin, perm } from '../utils/permissions';
import { changePassword, getMe } from '../api';

export default {
  name: 'Layout',
  data() {
    return {
      accountType: localStorage.getItem('accountType') || '',
      pwDialog: false,
      pwSaving: false,
      pwForm: { oldPassword: '', newPassword: '', newPassword2: '' },
      idleTimer: null
    };
  },
  computed: {
    isSuperAdminUser() {
      return isSuperAdmin();
    },
    menuDefaultOpeneds() {
      if (!this.isSuperAdminUser) return [];
      return ['account-submenu', 'audit-submenu'];
    },
    pageTitle() {
      const p = this.$route.path;
      if (p.startsWith('/reports')) return '报告管理';
      if (p.startsWith('/qrcodes')) return '二维码管理';
      if (p.startsWith('/stamps')) return '公司章管理';
      if (p.startsWith('/company')) return '公司信息';
      if (p.startsWith('/employee-categories')) return '账号管理 · 员工类别';
      if (p.startsWith('/users')) return '账号管理 · 员工账号';
      if (p === '/security') return '系统安全';
      if (p.startsWith('/audit/login-logs')) return '安全日志 · 登录';
      if (p.startsWith('/audit/operations')) return '安全日志 · 操作';
      if (p.startsWith('/audit/errors')) return '安全日志 · 错误';
      if (p.startsWith('/my-operation-logs')) return '我的操作日志';
      return '控制台';
    },
    pageDesc() {
      const p = this.$route.path;
      if (p === '/reports') return '查询、编辑、作废报告，批量生成二维码';
      if (p.startsWith('/reports')) return '录入报告与自定义字段';
      if (p.startsWith('/qrcodes')) return '查看二维码与绑定报告';
      if (p.startsWith('/stamps')) return '上传公司章并设置激活章';
      if (p.startsWith('/company')) return '管理logo、描述语、公司名与报告标题';
      if (p.startsWith('/employee-categories')) return '维护品管、客服等类别及各类别默认权限';
      if (p.startsWith('/users')) return '创建员工账号、分配类别与个性化权限';
      if (p === '/security') return '密码策略、登录锁定、会话超时、日志保留';
      if (p.startsWith('/audit/login-logs')) return '全部账号登录记录，不可删改';
      if (p.startsWith('/audit/operations')) return '全站操作审计';
      if (p.startsWith('/audit/errors')) return '服务端错误，可导出';
      if (p.startsWith('/my-operation-logs')) return '仅本人操作记录';
      return '';
    }
  },
  async mounted() {
    const bindActivity = () => {
      ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((ev) => {
        window.addEventListener(ev, this.onUserActivity, true);
      });
    };
    bindActivity();
    if (localStorage.getItem('token')) {
      try {
        const d = await getMe();
        if (d?.user?.accountType) {
          localStorage.setItem('accountType', d.user.accountType);
          this.accountType = d.user.accountType;
          if (d.user.permissions != null) {
            localStorage.setItem('permissions', JSON.stringify(d.user.permissions));
          } else {
            localStorage.removeItem('permissions');
          }
          this.$forceUpdate();
        }
        if (d.idleTimeoutMinutes != null) {
          localStorage.setItem('idleTimeoutMinutes', String(d.idleTimeoutMinutes));
        }
        if (d.confirmSensitiveOperations != null) {
          localStorage.setItem('confirmSensitiveOperations', d.confirmSensitiveOperations ? '1' : '0');
        }
      } catch (_) {
        /* ignore */
      }
    }
    this.setupIdleTimer();
  },
  beforeDestroy() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((ev) => {
      window.removeEventListener(ev, this.onUserActivity, true);
    });
  },
  methods: {
    perm,
    onUserActivity() {
      this.resetIdleTimer();
    },
    resetIdleTimer() {
      if (this.idleTimer) clearTimeout(this.idleTimer);
      const min = Number(localStorage.getItem('idleTimeoutMinutes') || '60');
      if (!Number.isFinite(min) || min < 1) return;
      this.idleTimer = setTimeout(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('accountType');
        localStorage.removeItem('permissions');
        this.$message.warning('长时间未操作，已自动退出登录');
        this.$router.push('/login');
      }, min * 60 * 1000);
    },
    setupIdleTimer() {
      this.resetIdleTimer();
    },
    openChangePassword() {
      this.pwDialog = true;
    },
    resetPw() {
      this.pwForm = { oldPassword: '', newPassword: '', newPassword2: '' };
    },
    async submitPassword() {
      if (!this.pwForm.oldPassword || !this.pwForm.newPassword) {
        this.$message.warning('请填写完整');
        return;
      }
      if (this.pwForm.newPassword !== this.pwForm.newPassword2) {
        this.$message.warning('两次新密码不一致');
        return;
      }
      this.pwSaving = true;
      try {
        await changePassword(this.pwForm.oldPassword, this.pwForm.newPassword);
        this.$message.success('密码已修改，请重新登录');
        this.pwDialog = false;
        this.logout();
      } catch (e) {
        this.$message.error(e?.response?.data?.message || e?.response?.data?.error || '修改失败');
      } finally {
        this.pwSaving = false;
      }
    },
    logout() {
      if (this.idleTimer) clearTimeout(this.idleTimer);
      localStorage.removeItem('token');
      localStorage.removeItem('accountType');
      localStorage.removeItem('permissions');
      localStorage.removeItem('idleTimeoutMinutes');
      this.$router.push('/login');
    }
  }
};
</script>

<style scoped>
.aside {
  padding: 14px 12px;
}
.brand {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}
.logo {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #0b1220;
  background: linear-gradient(135deg, #7dd3fc, #a78bfa);
}
.brand-text .name {
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
}
.brand-text .sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
  margin-top: 2px;
}
.menu {
  padding-top: 6px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  padding: 0 18px;
}
.header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.page-title {
  font-size: 16px;
  font-weight: 700;
}
.header-right {
  display: flex;
  align-items: center;
}
.user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.9);
  cursor: pointer;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 99px;
  background: #22c55e;
}
.text {
  font-size: 12px;
  color: #334155;
}
.main {
  padding: 18px;
}
</style>

