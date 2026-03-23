<template>
  <div>
    <div class="toolbar">
      <el-input v-model="q.username" placeholder="账号" clearable style="width: 140px" />
      <el-input v-model="q.userId" placeholder="用户ID" clearable style="width: 120px; margin-left: 8px" />
      <el-input v-model="q.module" placeholder="模块" clearable style="width: 140px; margin-left: 8px" />
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
    </div>
    <el-table v-loading="loading" :data="items" border style="margin-top: 12px">
      <el-table-column prop="id" label="ID" width="72" />
      <el-table-column prop="username" label="操作人" width="120" />
      <el-table-column prop="module" label="模块" width="120" />
      <el-table-column prop="action" label="操作" min-width="160" />
      <el-table-column label="结果" width="80">
        <template slot-scope="{ row }">
          <el-tag :type="row.success ? 'success' : 'danger'" size="mini">{{ row.success ? '成功' : '失败' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="ip" label="IP" width="130" />
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
import { listAuditOperations } from '../api';

export default {
  name: 'AuditOperationLogs',
  data() {
    return {
      loading: false,
      items: [],
      total: 0,
      page: 1,
      limit: 50,
      q: { username: '', userId: '', module: '' },
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
          username: this.q.username || undefined,
          userId: this.q.userId || undefined,
          module: this.q.module || undefined,
          from: this.range && this.range[0] ? this.range[0] : undefined,
          to: this.range && this.range[1] ? this.range[1] : undefined
        };
        const { items, total } = await listAuditOperations(params);
        this.items = items || [];
        this.total = total || 0;
      } catch (e) {
        this.$message.error(e?.response?.data?.error || '加载失败');
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>
