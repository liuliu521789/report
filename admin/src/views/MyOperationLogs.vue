<template>
  <div>
    <div class="toolbar">
      <el-input v-model="q.module" placeholder="模块" clearable style="width: 180px" />
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
    <p class="hint">仅展示您本人在本系统的操作记录。</p>
    <el-table v-loading="loading" :data="items" border style="margin-top: 8px">
      <el-table-column prop="module" label="模块" width="140" />
      <el-table-column prop="action" label="操作" min-width="200" />
      <el-table-column label="结果" width="80">
        <template slot-scope="{ row }">
          <el-tag :type="row.success ? 'success' : 'danger'" size="mini">{{ row.success ? '成功' : '失败' }}</el-tag>
        </template>
      </el-table-column>
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
import { listMyOperations } from '../api';

export default {
  name: 'MyOperationLogs',
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
        const { items, total } = await listMyOperations(params);
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

<style scoped>
.hint {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}
</style>
