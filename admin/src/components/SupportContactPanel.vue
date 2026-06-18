<template>
  <el-card shadow="never" class="support-panel">
    <div class="support-panel__inner">
      <div class="support-panel__main">
        <div class="support-panel__title-row">
          <el-icon class="support-panel__icon" :size="22"><ChatDotRound /></el-icon>
          <div>
            <div class="support-panel__title">需要技术支持？</div>
            <p v-if="supportReady" class="support-panel__desc">
              将通过<strong>企业微信</strong>通知{{ engineerLabel }}，对方会在企业微信收到您的求助，可直接回复。
            </p>
            <p v-else-if="loading" class="support-panel__desc">正在加载联系方式…</p>
            <p v-else class="support-panel__desc support-panel__desc--warn">
              {{ fallbackHint }}
            </p>
          </div>
        </div>
      </div>

      <div class="support-panel__actions">
        <el-button
          type="primary"
          size="large"
          :disabled="!supportReady || loading"
          :loading="requesting"
          @click="openRequestDialog"
        >
          <el-icon class="btn-ico"><Promotion /></el-icon>
          企业微信通知工程师
        </el-button>
        <el-button size="large" :disabled="loading" @click="copyHelpText">
          复制问题说明
        </el-button>
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      title="联系技术工程师"
      width="520px"
      append-to-body
      destroy-on-close
      @closed="onDialogClosed"
    >
      <p class="dialog-intro">
        点击发送后，系统会通过企业微信应用消息通知<strong>{{ engineerLabel }}</strong>，无需切换个人微信。
      </p>
      <el-input
        v-model.trim="requestMessage"
        type="textarea"
        :rows="4"
        maxlength="500"
        show-word-limit
        placeholder="简要说明您遇到的问题，例如：订单导入第 5 行报错、报告打印缺章…"
      />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="requesting" @click="submitRequest">发送</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script>
import { ChatDotRound, Promotion } from '@element-plus/icons-vue';
import { mapState } from 'pinia';
import { getSupportContact, requestSupportContact } from '../api';
import { useAuthStore } from '../stores/auth';

export default {
  name: 'SupportContactPanel',
  components: { ChatDotRound, Promotion },
  props: {
    pagePath: { type: String, default: '' }
  },
  data() {
    return {
      loading: false,
      requesting: false,
      dialogVisible: false,
      requestMessage: '',
      engineerWecomUserid: '',
      engineerDisplayName: '',
      wecomConfigured: false,
      supportReady: false
    };
  },
  computed: {
    ...mapState(useAuthStore, ['realName', 'username']),
    engineerLabel() {
      return (this.engineerDisplayName || '').trim() || '技术工程师';
    },
    actorLabel() {
      const real = (this.realName || '').trim();
      if (real) return real;
      return (this.username || '').trim() || '我';
    },
    fallbackHint() {
      if (!this.wecomConfigured) {
        return '企业微信应用尚未配置，暂无法发送通知。请联系有「企业微信通知」权限的同事完成配置。';
      }
      if (!this.engineerWecomUserid) {
        return '尚未配置技术工程师的企业微信 UserID。请联系有「技术支持联系」权限的同事维护。';
      }
      return '暂无法通过企业微信联系，请使用「复制问题说明」发给同事协助。';
    },
    helpTextTemplate() {
      const path = (this.pagePath || this.$route?.fullPath || '').trim();
      return [
        '【物源数智管控平台 · 技术支持】',
        `我是${this.actorLabel}，需要协助。`,
        path ? `当前页面：${path}` : '',
        '问题说明：（请补充）',
        '',
        '谢谢。'
      ]
        .filter(Boolean)
        .join('\n');
    }
  },
  mounted() {
    this.loadContact();
  },
  methods: {
    async loadContact() {
      this.loading = true;
      try {
        const data = await getSupportContact();
        this.engineerWecomUserid = (data.engineerWecomUserid || '').trim();
        this.engineerDisplayName = (data.engineerDisplayName || '').trim();
        this.wecomConfigured = !!data.wecomConfigured;
        this.supportReady = !!data.supportReady;
      } catch (_) {
        this.engineerWecomUserid = '';
        this.engineerDisplayName = '';
        this.wecomConfigured = false;
        this.supportReady = false;
      } finally {
        this.loading = false;
      }
    },
    openRequestDialog() {
      if (!this.supportReady) {
        this.$message.warning(this.fallbackHint);
        return;
      }
      this.dialogVisible = true;
    },
    onDialogClosed() {
      this.requestMessage = '';
    },
    async submitRequest() {
      if (!this.supportReady || this.requesting) return;
      this.requesting = true;
      try {
        const data = await requestSupportContact({
          message: this.requestMessage,
          pagePath: this.pagePath || this.$route?.fullPath || ''
        });
        this.dialogVisible = false;
        this.$message.success(data.message || '已通过企业微信通知技术工程师');
      } catch (e) {
        const msg = e?.response?.data?.message || this.$apiUserMsg(e, '发送失败，请稍后重试');
        this.$message.error(msg);
      } finally {
        this.requesting = false;
      }
    },
    async copyHelpText() {
      const text = this.helpTextTemplate;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          this.$message.success('已复制问题说明，可粘贴到企业微信或发给同事');
          return;
        } catch (_) {
          /* fall through */
        }
      }
      this.$message.info(text);
    }
  }
};
</script>

<style scoped>
.support-panel {
  margin-bottom: 0;
}

.support-panel :deep(.el-card__body) {
  padding: 18px 20px;
  background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
  border-radius: var(--radius, 14px);
}

.support-panel__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.support-panel__main {
  flex: 1;
  min-width: 240px;
}

.support-panel__title-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.support-panel__icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: #2563eb;
}

.support-panel__title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}

.support-panel__desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.55;
  max-width: 560px;
}

.support-panel__desc strong {
  color: #334155;
}

.support-panel__desc--warn {
  color: #b45309;
}

.support-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.btn-ico {
  margin-right: 6px;
  vertical-align: middle;
}

.dialog-intro {
  margin: 0 0 12px;
  font-size: 14px;
  color: #475569;
  line-height: 1.6;
}

@media (max-width: 992px) {
  .support-panel__inner {
    flex-direction: column;
    align-items: stretch;
  }

  .support-panel__actions {
    flex-direction: column;
  }

  .support-panel__actions .el-button {
    width: 100%;
    margin: 0;
  }
}
</style>
