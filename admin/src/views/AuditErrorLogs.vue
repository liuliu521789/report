<template>
  <div>
    <div class="toolbar">
      <el-input v-model="q.module" placeholder="模块" clearable style="width: 160px" />
      <el-date-picker
        v-model="range"
        type="datetimerange"
        value-format="yyyy-MM-dd HH:mm:ss"
        range-separator="至"
        start-placeholder="开始"
        end-placeholder="结束"
        style="margin-left: 8px"
      />
      <el-button type="primary" style="margin-left: 8px" @click="load">查询</el-button>
      <el-button style="margin-left: 8px" @click="onExport">导出 JSON</el-button>
    </div>
    <el-table v-loading="loading" :data="items" border style="margin-top: 12px">
      <el-table-column prop="id" label="ID" width="72" />
      <el-table-column prop="module" label="模块" width="120" />
      <el-table-column prop="message" label="描述" min-width="220" show-overflow-tooltip />
      <el-table-column prop="code" label="代码" width="100" />
      <el-table-column prop="createdAt" label="时间" width="168" />
    </el-table>
    <el-pagination
      style="margin-top: 12px"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="limit"
      :current-page.sync="page"
      @current-change="load"
    />
  </div>
</template>

<script>
import { listErrorLogs, downloadErrorLogsExport } from '../api';

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
      range: null
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
    async onExport() {
      try {
        await downloadErrorLogsExport();
        this.$message.success('已开始下载');
      } catch (e) {
        this.$message.error(e?.response?.data?.error || '导出失败');
      }
    }
  }
};
</script>
