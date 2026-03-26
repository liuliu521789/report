<template>
  <div>
    <el-card>
      <div slot="header" class="field-header">
        <div>公司信息（页眉固定内容）</div>
      </div>

      <el-form :model="form" label-width="120px">
        <el-form-item label="公司logo">
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
          <div v-if="form.logoUrl" style="margin-top: 10px">
            <el-link :href="form.logoUrl" target="_blank">{{ form.logoUrl }}</el-link>
            <div style="margin-top: 10px">
              <img :src="form.logoUrl" alt="logo" style="width: 120px; height: 120px; object-fit: contain; border: 1px dashed #ddd; border-radius: 10px; background: #fafafa;" />
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

      <div style="text-align:right; margin-top: 12px">
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
      const base = process.env.VUE_APP_API_BASE_URL || 'http://localhost:3001';
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
.field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>

