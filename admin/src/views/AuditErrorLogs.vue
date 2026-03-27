<template>
  <div class="audit-page">
    <div class="toolbar">
      <el-input v-model="q.module" placeholder="模块" clearable class="w-module" />
      <el-date-picker
        v-model="range"
        type="datetimerange"
        value-format="YYYY-MM-DD HH:mm:ss"
        range-separator="至"
        start-placeholder="开始"
        end-placeholder="结束"
        class="w-range"
      />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button type="danger" plain :disabled="selected.length === 0" @click="onBulkDelete">
        批量删除
      </el-button>
      <el-dropdown :disabled="selected.length === 0" @command="onExportCommand">
        <el-button :disabled="selected.length === 0">批量导出</el-button>
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
      <el-table-column type="selection" width="48" />
      <el-table-column prop="id" label="ID" width="72" />
      <el-table-column prop="module" label="模块" width="120" />
      <el-table-column prop="message" label="描述" min-width="220" show-overflow-tooltip />
      <el-table-column prop="code" label="代码" width="100" />
      <el-table-column prop="createdAt" label="时间" width="168" />
    </el-table>
    <div class="mobile-list" v-loading="loading">
      <div v-for="row in items" :key="'m-' + row.id" class="mobile-card">
        <div class="mobile-head"><strong>#{{ row.id }}</strong><span>{{ row.module || '-' }}</span></div>
        <div class="mobile-line"><span>描述</span><span>{{ row.message || '-' }}</span></div>
        <div class="mobile-line"><span>代码</span><span>{{ row.code || '-' }}</span></div>
        <div class="mobile-line"><span>时间</span><span>{{ row.createdAt }}</span></div>
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
import { bulkDeleteErrorLogs, exportErrorLogs, listErrorLogs } from '../api';

export default {
  name: 'AuditErrorLogs',
  data() {
    return {
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
  mounted() {
    this.load();
  },
  methods: {
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
        this.$message.error(e?.response?.data?.error || '加载失败');
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
        await exportErrorLogs(ids);
        this.$message.success('已开始下载');
      } catch (e) {
        this.$message.error(e?.response?.data?.error || '导出失败');
      }
    },
    onBulkExportTable() {
      const rows = (this.selected || []).map((x) => ({
        id: x.id,
        module: x.module,
        message: x.message,
        code: x.code,
        createdAt: x.createdAt
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
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.w-module {
  width: 160px;
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
  color: #334155;
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
  .w-module,
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
</style>
