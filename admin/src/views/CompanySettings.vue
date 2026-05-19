<template>
  <div class="company-page">
    <el-card>
      <template #header>
        <div class="field-header">
          <div>公司信息（页眉固定内容）</div>
        </div>
      </template>
      <el-alert
        v-if="!canManageCompany"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
        title="当前为只读查看，不可修改公司信息。"
      />

      <el-form :model="form" label-width="120px" class="company-form" @submit.prevent>
        <el-form-item label="公司logo">
          <div class="logo-upload-row">
            <el-upload
              v-if="canManageCompany"
              :action="uploadAction"
              :headers="uploadHeaders"
              :show-file-list="false"
              :before-upload="beforeUpload"
              :on-success="onUploadSuccess"
              :on-error="onUploadError"
            >
              <el-button size="small" type="primary" icon=Upload>上传logo图片</el-button>
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
          <el-input type="textarea" :rows="3" v-model="form.descriptionZh" :readonly="!canManageCompany" />
        </el-form-item>
        <el-form-item label="Description (English)">
          <el-input type="textarea" :rows="3" v-model="form.descriptionEn" :readonly="!canManageCompany" />
        </el-form-item>

        <el-form-item label="公司名称（中文）">
          <el-input v-model="form.companyNameZh" :readonly="!canManageCompany" />
        </el-form-item>
        <el-form-item label="Company Name (English)">
          <el-input v-model="form.companyNameEn" :readonly="!canManageCompany" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="form.email" :readonly="!canManageCompany" placeholder="例如：contact@company.com" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="form.address" :readonly="!canManageCompany" />
        </el-form-item>

      </el-form>

      <div v-if="canManageCompany" class="actions">
        <el-button type="primary" :loading="saving" @click="save" icon=Check>保存</el-button>
      </div>
    </el-card>

    <el-card v-if="isSuperAdminUser" class="quick-role-card" shadow="never">
      <template #header>
        <div class="field-header">
          <div>快捷角色账号（仅超级管理员）</div>
        </div>
      </template>
      <p class="quick-role-hint">
        在控制台点击「销售 / 财务 / 仓库」快捷入口时，将以此处绑定的<strong>员工账号</strong>重新登录，菜单与权限与该员工一致。请先在各「员工类别」中维护好对应权限，再创建员工并绑定到此处。
      </p>
      <p class="quick-role-hint">
        <strong>企业微信：</strong>销售提交订单财务审核时，系统会向此处「财务角色」对应员工发送企业微信（需在「员工账号」中为其填写与通讯录一致的
        UserID，并完成「企业微信通知」中的应用配置）。未绑定财务快捷账号时，将向所有「财务」类别且填写了 UserID 的员工推送。
      </p>
      <el-form label-width="120px" class="company-form" @submit.prevent>
        <el-form-item label="销售角色">
          <el-select
            v-model="quickRoles.salesUserId"
            clearable
            filterable
            placeholder="选择员工账号"
            class="w-full-select"
          >
            <el-option
              v-for="u in employeeOptions"
              :key="'s-' + u.id"
              :label="formatUserOption(u)"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="财务角色">
          <el-select
            v-model="quickRoles.financeUserId"
            clearable
            filterable
            placeholder="选择员工账号"
            class="w-full-select"
          >
            <el-option
              v-for="u in employeeOptions"
              :key="'f-' + u.id"
              :label="formatUserOption(u)"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="仓库角色">
          <el-select
            v-model="quickRoles.warehouseUserId"
            clearable
            filterable
            placeholder="选择员工账号"
            class="w-full-select"
          >
            <el-option
              v-for="u in employeeOptions"
              :key="'w-' + u.id"
              :label="formatUserOption(u)"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
<div class="actions">
        <el-button type="primary" :loading="quickRoleSaving" @click="saveQuickRoles" icon=Check>保存</el-button>
      </div>
    </el-card>

    <el-card v-if="isSuperAdminUser" class="backup-card" shadow="never">
      <template #header>
        <div class="field-header">
          <div>数据备份（仅超级管理员）</div>
        </div>
      </template>
      <p class="backup-hint">
        点击下方按钮，将下载当前数据库的完整 SQL 备份文件。建议定期备份，或在执行重要操作前备份。
      </p>
      <p class="backup-hint backup-hint-warning">
        注意：从 SQL 文件恢复仅恢复数据库数据，不会恢复 uploads 中的图片/附件文件（如公司章图片、公司 logo）。
      </p>
<div class="actions">
        <el-button type="warning" :loading="backingUp" icon="Download" @click="onBackup">下载 SQL 备份</el-button>
        <el-button icon="Upload" @click="restoreDialog = true">从 SQL 文件恢复</el-button>
      </div>
    </el-card>
  </div>

  <el-dialog title="从 SQL 文件恢复" v-model="restoreDialog" width="600px" :close-on-click-modal="false">
    <el-alert type="danger" :closable="false" show-icon style="margin-bottom: 16px">
      恢复将覆盖当前所有数据，建议先下载备份后再操作。
    </el-alert>
    <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 16px">
      仅恢复数据库，不恢复 uploads 文件；若需要恢复公司章/logo 等图片，请使用「备份管理」中的完整恢复。
    </el-alert>
    <el-upload
      ref="restoreUploadRef"
      :auto-upload="false"
      :limit="1"
      accept=".sql"
      :on-change="onRestoreFileChange"
    >
      <template #trigger>
        <el-button icon="Upload">选择 .sql 文件</el-button>
      </template>
      <template #tip>
        <div class="el-upload__tip">仅支持 .sql 文件，请确保文件由本系统备份生成</div>
      </template>
    </el-upload>
    <div v-if="restoreSql" style="margin-top: 12px">
      <el-input type="textarea" :rows="6" :value="restoreSql" readonly placeholder="已加载文件内容（只读）" />
    </div>
    <template #footer>
      <el-button @click="restoreDialog = false">取消</el-button>
      <el-button type="danger" :loading="restoreLoading" :disabled="!restoreSql" @click="onRestore">确认恢复</el-button>
    </template>
  </el-dialog>
</template>

<script>
import { mapState } from 'pinia';
import { getCompanySettings, getQuickRoleUsers, listUsersLite, updateCompanySettings, updateQuickRoleUsers, downloadBackup, restoreBackup } from '../api';
import { useAuthStore } from '../stores/auth';
import { isSuperAdmin, perm } from '../utils/permissions';
import { absoluteApiOrigin } from '../utils/absoluteApiOrigin.js';
import { startDownload } from '../composables/useDownloadProgress.js';

export default {
  name: 'CompanySettings',
  data() {
    return {
      saving: false,
      form: {
        companyNameZh: '',
        companyNameEn: '',
        email: '',
        address: '',
        reportTitleZh: '',
        reportTitleEn: '',
        descriptionZh: '',
        descriptionEn: '',
        logoUrl: ''
      },
      quickRoles: {
        salesUserId: null,
        financeUserId: null,
        warehouseUserId: null
      },
      employeeOptions: [],
      quickRoleSaving: false,
      backingUp: false,
      restoreDialog: false,
      restoreSql: '',
      restoreLoading: false
    };
  },
  computed: {
    ...mapState(useAuthStore, ['token']),
    isSuperAdminUser() {
      return isSuperAdmin();
    },
    canManageCompany() {
      return perm('company', 'manage');
    },
    uploadAction() {
      return `${absoluteApiOrigin()}/api/company/settings/logo`;
    },
    uploadHeaders() {
      return this.token ? { Authorization: `Bearer ${this.token}` } : {};
    }
  },
  mounted() {
    this.load();
    this.loadQuickRoleSection();
  },
  methods: {
    formatUserOption(u) {
      const cat = u.categoryNameZh || u.categoryCode || '';
      return cat ? `${u.username}（${cat}）` : u.username;
    },
    async loadQuickRoleSection() {
      if (!this.isSuperAdminUser) return;
      try {
        const [usersRes, qr] = await Promise.all([
          listUsersLite({ accountType: 'employee', activeOnly: 1 }),
          getQuickRoleUsers()
        ]);
        this.employeeOptions = usersRes?.items || [];
        this.quickRoles = {
          salesUserId: qr?.salesUserId ?? null,
          financeUserId: qr?.financeUserId ?? null,
          warehouseUserId: qr?.warehouseUserId ?? null
        };
      } catch {
        this.employeeOptions = [];
      }
    },
    async saveQuickRoles() {
      this.quickRoleSaving = true;
      try {
        await updateQuickRoleUsers({
          salesUserId: this.quickRoles.salesUserId,
          financeUserId: this.quickRoles.financeUserId,
          warehouseUserId: this.quickRoles.warehouseUserId
        });
        await this.loadQuickRoleSection();
        this.$message.success('快捷角色绑定已保存');
      } catch (e) {
        const err = e?.response?.data?.error;
        if (err === 'INVALID_QUICK_ROLE_USER') {
          this.$message.error('所选账号须为已启用的员工');
        } else {
          this.$message.error(this.$apiUserMsg(e, '保存失败'));
        }
      } finally {
        this.quickRoleSaving = false;
      }
    },
    async load() {
      const { settings } = await getCompanySettings();
      if (!settings) return;
      this.form = {
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
          email: this.form.email || null,
          address: this.form.address || null,
          reportTitleZh: this.form.reportTitleZh,
          reportTitleEn: this.form.reportTitleEn,
          descriptionZh: this.form.descriptionZh,
          descriptionEn: this.form.descriptionEn,
          logoUrl: this.form.logoUrl || null
        });
        this.$message.success('保存成功');
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '保存失败'));
      } finally {
        this.saving = false;
      }
    },
    async onBackup() {
      this.backingUp = true;
      try {
        const blob = await downloadBackup();
        startDownload({
          request: blob,
          filename: `backup_${new Date().toISOString().slice(0, 10)}.sql`,
          onSuccess: () => { this.$message.success('备份下载完成'); }
        });
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '备份失败'));
      } finally {
        this.backingUp = false;
      }
    },
    onRestoreFileChange(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.restoreSql = e.target.result;
      };
      reader.readAsText(file.raw);
    },
    async onRestore() {
      if (!this.restoreSql) return;
      try {
        await this.$confirm('数据将被完全覆盖，确定要恢复吗？', '危险操作', { type: 'error' });
      } catch {
        return;
      }
      this.restoreLoading = true;
      try {
        await restoreBackup(this.restoreSql);
        this.$message.success('数据恢复完成（仅数据库）');
        this.restoreDialog = false;
        this.restoreSql = '';
      } catch (e) {
        const msg = e?.response?.data?.error || this.$apiUserMsg(e, '恢复失败');
        this.$message.error(msg);
      } finally {
        this.restoreLoading = false;
      }
    }
  }
};
</script>

<style scoped>
.company-page {
  max-width: 920px;
}

.quick-role-card {
  margin-top: 16px;
}

.backup-card {
  margin-top: 16px;
}

.quick-role-hint {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  margin: 0 0 16px;
}

.backup-hint {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  margin: 0 0 16px;
}

.backup-hint-warning {
  color: #b45309;
}

.w-full-select {
  width: 100%;
  max-width: 420px;
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

