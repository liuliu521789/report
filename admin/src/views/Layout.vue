<template>
  <el-container class="app-shell" style="height: 100%">
    <el-aside
      v-if="!isMobile"
      :width="isMenuCollapsed ? '64px' : '240px'"
      class="aside"
      :class="{ 'is-collapsed': isMenuCollapsed }"
    >
      <div class="aside-column">
        <div class="brand">
          <div class="logo" v-if="!isMenuCollapsed">NL</div>
          <div class="brand-text" v-if="!isMenuCollapsed">
            <div class="name">物源数智管控平台</div>
            <div class="sub">员工端后台</div>
          </div>
          <el-button class="collapse-btn" text @click="toggleMenu">
            <el-icon :size="18">
              <Expand v-if="isMenuCollapsed" />
              <Fold v-else />
            </el-icon>
          </el-button>
        </div>
        <div class="aside-menu-wrap">
          <el-menu
            :default-active="$route.path"
            :default-openeds="menuDefaultOpeneds"
            :collapse="isMenuCollapsed"
            router
            class="menu"
          >
        <el-menu-item v-if="perm('reports', 'list')" index="/reports">
          <el-icon><DocumentCopy /></el-icon>
          <span>报告管理</span>
        </el-menu-item>
        <el-menu-item v-if="isSuperAdminUser" index="/reports/image-library">
          <el-icon><Picture /></el-icon>
          <span>系统图片库</span>
        </el-menu-item>
        <el-menu-item v-if="perm('qrcodes', 'list')" index="/qrcodes">
          <el-icon><Link /></el-icon>
          <span>二维码管理</span>
        </el-menu-item>
        <el-menu-item v-if="perm('stamps', 'manage') || perm('stamps', 'view')" index="/stamps">
          <el-icon><Medal /></el-icon>
          <span>公司章管理</span>
        </el-menu-item>
        <el-menu-item v-if="perm('company', 'manage') || perm('company', 'view')" index="/company">
          <el-icon><OfficeBuilding /></el-icon>
          <span>公司信息</span>
        </el-menu-item>
        <el-menu-item v-if="perm('wecom', 'manage')" index="/wecom-notifications">
          <el-icon><ChatDotRound /></el-icon>
          <span>企业微信通知</span>
        </el-menu-item>
        <el-sub-menu v-if="showSalesMenu" index="sales-submenu" class="no-parent-active">
          <template #title>
            <el-icon><ShoppingCart /></el-icon>
            <span>销售数据</span>
          </template>
          <el-menu-item
            v-if="perm('order_management', 'order_query') || perm('order_management', 'order_input')"
            index="/sales/orders"
          >
            <el-icon><Document /></el-icon>
            <span>订单管理</span>
          </el-menu-item>
          <el-menu-item
            v-if="
              perm('contract_management', 'contract_view') ||
              perm('contract_management', 'template_manage') ||
              perm('process_management', 'view_flow')
            "
            index="/sales/contracts"
          >
            <el-icon><Tickets /></el-icon>
            <span>合同管理</span>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="isSuperAdminUser" index="account-submenu" class="no-parent-active">
          <template #title>
            <el-icon><User /></el-icon>
            <span>账号管理</span>
          </template>
          <el-menu-item index="/employee-categories">
            <el-icon><FolderOpened /></el-icon>
            <span>员工类别</span>
          </el-menu-item>
          <el-menu-item index="/departments">
            <el-icon><Share /></el-icon>
            <span>部门管理</span>
          </el-menu-item>
          <el-menu-item index="/users">
            <el-icon><UserFilled /></el-icon>
            <span>员工账号</span>
          </el-menu-item>
          <el-menu-item index="/support-contact">
            <el-icon><Service /></el-icon>
            <span>技术支持联系</span>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="showAuditMenu" index="audit-submenu" class="no-parent-active">
          <template #title>
            <el-icon><Notebook /></el-icon>
            <span>安全日志</span>
          </template>
          <el-menu-item v-if="isSuperAdminUser || perm('audit', 'viewLogin')" index="/audit/login-logs">
            <el-icon><Key /></el-icon>
            <span>登录日志</span>
          </el-menu-item>
          <el-menu-item v-if="isSuperAdminUser || perm('audit', 'viewOperations')" index="/audit/operations">
            <el-icon><Tickets /></el-icon>
            <span>操作日志</span>
          </el-menu-item>
          <el-menu-item v-if="isSuperAdminUser || perm('audit', 'viewErrors')" index="/audit/errors">
            <el-icon><Warning /></el-icon>
            <span>错误日志</span>
          </el-menu-item>
          <el-menu-item v-if="isSuperAdminUser" index="/security">
            <el-icon><Lock /></el-icon>
            <span>系统安全</span>
          </el-menu-item>
        </el-sub-menu>
        <el-menu-item v-if="!isSuperAdminUser" index="/my-operation-logs">
          <el-icon><Document /></el-icon>
          <span>我的操作日志</span>
        </el-menu-item>
          </el-menu>
        </div>
        <SidebarGuide :collapsed="isMenuCollapsed" />
      </div>
    </el-aside>
    <el-container class="main-column">
      <el-header height="64px" class="header">
        <div class="header-leading">
          <el-tooltip v-if="!isMobile" content="返回首页" placement="bottom">
            <el-button class="home-btn" @click="goDashboard">
              <el-icon><HomeFilled /></el-icon>
              <span>首页</span>
            </el-button>
          </el-tooltip>
          <div class="header-left">
            <el-button v-if="isMobile" class="mobile-menu-btn" text @click="openMobileMenu">
              <el-icon :size="18"><Expand /></el-icon>
            </el-button>
            <div class="page-title">{{ pageTitle }}</div>
            <div class="text-muted" v-if="!isMobile">{{ pageDesc }}</div>
          </div>
        </div>
        <div class="header-right">
          <el-button
            v-if="impersonationBackupActive && !isMobile"
            type="warning"
            plain
            class="restore-admin-btn"
            @click="restoreSuperAdminSession"
          >
            恢复超级管理员
          </el-button>
          <div class="meta-info" v-if="!isMobile">
            <span>{{ currentTimeText }}</span>
            <span class="divider">|</span>
            <span class="weather-info">
              <span class="weather-icon" aria-hidden="true">{{ weatherEmoji }}</span>
              <span>{{ weatherText }}</span>
            </span>
          </div>
          <el-dropdown trigger="click" class="messages-dropdown">
            <el-button type="primary" circle class="messages-btn">
              <el-icon><Bell /></el-icon>
              <el-badge v-if="unreadMessageCount > 0" :value="unreadMessageCount" class="message-badge" />
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="goToMessages">查看站内信</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-dropdown trigger="click">
            <span class="user">
              <span class="avatar-wrap">
                <el-avatar :size="24">
                  <el-icon><UserFilled /></el-icon>
                </el-avatar>
              </span>
              <span class="text">{{ loginName || '已登录' }}</span>
              <span class="online-dot" />
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="impersonationBackupActive" @click="restoreSuperAdminSession">
                  恢复超级管理员
                </el-dropdown-item>
                <el-dropdown-item :divided="impersonationBackupActive" @click="openChangePassword">修改密码</el-dropdown-item>
                <el-dropdown-item divided @click="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
    <el-drawer
      v-model="mobileMenuVisible"
      direction="ltr"
      size="280px"
      :with-header="false"
      class="mobile-menu-drawer"
    >
      <div class="mobile-drawer-body">
        <div class="brand mobile-brand">
          <div class="logo">QC</div>
          <div class="brand-text">
            <div class="name">质检报告系统</div>
            <div class="sub">员工端后台</div>
          </div>
        </div>
        <div class="mobile-meta">
          <el-button
            v-if="impersonationBackupActive"
            type="warning"
            plain
            size="small"
            class="mobile-restore-admin"
            @click="restoreSuperAdminSession"
          >
            恢复超管
          </el-button>
          <span>{{ currentTimeText }}</span>
          <span class="divider">|</span>
          <span>{{ weatherText }}</span>
        </div>
        <el-menu
          :default-active="$route.path"
          :default-openeds="menuDefaultOpeneds"
          router
          class="menu mobile-menu"
          @select="onMobileMenuSelect"
        >
          <el-menu-item v-if="perm('reports', 'list')" index="/reports">
            <el-icon><DocumentCopy /></el-icon>
            <span>报告管理</span>
          </el-menu-item>
          <el-menu-item v-if="isSuperAdminUser" index="/reports/image-library">
            <el-icon><Picture /></el-icon>
            <span>系统图片库</span>
          </el-menu-item>
          <el-menu-item v-if="perm('qrcodes', 'list')" index="/qrcodes">
            <el-icon><Link /></el-icon>
            <span>二维码管理</span>
          </el-menu-item>
          <el-menu-item v-if="perm('stamps', 'manage') || perm('stamps', 'view')" index="/stamps">
            <el-icon><Medal /></el-icon>
            <span>公司章管理</span>
          </el-menu-item>
          <el-menu-item v-if="perm('company', 'manage') || perm('company', 'view')" index="/company">
            <el-icon><OfficeBuilding /></el-icon>
            <span>公司信息</span>
          </el-menu-item>
          <el-menu-item v-if="perm('wecom', 'manage')" index="/wecom-notifications">
            <el-icon><ChatDotRound /></el-icon>
            <span>企业微信通知</span>
          </el-menu-item>
          <el-sub-menu v-if="showSalesMenu" index="sales-submenu-mobile" class="no-parent-active">
            <template #title>
              <el-icon><ShoppingCart /></el-icon>
              <span>销售数据</span>
            </template>
            <el-menu-item
              v-if="perm('order_management', 'order_query') || perm('order_management', 'order_input')"
              index="/sales/orders"
            >
              <el-icon><Document /></el-icon>
              <span>订单管理</span>
            </el-menu-item>
            <el-menu-item
              v-if="
                perm('contract_management', 'contract_view') ||
                perm('contract_management', 'template_manage') ||
                perm('process_management', 'view_flow')
              "
              index="/sales/contracts"
            >
              <el-icon><Tickets /></el-icon>
              <span>合同管理</span>
            </el-menu-item>
          </el-sub-menu>
          <el-sub-menu v-if="isSuperAdminUser" index="account-submenu-mobile" class="no-parent-active">
            <template #title>
              <el-icon><User /></el-icon>
              <span>账号管理</span>
            </template>
            <el-menu-item index="/employee-categories">
              <el-icon><FolderOpened /></el-icon>
              <span>员工类别</span>
            </el-menu-item>
            <el-menu-item index="/departments">
              <el-icon><Share /></el-icon>
              <span>部门管理</span>
            </el-menu-item>
            <el-menu-item index="/users">
              <el-icon><UserFilled /></el-icon>
              <span>员工账号</span>
            </el-menu-item>
            <el-menu-item index="/support-contact">
              <el-icon><Service /></el-icon>
              <span>技术支持联系</span>
            </el-menu-item>
          </el-sub-menu>
          <el-sub-menu v-if="showAuditMenu" index="audit-submenu-mobile" class="no-parent-active">
            <template #title>
              <el-icon><Notebook /></el-icon>
              <span>安全日志</span>
            </template>
            <el-menu-item v-if="isSuperAdminUser || perm('audit', 'viewLogin')" index="/audit/login-logs">
              <el-icon><Key /></el-icon>
              <span>登录日志</span>
            </el-menu-item>
            <el-menu-item v-if="isSuperAdminUser || perm('audit', 'viewOperations')" index="/audit/operations">
              <el-icon><Tickets /></el-icon>
              <span>操作日志</span>
            </el-menu-item>
            <el-menu-item v-if="isSuperAdminUser || perm('audit', 'viewErrors')" index="/audit/errors">
              <el-icon><Warning /></el-icon>
              <span>错误日志</span>
            </el-menu-item>
            <el-menu-item v-if="isSuperAdminUser" index="/security">
              <el-icon><Lock /></el-icon>
              <span>系统安全</span>
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-if="!isSuperAdminUser" index="/my-operation-logs">
            <el-icon><Document /></el-icon>
            <span>我的操作日志</span>
          </el-menu-item>
        </el-menu>
      </div>
    </el-drawer>
    <el-dialog title="修改密码" v-model="pwDialog" width="420px" @close="resetPw">
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
      <template #footer>
        <el-button @click="pwDialog = false">取消</el-button>
        <el-button type="primary" :loading="pwSaving" @click="submitPassword">保存</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script>
import { mapState } from 'pinia';
import { ElNotification } from 'element-plus';
import { isSuperAdmin, perm } from '../utils/permissions';
import { changePassword, getMe, listSalesMessages } from '../api';
import { useAuthStore } from '../stores/auth';
import SidebarGuide from '../components/SidebarGuide.vue';

export default {
  name: 'Layout',
  components: { SidebarGuide },
  data() {
    return {
      isMenuCollapsed: false,
      loginName: '',
      currentTimeText: '',
      weatherText: '天气定位中...',
      weatherCode: null,
      pwDialog: false,
      pwSaving: false,
      pwForm: { oldPassword: '', newPassword: '', newPassword2: '' },
      idleTimer: null,
      clockTimer: null,
      isMobile: false,
      mobileMenuVisible: false,
      salesInternalMsgPollTimer: null,
      /** @type {Set<number>|null} 已知的未读站内信 id，首轮仅建基线不弹窗 */
      salesInternalMsgSeenUnreadIds: null,
      /** @type {(() => void) | null} */
      salesInternalMsgVisibilityHandler: null,
      unreadMessageCount: 0
    };
  },
  computed: {
    ...mapState(useAuthStore, ['impersonationBackupActive']),
    isSuperAdminUser() {
      return isSuperAdmin();
    },
    showAuditMenu() {
      if (this.isSuperAdminUser) return true;
      return (
        perm('audit', 'viewLogin') ||
        perm('audit', 'viewOperations') ||
        perm('audit', 'viewErrors')
      );
    },
    showSalesMenu() {
      if (this.isSuperAdminUser) return true;
      return (
        perm('order_management', 'order_query') ||
        perm('order_management', 'order_input') ||
        perm('contract_management', 'contract_view') ||
        perm('contract_management', 'template_manage') ||
        perm('process_management', 'view_flow')
      );
    },
    menuDefaultOpeneds() {
      return [];
    },
    pageTitle() {
      const p = this.$route.path;
      if (p === '/dashboard') return '控制台';
      if (p === '/reports/image-library') return '系统图片库';
      if (p.startsWith('/reports')) return '报告管理';
      if (p.startsWith('/qrcodes')) return '二维码管理';
      if (p.startsWith('/stamps')) return '公司章管理';
      if (p.startsWith('/company')) return '公司信息';
      if (p.startsWith('/wecom-notifications')) return '企业微信通知';
      if (p.startsWith('/sales/orders')) return '销售数据 · 订单管理';
      if (p.startsWith('/sales/contracts/templates')) return '销售数据 · 合同模板';
      if (p.startsWith('/sales/contracts/editor')) return '销售数据 · 编辑合同';
      if (p.startsWith('/sales/contracts')) return '销售数据 · 合同管理';
      if (p.startsWith('/employee-categories')) return '账号管理 · 员工类别';
      if (p.startsWith('/departments')) return '账号管理 · 部门管理';
      if (p.startsWith('/users')) return '账号管理 · 员工账号';
      if (p.startsWith('/support-contact')) return '账号管理 · 技术支持联系';
      if (p === '/security') return '系统安全';
      if (p.startsWith('/audit/login-logs')) return '安全日志 · 登录';
      if (p.startsWith('/audit/operations')) return '安全日志 · 操作';
      if (p.startsWith('/audit/errors')) return '安全日志 · 错误';
      if (p.startsWith('/my-operation-logs')) return '我的操作日志';
      if (p === '/operation-guide') return '操作指南';
      return '控制台';
    },
    pageDesc() {
      const p = this.$route.path;
      if (p === '/dashboard') return '系统概览：报表趋势与状态分布';
      if (p === '/reports') return '查询、编辑、作废报告，批量生成二维码';
      if (p === '/reports/image-library') return '仅超级管理员维护，供报告样式设计器选用（服务器存储）';
      if (p.startsWith('/reports')) return '录入报告与自定义字段';
      if (p.startsWith('/qrcodes')) return '查看二维码与绑定报告';
      if (p.startsWith('/stamps')) return '上传公司章并设置激活章';
      if (p.startsWith('/company')) return '管理logo、描述语、公司名与报告标题';
      if (p.startsWith('/wecom-notifications'))
        return '绑定企业微信应用、维护成员 UserID 与模板，生成 HTTP 调用示例';
      if (p.startsWith('/sales/orders')) return '销售订单录入、审核、发货与质检二维码关联';
      if (p.startsWith('/sales/contracts/templates'))
        return '参考新建报告：套用已有模板或推荐版式，编辑正文与预览后保存（与报告编辑页同类操作习惯）';
      if (p.startsWith('/sales/contracts/editor'))
        return '修改已生成合同的标题与正文 HTML，右侧预览版式；保存后更新合同草稿';
      if (p.startsWith('/sales/contracts'))
        return '参照报告管理：查询与分页浏览合同，正文预览与打印；模板维护对应报告的版式配置，订单流程单独追溯';
      if (p.startsWith('/employee-categories')) return '维护品管、客服等类别及各类别默认权限';
      if (p.startsWith('/departments')) return '多级部门架构，供员工归档与合同等环节选人';
      if (p.startsWith('/users')) return '创建员工账号、分配类别与个性化权限';
      if (p.startsWith('/support-contact')) return '配置技术工程师微信号，供全员在操作指南中复制';
      if (p === '/security') return '密码策略、登录锁定、会话超时、日志保留';
      if (p.startsWith('/audit/login-logs')) return '全部账号登录记录，不可删改';
      if (p.startsWith('/audit/operations')) return '全站操作审计';
      if (p.startsWith('/audit/errors')) return '服务端错误，可导出';
      if (p.startsWith('/my-operation-logs')) return '仅本人操作记录';
      if (p === '/operation-guide') return '功能说明、常见问题与联系技术工程师';
      return '';
    },
    weatherEmoji() {
      const code = Number(this.weatherCode);
      if (!Number.isFinite(code)) return '🌤️';
      if (code === 0 || code === 1) return '☀️';
      if (code === 2 || code === 3) return '⛅';
      if (code === 45 || code === 48) return '🌫️';
      if ([51, 53, 55, 61, 63, 80, 81].includes(code)) return '🌦️';
      if ([65, 82].includes(code)) return '🌧️';
      if ([71, 73, 75].includes(code)) return '🌨️';
      if (code === 95) return '⛈️';
      return '🌤️';
    }
  },
  async mounted() {
    this.handleViewportChange();
    window.addEventListener('resize', this.handleViewportChange, { passive: true });
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
        this.startSalesInternalMessagePolling();
      } catch (e) {
        const status = e?.response?.status;
        if (status === 401 || !useAuthStore().token) {
          useAuthStore().clearSession();
          this.$router.replace('/login');
        }
      }
    }
    this.tickClock();
    this.clockTimer = setInterval(this.tickClock, 1000);
    this.fetchWeather();
    this.setupIdleTimer();
    this.salesInternalMsgVisibilityHandler = () => {
      if (document.visibilityState === 'visible') this.pollSalesInternalMessages();
    };
    document.addEventListener('visibilitychange', this.salesInternalMsgVisibilityHandler);
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleViewportChange);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.salesInternalMsgPollTimer) clearInterval(this.salesInternalMsgPollTimer);
    if (this.salesInternalMsgVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.salesInternalMsgVisibilityHandler);
      this.salesInternalMsgVisibilityHandler = null;
    }
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
    handleViewportChange() {
      this.isMobile = window.innerWidth <= 992;
      if (!this.isMobile) {
        this.mobileMenuVisible = false;
      }
    },
    openMobileMenu() {
      this.mobileMenuVisible = true;
    },
    onMobileMenuSelect() {
      this.mobileMenuVisible = false;
    },
    toggleMenu() {
      this.isMenuCollapsed = !this.isMenuCollapsed;
    },
    goDashboard() {
      if (this.$route.path !== '/dashboard') this.$router.push('/dashboard');
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
        const code = Number(cw.weathercode);
        const codeText = this.weatherCodeText(code);
        this.weatherCode = Number.isFinite(code) ? code : null;
        this.weatherText = `${cityLabel} ${codeText} ${t}°C`;
        return true;
      } catch (_) {
        this.weatherCode = null;
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
        this.$message.error(this.$apiUserMsg(e, '修改失败'));
      } finally {
        this.pwSaving = false;
      }
    },
    async restoreSuperAdminSession() {
      const auth = useAuthStore();
      if (!auth.restoreImpersonationBackup()) {
        this.$message.warning('无法恢复：未找到超管会话备份');
        return;
      }
      if (this.salesInternalMsgPollTimer) clearInterval(this.salesInternalMsgPollTimer);
      this.salesInternalMsgPollTimer = null;
      this.salesInternalMsgSeenUnreadIds = null;
      try {
        const d = await getMe();
        auth.applyMeResponse(d);
        if (d?.user?.username) this.loginName = d.user.username;
      } catch {
        /* token 已恢复 */
      }
      this.$forceUpdate();
      this.startSalesInternalMessagePolling();
      this.$message.success('已恢复超级管理员身份');
      if (this.$route.path !== '/dashboard') {
        await this.$router.replace('/dashboard');
      }
    },
    logout() {
      if (this.idleTimer) clearTimeout(this.idleTimer);
      if (this.salesInternalMsgPollTimer) clearInterval(this.salesInternalMsgPollTimer);
      this.salesInternalMsgPollTimer = null;
      this.salesInternalMsgSeenUnreadIds = null;
      useAuthStore().clearSession();
      this.$router.push('/login');
    },
    startSalesInternalMessagePolling() {
      if (this.salesInternalMsgPollTimer) clearInterval(this.salesInternalMsgPollTimer);
      this.salesInternalMsgSeenUnreadIds = null;
      this.salesInternalMsgPollTimer = setInterval(() => this.pollSalesInternalMessages(), 2000);
      this.$nextTick(() => this.pollSalesInternalMessages());
    },
    notifyNewSalesInternalMessages(items) {
      const opts = {
        type: 'warning',
        position: 'top-right',
        showClose: true,
        customClass: 'sales-internal-msg-notify',
        offset: 80
      };
      const hint = '请点击顶部站内信图标查看详情。';
      if (items.length === 1) {
        const m = items[0];
        ElNotification({
          title: m.title || '新站内信',
          message: hint,
          duration: 15000,
          ...opts
        });
      } else {
        ElNotification({
          title: `新站内信 (${items.length})`,
          message: hint,
          duration: 15000,
          ...opts
        });
      }
    },
    goToMessages() {
      this.$router.push('/sales/orders');
    },
    async pollSalesInternalMessages() {
      if (!useAuthStore().token) return;
      try {
        const { items } = await listSalesMessages({ unread: 1 });
        const list = items || [];
        const currIds = new Set(list.map((m) => Number(m.id)));
        const prev = this.salesInternalMsgSeenUnreadIds;
        if (prev !== null) {
          const newcomers = list.filter((m) => !prev.has(Number(m.id)));
          if (newcomers.length) this.notifyNewSalesInternalMessages(newcomers);
        }
        this.salesInternalMsgSeenUnreadIds = currIds;
        this.unreadMessageCount = list.length;
      } catch {
        /* 未登录跳转、网络异常等忽略 */
      }
    }
  }
};
</script>

<style scoped>
.aside {
  padding: 14px 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}
.aside-column {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
}
.aside-menu-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 12px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.aside-menu-wrap::-webkit-scrollbar {
  display: none;
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
  margin: 0 12px 12px;
}
.collapse-btn {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.9);
}
.collapse-btn:hover {
  color: rgba(255, 255, 255, 0.8);
}

/* When sidebar is collapsed, only collapse button is shown in brand;
   center it and adjust hover background. */
.aside.is-collapsed .brand {
  justify-content: center;
}

.aside.is-collapsed .collapse-btn {
  margin-left: 0;
  width: 100%;
  justify-content: center;
}

.aside.is-collapsed .collapse-btn:hover {
  background: rgba(34, 197, 94, 0.14) !important;
  border-radius: 8px;
  padding: 4px;
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
  white-space: nowrap; /* 防止“质检报告系统”换行 */
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px; /* 侧栏宽度收起时也不换行 */
  line-height: 1.2;
}
.brand-text .sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
  margin-top: 2px;
}
.menu {
  padding-top: 6px;
  padding-bottom: 8px;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  padding: 0 18px;
}
.header-leading {
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;
}
.header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
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
.mobile-menu-btn {
  align-self: flex-start;
  margin-bottom: 2px;
}
.home-btn {
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.9);
  color: #334155;
  padding: 8px 12px;
}
.home-btn:hover {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.35);
}

.restore-admin-btn {
  flex-shrink: 0;
}

.mobile-restore-admin {
  display: block;
  width: 100%;
  margin-bottom: 8px;
}
.meta-info {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
}
.weather-info {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.weather-icon {
  line-height: 1;
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

.messages-btn {
  background-color: #165DFF;
  border-color: #165DFF;
}

.messages-btn:hover {
  background-color: #4080FF;
  border-color: #4080FF;
}

.message-badge {
  --el-badge-background-color: #F56C6C;
  --el-badge-text-color: #FFFFFF;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
  position: absolute;
  top: -4px;
  right: -4px;
}

.messages-btn {
  position: relative;
  background-color: #165DFF;
  border-color: #165DFF;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.messages-dropdown {
  position: relative;
}
/* 右侧主区域：占满侧栏以外的空间并正确参与 flex 高度计算，避免主内容出现“多余”滚动条 */
.main-column {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.main {
  padding: 18px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.mobile-drawer-body {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mobile-brand {
  margin: 0 0 10px;
}

.mobile-meta {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 8px;
}

.mobile-menu {
  color: #0f172a;
}

.mobile-menu :deep(.el-menu-item),
.mobile-menu :deep(.el-sub-menu__title) {
  color: #0f172a;
}

.menu :deep(.no-parent-active.is-active > .el-sub-menu__title) {
  background: transparent !important;
  color: rgba(255, 255, 255, 0.84) !important;
  border-right-color: transparent !important;
}

.menu :deep(.no-parent-active.is-active > .el-sub-menu__title .el-icon) {
  color: rgba(255, 255, 255, 0.84) !important;
}

.mobile-menu :deep(.no-parent-active.is-active > .el-sub-menu__title) {
  background: transparent !important;
  color: #0f172a !important;
  border-right-color: transparent !important;
}

.mobile-menu :deep(.no-parent-active.is-active > .el-sub-menu__title .el-icon) {
  color: #0f172a !important;
}

@media (max-width: 992px) {
  .header {
    padding: 0 12px;
  }
  .page-title {
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 50vw;
  }
  .header-right {
    gap: 8px;
  }
  .user {
    padding: 6px 8px;
  }
  .user .text {
    max-width: 96px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .main {
    padding: 12px;
  }
}
</style>

<style>
/* 站内信弹窗：多行正文与后端 \n 对齐 */
.sales-internal-msg-notify .el-notification__content {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
  overflow-y: auto;
  text-align: left;
}
</style>
