<template>
  <div class="internal-models">
    <div class="page-header">
      <h2>内部型号管理</h2>
      <div class="toolbar">
        <el-input
          v-model="searchQuery"
          placeholder="搜索编码 / 名称"
          style="width: 280px"
          clearable
          @keyup.enter="loadData"
          @clear="loadData"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select
          v-model="statusFilter"
          placeholder="状态"
          style="width: 120px"
          clearable
          @change="loadData"
        >
          <el-option label="全部" value="" />
          <el-option label="启用" value="active" />
          <el-option label="停用" value="inactive" />
        </el-select>
        <el-button v-if="hasCreatePerm" type="primary" @click="openCreateDialog">
          新增内部型号
        </el-button>
        <el-upload
          v-if="hasEditPerm"
          :show-file-list="false"
          accept=".xlsx,.xls"
          :http-request="handleImportExcel"
          :disabled="importing"
        >
          <el-button type="success" :loading="importing">上传表格导入</el-button>
        </el-upload>
        <el-button
          v-if="multipleSelection.length > 0 && hasEditPerm"
          type="danger"
          @click="batchDelete"
        >
          批量删除 ({{ multipleSelection.length }})
        </el-button>
        <el-button
          v-if="multipleSelection.length > 0"
          type="warning"
          @click="exportSelected"
        >
          导出选中
        </el-button>
        <el-button @click="loadData">刷新</el-button>
      </div>
    </div>

    <el-alert
      class="import-hint"
      type="info"
      :closable="false"
      description="表格说明：两列表头为「名称」「英文代码」时，按表头列自动识别；英文代码写入内部编码，名称写入名称列。也支持无表头时前两列依次为名称、英文代码。首行表头会自动跳过。"
    />

    <el-table
      v-loading="loading"
      :data="modelList"
      border
      style="width: 100%"
      :default-sort="{ prop: 'internal_code', order: 'ascending' }"
      row-key="id"
      @selection-change="handleSelectionChange"
    >
      <el-table-column v-if="hasEditPerm" type="selection" width="48" />
      <el-table-column prop="internal_code" label="内部编码" width="140" sortable />
      <el-table-column prop="name" label="名称" min-width="200" sortable />
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-switch
            v-model="row.is_active"
            :active-value="1"
            :inactive-value="0"
            :disabled="!hasEditPerm"
            @change="(val) => toggleStatus(row.id, val)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="remarks" label="备注" min-width="180" show-overflow-tooltip />
      <el-table-column label="更新时间" width="160">
        <template #default="{ row }">
          {{ formatDateTime(row.updated_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="hasEditPerm"
            link
            type="primary"
            size="small"
            @click="openEditDialog(row)"
          >
            编辑
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="currentPage"
        :page-sizes="[10, 20, 50, 100]"
        :page-size="pageSize"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </div>

    <!-- Add/Edit Dialog -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="520px"
      @close="resetDialogForm"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="100px"
      >
        <el-form-item label="内部编码" prop="internal_code">
          <el-input 
            v-model="formData.internal_code" 
            placeholder="唯一编码，如 IM-001（支持字母数字-_）" 
            maxlength="64" 
            :disabled="dialogMode === 'edit'"
          />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="formData.name" placeholder="内部型号名称" maxlength="128" />
        </el-form-item>
        <el-form-item label="状态" prop="is_active">
          <el-switch v-model="formData.is_active" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input 
            v-model="formData.remarks" 
            type="textarea" 
            placeholder="可选备注信息" 
            maxlength="512" 
            :rows="3" 
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import {
  listSalesInternalModels,
  createSalesInternalModel,
  patchSalesInternalModel,
  batchDeleteInternalModels,
  importInternalModelsFromExcel
} from '../api';
import { perm } from '../utils/permissions';
import { formatDateTime } from '../utils/formatDateTime';
import { Search } from '@element-plus/icons-vue';

export default {
  name: 'InternalModels',
  components: {
    Search
  },
  data() {
    return {
      loading: false,
      modelList: [],
      searchQuery: '',
      statusFilter: '',
      currentPage: 1,
      pageSize: 20,
      total: 0,
      dialogVisible: false,
      dialogMode: 'create',
      saving: false,
      editingId: null,
      formData: {
        internal_code: '',
        name: '',
        is_active: true,
        remarks: ''
      },
      formRules: {
        internal_code: [
          { required: true, message: '请输入内部编码', trigger: 'blur' },
          { min: 1, max: 64, message: '编码长度1-64字符', trigger: 'blur' }
        ],
        name: [
          { required: true, message: '请输入名称', trigger: 'blur' },
          { min: 1, max: 128, message: '名称长度1-128字符', trigger: 'blur' }
        ]
      },
      multipleSelection: [],
      importing: false
    };
  },
  computed: {
    dialogTitle() {
      return this.dialogMode === 'create' ? '新增内部型号' : '编辑内部型号';
    },
    hasCreatePerm() {
      return perm('order_management', 'order_field_config');
    },
    hasEditPerm() {
      return perm('order_management', 'order_field_config');
    }
  },
  watch: {
    searchQuery(val) {
      if (!val) this.loadData();
    }
  },
  mounted() {
    this.loadData();
  },
  methods: {
    async loadData() {
      if (!this.hasEditPerm && !this.hasCreatePerm) return;
      this.loading = true;
      try {
        const params = {
          q: this.searchQuery || undefined,
          status: this.statusFilter || undefined,
          page: this.currentPage,
          pageSize: this.pageSize
        };
        const res = await listSalesInternalModels(params);
        this.modelList = (res.items || []).map(item => ({
          ...item,
          is_active: !!item.is_active
        }));
        this.total = res.pagination?.total || 0;
      } catch (e) {
        this.$message.error(this.apiUserMsg(e, '加载内部型号列表失败'));
        this.modelList = [];
      } finally {
        this.loading = false;
      }
    },
    handleSizeChange(size) {
      this.pageSize = size;
      this.currentPage = 1;
      this.loadData();
    },
    handlePageChange(page) {
      this.currentPage = page;
      this.loadData();
    },
    openCreateDialog() {
      this.dialogMode = 'create';
      this.editingId = null;
      this.formData = {
        internal_code: '',
        name: '',
        is_active: true,
        remarks: ''
      };
      this.dialogVisible = true;
    },
    openEditDialog(row) {
      this.dialogMode = 'edit';
      this.editingId = row.id;
      this.formData = {
        internal_code: row.internal_code || '',
        name: row.name || '',
        is_active: !!row.is_active,
        remarks: row.remarks || ''
      };
      this.dialogVisible = true;
    },
    resetDialogForm() {
      this.formData = {
        internal_code: '',
        name: '',
        is_active: true,
        remarks: ''
      };
      this.editingId = null;
      if (this.$refs.formRef) this.$refs.formRef.resetFields();
    },
    async submitForm() {
      if (!this.$refs.formRef) return;
      const valid = await this.$refs.formRef.validate().catch(() => false);
      if (!valid) return;

      this.saving = true;
      try {
        let res;
        const payload = {
          ...this.formData,
          is_active: this.formData.is_active ? 1 : 0
        };
        if (this.dialogMode === 'create') {
          res = await createSalesInternalModel(payload);
        } else {
          res = await patchSalesInternalModel(this.editingId, payload);
        }
        this.$message.success('操作成功');
        this.dialogVisible = false;
        this.loadData();
      } catch (e) {
        const errMsg = e.response?.data?.error || '';
        if (errMsg === 'DUPLICATE_INTERNAL_CODE') {
          this.$message.error('内部编码已存在，请使用其他编码');
        } else if (errMsg.includes('VALIDATION')) {
          this.$message.error('输入格式错误，请检查编码和名称');
        } else {
          this.$message.error(this.apiUserMsg(e, '保存失败'));
        }
      } finally {
        this.saving = false;
      }
    },
    async toggleStatus(id, isActive) {
      if (!this.hasEditPerm) return;
      try {
        await patchSalesInternalModel(id, { is_active: isActive ? 1 : 0 });
        // 不再显示单个提示，避免批量操作时提示框过多
      } catch (e) {
        this.$message.error(this.apiUserMsg(e, '状态切换失败'));
        this.loadData(); // revert
      }
    },
    formatDateTime(date) {
      return formatDateTime(date);
    },
    apiUserMsg(e, defaultMsg) {
      return e?.response?.data?.error || e?.message || defaultMsg || '操作失败';
    },
    handleSelectionChange(val) {
      this.multipleSelection = val || [];
    },
    async handleImportExcel({ file, onSuccess, onError }) {
      if (!this.hasEditPerm) return;
      this.importing = true;
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await importInternalModelsFromExcel(fd);
        const errN = Array.isArray(res.errors) ? res.errors.length : 0;
        this.$message.success(
          `导入完成：新增 ${res.inserted ?? 0} 条，更新 ${res.updated ?? 0} 条，跳过 ${res.skipped ?? 0} 行` +
            (errN ? `（${errN} 条有格式问题，详见控制台）` : '')
        );
        if (errN && res.errors?.length) {
          // eslint-disable-next-line no-console
          console.warn('内部型号导入问题行', res.errors);
        }
        this.multipleSelection = [];
        await this.loadData();
        onSuccess && onSuccess(res);
      } catch (e) {
        this.$message.error(this.apiUserMsg(e, '导入失败'));
        onError && onError(e);
      } finally {
        this.importing = false;
      }
    },
    async batchDelete() {
      if (!this.hasEditPerm || !this.multipleSelection.length) return;
      const ids = this.multipleSelection.map((r) => r.id);
      try {
        await this.$confirm(`确定删除选中的 ${ids.length} 条内部型号？此操作不可恢复。`, '确认删除', {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消'
        });
      } catch {
        return;
      }
      try {
        await batchDeleteInternalModels({ ids });
        this.$message.success('已删除');
        this.multipleSelection = [];
        this.loadData();
      } catch (e) {
        this.$message.error(this.apiUserMsg(e, '批量删除失败'));
      }
    },
    exportSelected() {
      if (!this.multipleSelection.length) return;
      const headers = ['内部编码', '名称', '状态', '备注'];
      const lines = [headers.join(',')];
      for (const row of this.multipleSelection) {
        const status = row.is_active ? '启用' : '停用';
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        lines.push([esc(row.internal_code), esc(row.name), esc(status), esc(row.remarks || '')].join(','));
      }
      const bom = '\uFEFF';
      const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `内部型号导出_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }
};
</script>

<style scoped>
.internal-models {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0;
  color: #333;
}
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}
.pagination-bar {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
.import-hint {
  margin-bottom: 16px;
}
</style>
