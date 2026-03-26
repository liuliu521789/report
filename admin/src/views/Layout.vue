<template>
  <el-container class="app-shell" style="height: 100%">
    <el-aside :width="isMenuCollapsed ? '64px' : '240px'" class="aside">
      <div class="brand">
        <div class="logo" v-if="!isMenuCollapsed">QC</div>
        <div class="brand-text" v-if="!isMenuCollapsed">
          <div class="name">质检报告系统</div>
          <div class="sub">员工端后台</div>
        </div>
        <el-button
          class="collapse-btn"
          type="text"
          :icon="isMenuCollapsed ? 'el-icon-s-unfold' : 'el-icon-s-fold'"
          @click="toggleMenu"
        />
      </div>
      <el-menu
        :default-active="$route.path"
        :default-openeds="menuDefaultOpeneds"
        :collapse="isMenuCollapsed"
        router
        class="menu"
      >
        <el-menu-item v-if="perm('reports', 'list')" index="/reports">
          <i class="el-icon-document-copy" />
          <span>报告管理</span>
        </el-menu-item>
        <el-menu-item v-if="perm('qrcodes', 'list')" index="/qrcodes">
          <i class="el-icon-link" />
          <span>二维码管理</span>
        </el-menu-item>
        <el-menu-item v-if="perm('stamps', 'manage')" index="/stamps">
          <i class="el-icon-postcard" />
          <span>公司章管理</span>
        </el-menu-item>
        <el-menu-item v-if="perm('company', 'manage')" index="/company">
          <i class="el-icon-office-building" />
          <span>公司信息</span>
        </el-menu-item>
        <el-submenu v-if="isSuperAdminUser" index="account-submenu">
          <template slot="title">
            <i class="el-icon-user" />
            <span>账号管理</span>
          </template>
          <el-menu-item index="/employee-categories">
            <i class="el-icon-collection-tag" />
            <span>员工类别</span>
          </el-menu-item>
          <el-menu-item index="/users">
            <i class="el-icon-user-solid" />
            <span>员工账号</span>
          </el-menu-item>
        </el-submenu>
        <el-submenu v-if="isSuperAdminUser" index="audit-submenu">
          <template slot="title">
            <i class="el-icon-notebook-2" />
            <span>安全日志</span>
          </template>
          <el-menu-item index="/audit/login-logs">
            <i class="el-icon-key" />
            <span>登录日志</span>
          </el-menu-item>
          <el-menu-item index="/audit/operations">
            <i class="el-icon-tickets" />
            <span>操作日志</span>
          </el-menu-item>
          <el-menu-item index="/audit/errors">
            <i class="el-icon-warning-outline" />
            <span>错误日志</span>
          </el-menu-item>
          <el-menu-item index="/security">
            <i class="el-icon-lock" />
            <span>系统安全</span>
          </el-menu-item>
        </el-submenu>
        <el-menu-item v-if="!isSuperAdminUser" index="/my-operation-logs">
          <i class="el-icon-document" />
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
          <div class="meta-info">
            <span>{{ currentTimeText }}</span>
            <span class="divider">|</span>
            <span>{{ weatherText }}</span>
          </div>
          <el-dropdown trigger="click">
            <span class="user">
              <span class="avatar-wrap">
                <el-avatar size="small" icon="el-icon-user-solid" />
              </span>
              <span class="text">{{ loginName || '已登录' }}</span>
              <span class="online-dot" />
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
import { useAuthStore } from '../stores/auth';

export default {
  name: 'Layout',
  data() {
    return {
      isMenuCollapsed: false,
      loginName: '',
      currentTimeText: '',
      weatherText: '天气定位中...',
      pwDialog: false,
      pwSaving: false,
      pwForm: { oldPassword: '', newPassword: '', newPassword2: '' },
      idleTimer: null,
      clockTimer: null
    };
  },
  computed: {
    isSuperAdminUser() {
      return isSuperAdmin();
    },
    menuDefaultOpeneds() {
      return [];
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
    const auth = useAuthStore();
    if (auth.token) {
      try {
        const d = await getMe();
        if (d?.user?.accountType) {
          this.loginName = d.user.username || '';
        }
        auth.applyMeResponse(d);
        this.$forceUpdate();
      } catch (_) {
        /* ignore */
      }
    }
    this.tickClock();
    this.clockTimer = setInterval(this.tickClock, 1000);
    this.fetchWeather();
    this.setupIdleTimer();
  },
  beforeDestroy() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
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
      const min = Number(useAuthStore().idleTimeoutMinutes || 60);
      if (!Number.isFinite(min) || min < 1) return;
      this.idleTimer = setTimeout(() => {
        useAuthStore().clearSession();
        this.$message.warning('长时间未操作，已自动退出登录');
        this.$router.push('/login');
      }, min * 60 * 1000);
    },
    setupIdleTimer() {
      this.resetIdleTimer();
    },
    toggleMenu() {
      this.isMenuCollapsed = !this.isMenuCollapsed;
    },
    tickClock() {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      this.currentTimeText = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    },
    weatherCodeText(code) {
      const m = {
        0: '晴',
        1: '基本晴',
        2: '少云',
        3: '多云',
        45: '雾',
        48: '雾凇',
        51: '毛毛雨',
        53: '小雨',
        55: '中雨',
        61: '小雨',
        63: '中雨',
        65: '大雨',
        71: '小雪',
        73: '中雪',
        75: '大雪',
        80: '阵雨',
        81: '中阵雨',
        82: '强阵雨',
        95: '雷暴'
      };
      return m[Number(code)] || '未知';
    },
    getCurrentPosition() {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('geolocation_not_supported'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 10 * 60 * 1000
        });
      });
    },
    async fetchWeatherByCoords(lat, lon, cityLabel = '当前位置') {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`);
        if (!res.ok) throw new Error('weather_http_error');
        const data = await res.json();
        const cw = data?.current_weather;
        if (!cw) throw new Error('weather_data_missing');
        const t = Math.round(Number(cw.temperature));
        const codeText = this.weatherCodeText(cw.weathercode);
        this.weatherText = `${cityLabel} ${codeText} ${t}°C`;
        return true;
      } catch (_) {
        return false;
      }
    },
    async fetchWeather() {
      try {
        const pos = await this.getCurrentPosition();
        const lat = Number(pos?.coords?.latitude);
        const lon = Number(pos?.coords?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          const ok = await this.fetchWeatherByCoords(lat, lon, '当前位置');
          if (ok) return;
        }
      } catch (_) {
        // ignore and fallback
      }
      // 定位失败时兜底开封
      const ok = await this.fetchWeatherByCoords(34.797049, 114.307583, '开封');
      if (!ok) {
        this.weatherText = '天气获取失败';
      }
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
      useAuthStore().clearSession();
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
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}
.collapse-btn {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.9);
}
.collapse-btn:hover {
  color: #ffffff;
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
  gap: 14px;
}
.meta-info {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
}
.divider {
  color: #cbd5e1;
}
.user {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.9);
  cursor: pointer;
}
.avatar-wrap {
  position: relative;
  width: 24px;
  height: 24px;
}
.online-dot {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #22c55e;
  border: 1px solid #ffffff;
}
.text {
  font-size: 12px;
  color: #334155;
}
.main {
  padding: 18px;
}
</style>

