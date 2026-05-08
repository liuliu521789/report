<template>
  <el-card class="backup-page" shadow="always">
    <div class="toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div><strong>备份管理</strong></div>
      <div style="display:flex;gap:8px">
        <el-button type="warning" plain :loading="rotating" @click="onRotateEncryption">重加密历史备份</el-button>
        <el-button type="info" plain :loading="verifying" @click="onVerifyLatestBackup">校验最新备份</el-button>
        <el-button type="primary" :loading="creating" @click="onBackup">一键备份</el-button>
      </div>
    </div>
    <el-table :data="backups" border style="width: 100%" v-loading="loading">
      <el-table-column prop="id" label="日期（ID）" width="180" />
      <el-table-column label="时间" min-width="180">
        <template #default="{ row }">{{ formatDate(row.date) }}</template>
      </el-table-column>
      <el-table-column label="大小" width="140">
        <template #default="{ row }">{{ formatSize(row.size) }}</template>
      </el-table-column>
      <el-table-column prop="dayDir" label="路径" show-overflow-tooltip />
      <el-table-column label="操作" width="260">
        <template #default="{ row }">
          <el-button size="mini" :loading="actionLoadingId === row.id && actionType === 'download'" @click="onDownload(row)" type="primary">下载</el-button>
          <el-button size="mini" :loading="actionLoadingId === row.id && actionType === 'restore'" @click="onRestore(row)" type="success">恢复</el-button>
          <el-button size="mini" :loading="actionLoadingId === row.id && actionType === 'delete'" @click="onDelete(row)" type="danger">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div style="margin-top: 20px">
      <div style="font-weight: 600; margin-bottom: 8px">最近任务</div>
      <el-table :data="jobs" border style="width: 100%" size="mini">
        <el-table-column prop="id" label="任务ID" width="90" />
        <el-table-column prop="jobType" label="类型" width="90" />
        <el-table-column prop="triggerType" label="触发" width="90" />
        <el-table-column prop="status" label="状态" width="90" />
        <el-table-column label="开始时间" min-width="160">
          <template #default="{ row }">{{ formatDate(row.startedAt) }}</template>
        </el-table-column>
        <el-table-column label="耗时" width="100">
          <template #default="{ row }">{{ formatDuration(row.durationMs) }}</template>
        </el-table-column>
        <el-table-column prop="errorMessage" label="错误信息" min-width="180" show-overflow-tooltip />
      </el-table>
    </div>
  </el-card>
  </template>

<script>
import {
  getBackups,
  getBackupJobs,
  runBackup,
  restoreBackup,
  deleteBackup,
  downloadBackup,
  rotateBackupEncryption,
  verifyBackupRecoverability
} from '../api/backup.js';
export default {
  name: 'Backups',
  data() {
    return {
      backups: [],
      loading: false,
      creating: false,
      rotating: false,
      verifying: false,
      actionLoadingId: '',
      actionType: '',
      jobs: []
    };
  },
  created() {
    this.fetchBackups();
    this.fetchJobs();
  },
  methods: {
    async fetchBackups() {
      this.loading = true;
      try {
        const list = await getBackups();
        this.backups = list;
      } catch (e) {
        console.error(e);
      } finally {
        this.loading = false;
      }
    },
    async fetchJobs() {
      try {
        this.jobs = await getBackupJobs();
      } catch (e) {
        console.error(e);
      }
    },
    formatDate(value) {
      if (!value) return '-';
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
      if (!Number.isFinite(n) || n <= 0) return '-';
      if (n < 1000) return `${n} ms`;
      return `${(n / 1000).toFixed(2)} s`;
    },
    async onBackup() {
      this.creating = true;
      try {
        await runBackup();
        this.$message.success('备份完成');
        await this.fetchBackups();
        await this.fetchJobs();
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
        await downloadBackup(row.id);
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
        await this.fetchBackups();
        await this.fetchJobs();
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
        await this.fetchBackups();
        await this.fetchJobs();
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
.backup-page { padding: 16px; }
</style>
