<template>
  <div>
    <div class="toolbar">
      <div>
        <el-button
          v-if="canBulkDelete"
          type="danger"
          plain
          icon="el-icon-delete"
          :disabled="selected.length === 0"
          @click="removeSelected"
        >
          批量删除
        </el-button>
      </div>
      <div>
        <el-button @click="load">刷新</el-button>
        <el-button type="primary" @click="openCreate">新增印章</el-button>
      </div>
    </div>

    <el-table class="stamps-table" :data="items" border size="small" row-key="id" @selection-change="selected = $event">
      <el-table-column type="selection" width="48" />
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="sealType" label="印章类型" width="130">
        <template slot-scope="{ row }">
          <el-tag size="mini">{{ sealTypeLabel(row.sealType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column label="印章预览" width="120" align="center">
        <template slot-scope="{ row }">
          <img
            v-if="row.imageUrl"
            :src="row.imageUrl"
            alt="seal-thumb"
            class="seal-thumb"
            @click="openPreview(row.imageUrl)"
          />
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="isActive" label="激活" width="90" align="center">
        <template slot-scope="{ row }">
          <el-tag v-if="row.isActive" type="success">是</el-tag>
          <el-tag v-else type="info">否</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="220" align="center">
        <template slot-scope="{ row }">
          <el-button type="text" :disabled="row.isActive" @click="activate(row)">设为激活</el-button>
          <el-button type="text" @click="openEdit(row)">修改</el-button>
          <el-button type="text" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog :title="editId ? '修改印章' : '新增印章'" :visible.sync="dialog" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="印章类型">
          <el-select v-model="form.sealType" style="width: 100%">
            <el-option label="质检章（盖部门）" value="department_qc" />
            <el-option label="主检章（盖主检）" value="inspector" />
            <el-option label="审核章（盖审核）" value="supervisor" />
            <el-option label="合格章（盖结论）" value="pass" />
            <el-option label="复检章（盖备注）" value="recheck" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="公司章图片">
          <el-upload
            :action="uploadAction"
            :headers="uploadHeaders"
            :show-file-list="false"
            :before-upload="beforeUpload"
            :on-success="onUploadSuccess"
            :on-error="onUploadError"
          >
            <el-button>选择图片并上传</el-button>
            <div slot="tip" class="el-upload__tip">支持 png/jpg/webp，建议透明背景，大小 ≤ 2MB</div>
          </el-upload>
          <div v-if="form.imageUrl" style="margin-top: 10px">
            <div class="muted" style="margin-bottom: 6px">已上传：</div>
            <el-link :href="form.imageUrl" target="_blank">{{ form.imageUrl }}</el-link>
            <div style="margin-top: 10px">
              <img :src="form.imageUrl" alt="stamp" class="preview" />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="设为激活">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">
          {{ editId ? '保存修改' : '保存' }}
        </el-button>
      </span>
    </el-dialog>

    <el-dialog
      title="印章预览"
      :visible.sync="previewDialog"
      width="520px"
      :close-on-click-modal="false"
    >
      <div v-if="previewImageUrl" class="preview-wrap">
        <img :src="previewImageUrl" alt="seal-preview" class="preview-image" />
      </div>
      <span slot="footer">
        <el-button @click="previewDialog = false">关闭</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { mapState } from 'pinia';
import { activateStamp, bulkDeleteStamps, createStamp, deleteStamp, listStamps, updateStamp } from '../api';
import { perm } from '../utils/permissions';
import { useAuthStore } from '../stores/auth';

export default {
  name: 'Stamps',
  data() {
    return {
      items: [],
      selected: [],
      dialog: false,
      saving: false,
      editId: null,
      previewDialog: false,
      previewImageUrl: '',
      form: { sealType: 'department_qc', name: '', imageUrl: '', isActive: true }
    };
  },
  computed: {
    ...mapState(useAuthStore, ['token']),
    canBulkDelete() {
      return perm('stamps', 'manage');
    },
    uploadAction() {
      const base = process.env.VUE_APP_API_BASE_URL || 'http://localhost:3001';
      return `${base}/api/stamps/upload`;
    },
    uploadHeaders() {
      return this.token ? { Authorization: `Bearer ${this.token}` } : {};
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    openCreate() {
      this.editId = null;
      this.previewDialog = false;
      this.previewImageUrl = '';
      this.form = { sealType: 'department_qc', name: '', imageUrl: '', isActive: true };
      this.dialog = true;
    },
    openEdit(row) {
      this.editId = row?.id ?? null;
      this.previewDialog = false;
      this.previewImageUrl = '';
      this.form = {
        sealType: row.sealType,
        name: row.name,
        imageUrl: row.imageUrl,
        isActive: !!row.isActive
      };
      this.dialog = true;
    },
    async load() {
      const { items } = await listStamps();
      this.items = items;
      this.selected = [];
    },
    async submit() {
      if (this.editId) return this.update();
      return this.create();
    },
    async create() {
      this.saving = true;
      try {
        if (!this.form.sealType) {
          this.$message.warning('请选择印章类型');
          return;
        }
        if (!this.form.imageUrl) {
          this.$message.warning('请先上传印章图片');
          return;
        }
        await createStamp(this.form);
        this.$message.success('已新增');
        this.dialog = false;
        this.form = { sealType: 'department_qc', name: '', imageUrl: '', isActive: true };
        this.load();
      } catch (e) {
        this.$message.error(e?.response?.data?.error || '新增失败');
      } finally {
        this.saving = false;
      }
    },
    async update() {
      this.saving = true;
      try {
        if (!this.editId) return;
        if (!this.form.sealType) {
          this.$message.warning('请选择印章类型');
          return;
        }
        if (!this.form.imageUrl) {
          this.$message.warning('请先上传印章图片');
          return;
        }
        await updateStamp(this.editId, this.form);
        this.$message.success('已修改');
        this.dialog = false;
        this.editId = null;
        this.form = { sealType: 'department_qc', name: '', imageUrl: '', isActive: true };
        await this.load();
      } catch (e) {
        this.$message.error(e?.response?.data?.error || '修改失败');
      } finally {
        this.saving = false;
      }
    },
    sealTypeLabel(v) {
      const map = {
        department_qc: '质检章',
        inspector: '主检章',
        supervisor: '审核章',
        pass: '合格章',
        recheck: '复检章'
      };
      return map[v] || v || '-';
    },
    beforeUpload(file) {
      const okType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
      const okSize = file.size / 1024 / 1024 <= 2;
      if (!okType) this.$message.error('仅支持 png/jpg/webp');
      if (!okSize) this.$message.error('图片大小不能超过 2MB');
      return okType && okSize;
    },
    onUploadSuccess(res) {
      if (res && res.imageUrl) {
        this.form.imageUrl = res.imageUrl;
        this.$message.success('上传成功');
      } else {
        this.$message.error('上传返回异常');
      }
    },
    onUploadError(err) {
      const code = err?.response?.data?.error;
      this.$message.error(code || '上传失败');
    },
    async activate(row) {
      await activateStamp(row.id);
      this.$message.success('已激活');
      this.load();
    },
    async remove(row) {
      await this.$confirm('确认删除该公司章？', '提示', { type: 'warning' });
      await deleteStamp(row.id);
      this.$message.success('已删除');
      this.load();
    },
    async removeSelected() {
      const ids = (this.selected || []).map((x) => x.id).filter(Boolean);
      if (!ids.length) return;
      try {
        await this.$confirm(`确认删除选中的 ${ids.length} 个公司章？删除后不可恢复`, '批量删除', { type: 'warning' });
        await bulkDeleteStamps(ids);
        this.$message.success('批量删除完成');
        this.selected = [];
        await this.load();
      } catch (_) {
        // cancelled
      }
    },
    openPreview(imageUrl) {
      if (!imageUrl) return;
      this.previewImageUrl = imageUrl;
      this.previewDialog = true;
    }
  }
};
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  align-items: center;
}
.muted {
  color: #666;
  font-size: 12px;
}
.preview {
  width: 140px;
  height: 140px;
  object-fit: contain;
  border: 1px dashed #ddd;
  border-radius: 8px;
  background: #fafafa;
}

.seal-thumb {
  width: 70px;
  height: 46px;
  object-fit: contain;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  display: block;
  margin: 0 auto;
}

.preview-wrap {
  display: flex;
  justify-content: center;
  padding: 10px 0;
}

.preview-image {
  max-width: 100%;
  max-height: 520px;
  object-fit: contain;
  border: 1px dashed #ddd;
  border-radius: 10px;
  background: #fafafa;
}

.stamps-table .el-table__cell {
  vertical-align: middle;
}

.stamps-table .el-button--text {
  padding-left: 6px;
  padding-right: 6px;
}
</style>

