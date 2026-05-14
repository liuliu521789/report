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
          <!-- default-active 会随路由更新（EP 内部 watch）；勿加 :key 整表重建，否则子菜单展开态易丢 -->
          <el-menu
            :default-active="sidebarActivePath"
            :default-openeds="menuDefaultOpeneds"
            :collapse="isMenuCollapsed"
            class="menu"
            @select="onSidebarMenuSelect"
          >
        <el-menu-item v-if="perm('reports', 'list')" index="/reports">
          <el-icon><DocumentCopy /></el-icon>
          <span>报告管理</span>
        </el-menu-item>
        <el-menu-item v-if="isSuperAdminUser" index="/reports/image-library">
          <el-icon><Picture /></el-icon>
          <span>系统图片库</span>
        </el-menu-item>
        <el-menu-item v-if="perm('templates', 'use')" index="/report-templates">
          <el-icon><Files /></el-icon>
          <span>报告模板管理</span>
        </el-menu-item>
        <el-menu-item
          v-if="perm('qc_yearbooks', 'view') || perm('qc_yearbooks', 'upload')"
          index="/qc-yearbooks"
        >
          <el-icon><DataAnalysis /></el-icon>
          <span>品质管控数据</span>
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
            v-if="perm('customer_management', 'view')"
            index="/sales/customers"
          >
            <el-icon><User /></el-icon>
            <span>客户管理</span>
          </el-menu-item>
          <el-menu-item
            v-if="perm('order_management', 'order_field_config')"
            index="/sales/internal-models"
          >
            <el-icon><Document /></el-icon>
            <span>内部型号管理</span>
          </el-menu-item>
          <el-menu-item
            v-if="
              perm('contract_management', 'template_manage') ||
              canAccessSalesContractWorkspace() ||
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
            <span>安全中心</span>
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
          <el-menu-item v-if="isSuperAdminUser" index="/backups">
            <el-icon><Download /></el-icon>
            <span>备份与恢复</span>
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
          <el-tooltip content="站内信" placement="bottom">
            <el-button
              type="primary"
              circle
              class="messages-btn"
              :class="{ 'messages-btn--alert': bellAlertAnimating }"
              @click="goToMessages"
            >
              <span
                v-if="unreadMessageCount > 0"
                class="messages-live-dot"
                aria-hidden="true"
              />
              <el-icon><Bell /></el-icon>
            </el-button>
          </el-tooltip>
          <el-dropdown trigger="click">
            <span
              class="user"
              :class="{
                'user--chairman': isChairmanUser,
                'user--super-admin': !isChairmanUser && accountType === 'super_admin'
              }"
            >
              <span class="avatar-wrap">
                <el-avatar :size="24">
                  <el-icon><UserFilled /></el-icon>
                </el-avatar>
              </span>
              <span class="text">{{ displayLoginName }}</span>
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
        <router-view :key="$route.fullPath" />
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
          :default-active="sidebarActivePath"
          :default-openeds="menuDefaultOpeneds"
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
          <el-menu-item v-if="perm('templates', 'use')" index="/report-templates">
            <el-icon><Files /></el-icon>
            <span>报告模板管理</span>
          </el-menu-item>
          <el-menu-item
            v-if="perm('qc_yearbooks', 'view') || perm('qc_yearbooks', 'upload')"
            index="/qc-yearbooks"
          >
            <el-icon><DataAnalysis /></el-icon>
            <span>品质管控数据</span>
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
              v-if="perm('customer_management', 'view')"
              index="/sales/customers"
            >
              <el-icon><User /></el-icon>
              <span>客户管理</span>
            </el-menu-item>
            <el-menu-item
              v-if="perm('order_management', 'order_field_config')"
              index="/sales/internal-models"
            >
              <el-icon><Document /></el-icon>
              <span>内部型号管理</span>
            </el-menu-item>
            <el-menu-item
              v-if="
                perm('contract_management', 'template_manage') ||
                canAccessSalesContractWorkspace() ||
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
              <span>安全中心</span>
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
            <el-menu-item v-if="isSuperAdminUser" index="/backups">
              <el-icon><Download /></el-icon>
              <span>备份与恢复</span>
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-if="!isSuperAdminUser" index="/my-operation-logs">
            <el-icon><Document /></el-icon>
            <span>我的操作日志</span>
          </el-menu-item>
        </el-menu>
      </div>
    </el-drawer>
    <el-dialog
      :title="forceChangePassword ? '请修改初始密码' : '修改密码'"
      v-model="pwDialog"
      width="420px"
      :close-on-click-modal="!forceChangePassword"
      :close-on-press-escape="!forceChangePassword"
      :show-close="!forceChangePassword"
      @close="resetPw"
    >
      <el-alert
        v-if="forceChangePassword"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
        title="您的账号被要求修改初始/重置密码后才能继续操作。"
      />
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
        <el-button v-if="!forceChangePassword" @click="pwDialog = false" icon=Close>取消</el-button>
        <el-button v-else @click="logout" icon=Close>退出登录</el-button>
        <el-button type="primary" :loading="pwSaving" @click="submitPassword" icon=Check>保存</el-button>
      </template>
    </el-dialog>
    <el-drawer
      v-model="messagesOpen"
      title="站内信"
      size="420px"
      class="layout-messages-drawer"
      @open="onMessagesOpen"
    >
      <div class="messages-toolbar messages-toolbar--top">
        <el-button size="small" @click="loadMessages" icon=Refresh>刷新</el-button>
        <el-button size="small" type="primary" @click="goToMessagesManage">管理站内信</el-button>
      </div>
      <el-radio-group v-model="messageInboxFilter" size="small" class="msg-type-filter">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="notice">普通通知</el-radio-button>
        <el-radio-button value="todo">待办通知</el-radio-button>
        <el-radio-button value="system">系统消息</el-radio-button>
      </el-radio-group>
      <el-scrollbar class="messages-scroll" max-height="calc(100vh - 200px)">
        <div
          v-for="m in filteredMessages"
          :key="m.id"
          class="msg-card"
          :class="{ 'msg-card--unread': !m.read_at }"
          role="button"
          tabindex="0"
          @click="readMsg(m)"
          @keydown.enter="readMsg(m)"
        >
          <div class="msg-card__row">
            <div
              class="msg-card__icon-wrap"
              :class="{
                'msg-card__icon-wrap--reject': isFinanceRejectInboxMessage(m),
                'msg-card__icon-wrap--notice': messageKind(m) === 'notice' && !isFinanceRejectInboxMessage(m),
                'msg-card__icon-wrap--todo': messageKind(m) === 'todo',
                'msg-card__icon-wrap--system': messageKind(m) === 'system'
              }"
              aria-hidden="true"
            >
              <span v-if="isFinanceRejectInboxMessage(m)" class="msg-card__reject-x">×</span>
              <el-icon v-else-if="messageKind(m) === 'notice'" :size="22"><Bell /></el-icon>
              <el-icon v-else-if="messageKind(m) === 'todo'" :size="22"><Calendar /></el-icon>
              <el-icon v-else :size="22"><Cpu /></el-icon>
            </div>
            <div class="msg-card__main">
              <div class="msg-card__head">
                <span v-if="!m.read_at" class="msg-card__dot" aria-hidden="true" />
                <span class="msg-card__title">{{ m.title }}</span>
                <el-tag size="small" effect="plain" class="msg-card__type-tag">{{ messageKindLabel(m) }}</el-tag>
                <el-tag v-if="!m.read_at" type="danger" size="small" effect="plain" class="msg-card__badge">未读</el-tag>
              </div>
              <div class="msg-card__body">{{ m.body_text }}</div>
              <div class="msg-card__time">{{ $dt(m.created_at) }}</div>
            </div>
          </div>
        </div>
        <el-empty
          v-if="!filteredMessages.length"
          :description="messages.length ? '该分类暂无消息' : '暂无消息'"
          class="messages-empty"
        />
      </el-scrollbar>
    </el-drawer>
  </el-container>
</template>

<script>
import { mapState } from 'pinia';
import { ElNotification } from 'element-plus';
import { isSuperAdmin, perm, canAccessSalesContractWorkspace } from '../utils/permissions';
import { changePassword, getMe, listSalesMessages, logout as apiLogout, markSalesMessageRead } from '../api';
import { resolveInternalMessageRoute } from '../utils/internalMessageNavigate';
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
      unreadMessageCount: 0,
      messagesOpen: false,
      messages: [],
      /** all | notice | todo | system */
      messageInboxFilter: 'all',
      bellAlertAnimating: false,
      bellAlertTimer: null
    };
  },
  computed: {
    ...mapState(useAuthStore, ['impersonationBackupActive', 'forceChangePassword', 'accountType', 'username', 'realName', 'employeeCategoryCode']),
    displayLoginName() {
      if (this.accountType === 'super_admin') return '超级管理员';
      const realName = String(this.realName || '').trim();
      if (realName) return realName;
      const username = String(this.username || '').trim();
      if (username) return username;
      return this.loginName || '已登录';
    },
    isChairmanUser() {
      const categoryCode = String(this.employeeCategoryCode || '').trim().toLowerCase();
      if (categoryCode === 'chairman') return true;
      const realName = String(this.realName || '').trim();
      return realName === '董事长' || realName === '王总';
    },
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
        perm('order_management', 'order_field_config') ||
        perm('customer_management', 'view') ||
        perm('contract_management', 'template_manage') ||
        canAccessSalesContractWorkspace() ||
        perm('process_management', 'view_flow')
      );
    },
    menuDefaultOpeneds() {
      return [];
    },
    /** 与侧栏 `index` 对齐，避免子路由（如 /reports/123）无法高亮一级菜单 */
    sidebarActivePath() {
      const p = this.$route.path;
      if (p === '/reports/image-library') return '/reports/image-library';
      if (p === '/reports/designer' || p === '/reports/new') return '/reports';
      if (/^\/reports\/\d+$/.test(p)) return '/reports';
      if (p.startsWith('/sales/contracts/')) return '/sales/contracts';
      if (p.startsWith('/audit/login-logs')) return '/audit/login-logs';
      if (p.startsWith('/audit/operations')) return '/audit/operations';
      if (p.startsWith('/audit/errors')) return '/audit/errors';
      return p;
    },
    filteredMessages() {
      const list = this.messages || [];
      const f = this.messageInboxFilter;
      if (f === 'all') return list;
      return list.filter((m) => this.messageKind(m) === f);
    },
    pageTitle() {
      const p = this.$route.path;
      if (p === '/dashboard') return '控制台';
      if (p === '/reports/image-library') return '系统图片库';
      if (p === '/report-templates') return '报告模板管理';
      if (p === '/qc-yearbooks') return '品质管控数据台账';
      if (p.startsWith('/reports')) return '报告管理';
      if (p.startsWith('/qrcodes')) return '二维码管理';
      if (p.startsWith('/stamps')) return '公司章管理';
      if (p.startsWith('/company')) return '公司信息';
      if (p.startsWith('/wecom-notifications')) return '企业微信通知';
      if (p === '/sales/messages') return '站内信';
      if (p.startsWith('/sales/orders')) return '销售数据 · 订单管理';
      if (p.startsWith('/sales/internal-models')) return '销售数据 · 内部型号管理';
      if (p.startsWith('/sales/contracts/templates')) return '销售数据 · 合同模板';
      if (p.startsWith('/sales/contracts/editor')) return '销售数据 · 编辑合同';
      if (p.startsWith('/sales/contracts')) return '销售数据 · 合同管理';
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
    },
    pageDesc() {
      const p = this.$route.path;
      if (p === '/dashboard') return '系统概览：报表趋势与状态分布';
      if (p === '/reports') return '查询、编辑、作废报告，批量生成二维码';
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
      if (p.startsWith('/sales/internal-models')) return '维护销售内部型号编码、名称、状态与备注，支持订单字段配置权限下的CRUD操作';
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
      if (p.startsWith('/backups')) return '数据库与文件备份包导出、完整性校验与注意事项';
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
  watch: {
    forceChangePassword(v) {
      if (v) {
        // 触发强制改密时：停止站内信轮询，避免持续 403
        this.unreadMessageCount = 0;
        if (this.salesInternalMsgPollTimer) {
          clearInterval(this.salesInternalMsgPollTimer);
          this.salesInternalMsgPollTimer = null;
        }
        this.openChangePassword();
      } else {
        // 取消强制改密时：若当前有 token，则恢复站内信轮询
        if (useAuthStore().token && !this.salesInternalMsgPollTimer) {
          this.startSalesInternalMessagePolling();
        }
      }
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
          this.loginName = this.resolveLoginName(d.user);
        }
        auth.applyMeResponse(d);
        this.$forceUpdate();
        if (auth.forceChangePassword) {
          this.openChangePassword();
        } else {
          this.startSalesInternalMessagePolling();
        }
      } catch (e) {
        const status = e?.response?.status;
        const code = e?.response?.data?.error;
        if (code === 'PASSWORD_MUST_CHANGE') {
          this.openChangePassword();
        } else if (status === 401 || !useAuthStore().token) {
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
    if (this.bellAlertTimer) {
      clearTimeout(this.bellAlertTimer);
      this.bellAlertTimer = null;
    }
    if (this._internalMsgAudio) {
      try {
        this._internalMsgAudio.pause();
      } catch {
        /* ignore */
      }
      this._internalMsgAudio = null;
    }
    this._internalMsgAudioPrimed = false;
    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((ev) => {
      window.removeEventListener(ev, this.onUserActivity, true);
    });
  },
  methods: {
    perm,
    canAccessSalesContractWorkspace,
    resolveLoginName(user) {
      if (!user || typeof user !== 'object') return '';
      if (user.accountType === 'super_admin') return '超级管理员';
      const realName = String(user.realName || '').trim();
      if (realName) return realName;
      return String(user.username || '');
    },
    onUserActivity() {
      this.primeInternalMessageAudioFromUserGesture();
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
    /** `el-menu` 的 `router` 模式在部分环境下与 hash 路由不同步，改为显式 push */
    navigateByMenuIndex(index) {
      if (typeof index !== 'string' || !index.startsWith('/')) return;
      /** 侧栏一级菜单均不应携带上一页的 query；否则合同页残留 customer_code 等会导致列表被筛空，且 el-menu 在同 path 下可能不再触发有效跳转 */
      this.$router.push({ path: index, query: {} }).catch(() => {});
    },
    onSidebarMenuSelect(index) {
      this.navigateByMenuIndex(index);
    },
    onMobileMenuSelect(index) {
      this.mobileMenuVisible = false;
      this.navigateByMenuIndex(index);
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
        useAuthStore().clearSession();
        this.$router.push('/login');
      } catch (e) {
        const code = e?.response?.data?.error;
        if (code === 'OLD_PASSWORD_WRONG') this.$message.error('当前密码不正确');
        else if (code === 'PASSWORD_SAME_AS_OLD') this.$message.error('新密码不能与原密码相同');
        else this.$message.error(this.$apiUserMsg(e, '修改失败'));
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
        if (d?.user) this.loginName = this.resolveLoginName(d.user);
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
    async logout() {
      if (this.idleTimer) clearTimeout(this.idleTimer);
      if (this.salesInternalMsgPollTimer) clearInterval(this.salesInternalMsgPollTimer);
      this.salesInternalMsgPollTimer = null;
      this.salesInternalMsgSeenUnreadIds = null;
      try {
        /** 通知服务端 bump token_version，让此 token 在所有设备立即失效 */
        await apiLogout();
      } catch {
        /** 网络异常时仍清本地会话 */
      }
      useAuthStore().clearSession();
      this.$router.push('/login');
    },
    startSalesInternalMessagePolling() {
      if (this.salesInternalMsgPollTimer) clearInterval(this.salesInternalMsgPollTimer);
      this.salesInternalMsgSeenUnreadIds = null;
      this.salesInternalMsgPollTimer = setInterval(() => this.pollSalesInternalMessages(), 2000);
      this.$nextTick(() => this.pollSalesInternalMessages());
    },
    /**
     * 浏览器默认禁止无用户手势播放有声媒体；首次单击 / 按键 / 滑动等之后用静音 play 解锁，
     * 后续轮询触发的站内信提示音才能播。
     */
    primeInternalMessageAudioFromUserGesture() {
      if (this._internalMsgAudioPrimed) return;
      try {
        if (!this._internalMsgAudio) {
          this._internalMsgAudio = new Audio('/newMessage.mp3');
          this._internalMsgAudio.preload = 'auto';
        }
        const a = this._internalMsgAudio;
        a.muted = true;
        const p = a.play();
        const finish = () => {
          try {
            a.pause();
            a.currentTime = 0;
            a.muted = false;
            this._internalMsgAudioPrimed = true;
          } catch {
            /* ignore */
          }
        };
        if (p && typeof p.then === 'function') {
          p.then(finish).catch(() => {
            try {
              a.muted = false;
            } catch {
              /* ignore */
            }
          });
        } else {
          finish();
        }
      } catch {
        /* ignore */
      }
    },
    playInternalMessageSound() {
      try {
        if (!this._internalMsgAudio) {
          this._internalMsgAudio = new Audio('/newMessage.mp3');
          this._internalMsgAudio.preload = 'auto';
        }
        this._internalMsgAudio.currentTime = 0;
        const p = this._internalMsgAudio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* 浏览器未交互前可能拒绝播放 */
      }
    },
    notifyNewSalesInternalMessages(items) {
      this.playInternalMessageSound();
      const opts = {
        type: 'warning',
        position: 'top-right',
        showClose: true,
        customClass: 'sales-internal-msg-notify',
        offset: 80
      };
      const hint = '点击本条通知或顶部站内信图标查看详情。';
      const openInbox = () => {
        this.goToMessages();
      };
      if (items.length === 1) {
        const m = items[0];
        ElNotification({
          title: m.title || '新站内信',
          message: hint,
          duration: 15000,
          onClick: openInbox,
          ...opts
        });
      } else {
        ElNotification({
          title: `新站内信 (${items.length})`,
          message: hint,
          duration: 15000,
          onClick: openInbox,
          ...opts
        });
      }
    },
    triggerMessageBellAlert() {
      this.bellAlertAnimating = false;
      if (this.bellAlertTimer) {
        clearTimeout(this.bellAlertTimer);
        this.bellAlertTimer = null;
      }
      this.$nextTick(() => {
        this.bellAlertAnimating = true;
        this.bellAlertTimer = setTimeout(() => {
          this.bellAlertAnimating = false;
          this.bellAlertTimer = null;
        }, 1200);
      });
    },
    goToMessages() {
      this.primeInternalMessageAudioFromUserGesture();
      if (this.forceChangePassword) {
        this.openChangePassword();
        return;
      }
      this.messagesOpen = true;
    },
    goToMessagesManage() {
      this.messagesOpen = false;
      this.$router.push('/sales/messages');
    },
    isFinanceRejectInboxMessage(m) {
      if (!m) return false;
      if (m.title === '订单审核驳回') return true;
      if (m.ref_type === 'order_batch_rejected') return true;
      return false;
    },
    messageKind(m) {
      const c = m && m.category;
      if (c === 'todo' || c === 'system') return c;
      return 'notice';
    },
    messageKindLabel(m) {
      const k = this.messageKind(m);
      if (k === 'todo') return '待办';
      if (k === 'system') return '系统';
      return '普通';
    },
    async refreshMessages() {
      if (this.forceChangePassword) {
        this.messages = [];
        this.unreadMessageCount = 0;
        return;
      }
      try {
        const d = await listSalesMessages({});
        this.messages = d.items || [];
      } catch {
        this.messages = [];
      }
    },
    async loadMessages() {
      await this.refreshMessages();
    },
    async onMessagesOpen() {
      await this.loadMessages();
      await this.markAllMessagesRead();
    },
    async markAllMessagesRead() {
      const unread = this.messages.filter((m) => !m.read_at);
      if (!unread.length) {
        this.unreadMessageCount = 0;
        return;
      }
      try {
        await Promise.all(unread.map((m) => this.readMsg(m, { silent: true, navigate: false })));
        this.unreadMessageCount = 0;
      } catch {
        this.pollSalesInternalMessages();
      }
    },
    async readMsg(m, opts = {}) {
      const silent = opts.silent === true;
      const navigate = opts.navigate !== false;
      if (!m.read_at) {
        try {
          await markSalesMessageRead(m.id);
          m.read_at = new Date().toISOString();
          this.unreadMessageCount = Math.max(0, this.unreadMessageCount - 1);
        } catch {
          if (!silent) this.$message.error('标记已读失败');
          return;
        }
      }
      if (!navigate) return;
      const target = resolveInternalMessageRoute(m);
      if (!target) return;
      this.messagesOpen = false;
      try {
        await this.$router.push(target);
      } catch (e) {
        if (e && e.name === 'NavigationDuplicated') return;
        throw e;
      }
    },
    async pollSalesInternalMessages() {
      if (!useAuthStore().token) return;
      if (this.forceChangePassword) {
        this.unreadMessageCount = 0;
        if (this.salesInternalMsgPollTimer) {
          clearInterval(this.salesInternalMsgPollTimer);
          this.salesInternalMsgPollTimer = null;
        }
        return;
      }
      try {
        const { items } = await listSalesMessages({ unread: 1 });
        const list = items || [];
        const currIds = new Set(list.map((m) => Number(m.id)));
        const prev = this.salesInternalMsgSeenUnreadIds;
        if (prev !== null) {
          const newcomers = list.filter((m) => !prev.has(Number(m.id)));
          if (newcomers.length) {
            this.notifyNewSalesInternalMessages(newcomers);
            this.triggerMessageBellAlert();
          }
        }
        this.salesInternalMsgSeenUnreadIds = currIds;
        this.unreadMessageCount = list.length;
      } catch (e) {
        const code = e?.response?.data?.error;
        if (code === 'PASSWORD_MUST_CHANGE') {
          this.unreadMessageCount = 0;
          if (this.salesInternalMsgPollTimer) {
            clearInterval(this.salesInternalMsgPollTimer);
            this.salesInternalMsgPollTimer = null;
          }
          this.openChangePassword();
        }
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
  overflow-y: auto;
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
.user--super-admin {
  border-color: rgba(192, 192, 192, 0.75);
  background: linear-gradient(145deg, #f8fafc, #e2e8f0);
  box-shadow: 0 2px 10px rgba(148, 163, 184, 0.35);
}
.user--super-admin .text {
  color: #475569;
  font-weight: 600;
}
.user--super-admin :deep(.el-avatar) {
  background: #cbd5e1;
  color: #334155;
}
.user--super-admin .online-dot {
  background: linear-gradient(145deg, #86efac, #22c55e);
  border-color: #f8fafc;
}
.user--chairman {
  border-color: rgba(212, 175, 55, 0.65);
  background: linear-gradient(145deg, #141414, #1f1f1f);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
}
.user--chairman .text {
  color: #f5d67a;
  font-weight: 600;
}
.user--chairman :deep(.el-avatar) {
  background: #2a2a2a;
  color: #f5d67a;
}
.user--chairman .online-dot {
  background: #d4af37;
  border-color: #1a1a1a;
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

.messages-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e2e8f0;
}
.msg-type-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-bottom: 12px;
  width: 100%;
}
.msg-type-filter :deep(.el-radio-button__inner) {
  padding: 7px 10px;
}
.messages-scroll {
  padding-right: 4px;
}
.messages-empty {
  padding: 24px 0;
}
.msg-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 12px 10px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.msg-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  background: #fff;
}
.msg-card:focus-visible {
  outline: 2px solid rgba(34, 197, 94, 0.45);
  outline-offset: 2px;
}
.msg-card--unread {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.06), #f8fafc);
  border-color: rgba(34, 197, 94, 0.35);
  border-left-width: 3px;
  border-left-color: #22c55e;
}
.msg-card__row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.msg-card__icon-wrap {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.msg-card__icon-wrap--reject {
  background: #ef4444;
  border-color: #dc2626;
  box-shadow: 0 1px 3px rgba(220, 38, 38, 0.35);
}
.msg-card__reject-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 26px;
  font-weight: 600;
  line-height: 1;
  color: #fff;
  user-select: none;
}
.msg-card__icon-wrap--notice :deep(.el-icon) {
  color: #2563eb;
}
.msg-card__icon-wrap--todo :deep(.el-icon) {
  color: #d97706;
}
.msg-card__icon-wrap--system :deep(.el-icon) {
  color: #64748b;
}
.msg-card__main {
  flex: 1;
  min-width: 0;
}
.msg-card__head {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-bottom: 8px;
}
.msg-card__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: #ef4444;
}
.msg-card__title {
  flex: 1;
  min-width: 120px;
  font-weight: 600;
  font-size: 14px;
  color: #0f172a;
  line-height: 1.4;
}
.msg-card__type-tag {
  flex-shrink: 0;
  color: #64748b !important;
  border-color: #e2e8f0 !important;
  background: rgba(255, 255, 255, 0.9) !important;
}
.msg-card__badge {
  flex-shrink: 0;
}
.msg-card__body {
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-card__time {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 10px;
}

.messages-btn {
  background-color: #165DFF;
  border-color: #165DFF;
}

.messages-btn:hover {
  background-color: #4080FF;
  border-color: #4080FF;
}

/* 未读时右上角呼吸脉冲红点 */
.messages-live-dot {
  position: absolute;
  right: 2px;
  top: 2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: linear-gradient(145deg, #fb7185, #ef4444);
  border: 1.5px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.42);
  pointer-events: none;
  z-index: 2;
  animation: messages-dot-breathe 2.75s ease-in-out infinite;
}

.messages-btn--alert .el-icon {
  transform-origin: 50% 18%;
  animation: bell-alert-shake-bounce 1.15s ease-in-out 1;
}

@keyframes messages-dot-breathe {
  0%,
  100% {
    opacity: 0.82;
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.38);
  }
  50% {
    opacity: 1;
    transform: scale(1.14);
    box-shadow: 0 0 0 5px rgba(239, 68, 68, 0);
  }
}

@keyframes bell-alert-shake-bounce {
  0% { transform: rotate(0deg) translateY(0); }
  8% { transform: rotate(18deg) translateY(0); }
  16% { transform: rotate(-18deg) translateY(0); }
  24% { transform: rotate(12deg) translateY(0); }
  32% { transform: rotate(-12deg) translateY(0); }
  40% { transform: rotate(8deg) translateY(0); }
  48% { transform: rotate(-8deg) translateY(0); }
  56% { transform: rotate(0deg) translateY(0); }
  72% { transform: rotate(0deg) translateY(-2px); }
  86% { transform: rotate(0deg) translateY(0); }
  100% { transform: rotate(0deg) translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .messages-live-dot {
    animation: none;
    opacity: 1;
    box-shadow: none;
  }
  .messages-btn--alert .el-icon {
    animation: none;
  }
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
.sales-internal-msg-notify {
  cursor: pointer;
}
.sales-internal-msg-notify .el-notification__content {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
  overflow-y: auto;
  text-align: left;
}
</style>
