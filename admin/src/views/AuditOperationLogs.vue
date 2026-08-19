<template>
  <div class="ref-list-page audit-page">
    <div class="page-head">
      <div class="page-head__filters">
        <button
          v-for="pill in statusPills"
          :key="pill.key || 'all'"
          type="button"
          class="type-pill"
          :class="{ 'is-active': activePill === pill.key }"
          @click="setStatusPill(pill.key)"
        >
          {{ pill.label }}
          <span class="type-pill__count">{{ pill.count }}</span>
        </button>
      </div>
      <div class="page-head__actions">
        <el-button :icon="Refresh" :loading="loading" circle @click="load" />
        <el-button
          v-if="isSuperAdminUser"
          type="danger"
          plain
          :icon="Delete"
          :disabled="selected.length === 0"
          @click="onBulkDelete"
        >
          批量删除
        </el-button>
        <el-dropdown
          v-if="isSuperAdminUser || perm('audit', 'exportAudit')"
          :disabled="selected.length === 0"
          @command="onExportCommand"
        >
          <el-button :disabled="selected.length === 0" :icon="Download">导出</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="table">导出表格（CSV）</el-dropdown-item>
              <el-dropdown-item command="json">导出 JSON</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="content-panel">
      <div class="filter-bar">
        <div class="filter-bar__left">
          <el-input v-model="q.username" placeholder="账号" clearable class="filter-field filter-field--user" @keyup.enter="search" />
          <el-input v-model="q.userId" placeholder="用户 ID" clearable class="filter-field" @keyup.enter="search" />
          <el-input v-model="q.module" placeholder="模块" clearable class="filter-field" @keyup.enter="search" />
          <el-date-picker
            v-model="range"
            type="datetimerange"
            value-format="YYYY-MM-DD HH:mm:ss"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            class="filter-field filter-field--range"
          />
        </div>
        <div class="filter-bar__right">
          <el-button type="primary" class="search-btn search-btn--solo" :icon="Search" @click="search">查询</el-button>
        </div>
      </div>

      <div class="table-scroll">
        <el-table
          v-loading="loading"
          :data="items"
          class="desktop-table ref-table"
          row-key="id"
          @selection-change="onSelectionChange"
        >
          <el-table-column v-if="isSuperAdminUser || perm('audit', 'exportAudit')" type="selection" width="48" />
          <el-table-column label="成员" min-width="148" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="name-cell">
                <span class="name-icon">
                  <el-icon><User /></el-icon>
                </span>
                <div class="name-info">
                  <span class="name-title">{{ userDisplay(row) }}</span>
                  <span class="name-sub">{{ row.username || '—' }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="module" label="模块" width="120">
            <template #default="{ row }">
              <span class="role-tag">{{ row.module || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="action" label="操作" min-width="180" show-overflow-tooltip />
          <el-table-column label="结果" width="88" align="center">
            <template #default="{ row }">
              <span :class="['result-tag', row.success ? 'is-ok' : 'is-fail']">
                {{ row.success ? '成功' : '失败' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="ip" label="IP" width="128" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="cell-muted">{{ row.ip || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="168" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="cell-muted">{{ $dt(row.createdAt) }}</span>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="没有符合条件的记录" :image-size="88" />
          </template>
        </el-table>
      </div>

      <div v-if="total > 0" class="table-footer">
        <span>共 {{ total }} 条</span>
        <div class="table-footer__right">
          <el-pagination
            layout="total, prev, pager, next"
            :total="total"
            :page-size="limit"
            v-model:current-page="page"
            small
            @current-change="load"
          />
        </div>
      </div>
    </div>

    <div class="mobile-list" v-loading="loading">
      <div v-for="row in items" :key="'m-' + row.id" class="mobile-card">
        <div class="mobile-head">
          <div class="mobile-head-main">
            <span class="name-icon name-icon--sm">
              <el-icon><User /></el-icon>
            </span>
            <div>
              <strong>{{ userDisplay(row) }}</strong>
              <span class="name-sub">{{ row.module }} · {{ row.action }}</span>
            </div>
          </div>
          <span :class="['result-tag', row.success ? 'is-ok' : 'is-fail']">
            {{ row.success ? '成功' : '失败' }}
          </span>
        </div>
        <div class="mobile-line"><span>IP</span><span class="mobile-val">{{ row.ip || '—' }}</span></div>
        <div class="mobile-line"><span>时间</span><span>{{ $dt(row.createdAt) }}</span></div>
      </div>
      <el-empty v-if="!items.length && !loading" description="暂无记录" />
      <div v-if="total > 0" class="mobile-pager">
        <el-pagination
          layout="total, prev, pager, next"
          :total="total"
          :page-size="limit"
          v-model:current-page="page"
          small
          @current-change="load"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { Delete, Download, Refresh, Search, User } from '@element-plus/icons-vue';
import { bulkDeleteAuditOperations, exportAuditOperations, listAuditOperations } from '../api';
import { formatDateTime } from '../utils/formatDateTime';
import { isSuperAdmin, perm } from '../utils/permissions';
import { startDownload } from '../composables/useDownloadProgress.js';
import { actorDisplay } from '../utils/userActorDisplay';

export default {
  name: 'AuditOperationLogs',
  components: { User },
  data() {
    return {
      Search,
      Refresh,
      Delete,
      Download,
      loading: false,
      items: [],
      total: 0,
      allCount: 0,
      successTotal: 0,
      failTotal: 0,
      page: 1,
      limit: 50,
      activePill: '',
      q: { username: '', userId: '', module: '' },
      range: null,
      selected: []
    };
  },
  computed: {
    isSuperAdminUser() {
      return isSuperAdmin();
    },
    statusPills() {
      return [
        { key: '', label: '全部', count: this.allCount },
        { key: '1', label: '成功', count: this.successTotal },
        { key: '0', label: '失败', count: this.failTotal }
      ];
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    perm,
    userDisplay(row) {
      return actorDisplay(row);
    },
    setStatusPill(key) {
      this.activePill = key;
      this.page = 1;
      this.load();
    },
    search() {
      this.page = 1;
      this.load();
    },
    buildBaseParams() {
      return {
        username: this.q.username || undefined,
        userId: this.q.userId || undefined,
        module: this.q.module || undefined,
        from: this.range && this.range[0] ? this.range[0] : undefined,
        to: this.range && this.range[1] ? this.range[1] : undefined
      };
    },
    async load() {
      this.loading = true;
      try {
        const params = {
          limit: this.limit,
          offset: (this.page - 1) * this.limit,
          ...this.buildBaseParams(),
          success: this.activePill || undefined
        };
        const { items, total } = await listAuditOperations(params);
        this.items = items || [];
        this.total = total || 0;
        await this.loadStatusCounts();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载失败'));
      } finally {
        this.loading = false;
      }
    },
    async loadStatusCounts() {
      const base = { limit: 1, offset: 0, ...this.buildBaseParams() };
      try {
        const [all, ok, fail] = await Promise.all([
          listAuditOperations(base),
          listAuditOperations({ ...base, success: '1' }),
          listAuditOperations({ ...base, success: '0' })
        ]);
        this.allCount = all.total || 0;
        this.successTotal = ok.total || 0;
        this.failTotal = fail.total || 0;
      } catch {
        /* ignore */
      }
    },
    onSelectionChange(rows) {
      this.selected = rows || [];
    },
    selectedIds() {
      return (this.selected || []).map((x) => x.id).filter(Boolean);
    },
    async onBulkDelete() {
      const ids = this.selectedIds();
      if (!ids.length) return;
      try {
        await this.$confirm(`确认删除选中的 ${ids.length} 条操作日志？删除后不可恢复`, '批量删除', { type: 'warning' });
        await bulkDeleteAuditOperations(ids);
        this.$message.success('批量删除完成');
        this.selected = [];
        await this.load();
      } catch (_) {
        /* cancelled */
      }
    },
    downloadCsv(filename, headers, rows) {
      const escapeCell = (v) => {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return `"${s}"`;
      };
      const lines = [headers.map((h) => escapeCell(h.label)).join(',')];
      for (const row of rows) {
        lines.push(headers.map((h) => escapeCell(row[h.key])).join(','));
      }
      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onExportCommand(command) {
      if (command === 'table') return this.onBulkExportTable();
      if (command === 'json') return this.onBulkExportJson();
      return null;
    },
    async onBulkExportJson() {
      const ids = this.selectedIds();
      if (!ids.length) return;
      try {
        const blob = await exportAuditOperations(ids);
        startDownload({ request: blob, filename: `operation-logs-${Date.now()}.json` });
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '导出失败'));
      }
    },
    onBulkExportTable() {
      const rows = (this.selected || []).map((x) => ({
        id: x.id,
        realName: actorDisplay(x),
        username: x.username,
        module: x.module,
        action: x.action,
        success: x.success ? '成功' : '失败',
        ip: x.ip,
        createdAt: formatDateTime(x.createdAt, { empty: '' })
      }));
      if (!rows.length) return;
      this.downloadCsv(
        `operation-logs-${Date.now()}.csv`,
        [
          { key: 'id', label: 'ID' },
          { key: 'realName', label: '姓名' },
          { key: 'username', label: '账号' },
          { key: 'module', label: '模块' },
          { key: 'action', label: '操作' },
          { key: 'success', label: '结果' },
          { key: 'ip', label: 'IP' },
          { key: 'createdAt', label: '时间' }
        ],
        rows
      );
      this.$message.success('表格已下载');
    }
  }
};
</script>

<style scoped>
@import '../styles/refListPage.css';

.search-btn--solo {
  border-radius: 10px !important;
}
.mobile-pager {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}
</style>
