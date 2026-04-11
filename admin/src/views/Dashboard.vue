<template>
  <div class="dashboard">
    <div class="quick-top">
      <div class="quick-top-title">快捷入口</div>
      <div class="quick-top-grid">
        <div class="quick-item" v-if="perm('reports', 'create')">
          <el-button class="quick-btn quick-btn--green" @click="$router.push('/reports/new')">
            <el-icon><Plus /></el-icon>
            <span class="quick-btn-texts">
              <span class="quick-btn-zh">新建报告</span>
              <span class="quick-btn-en">New Report</span>
            </span>
          </el-button>
        </div>

        <div class="quick-item" v-if="perm('reports', 'list')">
          <el-button class="quick-btn quick-btn--blue" @click="$router.push('/reports')">
            <el-icon><DocumentCopy /></el-icon>
            <span class="quick-btn-texts">
              <span class="quick-btn-zh">报告管理</span>
              <span class="quick-btn-en">Reports</span>
            </span>
          </el-button>
        </div>

        <div class="quick-item" v-if="perm('qrcodes', 'list')">
          <el-button class="quick-btn quick-btn--purple" @click="$router.push('/qrcodes')">
            <el-icon><Link /></el-icon>
            <span class="quick-btn-texts">
              <span class="quick-btn-zh">二维码管理</span>
              <span class="quick-btn-en">QRCodes</span>
            </span>
          </el-button>
        </div>

        <div class="quick-item" v-if="perm('stamps', 'manage')">
          <el-button class="quick-btn quick-btn--orange" @click="$router.push('/stamps')">
            <el-icon><Medal /></el-icon>
            <span class="quick-btn-texts">
              <span class="quick-btn-zh">公司章管理</span>
              <span class="quick-btn-en">Company Stamps</span>
            </span>
          </el-button>
        </div>

        <div class="quick-item" v-if="perm('company', 'manage')">
          <el-button class="quick-btn quick-btn--teal" @click="$router.push('/company')">
            <el-icon><OfficeBuilding /></el-icon>
            <span class="quick-btn-texts">
              <span class="quick-btn-zh">公司信息</span>
              <span class="quick-btn-en">Company Profile</span>
            </span>
          </el-button>
        </div>

        <div class="quick-item">
          <el-button class="quick-btn quick-btn--slate" @click="$router.push('/operation-guide')">
            <el-icon><Guide /></el-icon>
            <span class="quick-btn-texts">
              <span class="quick-btn-zh">操作指南</span>
              <span class="quick-btn-en">User Guide</span>
            </span>
          </el-button>
        </div>

        <div class="quick-item" v-if="isSuperAdminUser">
          <el-button
            class="quick-btn quick-btn--indigo"
            :loading="quickRoleEntering === 'sales'"
            @click="enterQuickRole('sales')"
          >
            <el-icon><ShoppingCart /></el-icon>
            <span class="quick-btn-texts">
              <span class="quick-btn-zh">销售角色</span>
              <span class="quick-btn-en">Sales Role</span>
            </span>
          </el-button>
        </div>

        <div class="quick-item" v-if="isSuperAdminUser">
          <el-button
            class="quick-btn quick-btn--indigo"
            :loading="quickRoleEntering === 'finance'"
            @click="enterQuickRole('finance')"
          >
            <el-icon><Money /></el-icon>
            <span class="quick-btn-texts">
              <span class="quick-btn-zh">财务角色</span>
              <span class="quick-btn-en">Finance Role</span>
            </span>
          </el-button>
        </div>

        <div class="quick-item" v-if="isSuperAdminUser">
          <el-button
            class="quick-btn quick-btn--indigo"
            :loading="quickRoleEntering === 'warehouse'"
            @click="enterQuickRole('warehouse')"
          >
            <el-icon><Box /></el-icon>
            <span class="quick-btn-texts">
              <span class="quick-btn-zh">仓库角色</span>
              <span class="quick-btn-en">Warehouse Role</span>
            </span>
          </el-button>
        </div>
      </div>
    </div>

    <el-row :gutter="16" class="top-row">
      <el-col :span="6">
        <el-card shadow="never" class="stat-card stat-card--blue">
          <div class="stat-top">
            <div class="stat-icon-badge">
              <el-icon :size="18" class="stat-icon">
                <DocumentCopy />
              </el-icon>
            </div>
            <div class="stat-top-text">
              <div class="stat-label">今日报告</div>
              <div class="stat-hint">Today reports</div>
            </div>
            <div
              class="stat-trend"
              :class="todayTrendUp ? 'stat-trend--up' : 'stat-trend--down'"
              :title="formatTrendPct(todayTrendPct)"
            >
              <span class="trend-arrow" aria-hidden="true">
                <svg v-if="todayTrendUp" viewBox="0 0 16 16" class="trend-arrow-svg">
                  <polyline points="4,10 8,6 12,10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <polyline points="8,6 8,14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
                <svg v-else viewBox="0 0 16 16" class="trend-arrow-svg">
                  <polyline points="4,6 8,10 12,6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <polyline points="8,10 8,2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </span>
              <span class="trend-text">{{ formatTrendPct(todayTrendPct) }}</span>
            </div>
          </div>
          <div class="stat-value">{{ formatMaybeNumber(summary?.cards?.todayReports) }}</div>
          <div class="stat-sub">较昨日</div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card shadow="never" class="stat-card stat-card--green">
          <div class="stat-top">
            <div class="stat-icon-badge">
              <el-icon :size="18" class="stat-icon">
                <Odometer />
              </el-icon>
            </div>
            <div class="stat-top-text">
              <div class="stat-label">本季度生成</div>
              <div class="stat-hint">This quarter output</div>
            </div>
            <div
              class="stat-trend"
              :class="quarterTrendUp ? 'stat-trend--up' : 'stat-trend--down'"
              :title="formatTrendPct(quarterTrendPct)"
            >
              <span class="trend-arrow" aria-hidden="true">
                <svg v-if="quarterTrendUp" viewBox="0 0 16 16" class="trend-arrow-svg">
                  <polyline points="4,10 8,6 12,10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <polyline points="8,6 8,14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
                <svg v-else viewBox="0 0 16 16" class="trend-arrow-svg">
                  <polyline points="4,6 8,10 12,6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <polyline points="8,10 8,2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </span>
              <span class="trend-text">{{ formatTrendPct(quarterTrendPct) }}</span>
            </div>
          </div>
          <div class="stat-value">{{ formatMaybeNumber(summary?.cards?.quarterReports) }}</div>
          <div class="stat-sub">较上季度</div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card shadow="never" class="stat-card stat-card--purple">
          <div class="stat-top">
            <div class="stat-icon-badge">
              <el-icon :size="18" class="stat-icon">
                <User />
              </el-icon>
            </div>
            <div class="stat-top-text">
              <div class="stat-label">在线用户</div>
              <div class="stat-hint">Active users</div>
            </div>
            <div
              class="stat-trend"
              :class="onlineTrendUp ? 'stat-trend--up' : 'stat-trend--down'"
              :title="formatTrendPct(onlineTrendPct)"
            >
              <span class="trend-arrow" aria-hidden="true">
                <svg v-if="onlineTrendUp" viewBox="0 0 16 16" class="trend-arrow-svg">
                  <polyline points="4,10 8,6 12,10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <polyline points="8,6 8,14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
                <svg v-else viewBox="0 0 16 16" class="trend-arrow-svg">
                  <polyline points="4,6 8,10 12,6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <polyline points="8,10 8,2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </span>
              <span class="trend-text">{{ formatTrendPct(onlineTrendPct) }}</span>
            </div>
          </div>
          <div class="stat-value">{{ formatMaybeNumber(summary?.cards?.onlineUsers) }}</div>
          <div class="stat-sub">近1小时</div>
        </el-card>
      </el-col>

      <el-col :span="6">
        <el-card shadow="never" class="stat-card stat-card--red">
          <div class="stat-top">
            <div class="stat-icon-badge">
              <el-icon :size="18" class="stat-icon">
                <Warning />
              </el-icon>
            </div>
            <div class="stat-top-text">
              <div class="stat-label">安全事件</div>
              <div class="stat-hint">Incidents</div>
            </div>
            <div
              class="stat-trend"
              :class="securityTrendUp ? 'stat-trend--up' : 'stat-trend--down'"
              :title="formatTrendPct(securityTrendPct)"
            >
              <span class="trend-arrow" aria-hidden="true">
                <svg v-if="securityTrendUp" viewBox="0 0 16 16" class="trend-arrow-svg">
                  <polyline points="4,10 8,6 12,10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <polyline points="8,6 8,14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
                <svg v-else viewBox="0 0 16 16" class="trend-arrow-svg">
                  <polyline points="4,6 8,10 12,6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  <polyline points="8,10 8,2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </span>
              <span class="trend-text">{{ formatTrendPct(securityTrendPct) }}</span>
            </div>
          </div>
          <div class="stat-value">{{ formatMaybeNumber(summary?.cards?.securityIncidents) }}</div>
          <div class="stat-sub">近24小时</div>
        </el-card>
      </el-col>
    </el-row>

    <div class="dashboard-mid">
      <el-row :gutter="16" class="mid-row">
        <el-col :span="16" class="mid-col">
          <el-card shadow="never" class="chart-card">
            <template #header>
              <span>报告趋势分析</span>
            </template>
            <div v-loading="loading" class="chart-body chart-fill">
              <div ref="trendChartRef" class="echart-trend" />
            </div>
          </el-card>
        </el-col>

        <el-col :span="8" class="mid-col">
          <el-card shadow="never" class="chart-card">
            <template #header>
              <span>报告状态分布</span>
            </template>
            <div v-loading="loading" class="donut-body chart-fill">
              <div class="donut-wrap">
                <div ref="donutChartRef" class="echart-donut" />
              </div>

              <div class="donut-legend">
                <div class="legend-row">
                  <span class="legend-dot" style="background:#22c55e" />
                  <span class="legend-name">有效</span>
                  <span class="legend-val">{{ formatMaybeNumber(summary?.donut?.validTotal) }}</span>
                </div>
                <div class="legend-row">
                  <span class="legend-dot" style="background:#ef4444" />
                  <span class="legend-name">作废</span>
                  <span class="legend-val">{{ formatMaybeNumber(summary?.donut?.voidTotal) }}</span>
                </div>
                <div class="legend-row">
                  <span class="legend-dot" style="background:#94a3b8" />
                  <span class="legend-name">未知</span>
                  <span class="legend-val">{{ formatMaybeNumber(summary?.donut?.unknownTotal) }}</span>
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-row :gutter="16" class="bottom-row">
      <el-col :span="24">
        <el-card shadow="never" class="bottom-card audit-feed-card">
          <template #header>
            <div class="audit-card-head">
              <span>登录与操作</span>
              <span class="audit-card-sub">最近记录 · 左右分栏</span>
            </div>
          </template>
          <div v-loading="auditLoading" class="audit-panels">
            <div class="audit-panel audit-panel--login">
              <div class="audit-panel-toolbar">
                <span class="audit-panel-title">登录日志</span>
                <el-button v-if="isSuperAdminUser" link type="primary" size="small" @click="$router.push('/audit/login-logs')">
                  查看全部
                </el-button>
              </div>
              <ul class="audit-list">
                <li v-if="!isSuperAdminUser" class="audit-empty">全员登录日志仅超级管理员可查看</li>
                <li v-else-if="loginItems.length === 0" class="audit-empty">暂无记录</li>
                <template v-else>
                  <li v-for="row in loginItems" :key="'lg-' + row.id" class="audit-li">
                    <div class="audit-li-main">
                      <span class="audit-li-user">{{ row.username || '—' }}</span>
                      <el-tag :type="loginSuccessTag(row) ? 'success' : 'danger'" size="small" effect="plain" class="audit-li-tag">
                        {{ loginSuccessTag(row) ? '成功' : '失败' }}
                      </el-tag>
                      <span class="audit-li-time">{{ $dt(row.createdAt, { empty: '' }) }}</span>
                    </div>
                    <div class="audit-li-sub">{{ loginSubText(row) }}</div>
                  </li>
                </template>
              </ul>
            </div>

            <div class="audit-panel audit-panel--ops">
              <div class="audit-panel-toolbar">
                <span class="audit-panel-title">操作日志</span>
                <el-button v-if="isSuperAdminUser" link type="primary" size="small" @click="$router.push('/audit/operations')">
                  查看全部
                </el-button>
                <el-button v-else link type="primary" size="small" @click="$router.push('/my-operation-logs')">我的记录</el-button>
              </div>
              <ul class="audit-list">
                <li v-if="operationItems.length === 0" class="audit-empty">暂无记录</li>
                <template v-else>
                  <li v-for="row in operationItems" :key="'op-' + row.id" class="audit-li">
                    <div class="audit-li-main">
                      <span class="audit-li-user">{{ row.username || '—' }}</span>
                      <span class="audit-li-module">{{ row.module || '—' }}</span>
                      <span class="audit-li-time">{{ $dt(row.createdAt, { empty: '' }) }}</span>
                    </div>
                    <div class="audit-li-sub">{{ row.action || '' }}</div>
                  </li>
                </template>
              </ul>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import * as echarts from 'echarts';
import { isSuperAdmin, perm } from '../utils/permissions';
import { getDashboardSummary, getQuickRoleUsers, impersonateUser, listAuditOperations, listLoginLogs, listMyOperations } from '../api';
import { useAuthStore } from '../stores/auth';

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
  data() {
    return {
      summary: null,
      loading: false,
      auditLoading: false,
      loginItems: [],
      operationItems: [],
      trendChart: null,
      donutChart: null,
      trendResizeObserver: null,
      donutResizeObserver: null,
      quickRoles: {
        salesUserId: null,
        financeUserId: null,
        warehouseUserId: null
      },
      quickRoleEntering: ''
    };
  },
  computed: {
    isSuperAdminUser() {
      return isSuperAdmin();
    },
    donutTotal() {
      const d = this.summary?.donut || {};
      return numOrZero(d.validTotal) + numOrZero(d.unknownTotal) + numOrZero(d.voidTotal);
    },
    todayTrendPct() {
      return Number(this.summary?._ui?.todayVsYesterdayPct ?? 0) || 0;
    },
    quarterTrendPct() {
      return Number(this.summary?._ui?.quarterVsPrevPct ?? 0) || 0;
    },
    onlineTrendPct() {
      return Number(this.summary?._ui?.onlineDeltaPct ?? 0) || 0;
    },
    securityTrendPct() {
      return Number(this.summary?._ui?.securityDeltaPct ?? 0) || 0;
    },
    todayTrendUp() {
      return this.todayTrendPct >= 0;
    },
    quarterTrendUp() {
      return this.quarterTrendPct >= 0;
    },
    onlineTrendUp() {
      return this.onlineTrendPct >= 0;
    },
    securityTrendUp() {
      return this.securityTrendPct >= 0;
    }
  },
  watch: {
    /** 在首页从「模拟员工」恢复超管时路由可能仍为 /dashboard，不会 remount；须重新拉取快捷角色绑定 */
    isSuperAdminUser(isSa) {
      if (isSa) this.refreshQuickRoles();
    }
  },
  async mounted() {
    this.loading = true;
    try {
      const d = await getDashboardSummary();
      // UI-only placeholders: delta percentages are not returned by backend yet.
      this.summary = {
        ...(d || {}),
        _ui: {
          todayVsYesterdayPct: 12,
          quarterVsPrevPct: 8,
          onlineDeltaPct: -3,
          securityDeltaPct: -50
        }
      };
    } catch (e) {
      // Fallback to empty UI (still renders layout)
      this.summary = {
        cards: {},
        trends: { labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], pass: Array(7).fill(0), fail: Array(7).fill(0), unknown: Array(7).fill(0) },
        donut: { validTotal: 0, unknownTotal: 0, voidTotal: 0, passActive: 0, unknownActive: 0, failActive: 0 },
        _ui: { todayVsYesterdayPct: 0, quarterVsPrevPct: 0, onlineDeltaPct: 0, securityDeltaPct: 0 }
      };
    } finally {
      this.loading = false;
      await this.$nextTick();
      this.renderCharts();
    }
    this.loadAuditFeeds();
    if (this.isSuperAdminUser) await this.refreshQuickRoles();
  },
  beforeUnmount() {
    this.disposeCharts();
  },
  methods: {
    perm,
    isSuperAdmin,
    async refreshQuickRoles() {
      if (!isSuperAdmin()) return;
      try {
        const qr = await getQuickRoleUsers();
        this.quickRoles = {
          salesUserId: qr?.salesUserId ?? null,
          financeUserId: qr?.financeUserId ?? null,
          warehouseUserId: qr?.warehouseUserId ?? null
        };
      } catch {
        /* ignore */
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
        this.$message.warning('请先在「公司信息」页面底部绑定对应员工账号并保存');
        this.$router.push('/company');
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
      } catch (_) {
        this.loginItems = [];
        this.operationItems = [];
      } finally {
        this.auditLoading = false;
        await this.$nextTick();
        // Avoid forcing line-chart resize here: certain ECharts builds can throw in LineView.render on resize.
        try {
          this.donutChart?.resize();
        } catch (_) {
          // no-op
        }
      }
    },

    disposeCharts() {
      if (this.trendResizeObserver) {
        this.trendResizeObserver.disconnect();
        this.trendResizeObserver = null;
      }
      if (this.donutResizeObserver) {
        this.donutResizeObserver.disconnect();
        this.donutResizeObserver = null;
      }
      if (this.trendChart) {
        this.trendChart.dispose();
        this.trendChart = null;
      }
      if (this.donutChart) {
        this.donutChart.dispose();
        this.donutChart = null;
      }
    },

    renderCharts() {
      this.disposeCharts();
      if (!this.summary) return;

      const trendEl = this.$refs.trendChartRef;
      const donutEl = this.$refs.donutChartRef;
      if (!trendEl || !donutEl) return;

      const labels = Array.isArray(this.summary.trends?.labels) && this.summary.trends.labels.length
        ? this.summary.trends.labels
        : ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      const xLen = labels.length;
      const passSeries = normalizeSeries(this.summary.trends?.pass, xLen);
      const failSeries = normalizeSeries(this.summary.trends?.fail, xLen);
      const unkSeries = normalizeSeries(this.summary.trends?.unknown, xLen);

      const trendSeries = [
        {
          name: '合格（Pass）',
          type: 'line',
          smooth: 0.35,
          symbol: 'circle',
          symbolSize: 8,
          showSymbol: true,
          lineStyle: { width: 2.5 },
          data: passSeries
        },
        {
          name: '不合格（Fail）',
          type: 'line',
          smooth: 0.35,
          symbol: 'circle',
          symbolSize: 8,
          showSymbol: true,
          lineStyle: { width: 2.5 },
          data: failSeries
        },
        {
          name: '未知（Unknown）',
          type: 'line',
          smooth: 0.35,
          symbol: 'circle',
          symbolSize: 8,
          showSymbol: true,
          lineStyle: { width: 2.5 },
          data: unkSeries
        }
      ];

      this.trendChart = echarts.init(trendEl);
      this.trendChart.setOption({
        color: ['#22c55e', '#ef4444', '#f59e0b'],
        tooltip: {
          trigger: 'axis',
          confine: true,
          axisPointer: {
            type: 'cross',
            crossStyle: { color: 'rgba(100,116,139,0.35)' },
            label: { backgroundColor: '#64748b' }
          }
        },
        legend: {
          bottom: 0,
          itemGap: 20,
          textStyle: { color: '#64748b', fontSize: 12 },
          selectedMode: false,
          data: trendSeries.map((s) => s.name)
        },
        grid: { left: '2%', right: '2%', top: '8%', bottom: '18%', containLabel: true },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: labels,
          axisLine: { lineStyle: { color: '#e2e8f0' } },
          axisLabel: { color: '#64748b', fontSize: 11 },
          axisPointer: { show: true, type: 'line', lineStyle: { color: 'rgba(59,130,246,0.35)', width: 1 } }
        },
        yAxis: {
          type: 'value',
          min: 0,
          minInterval: 1,
          splitLine: { lineStyle: { color: 'rgba(15,23,42,0.06)' } },
          axisLabel: { color: '#64748b', fontSize: 11 }
        },
        series: trendSeries
      });
      // Keep trend rendering stable: avoid immediate forced resize.

      const d = this.summary.donut || {};
      const total = this.donutTotal;
      const pieData = [
        { value: numOrZero(d.validTotal), name: '有效', itemStyle: { color: '#22c55e' } },
        { value: numOrZero(d.voidTotal), name: '作废', itemStyle: { color: '#ef4444' } },
        { value: numOrZero(d.unknownTotal), name: '未知', itemStyle: { color: '#94a3b8' } }
      ];

      this.donutChart = echarts.init(donutEl);
      this.donutChart.setOption({
        tooltip: {
          trigger: 'item',
          confine: true,
          formatter: '{b}<br/>数量：{c}（{d}%）'
        },
        graphic:
          total > 0
            ? [
                {
                  type: 'text',
                  left: 'center',
                  top: '42%',
                  style: { text: String(total), textAlign: 'center', fill: 'rgba(15,23,42,0.92)', fontSize: 20, fontWeight: 700 }
                },
                {
                  type: 'text',
                  left: 'center',
                  top: '56%',
                  style: { text: '总计', textAlign: 'center', fill: '#64748b', fontSize: 12 }
                }
              ]
            : [
                {
                  type: 'text',
                  left: 'center',
                  top: 'center',
                  style: { text: '暂无数据', textAlign: 'center', fill: '#94a3b8', fontSize: 13 }
                }
              ],
        series: [
          {
            type: 'pie',
            radius: ['44%', '70%'],
            center: ['50%', '50%'],
            avoidLabelOverlap: true,
            hoverAnimation: true,
            itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
            emphasis: {
              scale: true,
              scaleSize: 10,
              itemStyle: {
                shadowBlur: 14,
                shadowOffsetX: 0,
                shadowColor: 'rgba(15,23,42,0.18)'
              },
              label: { show: true, fontWeight: 600, color: '#334155' }
            },
            label: { show: false },
            labelLine: { show: false },
            data: pieData
          }
        ]
      });
      requestAnimationFrame(() => this.donutChart?.resize());
      setTimeout(() => this.donutChart?.resize(), 60);

      if (typeof ResizeObserver !== 'undefined') {
        this.donutResizeObserver = new ResizeObserver(() => {
          this.donutChart?.resize();
        });
        this.donutResizeObserver.observe(donutEl);
      }
    }
  }
};
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: visible;
  min-height: min-content;
}

.quick-top {
  flex: 0 0 auto;
  border: 1px solid rgba(30, 58, 95, 0.12);
  background: rgba(255, 255, 255, 0.72);
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(30, 58, 95, 0.08);
  padding: 10px 12px 12px;
}

.quick-top-title {
  font-weight: 800;
  color: #1e3a5f;
  margin-bottom: 8px;
}

.quick-top-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.quick-item {
  width: 100%;
}

.quick-btn {
  width: 100%;
  height: 64px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 10px 26px rgba(30, 58, 95, 0.15);
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 0 16px;
  color: rgba(255, 255, 255, 0.95);
  font-weight: 800;
}

.quick-btn :deep(.el-icon) {
  font-size: 20px;
}

.quick-btn-texts {
  display: inline-flex;
  flex-direction: column;
  line-height: 1.05;
}

.quick-btn-zh {
  font-size: 15px;
  letter-spacing: 0.2px;
}

.quick-btn-en {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.78);
}

.quick-btn--green {
  background: linear-gradient(135deg, #22c55e, #16a34a);
}
.quick-btn--blue {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}
.quick-btn--purple {
  background: linear-gradient(135deg, #a78bfa, #7c3aed);
}
.quick-btn--orange {
  background: linear-gradient(135deg, #fb923c, #f97316);
}
.quick-btn--teal {
  background: linear-gradient(135deg, #14b8a6, #0ea5e9);
}
.quick-btn--slate {
  background: linear-gradient(135deg, #334155, #0f172a);
}
.quick-btn--indigo {
  background: linear-gradient(135deg, #6366f1, #4338ca);
}

.quick-btn:hover {
  filter: brightness(1.03);
  transform: translateY(-1px);
}

.top-row {
  margin-bottom: 0;
}

.stat-card {
  height: 104px;
  border: 1px solid rgba(30, 58, 95, 0.1);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 4px 20px rgba(30, 58, 95, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.stat-card :deep(.el-card__body) {
  padding: 14px 14px 12px;
  overflow: hidden; /* 禁止卡片内部出现滚动条 */
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.stat-card--blue {
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.06), rgba(255, 255, 255, 0.92));
}
.stat-card--green {
  background: linear-gradient(180deg, rgba(34, 197, 94, 0.06), rgba(255, 255, 255, 0.92));
}
.stat-card--purple {
  background: linear-gradient(180deg, rgba(167, 139, 250, 0.08), rgba(255, 255, 255, 0.92));
}
.stat-card--red {
  background: linear-gradient(180deg, rgba(239, 68, 68, 0.06), rgba(255, 255, 255, 0.92));
}

.stat-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stat-icon-badge {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid rgba(15, 23, 42, 0.06);
  flex: 0 0 auto;
}

.stat-card--blue .stat-icon-badge {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.18);
}
.stat-card--green .stat-icon-badge {
  background: rgba(34, 197, 94, 0.12);
  border-color: rgba(34, 197, 94, 0.18);
}
.stat-card--purple .stat-icon-badge {
  background: rgba(167, 139, 250, 0.14);
  border-color: rgba(167, 139, 250, 0.2);
}
.stat-card--red .stat-icon-badge {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.18);
}

.stat-icon {
  color: rgba(15, 23, 42, 0.78);
}

.stat-top-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat-label {
  font-size: 13px;
  color: #1e3a5f;
  font-weight: 600;
}

.stat-hint {
  font-size: 12px;
  color: #2d5a87;
  line-height: 1.1;
}

.stat-trend {
  margin-left: auto;
  font-size: 12px;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.stat-trend--up {
  background: rgba(239, 68, 68, 0.10);
  color: #dc2626;
  border-color: rgba(239, 68, 68, 0.18);
}

.stat-trend--down {
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
  border-color: rgba(34, 197, 94, 0.18);
}

.trend-arrow {
  display: inline-flex;
  align-items: center;
}

.trend-arrow-svg {
  width: 16px;
  height: 16px;
  display: block;
}

.stat-value {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.2px;
  line-height: 1.05;
}

.stat-sub {
  margin-top: auto;
  color: rgba(100, 116, 139, 1);
  font-size: 12px;
}

.trend-text {
  color: rgba(100, 116, 139, 1);
}

.dashboard-mid {
  flex: 0 0 auto;
}

.mid-col {
  display: flex;
  flex-direction: column;
}

.chart-card :deep(.el-card__header) {
  padding: 10px 14px;
}

.chart-card :deep(.el-card__body) {
  display: block;
  padding: 0 12px 12px;
}

.chart-fill {
  display: block;
}

.chart-body {
  padding: 4px 4px 0;
  min-height: 280px;
}

.echart-trend {
  width: 100%;
  height: 280px;
  min-height: 280px;
}

.donut-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 4px 0;
  min-height: 280px; /* same visual height as trend chart */
}

.donut-wrap {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.echart-donut {
  width: 190px;
  height: 190px;
  min-height: 190px;
}

.donut-legend {
  flex: 0 0 108px; /* make right-side metrics narrower */
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.legend-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
  color: rgba(100, 116, 139, 1);
}

.legend-name {
  flex: 1;
  margin-left: 6px;
  white-space: nowrap;
}

.legend-val {
  font-weight: 800;
  color: rgba(15, 23, 42, 0.9);
  font-size: 12px;
}

.bottom-row {
  margin-bottom: 0;
}

.bottom-card :deep(.el-card__header) {
  padding: 10px 14px;
}

.bottom-card :deep(.el-card__body) {
  padding: 10px 14px 12px;
}

.audit-card-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.audit-card-sub {
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}

.audit-panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  min-height: 200px;
}

.audit-panel {
  border-radius: 14px;
  padding: 12px 12px 10px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
  display: flex;
  flex-direction: column;
}

.audit-panel--login {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.22), rgba(99, 102, 241, 0.28) 45%, rgba(14, 165, 233, 0.12));
}

.audit-panel--ops {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.18), rgba(45, 212, 191, 0.22) 40%, rgba(16, 185, 129, 0.12));
}

.audit-panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.audit-panel-title {
  font-weight: 800;
  font-size: 14px;
  color: #1e3a5f;
}

.audit-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.audit-li {
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 12px;
  padding: 8px 10px;
  backdrop-filter: blur(6px);
}

.audit-li-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.audit-li-user {
  font-weight: 800;
  color: rgba(15, 23, 42, 0.92);
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-li-tag {
  flex: 0 0 auto;
}

.audit-li-module {
  font-size: 12px;
  font-weight: 700;
  color: #0f766e;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-li-time {
  margin-left: auto;
  font-size: 11px;
  color: #64748b;
  flex: 0 0 auto;
}

.audit-li-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #475569;
  line-height: 1.45;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.audit-empty {
  padding: 18px 12px;
  text-align: center;
  font-size: 12.5px;
  color: #475569;
  background: rgba(255, 255, 255, 0.45);
  border-radius: 12px;
  border: 1px dashed rgba(15, 23, 42, 0.12);
}

@media (max-width: 992px) {
  .quick-top-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .quick-btn {
    height: 58px;
    padding: 0 12px;
    border-radius: 12px;
  }
  .quick-btn-zh {
    font-size: 13px;
  }
  .quick-btn-en {
    font-size: 10px;
  }
  .top-row :deep(.el-col),
  .mid-row :deep(.el-col),
  .bottom-row :deep(.el-col) {
    max-width: 100%;
    flex: 0 0 100%;
  }
  .top-row,
  .mid-row,
  .bottom-row {
    row-gap: 10px;
  }
  .stat-card {
    height: auto;
    min-height: 98px;
  }
  .stat-value {
    font-size: 22px;
  }
  .chart-body,
  .donut-body {
    min-height: 240px;
  }
  .echart-trend {
    height: 240px;
    min-height: 240px;
  }
  .audit-panels {
    grid-template-columns: 1fr;
  }
}
</style>

