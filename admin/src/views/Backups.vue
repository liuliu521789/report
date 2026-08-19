<template>
  <div class="ref-list-page backup-page">
    <div class="page-head">
      <div class="page-head__filters">
        <span class="type-pill is-active">
          备份包
          <span class="type-pill__count">{{ backups.length }}</span>
        </span>
        <span class="type-pill">
          最近任务
          <span class="type-pill__count">{{ jobs.length }}</span>
        </span>
      </div>
      <div class="page-head__actions">
        <el-button :icon="Refresh" :loading="loading" circle @click="refreshAll" />
        <el-button type="warning" plain :loading="verifying" @click="onVerifyLatestBackup">校验最新</el-button>
        <el-button type="info" plain :loading="rotating" @click="onRotateEncryption">重加密</el-button>
        <el-button type="primary" class="btn-create" :icon="Download" :loading="creating" @click="onBackup">
          一键备份
        </el-button>
      </div>
    </div>

    <div class="stack-panels">
      <div class="content-panel">
        <div class="sub-panel-head">
          <h4 class="sub-panel-title">备份包列表</h4>
        </div>
        <div class="table-scroll">
          <el-table v-loading="loading" :data="backups" class="desktop-table ref-table" row-key="id">
            <el-table-column label="备份" min-width="200">
              <template #default="{ row }">
                <div class="name-cell">
                  <span class="name-icon name-icon--lock">
                    <el-icon><FolderOpened /></el-icon>
                  </span>
                  <div class="name-info">
                    <span class="name-title">{{ row.id }}</span>
                    <span class="name-sub">{{ formatDate(row.date) }}</span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="大小" width="100" align="center">
              <template #default="{ row }">
                <span class="count-tag">{{ formatSize(row.size) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="dayDir" label="路径" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="cell-muted">{{ row.dayDir || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="64" fixed="right" align="center">
              <template #default="{ row }">
                <el-dropdown trigger="click" @command="(c) => onRowAction(c, row)">
                  <el-button link class="more-btn" @click.stop>
                    <el-icon :size="18"><MoreFilled /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="download" :icon="Download">下载</el-dropdown-item>
                      <el-dropdown-item command="restore" :icon="RefreshRight">恢复</el-dropdown-item>
                      <el-dropdown-item command="delete" divided>
                        <span class="danger-text">删除</span>
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无备份包" :image-size="88" />
            </template>
          </el-table>
        </div>
        <div v-if="backups.length" class="table-footer">
          <span>共 {{ backups.length }} 个备份包</span>
        </div>
      </div>

      <div class="content-panel">
        <div class="sub-panel-head">
          <h4 class="sub-panel-title">最近任务</h4>
        </div>
        <div class="table-scroll">
          <el-table :data="jobs" class="desktop-table ref-table ref-table--compact" row-key="id">
            <el-table-column prop="id" label="任务 ID" width="88" />
            <el-table-column prop="jobType" label="类型" width="88">
              <template #default="{ row }">
                <span class="role-tag">{{ row.jobType || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="triggerType" label="触发" width="88" />
            <el-table-column label="状态" width="96" align="center">
              <template #default="{ row }">
                <span :class="['result-tag', jobStatusClass(row.status)]">{{ row.status || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="开始时间" min-width="168">
              <template #default="{ row }">
                <span class="cell-muted">{{ formatDate(row.startedAt) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="96" align="center">
              <template #default="{ row }">{{ formatDuration(row.durationMs) }}</template>
            </el-table-column>
            <el-table-column prop="errorMessage" label="错误信息" min-width="180" show-overflow-tooltip />
            <template #empty>
              <el-empty description="暂无任务记录" :image-size="72" />
            </template>
          </el-table>
        </div>
      </div>
    </div>

    <div class="mobile-list" v-loading="loading">
      <div v-for="row in backups" :key="'m-' + row.id" class="mobile-card">
        <div class="mobile-head">
          <div class="mobile-head-main">
            <span class="name-icon name-icon--lock name-icon--sm">
              <el-icon><FolderOpened /></el-icon>
            </span>
            <div>
              <strong>{{ row.id }}</strong>
              <span class="name-sub">{{ formatDate(row.date) }}</span>
            </div>
          </div>
          <span class="count-tag">{{ formatSize(row.size) }}</span>
        </div>
        <div class="mobile-line"><span>路径</span><span class="mobile-val">{{ row.dayDir || '—' }}</span></div>
        <div class="mobile-actions">
          <el-button size="small" :loading="actionLoadingId === row.id && actionType === 'download'" @click="onDownload(row)">
            下载
          </el-button>
          <el-button size="small" type="success" plain :loading="actionLoadingId === row.id && actionType === 'restore'" @click="onRestore(row)">
            恢复
          </el-button>
          <el-button size="small" type="danger" plain :loading="actionLoadingId === row.id && actionType === 'delete'" @click="onDelete(row)">
            删除
          </el-button>
        </div>
      </div>
      <el-empty v-if="!backups.length && !loading" description="暂无备份包" />
    </div>
  </div>
</template>

<script>
import { Download, FolderOpened, MoreFilled, Refresh, RefreshRight } from '@element-plus/icons-vue';
import {
  deleteBackup,
  downloadBackup,
  getBackupJobs,
  getBackups,
  restoreBackup,
  rotateBackupEncryption,
  runBackup,
  verifyBackupRecoverability
} from '../api/backup.js';
import { startDownload } from '../composables/useDownloadProgress.js';

export default {
  name: 'Backups',
  components: { FolderOpened },
  data() {
    return {
      Download,
      Refresh,
      RefreshRight,
      MoreFilled,
      backups: [],
      jobs: [],
      loading: false,
      creating: false,
      rotating: false,
      verifying: false,
      actionLoadingId: '',
      actionType: ''
    };
  },
  created() {
    this.refreshAll();
  },
  methods: {
    async refreshAll() {
      this.loading = true;
      try {
        await Promise.all([this.fetchBackups(), this.fetchJobs()]);
      } finally {
        this.loading = false;
      }
    },
    async fetchBackups() {
      try {
        this.backups = await getBackups();
      } catch (e) {
        console.error(e);
        this.backups = [];
      }
    },
    async fetchJobs() {
      try {
        this.jobs = await getBackupJobs();
      } catch (e) {
        console.error(e);
        this.jobs = [];
      }
    },
    jobStatusClass(status) {
      const s = String(status || '').toLowerCase();
      if (s === 'success' || s === 'ok' || s === 'completed') return 'is-ok';
      if (s === 'failed' || s === 'error') return 'is-fail';
      return 'is-neutral';
    },
    formatDate(value) {
      if (!value) return '—';
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return String(value);
      return dt.toLocaleString();
    },
    formatSize(size) {
      const n = Number(size || 0);
      if (!Number.isFinite(n) || n <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = n;
      let idx = 0;
      while (value >= 1024 && idx < units.length - 1) {
        value /= 1024;
        idx += 1;
      }
      return `${value.toFixed(value >= 100 || idx === 0 ? 0 : 2)} ${units[idx]}`;
    },
    formatDuration(ms) {
      const n = Number(ms || 0);
      if (!Number.isFinite(n) || n <= 0) return '—';
      if (n < 1000) return `${n} ms`;
      return `${(n / 1000).toFixed(2)} s`;
    },
    onRowAction(command, row) {
      if (command === 'download') return this.onDownload(row);
      if (command === 'restore') return this.onRestore(row);
      if (command === 'delete') return this.onDelete(row);
    },
    async onBackup() {
      this.creating = true;
      try {
        await runBackup();
        this.$message.success('备份完成');
        await this.refreshAll();
      } catch (e) {
        this.$message.error(e?.message || '备份失败');
      } finally {
        this.creating = false;
      }
    },
    async onRotateEncryption() {
      try {
        await this.$confirm(
          '将使用当前密钥对历史备份包重新加密。执行期间会占用 IO，是否继续？',
          '重加密确认',
          { type: 'warning' }
        );
      } catch {
        return;
      }
      this.rotating = true;
      try {
        const result = await rotateBackupEncryption();
        this.$message.success(`重加密完成：处理 ${result.total} 条，更新 ${result.rotated} 条`);
        await this.fetchJobs();
      } catch (e) {
        this.$message.error(e?.message || '重加密失败');
      } finally {
        this.rotating = false;
      }
    },
    async onVerifyLatestBackup() {
      this.verifying = true;
      try {
        const result = await verifyBackupRecoverability('');
        this.$message.success(`校验通过：${result.backupId}`);
        await this.fetchJobs();
      } catch (e) {
        this.$message.error(e?.message || '校验失败');
        await this.fetchJobs();
      } finally {
        this.verifying = false;
      }
    },
    async onDownload(row) {
      this.actionLoadingId = row.id;
      this.actionType = 'download';
      try {
        const { blob, filename } = await downloadBackup(row.id);
        startDownload({ request: blob, filename });
      } catch (e) {
        this.$message.error(e?.message || '下载失败');
      } finally {
        this.actionLoadingId = '';
        this.actionType = '';
      }
    },
    async onRestore(row) {
      try {
        await this.$confirm(`确定恢复备份 ${row.id} 吗？这将覆盖当前数据`, '恢复确认', { type: 'warning' });
        this.actionLoadingId = row.id;
        this.actionType = 'restore';
        await restoreBackup(row.id);
        this.$message.success('恢复完成');
        await this.refreshAll();
      } catch (e) {
        if (e !== 'cancel') this.$message.error(e?.message || '恢复失败');
      } finally {
        this.actionLoadingId = '';
        this.actionType = '';
      }
    },
    async onDelete(row) {
      try {
        await this.$confirm(`确认删除备份 ${row.id}？`, '删除确认', { type: 'warning' });
        this.actionLoadingId = row.id;
        this.actionType = 'delete';
        await deleteBackup(row.id);
        this.$message.success('删除成功');
        await this.refreshAll();
      } catch (e) {
        if (e !== 'cancel') this.$message.error(e?.message || '删除失败');
      } finally {
        this.actionLoadingId = '';
        this.actionType = '';
      }
    }
  }
};
</script>

<style scoped>
@import '../styles/refListPage.css';

.ref-table--compact td.el-table__cell {
  padding: 10px 0;
}
</style>
