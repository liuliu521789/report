<template>
  <div class="ref-list-page audit-page">
    <div class="page-head">
      <div class="page-head__filters">
        <span class="type-pill is-active">
          错误日志
          <span class="type-pill__count">{{ total }}</span>
        </span>
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
          <el-table-column label="错误" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="name-cell">
                <span class="name-icon name-icon--danger">
                  <el-icon><WarningFilled /></el-icon>
                </span>
                <div class="name-info">
                  <span class="name-title">{{ row.message || '—' }}</span>
                  <span class="name-sub">{{ row.code || '无错误码' }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="module" label="模块" width="120">
            <template #default="{ row }">
              <span class="role-tag">{{ row.module || '—' }}</span>
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
            <span class="name-icon name-icon--danger name-icon--sm">
              <el-icon><WarningFilled /></el-icon>
            </span>
            <div>
              <strong>{{ row.module || '—' }}</strong>
              <span class="name-sub">{{ row.code || '无错误码' }}</span>
            </div>
          </div>
        </div>
        <div class="mobile-line"><span>描述</span><span class="mobile-val">{{ row.message || '—' }}</span></div>
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
import { Delete, Download, Refresh, Search, WarningFilled } from '@element-plus/icons-vue';
import { bulkDeleteErrorLogs, exportErrorLogs, listErrorLogs } from '../api';
import { formatDateTime } from '../utils/formatDateTime';
import { isSuperAdmin, perm } from '../utils/permissions';
import { startDownload } from '../composables/useDownloadProgress.js';

export default {
  name: 'AuditErrorLogs',
  components: { WarningFilled },
  data() {
    return {
      Search,
      Refresh,
      Delete,
      Download,
      WarningFilled,
      loading: false,
      items: [],
      total: 0,
      page: 1,
      limit: 50,
      q: { module: '' },
      range: null,
      selected: []
    };
  },
  computed: {
    isSuperAdminUser() {
      return isSuperAdmin();
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    perm,
    search() {
      this.page = 1;
      this.load();
    },
    async load() {
      this.loading = true;
      try {
        const params = {
          limit: this.limit,
          offset: (this.page - 1) * this.limit,
          module: this.q.module || undefined,
          from: this.range && this.range[0] ? this.range[0] : undefined,
          to: this.range && this.range[1] ? this.range[1] : undefined
        };
        const { items, total } = await listErrorLogs(params);
        this.items = items || [];
        this.total = total || 0;
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载失败'));
      } finally {
        this.loading = false;
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
        await this.$confirm(`确认删除选中的 ${ids.length} 条错误日志？删除后不可恢复`, '批量删除', { type: 'warning' });
        await bulkDeleteErrorLogs(ids);
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
        const blob = await exportErrorLogs(ids);
        startDownload({ request: blob, filename: `error-logs-${Date.now()}.json` });
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '导出失败'));
      }
    },
    onBulkExportTable() {
      const rows = (this.selected || []).map((x) => ({
        id: x.id,
        module: x.module,
        message: x.message,
        code: x.code,
        createdAt: formatDateTime(x.createdAt, { empty: '' })
      }));
      if (!rows.length) return;
      this.downloadCsv(
        `error-logs-${Date.now()}.csv`,
        [
          { key: 'id', label: 'ID' },
          { key: 'module', label: '模块' },
          { key: 'message', label: '描述' },
          { key: 'code', label: '代码' },
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
