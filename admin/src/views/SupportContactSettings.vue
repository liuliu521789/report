<template>
  <div class="ref-list-page support-contact-page" v-loading="loading">
    <div class="page-head">
      <div class="page-head__filters">
        <span class="readiness-badge" :class="supportReady ? 'is-ready' : 'is-pending'">
          <el-icon><component :is="supportReady ? CircleCheck : WarningFilled" /></el-icon>
          {{ supportReady ? '员工端可发送通知' : '配置未完成' }}
        </span>
        <span v-if="isDirty" class="dirty-tag">有未保存的修改</span>
      </div>
      <div class="page-head__actions">
        <el-button :icon="Refresh" circle @click="load" />
        <el-button
          type="primary"
          class="btn-create"
          :icon="Check"
          :loading="saving"
          :disabled="!isDirty"
          @click="save"
        >
          保存配置
        </el-button>
      </div>
    </div>

    <div class="page-grid">
      <div class="page-main">
        <div class="content-panel form-panel">
          <div class="panel-head">
            <div>
              <h3 class="panel-title">工程师联系方式</h3>
              <p class="panel-desc">员工在「操作指南」中通过企业微信向该工程师发送求助消息。</p>
            </div>
          </div>

          <el-form :model="form" label-width="132px" class="support-form" @submit.prevent>
            <div class="form-section-title">对外展示</div>
            <el-form-item label="显示名称">
              <el-input
                v-model="form.engineerDisplayName"
                maxlength="64"
                show-word-limit
                clearable
                placeholder="例如：技术支持-李工"
              />
              <p class="field-tip">员工在操作指南中看到的工程师称呼；留空则显示「技术工程师」。</p>
            </el-form-item>

            <div class="form-section-title">企业微信（主通道）</div>
            <el-form-item label="UserID">
              <el-input
                v-model="form.engineerWecomUserid"
                maxlength="64"
                show-word-limit
                clearable
                placeholder="工程师在企业微信通讯录中的 UserID"
              />
              <p class="field-tip">
                须与企业微信成员 UserID 一致，可在
                <router-link to="/wecom-notifications" class="inline-link">企业微信通知</router-link>
                或员工账号中对照维护。
              </p>
            </el-form-item>

            <div class="form-section-title">备用方式</div>
            <el-form-item label="个人微信号">
              <el-input
                v-model="form.engineerWechatId"
                maxlength="64"
                show-word-limit
                clearable
                placeholder="可选；主通道为企业微信应用消息"
              />
              <p class="field-tip">仅作内部记录备用，员工端默认通过企业微信通知，不直接展示微信号。</p>
            </el-form-item>
          </el-form>
        </div>
      </div>

      <aside class="page-aside">
        <div class="aside-card status-card">
          <h4 class="aside-title">配置状态</h4>
          <ul class="status-list">
            <li v-for="item in statusItems" :key="item.key" class="status-item">
              <span :class="['status-dot', item.ok ? 'is-ok' : 'is-warn']" />
              <div class="status-body">
                <span class="status-label">{{ item.label }}</span>
                <span class="status-value">{{ item.text }}</span>
              </div>
            </li>
          </ul>
        </div>

        <div class="aside-card preview-card">
          <h4 class="aside-title">员工端预览</h4>
          <div class="preview-box">
            <div class="preview-row">
              <el-icon class="preview-icon"><ChatDotRound /></el-icon>
              <div>
                <div class="preview-heading">需要技术支持？</div>
                <p v-if="supportReady" class="preview-text">
                  将通过<strong>企业微信</strong>通知{{ engineerLabel }}，对方会在企业微信收到您的求助。
                </p>
                <p v-else class="preview-text preview-text--warn">{{ previewWarnText }}</p>
              </div>
            </div>
            <el-button type="primary" class="preview-btn" disabled>
              <el-icon class="preview-btn-icon"><Promotion /></el-icon>
              企业微信通知工程师
            </el-button>
          </div>
        </div>

        <div class="aside-card steps-card">
          <h4 class="aside-title">配置指引</h4>
          <ol class="steps-list">
            <li :class="{ done: wecomConfigured }">
              在
              <router-link to="/wecom-notifications" class="inline-link">企业微信通知</router-link>
              完成 corpId、AgentId、Secret 绑定
            </li>
            <li :class="{ done: !!form.engineerWecomUserid.trim() }">
              填写上方工程师企业微信 UserID
            </li>
            <li :class="{ done: supportReady }">
              保存后，员工可在操作指南一键发送求助
            </li>
          </ol>
        </div>
      </aside>
    </div>
  </div>
</template>

<script>
import {
  ChatDotRound,
  Check,
  CircleCheck,
  Promotion,
  Refresh,
  WarningFilled
} from '@element-plus/icons-vue';
import { getSupportContact, updateSupportContact } from '../api';

function snapshotForm(form) {
  return {
    engineerWecomUserid: String(form.engineerWecomUserid || '').trim(),
    engineerDisplayName: String(form.engineerDisplayName || '').trim(),
    engineerWechatId: String(form.engineerWechatId || '').trim()
  };
}

export default {
  name: 'SupportContactSettings',
  components: { ChatDotRound, CircleCheck, WarningFilled, Promotion },
  data() {
    return {
      Check,
      Refresh,
      ChatDotRound,
      Promotion,
      CircleCheck,
      WarningFilled,
      loading: false,
      saving: false,
      loaded: false,
      wecomConfigured: false,
      savedSnapshot: '',
      form: {
        engineerWecomUserid: '',
        engineerDisplayName: '',
        engineerWechatId: ''
      }
    };
  },
  computed: {
    engineerLabel() {
      return this.form.engineerDisplayName.trim() || '技术工程师';
    },
    supportReady() {
      return this.wecomConfigured && !!this.form.engineerWecomUserid.trim();
    },
    isDirty() {
      return this.loaded && JSON.stringify(snapshotForm(this.form)) !== this.savedSnapshot;
    },
    previewWarnText() {
      if (!this.wecomConfigured) {
        return '企业微信应用尚未配置完整，员工端暂无法发送通知。';
      }
      if (!this.form.engineerWecomUserid.trim()) {
        return '尚未配置工程师 UserID，请填写后保存。';
      }
      return '配置未完成，请检查上方表单。';
    },
    statusItems() {
      return [
        {
          key: 'wecom',
          label: '企业微信应用',
          ok: this.wecomConfigured,
          text: this.wecomConfigured ? '已配置 corpId / Agent / Secret' : '未配置或信息不完整'
        },
        {
          key: 'userid',
          label: '工程师 UserID',
          ok: !!this.form.engineerWecomUserid.trim(),
          text: this.form.engineerWecomUserid.trim() || '未填写'
        },
        {
          key: 'name',
          label: '对外显示名称',
          ok: !!this.form.engineerDisplayName.trim(),
          text: this.form.engineerDisplayName.trim() || '将显示为「技术工程师」'
        },
        {
          key: 'ready',
          label: '员工端通知',
          ok: this.supportReady,
          text: this.supportReady ? '可正常发送企业微信求助' : '暂不可用'
        }
      ];
    }
  },
  async mounted() {
    await this.load();
  },
  methods: {
    applyData(data) {
      this.form.engineerWecomUserid = data.engineerWecomUserid || '';
      this.form.engineerDisplayName = data.engineerDisplayName || '';
      this.form.engineerWechatId = data.engineerWechatId || '';
      this.wecomConfigured = !!data.wecomConfigured;
      this.savedSnapshot = JSON.stringify(snapshotForm(this.form));
      this.loaded = true;
    },
    async load() {
      this.loading = true;
      try {
        const data = await getSupportContact();
        this.applyData(data);
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载失败'));
      } finally {
        this.loading = false;
      }
    },
    async save() {
      this.saving = true;
      try {
        const data = await updateSupportContact({
          engineerWecomUserid: this.form.engineerWecomUserid,
          engineerDisplayName: this.form.engineerDisplayName,
          engineerWechatId: this.form.engineerWechatId
        });
        this.applyData(data);
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

.readiness-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
}
.readiness-badge.is-ready {
  background: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}
.readiness-badge.is-pending {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
}
.dirty-tag {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.page-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  align-items: start;
}
.page-main {
  min-width: 0;
}
.form-panel {
  padding: 0;
}
.panel-head {
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
}
.panel-title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}
.panel-desc {
  margin: 0;
  font-size: 13px;
  color: var(--ref-muted);
  line-height: 1.5;
}
.support-form {
  padding: 8px 20px 20px;
  max-width: 640px;
}
.form-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ref-text);
  margin: 16px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid #eef2f7;
}
.form-section-title:first-child {
  margin-top: 8px;
}
.field-tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--ref-muted);
  line-height: 1.5;
}
.inline-link {
  color: var(--ref-primary);
  text-decoration: none;
}
.inline-link:hover {
  text-decoration: underline;
}

.page-aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.aside-card {
  background: #fff;
  border: 1px solid var(--ref-border);
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}
.aside-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.status-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.status-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.status-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
}
.status-dot.is-ok {
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
}
.status-dot.is-warn {
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
}
.status-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.status-label {
  font-size: 13px;
  font-weight: 500;
  color: #334155;
}
.status-value {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.45;
  word-break: break-word;
}

.preview-box {
  padding: 12px;
  border-radius: 10px;
  background: linear-gradient(135deg, #f8fafc 0%, #eef4ff 100%);
  border: 1px solid #e8edf3;
}
.preview-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}
.preview-icon {
  flex-shrink: 0;
  font-size: 22px;
  color: var(--ref-primary);
  margin-top: 2px;
}
.preview-heading {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
}
.preview-text {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.55;
}
.preview-text strong {
  color: #334155;
}
.preview-text--warn {
  color: #b45309;
}
.preview-btn {
  width: 100%;
  background: var(--ref-primary);
  border-color: var(--ref-primary);
  opacity: 0.72;
}
.preview-btn-icon {
  margin-right: 4px;
}

.steps-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #475569;
  line-height: 1.55;
}
.steps-list li {
  margin-bottom: 8px;
}
.steps-list li:last-child {
  margin-bottom: 0;
}
.steps-list li.done {
  color: #059669;
}

@media (max-width: 992px) {
  .page-grid {
    grid-template-columns: 1fr;
  }
  .page-aside {
    order: -1;
  }
  .support-form {
    max-width: 100%;
  }
  .support-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    margin-bottom: 6px;
  }
  .support-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }
  .page-head__actions .btn-create {
    flex: 1;
  }
}
</style>
