<template>
  <div class="ref-list-page security-page" v-loading="loading">
    <div class="page-head">
      <div class="page-head__filters">
        <span class="type-pill is-active">系统安全策略</span>
        <span v-if="isDirty" class="dirty-tag">有未保存的修改</span>
      </div>
      <div class="page-head__actions">
        <el-button :icon="Refresh" circle @click="load" />
        <el-button
          type="primary"
          class="btn-create"
          :icon="Check"
          :loading="saving"
          :disabled="!form || !isDirty"
          @click="save"
        >
          保存配置
        </el-button>
      </div>
    </div>

    <div v-if="form && backupForm" class="stack-panels">
      <div class="content-panel form-panel">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">密码与登录</h3>
            <p class="panel-desc">控制密码强度、会话超时与登录失败锁定策略。</p>
          </div>
        </div>
        <el-form :model="form" label-width="168px" class="ref-form security-form">
          <div class="form-section-title">密码策略</div>
          <el-form-item label="密码最小长度">
            <el-input-number v-model="form.minPasswordLength" :min="4" :max="128" />
          </el-form-item>
          <el-form-item label="禁止的弱密码">
            <el-input v-model="bannedText" type="textarea" :rows="4" placeholder="每行一个" />
            <p class="field-tip">用户设置密码时若命中列表中的任一项，将被拒绝。</p>
          </el-form-item>

          <div class="form-section-title">会话与锁定</div>
          <el-form-item label="无操作自动退出">
            <el-input-number v-model="form.idleTimeoutMinutes" :min="5" :max="1440" />
            <span class="field-tip">单位：分钟；JWT 会话最长同步为此时间（不超过 12 小时）。</span>
          </el-form-item>
          <el-form-item label="连续失败锁定次数">
            <el-input-number v-model="form.loginFailMaxAttempts" :min="3" :max="20" />
          </el-form-item>
          <el-form-item label="锁定时长">
            <el-input-number v-model="form.loginLockMinutes" :min="5" :max="1440" />
            <span class="field-tip">单位：分钟。</span>
          </el-form-item>

          <div class="form-section-title">日志保留</div>
          <p class="field-tip log-retention-intro">
            超出保留期的记录会在服务启动、定时任务（默认每 24 小时）及打开对应日志页时自动删除。
          </p>
          <el-form-item label="登录日志保留">
            <el-input-number v-model="form.loginLogRetentionDays" :min="30" :max="3650" />
            <span class="field-tip">单位：天；可在「登录日志」中查看。</span>
          </el-form-item>
          <el-form-item label="操作日志保留">
            <el-input-number v-model="form.operationLogRetentionDays" :min="30" :max="3650" />
            <span class="field-tip">单位：天；可在「操作日志」中查看。</span>
          </el-form-item>
          <el-form-item label="错误日志保留">
            <el-input-number v-model="form.errorLogRetentionDays" :min="30" :max="3650" />
            <span class="field-tip">单位：天；可在「错误日志」中查看。</span>
          </el-form-item>

          <div class="form-section-title">其他</div>
          <el-form-item label="敏感操作二次确认">
            <el-switch v-model="form.confirmSensitiveOperations" />
          </el-form-item>
        </el-form>
      </div>

      <div class="content-panel form-panel">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">定时备份调度</h3>
            <p class="panel-desc">
              写入服务端 .env；备份包管理见
              <router-link to="/backups" class="inline-link">备份与恢复</router-link>。
            </p>
          </div>
        </div>
        <el-form :model="backupForm" label-width="168px" class="ref-form security-form">
          <div class="form-section-title">调度</div>
          <el-form-item label="启用定时备份">
            <el-switch v-model="backupForm.backupEnabled" />
          </el-form-item>
          <el-form-item label="Cron 表达式">
            <el-input v-model="backupForm.backupCron" placeholder="例如：0 2 * * *" />
            <p class="field-tip">示例 <code>0 2 * * *</code> 表示每天凌晨 2 点执行。</p>
          </el-form-item>
          <el-form-item label="备份保留天数">
            <el-input-number v-model="backupForm.backupRetentionDays" :min="1" :max="3650" />
          </el-form-item>

          <div class="form-section-title">告警</div>
          <el-form-item label="失败告警 Webhook">
            <el-input v-model="backupForm.backupAlertWebhookUrl" placeholder="企业微信机器人 webhook，可留空" />
          </el-form-item>
          <el-form-item label="告警级别阈值">
            <el-select v-model="backupForm.backupAlertLevel" style="width: 220px">
              <el-option label="关闭（不发机器人）" value="off" />
              <el-option label="错误及以上（推荐）" value="error" />
              <el-option label="仅严重" value="critical" />
            </el-select>
            <p class="field-tip">当前备份失败属于 error 级别。</p>
          </el-form-item>
          <el-form-item label="同类告警限频">
            <el-input-number v-model="backupForm.backupAlertDedupMinutes" :min="0" :max="1440" />
            <span class="field-tip">单位：分钟；0 表示不去重。</span>
          </el-form-item>

          <div class="form-section-title">加密</div>
          <el-form-item label="备份加密密钥">
            <el-input v-model="backupForm.backupEncryptionKey" show-password placeholder="建议使用高强度随机字符串" />
          </el-form-item>
          <el-form-item label="旧密钥（轮换）">
            <el-input v-model="backupForm.backupEncryptionKeyOld" placeholder="多个用英文逗号分隔；平时可留空" />
          </el-form-item>
          <p class="field-tip panel-save-tip">保存后建议重启服务使 .env 配置立即生效。</p>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script>
import { Check, Refresh } from '@element-plus/icons-vue';
import { getSecuritySettings, updateSecuritySettings } from '../api';

function snapshotState(form, bannedText, backupForm) {
  return JSON.stringify({
    form: form ? { ...form } : null,
    bannedText: String(bannedText || ''),
    backupForm: backupForm ? { ...backupForm } : null
  });
}

export default {
  name: 'SecuritySettings',
  data() {
    return {
      Check,
      Refresh,
      loading: false,
      saving: false,
      loaded: false,
      savedSnapshot: '',
      form: null,
      bannedText: '',
      backupForm: null
    };
  },
  computed: {
    isDirty() {
      if (!this.loaded || !this.form || !this.backupForm) return false;
      return snapshotState(this.form, this.bannedText, this.backupForm) !== this.savedSnapshot;
    }
  },
  async mounted() {
    await this.load();
  },
  methods: {
    applyData(result) {
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
      this.savedSnapshot = snapshotState(this.form, this.bannedText, this.backupForm);
      this.loaded = true;
    },
    async load() {
      this.loading = true;
      try {
        const result = await getSecuritySettings();
        this.applyData(result);
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
        this.applyData(saved);
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
@import '../styles/refListPage.css';

.panel-save-tip {
  margin: 4px 20px 0;
  padding-left: 168px;
}
.log-retention-intro {
  margin: 0 0 12px;
  padding-left: 168px;
}
@media (max-width: 992px) {
  .panel-save-tip,
  .log-retention-intro {
    padding-left: 0;
  }
}
</style>
