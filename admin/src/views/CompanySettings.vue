<template>
  <div class="company-page" v-loading="pageLoading">
    <el-card class="page-header-card" shadow="never">
      <div class="page-head">
        <div class="page-head-text">
          <h2 class="page-title">公司信息</h2>
          <p class="page-desc">
            维护报告页眉中的公司名称、Logo、报告标题等对外展示内容；保存后新打印或新分享的报告将使用最新信息。
          </p>
        </div>
        <div v-if="canManageCompany" class="head-actions">
          <el-button :icon="RefreshLeft" :disabled="!isDirty || saving" @click="onResetForm">放弃修改</el-button>
          <el-button type="primary" :icon="Check" :loading="saving" :disabled="!isDirty" @click="save">保存</el-button>
        </div>
      </div>
      <el-alert
        v-if="!canManageCompany"
        type="info"
        :closable="false"
        show-icon
        class="readonly-alert"
        title="当前为只读查看，不可修改公司信息。"
      />
      <el-tag v-else-if="isDirty" type="warning" effect="plain" class="dirty-tag">有未保存的修改</el-tag>
    </el-card>

    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-head">
          <span>Logo 与品牌</span>
          <span class="section-sub">显示在报告页眉左上角</span>
        </div>
      </template>
      <el-form :model="form" label-width="120px" class="company-form" @submit.prevent>
        <el-form-item label="公司 Logo">
          <div class="logo-block">
            <div class="logo-preview-box" :class="{ empty: !form.logoUrl }">
              <img v-if="form.logoUrl" :src="form.logoUrl" alt="公司 Logo" class="logo-preview-img" />
              <div v-else class="logo-placeholder">
                <el-icon :size="28"><Picture /></el-icon>
                <span>暂未上传 Logo</span>
              </div>
            </div>
            <div class="logo-side">
              <div v-if="canManageCompany" class="logo-actions">
                <el-upload
                  :action="uploadAction"
                  :headers="uploadHeaders"
                  :show-file-list="false"
                  :before-upload="beforeUpload"
                  :on-success="onUploadSuccess"
                  :on-error="onUploadError"
                >
                  <el-button type="primary" :icon="Upload" :loading="logoUploading">
                    {{ form.logoUrl ? '更换 Logo' : '上传 Logo' }}
                  </el-button>
                </el-upload>
                <el-button
                  v-if="form.logoUrl"
                  type="danger"
                  plain
                  :icon="Delete"
                  @click="removeLogo"
                >
                  移除
                </el-button>
              </div>
              <p class="field-tip">建议使用透明底 PNG，大小不超过 2MB，展示效果更好。</p>
            </div>
          </div>
        </el-form-item>

        <el-divider content-position="left">公司名称</el-divider>
        <el-form-item label="中文名称">
          <el-input
            v-model="form.companyNameZh"
            :readonly="!canManageCompany"
            maxlength="128"
            show-word-limit
            placeholder="例如：某某化工有限公司"
          />
        </el-form-item>
        <el-form-item label="英文名称">
          <el-input
            v-model="form.companyNameEn"
            :readonly="!canManageCompany"
            maxlength="256"
            show-word-limit
            placeholder="e.g. Example Chemical Co., Ltd."
          />
        </el-form-item>

        <el-divider content-position="left">报告标题</el-divider>
        <el-form-item label="中文标题">
          <el-input
            v-model="form.reportTitleZh"
            :readonly="!canManageCompany"
            maxlength="128"
            show-word-limit
            placeholder="例如：产品质量检验报告单"
          />
        </el-form-item>
        <el-form-item label="英文标题">
          <el-input
            v-model="form.reportTitleEn"
            :readonly="!canManageCompany"
            maxlength="256"
            show-word-limit
            placeholder="e.g. Certificate of Analysis"
          />
        </el-form-item>

        <el-divider content-position="left">联系信息</el-divider>
        <el-form-item label="邮箱">
          <el-input
            v-model="form.email"
            :readonly="!canManageCompany"
            maxlength="128"
            placeholder="例如：contact@company.com"
          />
        </el-form-item>
        <el-form-item label="地址">
          <el-input
            v-model="form.address"
            :readonly="!canManageCompany"
            maxlength="256"
            show-word-limit
            placeholder="公司联系地址"
          />
        </el-form-item>

        <el-divider content-position="left">描述语</el-divider>
        <el-form-item label="中文描述">
          <el-input
            type="textarea"
            :rows="3"
            v-model="form.descriptionZh"
            :readonly="!canManageCompany"
            maxlength="256"
            show-word-limit
            placeholder="显示在报告页眉的简短中文描述"
          />
        </el-form-item>
        <el-form-item label="英文描述">
          <el-input
            type="textarea"
            :rows="3"
            v-model="form.descriptionEn"
            :readonly="!canManageCompany"
            maxlength="256"
            show-word-limit
            placeholder="Short English description shown in report header"
          />
        </el-form-item>
      </el-form>
    </el-card>

    <div v-if="canManageCompany && isDirty" class="sticky-save-bar">
      <span class="sticky-tip">有未保存的修改</span>
      <div class="sticky-actions">
        <el-button size="small" @click="onResetForm">放弃修改</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'pinia';
import { Check, Delete, Picture, RefreshLeft, Upload } from '@element-plus/icons-vue';
import { getCompanySettings, updateCompanySettings } from '../api';
import { useAuthStore } from '../stores/auth';
import { perm } from '../utils/permissions';
import { absoluteApiOrigin } from '../utils/absoluteApiOrigin.js';

const EMPTY_FORM = () => ({
  companyNameZh: '',
  companyNameEn: '',
  email: '',
  address: '',
  reportTitleZh: '',
  reportTitleEn: '',
  descriptionZh: '',
  descriptionEn: '',
  logoUrl: ''
});

function normalizeSettings(settings) {
  if (!settings) return EMPTY_FORM();
  return {
    companyNameZh: settings.companyNameZh || settings.company_name_zh || '',
    companyNameEn: settings.companyNameEn || settings.company_name_en || '',
    email: settings.email || settings.company_email || '',
    address: settings.address || settings.company_address || '',
    reportTitleZh: settings.reportTitleZh || settings.report_title_zh || '',
    reportTitleEn: settings.reportTitleEn || settings.report_title_en || '',
    descriptionZh: settings.descriptionZh || settings.description_zh || '',
    descriptionEn: settings.descriptionEn || settings.description_en || '',
    logoUrl: settings.logoUrl || settings.logo_url || ''
  };
}

export default {
  name: 'CompanySettings',
  data() {
    return {
      Check,
      Delete,
      Picture,
      RefreshLeft,
      Upload,
      pageLoading: false,
      saving: false,
      logoUploading: false,
      form: EMPTY_FORM(),
      savedForm: EMPTY_FORM()
    };
  },
  computed: {
    ...mapState(useAuthStore, ['token']),
    canManageCompany() {
      return perm('company', 'manage');
    },
    uploadAction() {
      return `${absoluteApiOrigin()}/api/company/settings/logo`;
    },
    uploadHeaders() {
      return this.token ? { Authorization: `Bearer ${this.token}` } : {};
    },
    isDirty() {
      return JSON.stringify(this.form) !== JSON.stringify(this.savedForm);
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      this.pageLoading = true;
      try {
        const { settings } = await getCompanySettings();
        const normalized = normalizeSettings(settings);
        this.form = { ...normalized };
        this.savedForm = { ...normalized };
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载公司信息失败'));
      } finally {
        this.pageLoading = false;
      }
    },
    onResetForm() {
      this.form = { ...this.savedForm };
    },
    removeLogo() {
      this.form.logoUrl = '';
    },
    beforeUpload(file) {
      const okType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
      const okSize = file.size / 1024 / 1024 <= 2;
      if (!okType) this.$message.error('仅支持 png / jpg / webp');
      if (!okSize) this.$message.error('图片大小不能超过 2MB');
      if (okType && okSize) this.logoUploading = true;
      return okType && okSize;
    },
    onUploadSuccess(res) {
      this.logoUploading = false;
      if (res && res.logoUrl) {
        this.form.logoUrl = res.logoUrl;
        this.$message.success('Logo 上传成功');
      } else {
        this.$message.error('上传返回异常');
      }
    },
    onUploadError() {
      this.logoUploading = false;
      this.$message.error('Logo 上传失败');
    },
    async save() {
      this.saving = true;
      try {
        await updateCompanySettings({
          companyNameZh: this.form.companyNameZh,
          companyNameEn: this.form.companyNameEn,
          email: this.form.email || null,
          address: this.form.address || null,
          reportTitleZh: this.form.reportTitleZh,
          reportTitleEn: this.form.reportTitleEn,
          descriptionZh: this.form.descriptionZh,
          descriptionEn: this.form.descriptionEn,
          logoUrl: this.form.logoUrl || null
        });
        this.savedForm = { ...this.form };
        this.$message.success('保存成功');
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
.company-page {
  max-width: 920px;
  padding-bottom: 72px;
}

.page-header-card {
  margin-bottom: 12px;
}

.page-header-card :deep(.el-card__body) {
  padding: 16px 18px;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.55;
}

.head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.readonly-alert {
  margin-top: 12px;
}

.dirty-tag {
  margin-top: 10px;
}

.section-card :deep(.el-card__header) {
  padding: 12px 16px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1e293b;
}

.section-sub {
  font-size: 12px;
  font-weight: 400;
  color: #94a3b8;
}

.company-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.company-form :deep(.el-divider__text) {
  font-size: 13px;
  color: #64748b;
}

.field-tip {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

.logo-block {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.logo-preview-box {
  width: 120px;
  height: 120px;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.logo-preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.logo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #94a3b8;
  font-size: 12px;
}

.logo-side {
  flex: 1;
  min-width: 200px;
}

.logo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.sticky-save-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px;
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid #e5e7eb;
  box-shadow: 0 -4px 16px rgba(15, 23, 42, 0.06);
}

.sticky-tip {
  font-size: 13px;
  color: #b45309;
}

.sticky-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 992px) {
  .page-head {
    flex-direction: column;
  }

  .head-actions {
    width: 100%;
  }

  .head-actions .el-button {
    flex: 1;
  }

  .company-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    margin-bottom: 6px;
    line-height: 1.3;
  }

  .company-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }

  .logo-block,
  .logo-side {
    width: 100%;
    min-width: 0;
  }

  .logo-actions {
    width: 100%;
  }

  .logo-actions :deep(.el-upload),
  .logo-actions :deep(.el-upload .el-button) {
    width: 100%;
  }

  .sticky-save-bar {
    padding: 10px 12px;
  }
}
</style>
