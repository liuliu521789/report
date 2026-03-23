<template>
  <div>
    <div class="toolbar">
      <div />
      <div>
        <el-button @click="load">刷新</el-button>
        <el-button type="primary" @click="dialog = true">新增印章</el-button>
      </div>
    </div>

    <el-table :data="items" border>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="sealType" label="印章类型" width="130">
        <template slot-scope="{ row }">
          <el-tag size="mini">{{ sealTypeLabel(row.sealType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column prop="imageUrl" label="图片URL">
        <template slot-scope="{ row }">
          <el-link :href="row.imageUrl" target="_blank">{{ row.imageUrl }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="isActive" label="激活" width="90">
        <template slot-scope="{ row }">
          <el-tag v-if="row.isActive" type="success">是</el-tag>
          <el-tag v-else type="info">否</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template slot-scope="{ row }">
          <el-button type="text" :disabled="row.isActive" @click="activate(row)">设为激活</el-button>
          <el-button type="text" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog title="新增印章" :visible.sync="dialog" width="520px">
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
        <el-button type="primary" :loading="saving" @click="create">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { activateStamp, createStamp, deleteStamp, listStamps } from '../api';

export default {
  name: 'Stamps',
  data() {
    return {
      items: [],
      dialog: false,
      saving: false,
      form: { sealType: 'department_qc', name: '', imageUrl: '', isActive: true }
    };
  },
  computed: {
    uploadAction() {
      const base = process.env.VUE_APP_API_BASE_URL || 'http://localhost:3001';
      return `${base}/api/stamps/upload`;
    },
    uploadHeaders() {
      const token = localStorage.getItem('token');
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      const { items } = await listStamps();
      this.items = items;
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
    }
  }
};
</script>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
.muted {
  color: #666;
  font-size: 12px;
}
.preview {
  width: 160px;
  height: 160px;
  object-fit: contain;
  border: 1px dashed #ddd;
  border-radius: 8px;
  background: #fafafa;
}
</style>

