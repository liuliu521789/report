<template>
  <div>
    <el-card v-loading="loading">
      <div slot="header">系统安全策略（仅超级管理员）</div>
      <el-form v-if="form" :model="form" label-width="180px" style="max-width: 720px">
        <el-form-item label="密码最小长度">
          <el-input-number v-model="form.minPasswordLength" :min="4" :max="128" />
        </el-form-item>
        <el-form-item label="禁止的弱密码">
          <el-input v-model="bannedText" type="textarea" :rows="4" placeholder="每行一个" />
        </el-form-item>
        <el-form-item label="无操作自动退出(分钟)">
          <el-input-number v-model="form.idleTimeoutMinutes" :min="5" :max="1440" />
          <span class="hint">JWT 会话最长同步为此时间（不超过 12 小时）</span>
        </el-form-item>
        <el-form-item label="连续失败锁定次数">
          <el-input-number v-model="form.loginFailMaxAttempts" :min="3" :max="20" />
        </el-form-item>
        <el-form-item label="锁定时长(分钟)">
          <el-input-number v-model="form.loginLockMinutes" :min="5" :max="1440" />
        </el-form-item>
        <el-form-item label="敏感操作二次确认">
          <el-switch v-model="form.confirmSensitiveOperations" />
        </el-form-item>
        <el-form-item label="错误日志保留(天)">
          <el-input-number v-model="form.errorLogRetentionDays" :min="30" :max="3650" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script>
import { getSecuritySettings, updateSecuritySettings } from '../api';

export default {
  name: 'SecuritySettings',
  data() {
    return {
      loading: false,
      saving: false,
      form: null,
      bannedText: ''
    };
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const { settings } = await getSecuritySettings();
        this.form = { ...settings };
        this.bannedText = (settings.bannedPasswords || []).join('\n');
      } catch (e) {
        this.$message.error(e?.response?.data?.error || '加载失败');
      } finally {
        this.loading = false;
      }
    },
    async save() {
      const bannedPasswords = this.bannedText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      this.saving = true;
      try {
        const { settings } = await updateSecuritySettings({
          ...this.form,
          bannedPasswords
        });
        this.form = { ...settings };
        this.bannedText = (settings.bannedPasswords || []).join('\n');
        this.$message.success('已保存');
      } catch (e) {
        this.$message.error(e?.response?.data?.message || e?.response?.data?.error || '保存失败');
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<style scoped>
.hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}
</style>
