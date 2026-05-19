<template>
  <div class="audit-page">
    <div class="toolbar">
      <el-input v-model="q.username" placeholder="账号" clearable class="w-user" />
      <el-select v-model="q.success" placeholder="状态" clearable class="w-status">
        <el-option label="成功" value="1" />
        <el-option label="失败" value="0" />
      </el-select>
      <el-date-picker
        v-model="range"
        type="datetimerange"
        value-format="YYYY-MM-DD HH:mm:ss"
        range-separator="至"
        start-placeholder="开始"
        end-placeholder="结束"
        class="w-range"
      />
      <el-button type="primary" @click="load" icon=Search>查询</el-button>
      <el-button
        v-if="isSuperAdminUser"
        type="danger"
        plain
        :disabled="selected.length === 0"
        @click="onBulkDelete"
       icon=Delete>
        批量删除
      </el-button>
      <el-dropdown v-if="isSuperAdminUser || perm('audit', 'exportAudit')" :disabled="selected.length === 0" @command="onExportCommand">
        <el-button :disabled="selected.length === 0" icon=Download>批量导出</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="table">导出表格（CSV）</el-dropdown-item>
            <el-dropdown-item command="json">导出 JSON</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <el-table
      class="desktop-table"
      v-loading="loading"
      :data="items"
      border
      style="margin-top: 12px"
      row-key="id"
      @selection-change="onSelectionChange"
    >
      <el-table-column v-if="isSuperAdminUser || perm('audit', 'exportAudit')" type="selection" width="48" />
      <el-table-column prop="id" label="ID" width="72" />
      <el-table-column prop="username" label="账号" width="140" />
      <el-table-column prop="ip" label="IP" width="140" />
      <el-table-column prop="deviceSummary" label="设备/浏览器" min-width="180" show-overflow-tooltip />
      <el-table-column label="状态" width="88">
        <template #default="{ row }">
          <el-tag v-if="row.success" type="success" size="small">成功</el-tag>
          <el-tag v-else type="danger" size="small">失败</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="failReason" label="失败原因" min-width="160" show-overflow-tooltip />
      <el-table-column label="时间" width="180">
        <template #default="{ row }">{{ $dt(row.createdAt) }}</template>
      </el-table-column>
    </el-table>
    <div class="mobile-list" v-loading="loading">
      <div v-for="row in items" :key="'m-' + row.id" class="mobile-card">
        <div class="mobile-head">
          <strong>#{{ row.id }}</strong>
          <el-tag v-if="row.success" type="success" size="small">成功</el-tag>
          <el-tag v-else type="danger" size="small">失败</el-tag>
        </div>
        <div class="mobile-line"><span>账号</span><span>{{ row.username || '-' }}</span></div>
        <div class="mobile-line"><span>IP</span><span>{{ row.ip || '-' }}</span></div>
        <div class="mobile-line"><span>设备</span><span>{{ row.deviceSummary || '-' }}</span></div>
        <div class="mobile-line"><span>失败原因</span><span>{{ row.failReason || '-' }}</span></div>
        <div class="mobile-line"><span>时间</span><span>{{ $dt(row.createdAt) }}</span></div>
      </div>
      <el-empty v-if="!items.length && !loading" description="暂无记录" />
    </div>
    <el-pagination
      style="margin-top: 12px"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="limit"
      v-model:current-page="page"
      @current-change="load"
    />
  </div>
</template>

<script>
import { bulkDeleteLoginLogs, exportLoginLogs, listLoginLogs } from '../api';
import { formatDateTime } from '../utils/formatDateTime';
import { isSuperAdmin, perm } from '../utils/permissions';
import { startDownload } from '../composables/useDownloadProgress.js';

export default {
  name: 'AuditLoginLogs',
  data() {
    return {
      loading: false,
      items: [],
      total: 0,
      page: 1,
      limit: 50,
      q: { username: '', success: '' },
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
    async load() {
      this.loading = true;
      try {
        const params = {
          limit: this.limit,
          offset: (this.page - 1) * this.limit,
          username: this.q.username || undefined,
          success: this.q.success || undefined,
          from: this.range && this.range[0] ? this.range[0] : undefined,
          to: this.range && this.range[1] ? this.range[1] : undefined
        };
        const { items, total } = await listLoginLogs(params);
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
        await this.$confirm(`确认删除选中的 ${ids.length} 条登录日志？删除后不可恢复`, '批量删除', { type: 'warning' });
        await bulkDeleteLoginLogs(ids);
        this.$message.success('批量删除完成');
        this.selected = [];
        await this.load();
      } catch (_) {
        // cancelled
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
        const blob = await exportLoginLogs(ids);
        startDownload({ request: blob, filename: `login-logs-${Date.now()}.json` });
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '导出失败'));
      }
    },
    onBulkExportTable() {
      const rows = (this.selected || []).map((x) => ({
        id: x.id,
        username: x.username,
        ip: x.ip,
        deviceSummary: x.deviceSummary,
        success: x.success ? '成功' : '失败',
        failReason: x.failReason,
        createdAt: formatDateTime(x.createdAt, { empty: '' })
      }));
      if (!rows.length) return;
      this.downloadCsv(
        `login-logs-${Date.now()}.csv`,
        [
          { key: 'id', label: 'ID' },
          { key: 'username', label: '账号' },
          { key: 'ip', label: 'IP' },
          { key: 'deviceSummary', label: '设备/浏览器' },
          { key: 'success', label: '状态' },
          { key: 'failReason', label: '失败原因' },
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
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.w-user {
  width: 160px;
}
.w-status {
  width: 120px;
}
.mobile-list {
  display: none;
  margin-top: 12px;
}
.mobile-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  margin-bottom: 8px;
}
.mobile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.mobile-line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: #475569;
  margin: 3px 0;
}
.mobile-line span:last-child {
  text-align: right;
  word-break: break-all;
}
@media (max-width: 992px) {
  .w-user,
  .w-status,
  .w-range {
    width: 100%;
  }
  .toolbar .el-button {
    flex: 1 1 calc(50% - 8px);
  }
  .desktop-table {
    display: none;
  }
  .mobile-list {
    display: block;
  }
}
:deep(.el-table__row) {
  cursor: pointer;
}
:deep(.el-table__row:hover) {
  background-color: #f5f7fa;
}
</style>
