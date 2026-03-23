<template>
  <div>
    <div class="toolbar">
      <el-input v-model="q.username" placeholder="账号" clearable style="width: 160px" />
      <el-select v-model="q.success" placeholder="状态" clearable style="width: 120px; margin-left: 8px">
        <el-option label="成功" value="1" />
        <el-option label="失败" value="0" />
      </el-select>
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
      <el-table-column prop="username" label="账号" width="140" />
      <el-table-column prop="ip" label="IP" width="140" />
      <el-table-column prop="deviceSummary" label="设备/浏览器" min-width="180" show-overflow-tooltip />
      <el-table-column label="状态" width="88">
        <template slot-scope="{ row }">
          <el-tag v-if="row.success" type="success" size="mini">成功</el-tag>
          <el-tag v-else type="danger" size="mini">失败</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="failReason" label="失败原因" min-width="160" show-overflow-tooltip />
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
import { listLoginLogs } from '../api';

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
          success: this.q.success || undefined,
          from: this.range && this.range[0] ? this.range[0] : undefined,
          to: this.range && this.range[1] ? this.range[1] : undefined
        };
        const { items, total } = await listLoginLogs(params);
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
