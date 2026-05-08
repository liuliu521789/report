<template>
  <div class="security-page">
    <el-card v-loading="loading">
      <template #header>
        <div>系统安全策略（仅超级管理员）</div>
      </template>
      <el-form v-if="form" :model="form" label-width="180px" class="security-form">
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
          <el-button type="primary" :loading="saving" @click="save" icon=Check>保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <el-card v-loading="loading" style="margin-top: 16px">
      <template #header>
        <div>系统备份配置（写入服务端 .env）</div>
      </template>
      <el-form v-if="backupForm" :model="backupForm" label-width="180px" class="security-form">
        <el-form-item label="启用定时备份">
          <el-switch v-model="backupForm.backupEnabled" />
        </el-form-item>
        <el-form-item label="备份Cron表达式">
          <el-input v-model="backupForm.backupCron" placeholder="例如：0 2 * * *" />
          <span class="hint">示例：`0 2 * * *` 表示每天凌晨 2 点</span>
        </el-form-item>
        <el-form-item label="备份保留天数">
          <el-input-number v-model="backupForm.backupRetentionDays" :min="1" :max="3650" />
        </el-form-item>
        <el-form-item label="失败告警Webhook">
          <el-input v-model="backupForm.backupAlertWebhookUrl" placeholder="企业微信机器人 webhook，可留空" />
        </el-form-item>
        <el-form-item label="告警级别阈值">
          <el-select v-model="backupForm.backupAlertLevel" style="width: 220px">
            <el-option label="关闭（不发机器人）" value="off" />
            <el-option label="错误及以上（推荐）" value="error" />
            <el-option label="仅严重" value="critical" />
          </el-select>
          <span class="hint">当前备份失败属于 error 级别</span>
        </el-form-item>
        <el-form-item label="同类告警限频(分钟)">
          <el-input-number v-model="backupForm.backupAlertDedupMinutes" :min="0" :max="1440" />
          <span class="hint">0 表示不去重；默认 10 分钟同类告警只发一次</span>
        </el-form-item>
        <el-form-item label="备份加密密钥">
          <el-input v-model="backupForm.backupEncryptionKey" show-password placeholder="建议使用高强度随机字符串" />
        </el-form-item>
        <el-form-item label="旧密钥(轮换过渡)">
          <el-input v-model="backupForm.backupEncryptionKeyOld" placeholder="多个用英文逗号分隔；平时可留空" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
          <span class="hint">保存后建议重启服务使配置立即生效</span>
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
      bannedText: '',
      backupForm: null
    };
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const result = await getSecuritySettings();
        const settings = result?.settings || {};
        this.form = { ...settings };
        this.bannedText = (settings.bannedPasswords || []).join('\n');
        this.backupForm = {
          backupEnabled: !!result?.backupConfig?.backupEnabled,
          backupCron: result?.backupConfig?.backupCron || '0 2 * * *',
          backupRetentionDays: Number(result?.backupConfig?.backupRetentionDays || 30),
          backupAlertWebhookUrl: result?.backupConfig?.backupAlertWebhookUrl || '',
          backupAlertLevel: result?.backupConfig?.backupAlertLevel || 'error',
          backupAlertDedupMinutes: Number(result?.backupConfig?.backupAlertDedupMinutes ?? 10),
          backupEncryptionKey: result?.backupConfig?.backupEncryptionKey || '',
          backupEncryptionKeyOld: result?.backupConfig?.backupEncryptionKeyOld || ''
        };
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载失败'));
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
        await updateSecuritySettings({
          ...this.form,
          bannedPasswords,
          backupConfig: { ...this.backupForm }
        });
        const saved = await getSecuritySettings();
        this.form = { ...saved.settings };
        this.bannedText = (saved.settings.bannedPasswords || []).join('\n');
        this.backupForm = {
          backupEnabled: !!saved?.backupConfig?.backupEnabled,
          backupCron: saved?.backupConfig?.backupCron || '0 2 * * *',
          backupRetentionDays: Number(saved?.backupConfig?.backupRetentionDays || 30),
          backupAlertWebhookUrl: saved?.backupConfig?.backupAlertWebhookUrl || '',
          backupAlertLevel: saved?.backupConfig?.backupAlertLevel || 'error',
          backupAlertDedupMinutes: Number(saved?.backupConfig?.backupAlertDedupMinutes ?? 10),
          backupEncryptionKey: saved?.backupConfig?.backupEncryptionKey || '',
          backupEncryptionKeyOld: saved?.backupConfig?.backupEncryptionKeyOld || ''
        };
        this.$message.success('已保存');
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '保存失败'));
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<style scoped>
.security-form {
  max-width: 720px;
}
.hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}
@media (max-width: 992px) {
  .security-form {
    max-width: 100%;
  }
  .security-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    margin-bottom: 6px;
  }
  .security-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .hint {
    margin-left: 0;
    width: 100%;
  }
}
</style>
