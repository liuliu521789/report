<template>
  <div class="support-contact-page">
    <el-card v-loading="loading">
      <template #header>
        <div>技术支持联系（仅超级管理员）</div>
      </template>
      <el-form :model="form" label-width="160px" class="support-form" @submit.prevent>
        <el-form-item label="工程师显示名称">
          <el-input
            v-model="form.engineerDisplayName"
            maxlength="64"
            show-word-limit
            clearable
            placeholder="例如：技术支持-李工（员工在操作指南中可见）"
          />
        </el-form-item>
        <el-form-item label="企业微信 UserID">
          <el-input
            v-model="form.engineerWecomUserid"
            maxlength="64"
            show-word-limit
            clearable
            placeholder="工程师在企业微信中的成员 UserID"
          />
        </el-form-item>
        <el-form-item label="个人微信号（备用）">
          <el-input
            v-model="form.engineerWechatId"
            maxlength="64"
            show-word-limit
            clearable
            placeholder="可选；主通道为企业微信应用消息"
          />
        </el-form-item>
        <p class="hint-block">
          保存后，员工在「操作指南」点击<strong>企业微信通知工程师</strong>，系统会通过已配置的企业微信应用向该 UserID 发送求助消息（含员工姓名与问题说明）。
          须先在「企业微信通知 → 企业与应用绑定」中配置 corpId、AgentId、Secret。
          UserID 可在「企业微信通知 → 通知对象」或「员工账号」中对照维护。
        </p>
        <el-alert
          v-if="loaded && !wecomConfigured"
          type="warning"
          :closable="false"
          show-icon
          class="cfg-alert"
          title="企业微信应用尚未配置完整，员工端将无法发送技术支持通知。"
        />
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save" icon="Check">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script>
import { getSupportContact, updateSupportContact } from '../api';

export default {
  name: 'SupportContactSettings',
  data() {
    return {
      loading: false,
      saving: false,
      loaded: false,
      wecomConfigured: false,
      form: {
        engineerWecomUserid: '',
        engineerDisplayName: '',
        engineerWechatId: ''
      }
    };
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const data = await getSupportContact();
        this.form.engineerWecomUserid = data.engineerWecomUserid || '';
        this.form.engineerDisplayName = data.engineerDisplayName || '';
        this.form.engineerWechatId = data.engineerWechatId || '';
        this.wecomConfigured = !!data.wecomConfigured;
        this.loaded = true;
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
        this.form.engineerWecomUserid = data.engineerWecomUserid || '';
        this.form.engineerDisplayName = data.engineerDisplayName || '';
        this.form.engineerWechatId = data.engineerWechatId || '';
        this.wecomConfigured = !!data.wecomConfigured;
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
.support-form {
  max-width: 620px;
}
.hint-block {
  margin: -6px 0 18px;
  padding-left: 160px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.55;
  max-width: 700px;
}
.cfg-alert {
  max-width: 620px;
  margin: 0 0 16px 160px;
}
@media (max-width: 992px) {
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
  .hint-block,
  .cfg-alert {
    padding-left: 0;
    margin-left: 0;
  }
  .support-form .el-button {
    width: 100%;
  }
}
</style>
