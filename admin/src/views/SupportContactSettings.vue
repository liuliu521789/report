<template>
  <div class="support-contact-page">
    <el-card v-loading="loading">
      <template #header>
        <div>技术支持联系（仅超级管理员）</div>
      </template>
      <el-form :model="form" label-width="140px" class="support-form" @submit.prevent>
        <el-form-item label="技术工程师微信号">
          <el-input
            v-model="form.engineerWechatId"
            maxlength="64"
            show-word-limit
            clearable
            placeholder="填写工程师微信账号（员工在侧栏「操作指南」中可复制）"
          />
        </el-form-item>
        <p class="hint-block">
          保存后，全体已登录员工在「操作指南」页面（侧栏底部入口）点击「联系技术工程师」，可将该微信号复制到剪贴板，再到微信中搜索添加或发起沟通。可留空，留空时员工将看到提示联系管理员。
        </p>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
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
      form: { engineerWechatId: '' }
    };
  },
  async mounted() {
    await this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const { engineerWechatId } = await getSupportContact();
        this.form.engineerWechatId = engineerWechatId || '';
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载失败'));
      } finally {
        this.loading = false;
      }
    },
    async save() {
      this.saving = true;
      try {
        const { engineerWechatId } = await updateSupportContact({
          engineerWechatId: this.form.engineerWechatId
        });
        this.form.engineerWechatId = engineerWechatId || '';
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
  max-width: 560px;
}
.hint-block {
  margin: -6px 0 18px;
  padding-left: 140px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.55;
  max-width: 700px;
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
  .hint-block {
    padding-left: 0;
    margin: 2px 0 14px;
  }
  .support-form .el-button {
    width: 100%;
  }
}
</style>
