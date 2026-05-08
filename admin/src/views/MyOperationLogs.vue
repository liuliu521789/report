<template>
  <div class="my-op-page">
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
      <el-button type="primary" @click="load" icon=Search>查询</el-button>
    </div>
    <p class="hint">仅展示您本人在本系统的操作记录。</p>
    <el-table v-loading="loading" :data="items" border style="margin-top: 8px" class="desktop-table">
      <el-table-column prop="module" label="模块" width="140" />
      <el-table-column prop="action" label="操作" min-width="200" />
      <el-table-column label="结果" width="80">
        <template #default="{ row }">
          <el-tag :type="row.success ? 'success' : 'danger'" size="small">{{ row.success ? '成功' : '失败' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="时间" width="180">
        <template #default="{ row }">{{ $dt(row.createdAt) }}</template>
      </el-table-column>
    </el-table>
    <div class="mobile-list" v-loading="loading">
      <div v-for="(row, idx) in items" :key="'m-' + idx" class="mobile-card">
        <div class="mobile-head">
          <strong>{{ row.module || '-' }}</strong>
          <el-tag :type="row.success ? 'success' : 'danger'" size="small">{{ row.success ? '成功' : '失败' }}</el-tag>
        </div>
        <div class="mobile-line"><span>操作</span><span>{{ row.action || '-' }}</span></div>
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
        this.$message.error(this.$apiUserMsg(e, '加载失败'));
      } finally {
        this.loading = false;
      }
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
  width: 180px;
}
.hint {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}
.mobile-list {
  display: none;
  margin-top: 8px;
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
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.mobile-line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 4px 0;
  font-size: 13px;
  color: #475569;
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
    width: 100%;
  }
  .desktop-table {
    display: none;
  }
  .mobile-list {
    display: block;
  }
}
</style>
