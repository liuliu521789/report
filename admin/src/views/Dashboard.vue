<template>
  <div class="dashboard">
    <el-card shadow="hover" class="dash-panel dash-hero-card">
      <div class="dash-hero">
        <div class="dash-hero-main">
          <div class="dash-hero-greeting">{{ greetingText }}</div>
          <div class="dash-hero-sub">{{ welcomeSubText }}</div>
        </div>
        <div class="dash-hero-side">
          <div class="dash-hero-meta">
            <span class="dash-hero-date">{{ todayLabel }}</span>
            <el-tag v-if="isSuperAdminUser" type="warning" effect="dark" size="small" round>超级管理员</el-tag>
            <el-tag v-else-if="employeeCategoryLabel" type="info" effect="plain" size="small" round>
              {{ employeeCategoryLabel }}
            </el-tag>
          </div>
          <div class="dash-hero-actions">
            <span class="dash-updated">最近更新：{{ lastUpdatedText }}</span>
            <el-button :loading="refreshing" type="primary" plain size="small" @click="reloadDashboard">刷新数据</el-button>
          </div>
        </div>
      </div>
    </el-card>

    <el-row v-if="quickSections.length" :gutter="16" class="dash-row">
      <el-col
        v-for="(sec, idx) in quickSections"
        :key="sec.key"
        :xs="24"
        :md="quickSectionMdSpan(idx)"
        :lg="quickSectionLgSpan(idx)"
      >
        <el-card shadow="hover" class="dash-panel quick-panel">
          <template #header>
            <div class="panel-head" :class="{ 'panel-head--between': sec.key === 'impersonate' }">
              <div>
                <span class="panel-title">{{ sec.title }}</span>
                <span v-if="sec.hint" class="panel-desc">{{ sec.hint }}</span>
              </div>
              <el-button
                v-if="sec.key === 'impersonate'"
                type="primary"
                link
                size="small"
                @click.stop="openQuickRoleDialog"
              >
                配置绑定账号
              </el-button>
            </div>
          </template>
          <div class="quick-card-grid">
            <div
              v-for="item in sec.items"
              :key="item.key"
              class="quick-link-card"
              :class="`quick-link-card--${item.tone}`"
              role="button"
              tabindex="0"
              @click="onQuickItem(item)"
              @keyup.enter="onQuickItem(item)"
            >
              <div class="quick-link-icon">
                <el-icon :size="22"><component :is="item.icon" /></el-icon>
              </div>
              <div class="quick-link-text">
                <span class="quick-link-zh">{{ item.zh }}</span>
                <el-tag v-if="item.badge" size="small" type="danger" effect="plain" round>{{ item.badge }}</el-tag>
              </div>
              <el-icon v-if="item.loadingKey && quickRoleEntering === item.loadingKey" class="is-loading quick-link-loading">
                <Loading />
              </el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row v-if="activityHeatmap" :gutter="16" class="dash-row">
      <el-col :span="24">
        <el-card shadow="hover" class="dash-panel chart-panel">
          <template #header>
            <div class="panel-head panel-head--between heatmap-panel-head">
              <div>
                <span class="panel-title">{{ activityHeatmap.title }}</span>
                <span class="panel-desc">{{ activityHeatmap.subtitle }}</span>
              </div>
              <el-radio-group
                v-if="heatmapTypeOptions.length > 1"
                :model-value="heatmapSelectedType"
                size="small"
                class="heatmap-type-switch"
                @change="onHeatmapTypeChange"
              >
                <el-radio-button
                  v-for="opt in heatmapTypeOptions"
                  :key="opt.type"
                  :value="opt.type"
                >
                  {{ opt.label }}
                </el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <el-alert
            v-if="heatmapWrongTypeHint"
            class="heatmap-hint"
            type="info"
            :closable="false"
            show-icon
            title="当前为「报告生成」视图，订单录入请切换到「订单录入」"
          />
          <el-alert
            v-else-if="heatmapNoDataHint"
            class="heatmap-hint"
            type="warning"
            :closable="false"
            show-icon
            :title="heatmapNoDataHint"
          />
          <div v-loading="heatmapLoading">
            <ActivityHeatmap
              :days="activityHeatmap.days"
              :max="activityHeatmap.max"
              :total="activityHeatmap.total"
              :type="activityHeatmap.type"
              :title="activityHeatmap.title"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row v-if="statCards.length" :gutter="16" class="dash-row">
      <el-col
        v-for="(card, idx) in statCards"
        :key="card.key"
        :xs="24"
        :sm="12"
        :md="statCardMdSpan(idx)"
        :lg="statCardLgSpan(idx)"
      >
        <el-card shadow="hover" class="dash-panel stat-card" :class="`stat-card--${card.tone}`">
          <div class="stat-accent" />
          <div class="stat-body">
            <div class="stat-top">
              <div class="stat-icon-badge">
                <el-icon :size="20"><component :is="card.icon" /></el-icon>
              </div>
              <div class="stat-top-text">
                <div class="stat-label">{{ card.label }}</div>
                <div class="stat-hint">{{ card.sub }}</div>
              </div>
              <div
                v-if="card.trendPct != null"
                class="stat-trend"
                :class="card.trendUp ? 'stat-trend--up' : 'stat-trend--down'"
              >
                {{ formatTrendPct(card.trendPct) }}
              </div>
            </div>
            <div class="stat-value">{{ formatMaybeNumber(card.value) }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row v-if="hasChartRow" :gutter="16" class="dash-row">
      <el-col v-if="showReportCharts" :xs="24" :lg="showSalesFlowChart ? 12 : 16">
        <el-card shadow="hover" class="dash-panel chart-panel">
          <template #header>
            <div class="panel-head">
              <span class="panel-title">报告趋势</span>
              <span class="panel-desc">近 7 日 · 按结论分类</span>
            </div>
          </template>
          <div v-loading="loading" class="chart-box">
            <div ref="trendChartRef" class="echart-block echart-block--lg" />
          </div>
        </el-card>
      </el-col>
      <el-col v-if="showReportCharts" :xs="24" :lg="showSalesFlowChart ? 6 : 8">
        <el-card shadow="hover" class="dash-panel chart-panel chart-panel--donut">
          <template #header>
            <div class="panel-head">
              <span class="panel-title">报告状态</span>
              <span class="panel-desc">有效 / 作废 / 未知</span>
            </div>
          </template>
          <div v-loading="loading" class="chart-box chart-box--donut">
            <div ref="donutChartRef" class="echart-block echart-block--donut" />
          </div>
        </el-card>
      </el-col>
      <el-col v-if="showSalesFlowChart" :xs="24" :lg="showReportCharts ? 6 : 24">
        <el-card shadow="hover" class="dash-panel chart-panel">
          <template #header>
            <div class="panel-head">
              <span class="panel-title">订单流程分布</span>
              <span class="panel-desc">各阶段待处理数量</span>
            </div>
          </template>
          <div v-loading="loading" class="chart-box">
            <div ref="salesFlowChartRef" class="echart-block" :class="showReportCharts ? 'echart-block--donut' : 'echart-block--md'" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row v-if="salesTodoItems.length" :gutter="16" class="dash-row">
      <el-col :span="24">
        <el-card shadow="hover" class="dash-panel" v-loading="loading">
          <template #header>
            <div class="panel-head panel-head--between">
              <div>
                <span class="panel-title">销售待办</span>
                <span class="panel-desc">流程各节点积压</span>
              </div>
              <el-button type="primary" plain size="small" @click="$router.push('/sales/orders')">订单管理</el-button>
            </div>
          </template>
          <el-row :gutter="12">
            <el-col
              v-for="item in salesTodoItems"
              :key="item.key"
              :xs="12"
              :sm="8"
              :md="6"
              :lg="4"
            >
              <div
                class="todo-metric-card"
                :class="{ 'is-zero': item.count === 0, [`todo-metric-card--${item.tone}`]: true }"
                role="button"
                tabindex="0"
                @click="goSalesOrders(item)"
                @keyup.enter="goSalesOrders(item)"
              >
                <div class="todo-metric-head">
                  <div class="todo-metric-icon">
                    <el-icon :size="16"><component :is="item.icon" /></el-icon>
                  </div>
                  <el-tag :type="item.statusType" size="small" effect="light" round>{{ item.statusLabel }}</el-tag>
                </div>
                <div class="todo-metric-top">
                  <span class="todo-metric-count">{{ item.count }}</span>
                  <span class="todo-metric-unit">单</span>
                </div>
                <div class="todo-metric-label">{{ item.label }}</div>
                <div class="todo-metric-hint">{{ item.hint }}</div>
                <el-progress
                  class="todo-metric-progress"
                  :percentage="item.pct"
                  :stroke-width="6"
                  :show-text="false"
                  :color="item.progressColor"
                />
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <el-row v-if="showAuditFeed" :gutter="16" class="dash-row">
      <el-col :span="24">
        <el-card shadow="hover" class="dash-panel">
          <template #header>
            <div class="panel-head">
              <span class="panel-title">动态记录</span>
              <span class="panel-desc">登录与操作 · 最近 8 条</span>
            </div>
          </template>
          <div v-loading="auditLoading">
            <el-row :gutter="16">
              <el-col v-if="isSuperAdminUser" :xs="24" :md="12">
                <el-card shadow="never" class="audit-sub-card">
                  <template #header>
                    <div class="panel-head panel-head--between">
                      <span class="audit-sub-title">登录日志</span>
                      <el-button link type="primary" size="small" @click="$router.push('/audit/login-logs')">全部</el-button>
                    </div>
                  </template>
                  <div v-if="loginItems.length === 0" class="audit-empty">暂无记录</div>
                  <div v-else class="audit-feed-list">
                    <div v-for="row in loginItems" :key="'lg-' + row.id" class="audit-feed-item">
                      <div class="audit-feed-main">
                        <span class="audit-feed-user">{{ auditUserDisplay(row) }}</span>
                        <el-tag :type="loginSuccessTag(row) ? 'success' : 'danger'" size="small" effect="light" round>
                          {{ loginSuccessTag(row) ? '成功' : '失败' }}
                        </el-tag>
                        <span class="audit-feed-time">{{ $dt(row.createdAt, { empty: '' }) }}</span>
                      </div>
                      <div class="audit-feed-sub">{{ loginSubText(row) }}</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
              <el-col :xs="24" :md="isSuperAdminUser ? 12 : 24">
                <el-card shadow="never" class="audit-sub-card">
                  <template #header>
                    <div class="panel-head panel-head--between">
                      <span class="audit-sub-title">{{ isSuperAdminUser ? '操作日志' : '我的操作' }}</span>
                      <el-button
                        link
                        type="primary"
                        size="small"
                        @click="$router.push(isSuperAdminUser ? '/audit/operations' : '/my-operation-logs')"
                      >
                        全部
                      </el-button>
                    </div>
                  </template>
                  <div v-if="operationItems.length === 0" class="audit-empty">暂无记录</div>
                  <div v-else class="audit-feed-list">
                    <div v-for="row in operationItems" :key="'op-' + row.id" class="audit-feed-item">
                      <div class="audit-feed-main">
                        <span class="audit-feed-user">{{ auditUserDisplay(row) }}</span>
                        <el-tag size="small" effect="plain" round>{{ row.module || '—' }}</el-tag>
                        <span class="audit-feed-time">{{ $dt(row.createdAt, { empty: '' }) }}</span>
                      </div>
                      <div class="audit-feed-sub">{{ row.action || '' }}</div>
                    </div>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog
      v-model="quickRoleDialog"
      title="快捷角色账号绑定"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
      @open="loadQuickRoleDialog"
    >
      <p class="quick-role-dialog-hint">
        点击「销售 / 财务 / 仓库」快捷入口时，将以此处绑定的员工账号重新登录；财务角色也用于订单审核的企业微信通知。
      </p>
      <el-form label-width="88px" @submit.prevent>
        <el-form-item label="销售角色">
          <el-select
            v-model="quickRoleForm.salesUserId"
            clearable
            filterable
            placeholder="选择员工账号"
            class="quick-role-select"
          >
            <el-option
              v-for="u in quickRoleEmployeeOptions"
              :key="'s-' + u.id"
              :label="formatQuickRoleUserOption(u)"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="财务角色">
          <el-select
            v-model="quickRoleForm.financeUserId"
            clearable
            filterable
            placeholder="选择员工账号"
            class="quick-role-select"
          >
            <el-option
              v-for="u in quickRoleEmployeeOptions"
              :key="'f-' + u.id"
              :label="formatQuickRoleUserOption(u)"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="仓库角色">
          <el-select
            v-model="quickRoleForm.warehouseUserId"
            clearable
            filterable
            placeholder="选择员工账号"
            class="quick-role-select"
          >
            <el-option
              v-for="u in quickRoleEmployeeOptions"
              :key="'w-' + u.id"
              :label="formatQuickRoleUserOption(u)"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quickRoleDialog = false">取消</el-button>
        <el-button :disabled="!quickRoleFormDirty || quickRoleSaving" @click="resetQuickRoleForm">放弃修改</el-button>
        <el-button type="primary" :loading="quickRoleSaving" :disabled="!quickRoleFormDirty" @click="saveQuickRoleForm">
          保存绑定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import * as echarts from 'echarts';
import {
  Box,
  ChatDotRound,
  DataAnalysis,
  Document,
  DocumentCopy,
  Files,
  Guide,
  Link,
  Loading,
  Medal,
  Money,
  OfficeBuilding,
  Odometer,
  Plus,
  ShoppingCart,
  Tickets,
  User,
  Warning
} from '@element-plus/icons-vue';
import {
  isSuperAdmin,
  perm,
  canAccessSalesContractWorkspace,
  canAccessInvoiceCenter,
  canManageContractInvoice
} from '../utils/permissions';
import {
  getDashboardSummary,
  getDashboardActivityHeatmap,
  getQuickRoleUsers,
  impersonateUser,
  listAuditOperations,
  listLoginLogs,
  listMyOperations,
  listUsersLite,
  updateQuickRoleUsers
} from '../api';
import ActivityHeatmap from '../components/ActivityHeatmap.vue';
import { useAuthStore } from '../stores/auth';
import { formatEmployeeCategoryLabel } from '../utils/employeeCategoryDisplay';
import { actorDisplay } from '../utils/userActorDisplay';

function safeNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSeries(values, len) {
  const src = Array.isArray(values) ? values : [];
  const out = [];
  for (let i = 0; i < len; i += 1) out.push(numOrZero(src[i]));
  return out;
}

export default {
  name: 'Dashboard',
  components: {
    ActivityHeatmap,
    Box,
    ChatDotRound,
    DataAnalysis,
    Document,
    DocumentCopy,
    Files,
    Guide,
    Link,
    Loading,
    Medal,
    Money,
    OfficeBuilding,
    Odometer,
    Plus,
    ShoppingCart,
    Tickets,
    User,
    Warning
  },
  data() {
    return {
      summary: null,
      loading: false,
      refreshing: false,
      auditLoading: false,
      loginItems: [],
      operationItems: [],
      trendChart: null,
      donutChart: null,
      salesFlowChart: null,
      chartResizeObserver: null,
      quickRoles: {
        salesUserId: null,
        financeUserId: null,
        warehouseUserId: null
      },
      quickRoleEntering: '',
      quickRoleDialog: false,
      quickRoleForm: {
        salesUserId: null,
        financeUserId: null,
        warehouseUserId: null
      },
      savedQuickRoleForm: {
        salesUserId: null,
        financeUserId: null,
        warehouseUserId: null
      },
      quickRoleEmployeeOptions: [],
      quickRoleSaving: false,
      lastUpdatedAt: 0,
      activityHeatmap: null,
      heatmapLoading: false,
      heatmapSelectedType: '',
      heatmapTypeOptions: []
    };
  },
  computed: {
    auth() {
      return useAuthStore();
    },
    isSuperAdminUser() {
      return isSuperAdmin();
    },
    employeeCategoryLabel() {
      if (this.isSuperAdminUser) return '';
      return formatEmployeeCategoryLabel({
        nameZh: this.summary?.user?.employeeCategoryName,
        code: this.summary?.user?.employeeCategoryCode || this.auth.employeeCategoryCode
      });
    },
    greetingText() {
      const name = String(this.summary?.user?.realName || this.auth.realName || '').trim();
      const user = String(this.summary?.user?.username || this.auth.username || '').trim();
      const who = name || user || '您好';
      const h = new Date().getHours();
      let period = '您好';
      if (h < 6) period = '凌晨好';
      else if (h < 12) period = '上午好';
      else if (h < 14) period = '中午好';
      else if (h < 18) period = '下午好';
      else period = '晚上好';
      return `${period}，${who}`;
    },
    welcomeSubText() {
      const caps = this.summary?.capabilities || {};
      const parts = [];
      if (caps.reports) parts.push('报告质控');
      if (caps.salesOrders || caps.salesContracts || caps.salesInvoices) parts.push('销售业务');
      if (caps.adminMetrics) parts.push('系统管理');
      if (!parts.length) return '按您的账号权限展示快捷入口与统计';
      return `当前可用：${parts.join(' · ')}`;
    },
    todayLabel() {
      const d = new Date();
      const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 周${w}`;
    },
    lastUpdatedText() {
      if (!this.lastUpdatedAt) return '--';
      const d = new Date(this.lastUpdatedAt);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    },
    showReportCharts() {
      return !!(this.summary?.capabilities?.reports && this.summary?.trends);
    },
    showSalesFlowChart() {
      return !!(this.summary?.capabilities?.salesOrders && this.summary?.sales?.flow);
    },
    hasChartRow() {
      return this.showReportCharts || this.showSalesFlowChart;
    },
    showAuditFeed() {
      return true;
    },
    statCards() {
      const s = this.summary;
      if (!s) return [];
      const cmp = s.comparisons || {};
      const cards = s.cards || {};
      const caps = s.capabilities || {};
      const out = [];

      if (caps.reports) {
        out.push({
          key: 'todayReports',
          tone: 'blue',
          icon: 'DocumentCopy',
          label: '今日报告',
          hint: 'Today reports',
          value: cards.todayReports,
          sub: '较昨日',
          trendPct: cmp.todayVsYesterdayPct,
          trendUp: Number(cmp.todayVsYesterdayPct) >= 0
        });
        out.push({
          key: 'quarterReports',
          tone: 'green',
          icon: 'Odometer',
          label: '本季度生成',
          hint: 'This quarter',
          value: cards.quarterReports,
          sub: '较上季度',
          trendPct: cmp.quarterVsPrevPct,
          trendUp: Number(cmp.quarterVsPrevPct) >= 0
        });
      }

      if (caps.salesOrders && cards.salesMonthOrders != null) {
        out.push({
          key: 'salesMonth',
          tone: 'teal',
          icon: 'ShoppingCart',
          label: '本月订单',
          hint: 'Sales orders',
          value: cards.salesMonthOrders,
          sub: '不含已取消',
          trendPct: null
        });
      }

      if (caps.salesInvoices && s.sales?.pendingInvoices != null) {
        out.push({
          key: 'pendingInvoices',
          tone: 'orange',
          icon: 'Tickets',
          label: '待处理开票',
          hint: 'Pending invoices',
          value: s.sales.pendingInvoices,
          sub: '财务待回填',
          trendPct: null
        });
      }

      if (caps.adminMetrics) {
        out.push({
          key: 'onlineUsers',
          tone: 'purple',
          icon: 'User',
          label: '在线用户',
          hint: 'Active users',
          value: cards.onlineUsers,
          sub: '近 1 小时登录',
          trendPct: null
        });
        out.push({
          key: 'security',
          tone: 'red',
          icon: 'Warning',
          label: '安全事件',
          hint: 'Incidents',
          value: cards.securityIncidents,
          sub: '近 24 小时',
          trendPct: cmp.securityDeltaPct,
          trendUp: Number(cmp.securityDeltaPct) >= 0
        });
      }

      return out;
    },
    salesTodoItems() {
      const flow = this.summary?.sales?.flow;
      if (!flow || !this.summary?.capabilities?.salesOrders) return [];
      const meta = {
        pending_submit: {
          tone: 'slate',
          color: '#64748b',
          icon: 'Document',
          statusLabel: '待处理',
          statusType: 'info',
          hint: '销售先提交，才能进入审核流'
        },
        pending_finance: {
          tone: 'blue',
          color: '#3b82f6',
          icon: 'Money',
          statusLabel: '高优先',
          statusType: 'danger',
          hint: '财务审核堆积，影响出库和开票'
        },
        pending_qc: {
          tone: 'teal',
          color: '#14b8a6',
          icon: 'Odometer',
          statusLabel: '中优先',
          statusType: 'warning',
          hint: '品管确认后可进入发货阶段'
        },
        pending_ship: {
          tone: 'orange',
          color: '#f97316',
          icon: 'ShoppingCart',
          statusLabel: '高优先',
          statusType: 'danger',
          hint: '待备货发货订单请优先排产与出库'
        },
        finance_rejected: {
          tone: 'rose',
          color: '#f43f5e',
          icon: 'CircleClose',
          statusLabel: '需处理',
          statusType: 'danger',
          hint: '财务驳回订单需销售修改后重新提交'
        },
        qc_rejected: {
          tone: 'rose',
          color: '#e11d48',
          icon: 'CircleClose',
          statusLabel: '需处理',
          statusType: 'danger',
          hint: '品管驳回订单需销售修改后重新提交'
        },
        shipped_open: {
          tone: 'green',
          color: '#22c55e',
          icon: 'Tickets',
          statusLabel: '跟进中',
          statusType: 'success',
          hint: '已发货订单关注回款与签收'
        },
        contracts: {
          tone: 'purple',
          color: '#8b5cf6',
          icon: 'Warning',
          statusLabel: '待审批',
          statusType: 'warning',
          hint: '合同待审会阻塞后续流程'
        }
      };
      const items = [
        { key: 'pending_submit', label: '待提交', query: { flow_bucket: 'pending_submit' }, count: flow.pending_submit },
        { key: 'pending_finance', label: '待财务审核', query: { flow_bucket: 'pending_finance' }, count: flow.pending_finance },
        { key: 'finance_rejected', label: '财务驳回', query: { flow_bucket: 'finance_rejected' }, count: flow.finance_rejected },
        { key: 'pending_qc', label: '待品管审核', query: { flow_bucket: 'pending_qc' }, count: flow.pending_qc },
        { key: 'qc_rejected', label: '品管驳回', query: { flow_bucket: 'qc_rejected' }, count: flow.qc_rejected },
        { key: 'pending_ship', label: '待备货发货', query: { flow_bucket: 'pending_ship' }, count: flow.pending_ship },
        { key: 'shipped_open', label: '已发货', query: { flow_bucket: 'shipped_open' }, count: flow.shipped_open }
      ];
      if (this.summary?.capabilities?.salesContracts && this.summary?.sales?.pendingContracts > 0) {
        items.push({
          key: 'contracts',
          label: '合同待审',
          path: '/sales/contracts',
          count: this.summary.sales.pendingContracts
        });
      }
      const max = Math.max(1, ...items.map((x) => numOrZero(x.count)));
      return items
        .filter((x) =>
          x.count > 0 ||
          ['pending_finance', 'finance_rejected', 'pending_qc', 'qc_rejected', 'pending_ship'].includes(x.key)
        )
        .map((x) => {
          const c = numOrZero(x.count);
          const m = meta[x.key] || meta.pending_submit;
          return {
            ...x,
            tone: m.tone,
            progressColor: m.color,
            pct: Math.round((c / max) * 100),
            icon: m.icon,
            statusLabel: m.statusLabel,
            statusType: m.statusType,
            hint: m.hint
          };
        });
    },
    quickSections() {
      const sections = [];
      const reportItems = [];
      if (perm('reports', 'create')) {
        reportItems.push({ key: 'new-report', zh: '新建报告', tone: 'green', icon: 'Plus', path: '/reports/new' });
      }
      if (perm('reports', 'list')) {
        reportItems.push({ key: 'reports', zh: '报告管理', tone: 'blue', icon: 'DocumentCopy', path: '/reports' });
      }
      if (perm('templates', 'use')) {
        reportItems.push({ key: 'templates', zh: '报告模板', tone: 'blue', icon: 'Files', path: '/report-templates' });
      }
      if (perm('qc_yearbooks', 'view') || perm('qc_yearbooks', 'upload')) {
        reportItems.push({ key: 'qc-yearbooks', zh: '品质管控数据', tone: 'teal', icon: 'DataAnalysis', path: '/qc-yearbooks' });
      }
      if (perm('qrcodes', 'list')) {
        reportItems.push({ key: 'qrcodes', zh: '二维码管理', tone: 'purple', icon: 'Link', path: '/qrcodes' });
      }
      if (perm('stamps', 'manage') || perm('stamps', 'view')) {
        reportItems.push({ key: 'stamps', zh: '公司章管理', tone: 'orange', icon: 'Medal', path: '/stamps' });
      }
      if (reportItems.length) {
        sections.push({ key: 'reports', title: '报告质控', hint: '录入与台账', items: reportItems });
      }

      const salesItems = [];
      if (perm('order_management', 'order_query') || perm('order_management', 'order_input')) {
        salesItems.push({ key: 'orders', zh: '订单管理', tone: 'indigo', icon: 'Document', path: '/sales/orders' });
      }
      if (perm('customer_management', 'view')) {
        salesItems.push({ key: 'customers', zh: '客户管理', tone: 'indigo', icon: 'User', path: '/sales/customers' });
      }
      if (canAccessSalesContractWorkspace()) {
        salesItems.push({ key: 'contracts', zh: '合同管理', tone: 'indigo', icon: 'Tickets', path: '/sales/contracts' });
      }
      if (canAccessInvoiceCenter()) {
        const pending = this.summary?.sales?.pendingInvoices;
        salesItems.push({
          key: 'invoices',
          zh: '开票中心',
          tone: 'indigo',
          icon: 'Tickets',
          path: canManageContractInvoice() ? '/sales/invoices' : '/sales/invoices?status=pending_finance',
          badge: pending > 0 ? `${pending} 待办` : ''
        });
      }
      const unread = this.summary?.sales?.unreadMessages;
      if (unread > 0) {
        salesItems.push({
          key: 'messages',
          zh: '站内信',
          tone: 'slate',
          icon: 'ChatDotRound',
          path: '/sales/messages',
          badge: `${unread} 未读`
        });
      }
      if (salesItems.length) {
        sections.push({ key: 'sales', title: '销售业务', hint: '订单 · 合同 · 开票', items: salesItems });
      }

      const sysItems = [];
      if (perm('company', 'manage') || perm('company', 'view')) {
        sysItems.push({ key: 'company', zh: '公司信息', tone: 'teal', icon: 'OfficeBuilding', path: '/company' });
      }
      if (perm('wecom', 'manage')) {
        sysItems.push({ key: 'wecom', zh: '企业微信通知', tone: 'teal', icon: 'ChatDotRound', path: '/wecom-notifications' });
      }
      sysItems.push({ key: 'guide', zh: '操作指南', tone: 'slate', icon: 'Guide', path: '/operation-guide' });
      if (sysItems.length) {
        sections.push({ key: 'system', title: '系统与帮助', items: sysItems });
      }

      if (this.isSuperAdminUser) {
        sections.push({
          key: 'impersonate',
          title: '超级管理员',
          hint: '模拟员工视角',
          items: [
            { key: 'role-sales', zh: '销售角色', tone: 'indigo', icon: 'ShoppingCart', action: 'impersonate', loadingKey: 'sales' },
            { key: 'role-finance', zh: '财务角色', tone: 'indigo', icon: 'Money', action: 'impersonate', loadingKey: 'finance' },
            { key: 'role-warehouse', zh: '仓库角色', tone: 'indigo', icon: 'Box', action: 'impersonate', loadingKey: 'warehouse' }
          ]
        });
      }

      return sections;
    },
    donutTotal() {
      const d = this.summary?.donut || {};
      return numOrZero(d.validTotal) + numOrZero(d.unknownTotal) + numOrZero(d.voidTotal);
    },
    heatmapWrongTypeHint() {
      if (!this.activityHeatmap || this.heatmapLoading) return false;
      if (this.activityHeatmap.type !== 'reports') return false;
      if (Number(this.activityHeatmap.total) > 0) return false;
      return this.heatmapTypeOptions.some((o) => o.type === 'sales_orders');
    },
    heatmapNoDataHint() {
      if (!this.activityHeatmap || this.heatmapLoading) return '';
      if (Number(this.activityHeatmap.total) > 0) return '';
      if (this.activityHeatmap.type === 'sales_orders') {
        return '当前视图未统计到订单。请确认订单未取消，且由您本人录入；财务等角色看到的是全站订单汇总。';
      }
      if (this.activityHeatmap.type === 'reports') {
        return '当前视图未统计到报告，请确认报告状态为有效且由您本人创建。';
      }
      return '';
    },
    quickRoleFormDirty() {
      return JSON.stringify(this.quickRoleForm) !== JSON.stringify(this.savedQuickRoleForm);
    }
  },
  watch: {
    isSuperAdminUser(isSa) {
      if (isSa) this.refreshQuickRoles();
    },
    showReportCharts() {
      this.$nextTick(() => this.renderAllCharts());
    },
    showSalesFlowChart() {
      this.$nextTick(() => this.renderAllCharts());
    }
  },
  async mounted() {
    this.loading = true;
    try {
      this.summary = (await getDashboardSummary()) || {};
      this.lastUpdatedAt = Date.now();
    } catch {
      this.summary = {
        capabilities: { reports: perm('reports', 'list'), audit: false },
        cards: {},
        comparisons: {},
        trends: perm('reports', 'list')
          ? { labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], pass: Array(7).fill(0), fail: Array(7).fill(0), unknown: Array(7).fill(0) }
          : null,
        donut: perm('reports', 'list')
          ? { validTotal: 0, unknownTotal: 0, voidTotal: 0 }
          : null
      };
      this.lastUpdatedAt = Date.now();
    } finally {
      this.loading = false;
      await this.$nextTick();
      this.renderAllCharts();
    }
    this.loadActivityHeatmap();
    this.loadAuditFeeds();
    if (this.isSuperAdminUser) await this.refreshQuickRoles();
  },
  beforeUnmount() {
    this.disposeCharts();
  },
  methods: {
    perm,
    auditUserDisplay(row) {
      return actorDisplay(row);
    },
    quickSectionMdSpan(index) {
      const n = this.quickSections.length;
      if (n <= 1) return 24;
      if (index === n - 1 && n % 2 === 1) return 24;
      return 12;
    },
    quickSectionLgSpan(index) {
      const n = this.quickSections.length;
      if (n <= 1) return 24;
      if (n === 2) return 12;
      if (n === 3) return 8;
      const rem = n % 3;
      const fullCount = n - rem;
      if (index < fullCount) return 8;
      if (rem === 1) return 24;
      if (rem === 2) return 12;
      return 8;
    },
    statCardMdSpan(index) {
      const n = this.statCards.length;
      if (n <= 1) return 24;
      if (index === n - 1 && n % 2 === 1) return 24;
      return 12;
    },
    statCardLgSpan(index) {
      const n = this.statCards.length;
      if (n <= 1) return 24;
      if (n === 2) return 12;
      if (n === 3) return 8;
      if (n === 4) return 6;
      const rem = n % 4;
      const fullCount = n - rem;
      if (index < fullCount) return 6;
      if (rem === 1) return 24;
      if (rem === 2) return 12;
      if (rem === 3) return 8;
      return 6;
    },
    async reloadDashboard() {
      this.refreshing = true;
      try {
        this.summary = (await getDashboardSummary()) || {};
        this.lastUpdatedAt = Date.now();
        await Promise.all([this.loadActivityHeatmap(), this.loadAuditFeeds()]);
        await this.$nextTick();
        this.renderAllCharts();
        this.$message.success('控制台数据已刷新');
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '刷新失败'));
      } finally {
        this.refreshing = false;
      }
    },
    onQuickItem(item) {
      if (item.action === 'impersonate') {
        const role = item.loadingKey;
        if (role) this.enterQuickRole(role);
        return;
      }
      if (item.path) this.$router.push(item.path);
    },
    goSalesOrders(item) {
      if (item.path) {
        this.$router.push(item.path);
        return;
      }
      this.$router.push({ path: '/sales/orders', query: { ...(item.query || {}), tab: 'list' } });
    },
    async refreshQuickRoles() {
      if (!isSuperAdmin()) return;
      try {
        const qr = await getQuickRoleUsers();
        this.quickRoles = {
          salesUserId: qr?.salesUserId ?? null,
          financeUserId: qr?.financeUserId ?? null,
          warehouseUserId: qr?.warehouseUserId ?? null
        };
        this.syncQuickRoleFormFromRoles();
      } catch {
        /* ignore */
      }
    },
    syncQuickRoleFormFromRoles() {
      this.quickRoleForm = {
        salesUserId: this.quickRoles.salesUserId,
        financeUserId: this.quickRoles.financeUserId,
        warehouseUserId: this.quickRoles.warehouseUserId
      };
      this.savedQuickRoleForm = { ...this.quickRoleForm };
    },
    formatQuickRoleUserOption(u) {
      const cat = u.categoryNameZh || u.categoryCode || '';
      return cat ? `${u.username}（${cat}）` : u.username;
    },
    openQuickRoleDialog() {
      this.quickRoleDialog = true;
    },
    async loadQuickRoleDialog() {
      if (!this.isSuperAdminUser) return;
      try {
        const usersRes = await listUsersLite({ accountType: 'employee', activeOnly: 1 });
        this.quickRoleEmployeeOptions = usersRes?.items || [];
      } catch {
        this.quickRoleEmployeeOptions = [];
      }
      await this.refreshQuickRoles();
    },
    resetQuickRoleForm() {
      this.quickRoleForm = { ...this.savedQuickRoleForm };
    },
    async saveQuickRoleForm() {
      this.quickRoleSaving = true;
      try {
        await updateQuickRoleUsers({
          salesUserId: this.quickRoleForm.salesUserId,
          financeUserId: this.quickRoleForm.financeUserId,
          warehouseUserId: this.quickRoleForm.warehouseUserId
        });
        await this.refreshQuickRoles();
        this.$message.success('快捷角色绑定已保存');
        this.quickRoleDialog = false;
      } catch (e) {
        const err = e?.response?.data?.error;
        if (err === 'INVALID_QUICK_ROLE_USER') {
          this.$message.error('所选账号须为已启用的员工');
        } else {
          this.$message.error(this.$apiUserMsg(e, '保存失败'));
        }
      } finally {
        this.quickRoleSaving = false;
      }
    },
    quickRoleMap() {
      return {
        sales: this.quickRoles.salesUserId,
        finance: this.quickRoles.financeUserId,
        warehouse: this.quickRoles.warehouseUserId
      };
    },
    async enterQuickRole(role) {
      let userId = this.quickRoleMap()[role];
      if (!userId) {
        await this.refreshQuickRoles();
        userId = this.quickRoleMap()[role];
      }
      if (!userId) {
        this.$message.warning('请先在控制台「超级管理员」区域配置对应员工账号');
        this.quickRoleDialog = true;
        return;
      }
      this.quickRoleEntering = role;
      try {
        const data = await impersonateUser(userId);
        useAuthStore().beginImpersonationFromLoginResponse(data);
        if (role === 'sales') {
          await this.$router.push('/sales/orders');
        } else if (role === 'finance') {
          await this.$router.push({ path: '/sales/orders', query: { view: 'finance' } });
        } else {
          await this.$router.push({ path: '/sales/orders', query: { view: 'warehouse' } });
        }
        this.$message.success(`已切换为「${data?.user?.username || '员工'}」身份`);
      } catch (e) {
        const err = e?.response?.data?.error;
        if (err === 'INVALID_IMPERSONATION_TARGET') {
          this.$message.error('目标账号不可用（须为已启用的员工或管理账号）');
        } else {
          this.$message.error(this.$apiUserMsg(e, '切换失败'));
        }
      } finally {
        this.quickRoleEntering = '';
      }
    },
    formatMaybeNumber(v) {
      const n = safeNumber(v);
      if (n == null) return '--';
      return n;
    },
    formatTrendPct(pct) {
      const n = Number(pct);
      if (!Number.isFinite(n)) return '0%';
      const sign = n >= 0 ? '+' : '';
      return `${sign}${n}%`;
    },
    loginSuccessTag(row) {
      return row?.success === 1 || row?.success === true;
    },
    loginSubText(row) {
      if (!row) return '';
      if (this.loginSuccessTag(row)) return row.ip ? `IP ${row.ip}` : '';
      return row.failReason || row.fail_reason || '登录失败';
    },
    readHeatmapTypePref() {
      try {
        return String(localStorage.getItem('dashboard_heatmap_type') || '').trim();
      } catch {
        return '';
      }
    },
    writeHeatmapTypePref(type) {
      try {
        if (type) localStorage.setItem('dashboard_heatmap_type', type);
      } catch {
        /* ignore */
      }
    },
    async loadActivityHeatmap(forcedType) {
      this.heatmapLoading = true;
      let type = String(forcedType || this.heatmapSelectedType || this.readHeatmapTypePref() || '').trim();
      if (!forcedType && !type && this.summary?.capabilities?.salesOrders) {
        type = 'sales_orders';
      }
      try {
        const data = await getDashboardActivityHeatmap(type ? { type } : {});
        if (!data || !Array.isArray(data.days)) {
          this.activityHeatmap = null;
          this.heatmapTypeOptions = [];
          return;
        }
        this.activityHeatmap = data;
        this.heatmapTypeOptions = Array.isArray(data.types) ? data.types : [];
        this.heatmapSelectedType = data.type || '';
        this.writeHeatmapTypePref(this.heatmapSelectedType);
      } catch {
        this.activityHeatmap = null;
        this.heatmapTypeOptions = [];
      } finally {
        this.heatmapLoading = false;
      }
    },
    onHeatmapTypeChange(type) {
      if (!type || type === this.heatmapSelectedType) return;
      this.heatmapSelectedType = type;
      this.writeHeatmapTypePref(type);
      this.loadActivityHeatmap(type);
    },
    async loadAuditFeeds() {
      this.auditLoading = true;
      try {
        if (this.isSuperAdminUser) {
          const [loginRes, opRes] = await Promise.all([
            listLoginLogs({ limit: 8, offset: 0 }),
            listAuditOperations({ limit: 8, offset: 0 })
          ]);
          this.loginItems = loginRes?.items || [];
          this.operationItems = opRes?.items || [];
        } else {
          this.loginItems = [];
          const opRes = await listMyOperations({ limit: 8, offset: 0 });
          this.operationItems = opRes?.items || [];
        }
      } catch {
        this.loginItems = [];
        this.operationItems = [];
      } finally {
        this.auditLoading = false;
        await this.$nextTick();
        this.resizeCharts();
      }
    },
    disposeCharts() {
      if (this.chartResizeObserver) {
        this.chartResizeObserver.disconnect();
        this.chartResizeObserver = null;
      }
      if (this.trendChart) {
        this.trendChart.dispose();
        this.trendChart = null;
      }
      if (this.donutChart) {
        this.donutChart.dispose();
        this.donutChart = null;
      }
      if (this.salesFlowChart) {
        this.salesFlowChart.dispose();
        this.salesFlowChart = null;
      }
    },
    resizeCharts() {
      try {
        this.trendChart?.resize();
        this.donutChart?.resize();
        this.salesFlowChart?.resize();
      } catch {
        /* no-op */
      }
    },
    bindChartResizeObserver() {
      if (typeof ResizeObserver === 'undefined') return;
      const root = this.$el;
      if (!root) return;
      if (this.chartResizeObserver) this.chartResizeObserver.disconnect();
      this.chartResizeObserver = new ResizeObserver(() => this.resizeCharts());
      this.chartResizeObserver.observe(root);
    },
    renderTrendChart() {
      const trendEl = this.$refs.trendChartRef;
      if (!trendEl || !this.summary?.trends) return;
      if (this.trendChart) {
        this.trendChart.dispose();
        this.trendChart = null;
      }
      const labels =
        Array.isArray(this.summary.trends.labels) && this.summary.trends.labels.length
          ? this.summary.trends.labels
          : ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      const xLen = labels.length;
      const passSeries = normalizeSeries(this.summary.trends.pass, xLen);
      const failSeries = normalizeSeries(this.summary.trends.fail, xLen);
      const unkSeries = normalizeSeries(this.summary.trends.unknown, xLen);
      const area = (color) => ({
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color },
          { offset: 1, color: 'rgba(255,255,255,0)' }
        ]
      });
      this.trendChart = echarts.init(trendEl);
      this.trendChart.setOption({
        color: ['#22c55e', '#ef4444', '#f59e0b'],
        tooltip: { trigger: 'axis', confine: true, backgroundColor: 'rgba(255,255,255,0.96)' },
        legend: { top: 0, right: 0, textStyle: { color: '#64748b', fontSize: 12 } },
        grid: { left: '3%', right: '3%', top: '14%', bottom: '10%', containLabel: true },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: labels,
          axisLine: { lineStyle: { color: '#e2e8f0' } },
          axisLabel: { color: '#64748b', fontSize: 11 }
        },
        yAxis: {
          type: 'value',
          min: 0,
          minInterval: 1,
          splitLine: { lineStyle: { color: 'rgba(15,23,42,0.06)', type: 'dashed' } },
          axisLabel: { color: '#64748b', fontSize: 11 }
        },
        series: [
          {
            name: '合格',
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { width: 2.5 },
            areaStyle: { color: area('rgba(34,197,94,0.35)') },
            data: passSeries
          },
          {
            name: '不合格',
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { width: 2.5 },
            areaStyle: { color: area('rgba(239,68,68,0.28)') },
            data: failSeries
          },
          {
            name: '未知',
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { width: 2.5 },
            areaStyle: { color: area('rgba(245,158,11,0.28)') },
            data: unkSeries
          }
        ]
      });
    },
    renderDonutChart() {
      const donutEl = this.$refs.donutChartRef;
      if (!donutEl || !this.summary?.donut) return;
      if (this.donutChart) {
        this.donutChart.dispose();
        this.donutChart = null;
      }
      const d = this.summary.donut || {};
      const total = this.donutTotal;
      const pieData = [
        { value: numOrZero(d.validTotal), name: '有效' },
        { value: numOrZero(d.voidTotal), name: '作废' },
        { value: numOrZero(d.unknownTotal), name: '未知' }
      ];
      this.donutChart = echarts.init(donutEl);
      this.donutChart.setOption({
        color: ['#22c55e', '#ef4444', '#94a3b8'],
        tooltip: { trigger: 'item', confine: true, formatter: '{b}<br/>{c} 份 · {d}%' },
        legend: { orient: 'vertical', right: 8, top: 'center', textStyle: { fontSize: 12 } },
        graphic:
          total > 0
            ? [
                {
                  type: 'text',
                  left: '32%',
                  top: '44%',
                  style: { text: String(total), textAlign: 'center', fill: '#0f172a', fontSize: 22, fontWeight: 700 }
                },
                { type: 'text', left: '32%', top: '56%', style: { text: '总计', textAlign: 'center', fill: '#64748b', fontSize: 12 } }
              ]
            : [],
        series: [
          {
            type: 'pie',
            radius: ['48%', '72%'],
            center: ['38%', '50%'],
            padAngle: 2,
            itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
            label: { show: false },
            emphasis: { scale: true, scaleSize: 6 },
            data: pieData
          }
        ]
      });
    },
    renderSalesFlowChart() {
      const el = this.$refs.salesFlowChartRef;
      const flow = this.summary?.sales?.flow;
      if (!el || !flow) return;
      if (this.salesFlowChart) {
        this.salesFlowChart.dispose();
        this.salesFlowChart = null;
      }
      const rows = [
        { key: 'pending_submit', name: '待提交', color: '#94a3b8' },
        { key: 'pending_finance', name: '待财务审核', color: '#3b82f6' },
        { key: 'finance_rejected', name: '财务驳回', color: '#f43f5e' },
        { key: 'pending_qc', name: '待品管审核', color: '#14b8a6' },
        { key: 'qc_rejected', name: '品管驳回', color: '#e11d48' },
        { key: 'pending_ship', name: '待备货发货', color: '#f97316' },
        { key: 'shipped_open', name: '已发货', color: '#22c55e' }
      ];
      const names = rows.map((r) => r.name);
      const values = rows.map((r) => numOrZero(flow[r.key]));
      const colors = rows.map((r) => r.color);
      this.salesFlowChart = echarts.init(el);
      this.salesFlowChart.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true },
        grid: { left: '3%', right: '6%', top: '8%', bottom: '6%', containLabel: true },
        xAxis: {
          type: 'value',
          min: 0,
          minInterval: 1,
          splitLine: { lineStyle: { type: 'dashed', color: 'rgba(15,23,42,0.06)' } },
          axisLabel: { color: '#64748b' }
        },
        yAxis: {
          type: 'category',
          data: names,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#334155', fontSize: 12 }
        },
        series: [
          {
            type: 'bar',
            data: values.map((v, i) => ({
              value: v,
              itemStyle: {
                color: colors[i],
                borderRadius: [0, 8, 8, 0]
              }
            })),
            barWidth: 18,
            label: { show: true, position: 'right', color: '#475569', fontWeight: 600 }
          }
        ]
      });
      this.salesFlowChart.off('click');
      this.salesFlowChart.on('click', (params) => {
        const row = rows[params.dataIndex];
        if (row) this.goSalesOrders({ query: { flow_bucket: row.key } });
      });
    },
    renderAllCharts() {
      this.disposeCharts();
      this.$nextTick(() => {
        if (this.showReportCharts) {
          this.renderTrendChart();
          this.renderDonutChart();
        }
        if (this.showSalesFlowChart) this.renderSalesFlowChart();
        this.bindChartResizeObserver();
        requestAnimationFrame(() => this.resizeCharts());
      });
    }
  }
};
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1480px;
  margin: 0 auto;
}

.dash-updated {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}

.dash-panel {
  border-radius: 12px;
  border: 1px solid rgba(30, 58, 95, 0.08);
  overflow: hidden;
}

.dash-panel :deep(.el-card__header) {
  padding: 14px 18px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
}

.dash-panel :deep(.el-card__body) {
  padding: 18px 18px;
}

.dash-row {
  margin-bottom: 0;
}

.dash-row :deep(.el-col) {
  display: flex;
  margin-bottom: 16px;
}

.dash-row :deep(.el-col) > .el-card,
.dash-row :deep(.el-col) > .dash-panel {
  width: 100%;
  height: 100%;
}

.dash-panel {
  display: flex;
  flex-direction: column;
}

.dash-panel :deep(.el-card__body) {
  flex: 1;
}

.panel-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
}

.panel-head--between {
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-size: 15px;
  font-weight: 800;
  color: #1e3a5f;
}

.panel-desc {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.heatmap-panel-head {
  flex-wrap: wrap;
  gap: 10px;
}

.heatmap-type-switch {
  flex-shrink: 0;
}

.heatmap-hint {
  margin-bottom: 12px;
}

/* 顶部问候 + 工具栏（合并） */
.dash-hero-card :deep(.el-card__body) {
  padding: 18px 20px;
  background: linear-gradient(120deg, rgba(59, 130, 246, 0.1) 0%, rgba(255, 255, 255, 1) 52%);
}

.dash-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.dash-hero-main {
  flex: 1;
  min-width: 0;
}

.dash-hero-greeting {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
}

.dash-hero-sub {
  margin-top: 6px;
  font-size: 13px;
  color: #475569;
  line-height: 1.45;
}

.dash-hero-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.dash-hero-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.dash-hero-date {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}

.dash-hero-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

/* KPI 统计卡片 */
.stat-card {
  position: relative;
  overflow: hidden;
}

.stat-card :deep(.el-card__body) {
  padding: 0;
}

.stat-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}

.stat-card--blue .stat-accent { background: #3b82f6; }
.stat-card--green .stat-accent { background: #22c55e; }
.stat-card--purple .stat-accent { background: #8b5cf6; }
.stat-card--red .stat-accent { background: #ef4444; }
.stat-card--teal .stat-accent { background: #14b8a6; }
.stat-card--orange .stat-accent { background: #f97316; }

.stat-body {
  padding: 16px 16px 16px 20px;
}

.stat-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stat-icon-badge {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.05);
  color: #334155;
}

.stat-card--blue .stat-icon-badge { background: rgba(59, 130, 246, 0.12); color: #2563eb; }
.stat-card--green .stat-icon-badge { background: rgba(34, 197, 94, 0.12); color: #16a34a; }
.stat-card--purple .stat-icon-badge { background: rgba(139, 92, 246, 0.12); color: #7c3aed; }
.stat-card--red .stat-icon-badge { background: rgba(239, 68, 68, 0.12); color: #dc2626; }
.stat-card--teal .stat-icon-badge { background: rgba(20, 184, 166, 0.12); color: #0d9488; }
.stat-card--orange .stat-icon-badge { background: rgba(249, 115, 22, 0.12); color: #ea580c; }

.stat-top-text {
  flex: 1;
  min-width: 0;
}

.stat-label {
  font-size: 14px;
  font-weight: 700;
  color: #1e3a5f;
}

.stat-hint {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.stat-trend {
  font-size: 12px;
  font-weight: 800;
  padding: 4px 8px;
  border-radius: 6px;
}

.stat-trend--up {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.stat-trend--down {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.stat-value {
  margin-top: 10px;
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.1;
}

/* 图表区 */
.chart-panel :deep(.el-card__body) {
  padding: 14px 16px 16px;
}

.chart-box {
  width: 100%;
}

.echart-block {
  width: 100%;
}

.echart-block--lg {
  height: 300px;
}

.echart-block--donut {
  height: 280px;
}

.echart-block--md {
  height: 260px;
}

.echart-block--sm {
  height: 220px;
}

/* 销售待办卡片 */
.todo-metric-card {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  padding: 12px;
  background: #fff;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s;
  margin-bottom: 4px;
}

.todo-metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(30, 58, 95, 0.1);
  border-color: rgba(59, 130, 246, 0.25);
}

.todo-metric-card:focus-visible,
.quick-link-card:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.55);
  outline-offset: 2px;
}

.todo-metric-card.is-zero {
  opacity: 0.5;
}

.todo-metric-top {
  display: flex;
  align-items: baseline;
  margin-top: 6px;
}

.todo-metric-count {
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1;
}

.todo-metric-unit {
  margin-left: 4px;
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}

.todo-metric-label {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.todo-metric-hint {
  margin-top: 6px;
  min-height: 34px;
  font-size: 11px;
  line-height: 1.45;
  color: #64748b;
}

.todo-metric-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.todo-metric-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.06);
  color: #334155;
}

.todo-metric-card--slate .todo-metric-icon { background: rgba(100, 116, 139, 0.16); color: #475569; }
.todo-metric-card--blue .todo-metric-icon { background: rgba(59, 130, 246, 0.16); color: #2563eb; }
.todo-metric-card--teal .todo-metric-icon { background: rgba(20, 184, 166, 0.16); color: #0f766e; }
.todo-metric-card--orange .todo-metric-icon { background: rgba(249, 115, 22, 0.16); color: #c2410c; }
.todo-metric-card--green .todo-metric-icon { background: rgba(34, 197, 94, 0.16); color: #15803d; }
.todo-metric-card--purple .todo-metric-icon { background: rgba(139, 92, 246, 0.16); color: #6d28d9; }

.todo-metric-progress {
  margin-top: 8px;
}

/* 快捷入口卡片 */
.quick-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.quick-link-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #f8fafc;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
  position: relative;
}

.quick-link-card:hover {
  background: #fff;
  border-color: rgba(59, 130, 246, 0.35);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(30, 58, 95, 0.08);
}

.quick-link-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}

.quick-link-card--green .quick-link-icon { background: linear-gradient(135deg, #22c55e, #16a34a); }
.quick-link-card--blue .quick-link-icon { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.quick-link-card--purple .quick-link-icon { background: linear-gradient(135deg, #a78bfa, #7c3aed); }
.quick-link-card--orange .quick-link-icon { background: linear-gradient(135deg, #fb923c, #f97316); }
.quick-link-card--teal .quick-link-icon { background: linear-gradient(135deg, #14b8a6, #0ea5e9); }
.quick-link-card--slate .quick-link-icon { background: linear-gradient(135deg, #475569, #334155); }
.quick-link-card--indigo .quick-link-icon { background: linear-gradient(135deg, #6366f1, #4338ca); }

.quick-link-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.quick-link-zh {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}

.quick-link-loading {
  position: absolute;
  right: 10px;
  top: 50%;
  margin-top: -8px;
}

/* 动态记录 */
.audit-sub-card {
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid rgba(15, 23, 42, 0.06);
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.audit-sub-card :deep(.el-card__header) {
  padding: 12px 16px;
}

.audit-sub-card :deep(.el-card__body) {
  padding: 14px 16px 16px;
  max-height: 320px;
  overflow-y: auto;
  flex: 1;
}

.audit-sub-title {
  font-size: 13px;
  font-weight: 800;
  color: #334155;
}

.audit-feed-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.audit-feed-item {
  padding: 12px 14px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.audit-feed-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.audit-feed-user {
  font-weight: 700;
  font-size: 13px;
  color: #0f172a;
}

.audit-feed-time {
  margin-left: auto;
  font-size: 11px;
  color: #94a3b8;
}

.audit-feed-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.audit-empty {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
}

@media (max-width: 992px) {
  .dash-hero {
    flex-direction: column;
  }
  .dash-hero-side {
    width: 100%;
    align-items: flex-start;
  }
  .dash-hero-meta {
    justify-content: flex-start;
  }
  .dash-hero-actions {
    width: 100%;
    justify-content: space-between;
  }
  .echart-block--lg,
  .echart-block--donut,
  .echart-block--md {
    height: 260px;
  }
  .stat-value {
    font-size: 24px;
  }
}

.quick-role-dialog-hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.55;
}

.quick-role-select {
  width: 100%;
}
</style>
