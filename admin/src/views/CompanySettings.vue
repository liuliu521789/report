<template>
  <div class="company-page">
    <el-card>
      <template #header>
        <div class="field-header">
          <div>公司信息（页眉固定内容）</div>
        </div>
      </template>

      <el-form :model="form" label-width="120px" class="company-form" @submit.prevent>
        <el-form-item label="公司logo">
          <div class="logo-upload-row">
            <el-upload
              :action="uploadAction"
              :headers="uploadHeaders"
              :show-file-list="false"
              :before-upload="beforeUpload"
              :on-success="onUploadSuccess"
              :on-error="onUploadError"
            >
              <el-button size="small" type="primary">上传logo图片</el-button>
            </el-upload>
            <span class="upload-tip">建议使用透明底 PNG，展示效果更好。</span>
          </div>
          <div v-if="form.logoUrl" class="logo-preview-wrap">
            <el-link :href="form.logoUrl" target="_blank" class="logo-link">{{ form.logoUrl }}</el-link>
            <div class="logo-preview">
              <img :src="form.logoUrl" alt="logo" class="logo-preview-img" />
            </div>
          </div>
        </el-form-item>

        <el-form-item label="描述语（中文）">
          <el-input type="textarea" :rows="3" v-model="form.descriptionZh" />
        </el-form-item>
        <el-form-item label="Description (English)">
          <el-input type="textarea" :rows="3" v-model="form.descriptionEn" />
        </el-form-item>

        <el-form-item label="公司名称（中文）">
          <el-input v-model="form.companyNameZh" />
        </el-form-item>
        <el-form-item label="Company Name (English)">
          <el-input v-model="form.companyNameEn" />
        </el-form-item>

        <el-form-item label="报告名称（中文）">
          <el-input v-model="form.reportTitleZh" />
        </el-form-item>
        <el-form-item label="Report Title (English)">
          <el-input v-model="form.reportTitleEn" />
        </el-form-item>
      </el-form>

      <div class="actions">
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </el-card>
  </div>
</template>

<script>
import { mapState } from 'pinia';
import { getCompanySettings, updateCompanySettings } from '../api';
import { useAuthStore } from '../stores/auth';

export default {
  name: 'CompanySettings',
  data() {
    return {
      saving: false,
      form: {
        companyNameZh: '',
        companyNameEn: '',
        reportTitleZh: '',
        reportTitleEn: '',
        descriptionZh: '',
        descriptionEn: '',
        logoUrl: ''
      }
    };
  },
  computed: {
    ...mapState(useAuthStore, ['token']),
    uploadAction() {
      const base = import.meta.env.VITE_APP_API_BASE_URL || 'http://localhost:3001';
      return `${base}/api/company/settings/logo`;
    },
    uploadHeaders() {
      return this.token ? { Authorization: `Bearer ${this.token}` } : {};
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      const { settings } = await getCompanySettings();
      if (!settings) return;
      this.form = {
        companyNameZh: settings.companyNameZh || settings.company_name_zh || '',
        companyNameEn: settings.companyNameEn || settings.company_name_en || '',
        reportTitleZh: settings.reportTitleZh || settings.report_title_zh || '',
        reportTitleEn: settings.reportTitleEn || settings.report_title_en || '',
        descriptionZh: settings.descriptionZh || settings.description_zh || '',
        descriptionEn: settings.descriptionEn || settings.description_en || '',
        logoUrl: settings.logoUrl || settings.logo_url || ''
      };
    },
    beforeUpload(file) {
      const okType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
      const okSize = file.size / 1024 / 1024 <= 2;
      if (!okType) this.$message.error('仅支持 png/jpg/webp');
      if (!okSize) this.$message.error('图片大小不能超过 2MB');
      return okType && okSize;
    },
    onUploadSuccess(res) {
      if (res && res.logoUrl) {
        this.form.logoUrl = res.logoUrl;
        this.$message.success('logo上传成功');
      } else {
        this.$message.error('上传返回异常');
      }
    },
    onUploadError() {
      this.$message.error('logo上传失败');
    },
    async save() {
      this.saving = true;
      try {
        await updateCompanySettings({
          companyNameZh: this.form.companyNameZh,
          companyNameEn: this.form.companyNameEn,
          reportTitleZh: this.form.reportTitleZh,
          reportTitleEn: this.form.reportTitleEn,
          descriptionZh: this.form.descriptionZh,
          descriptionEn: this.form.descriptionEn,
          logoUrl: this.form.logoUrl || null
        });
        this.$message.success('保存成功');
      } catch (e) {
        this.$message.error(e?.response?.data?.error || '保存失败');
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
}

.field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.company-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.logo-upload-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.upload-tip {
  font-size: 12px;
  color: #64748b;
}

.logo-preview-wrap {
  margin-top: 10px;
}

.logo-link {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}

.logo-preview {
  margin-top: 10px;
}
.logo-preview-img {
  width: 120px;
  height: 120px;
  object-fit: contain;
  border: 1px dashed #ddd;
  border-radius: 10px;
  background: #fafafa;
}
.actions {
  text-align: right;
  margin-top: 12px;
}

@media (max-width: 992px) {
  .company-page :deep(.el-card__body) {
    padding: 12px;
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
  .logo-upload-row {
    width: 100%;
    align-items: stretch;
    gap: 6px;
  }
  .logo-upload-row :deep(.el-upload),
  .logo-upload-row :deep(.el-upload .el-button) {
    width: 100%;
  }
  .upload-tip {
    width: 100%;
  }
  .logo-link {
    width: 100%;
  }
  .logo-preview-img {
    width: 100px;
    height: 100px;
  }
  .actions {
    text-align: left;
    margin-top: 4px;
  }
  .actions .el-button {
    width: 100%;
    min-height: 38px;
  }
}
</style>

