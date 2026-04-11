<template>
  <div class="categories-page">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增类别</el-button>
      <span class="hint">内置「品管」「客服」「董事长」不可删除；可新增其他类别并配置默认权限。</span>
    </div>

    <el-table v-loading="loading" :data="items" border class="desktop-table">
      <el-table-column prop="id" label="ID" width="72" />
      <el-table-column prop="nameZh" label="名称" min-width="120" />
      <el-table-column prop="code" label="代码" width="120" />
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link @click="openEdit(row)">编辑</el-button>
          <el-button
            link
            :disabled="row.code === 'qc' || row.code === 'cs' || row.code === 'chairman'"
            @click="onDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="mobile-list" v-loading="loading">
      <div v-for="row in items" :key="'m-' + row.id" class="mobile-card">
        <div class="mobile-head">
          <strong>{{ row.nameZh }}</strong>
          <span class="mobile-code">{{ row.code }}</span>
        </div>
        <div class="mobile-line"><span>ID</span><span>{{ row.id }}</span></div>
        <div class="mobile-line"><span>排序</span><span>{{ row.sortOrder }}</span></div>
        <div class="mobile-actions">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button
            size="small"
            :disabled="row.code === 'qc' || row.code === 'cs' || row.code === 'chairman'"
            @click="onDelete(row)"
          >
            删除
          </el-button>
        </div>
      </div>
      <el-empty v-if="!items.length && !loading" description="暂无类别" />
    </div>

    <el-dialog :title="dialogMode === 'create' ? '新增员工类别' : '编辑员工类别'" v-model="dialog" width="560px" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" class="categories-form">
        <el-form-item v-if="dialogMode === 'create'" label="代码" prop="code">
          <el-input v-model="form.code" placeholder="英文标识，如 warehouse" maxlength="32" />
        </el-form-item>
        <el-form-item label="名称" prop="nameZh">
          <el-input v-model="form.nameZh" maxlength="64" />
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="强制双因素认证">
          <el-switch v-model="form.requireTwoFactor" active-text="开启" inactive-text="关闭" />
          <div class="sub-hint">开启后，该类员工须绑定验证器 App，登录时除密码外需输入 6 位动态码（如董事长岗位）。</div>
        </el-form-item>
        <el-form-item label="默认权限">
          <permission-toggles v-model="form.defaultPermissions" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import {
  createEmployeeCategory,
  deleteEmployeeCategory,
  listEmployeeCategories,
  updateEmployeeCategory
} from '../api';
import PermissionToggles from '../components/PermissionToggles.vue';

export default {
  name: 'EmployeeCategories',
  components: { PermissionToggles },
  data() {
    return {
      loading: false,
      items: [],
      dialog: false,
      dialogMode: 'create',
      saving: false,
      editingId: null,
      form: {
        code: '',
        nameZh: '',
        sortOrder: 0,
        requireTwoFactor: false,
        defaultPermissions: {}
      },
      rules: {
        code: [{ required: true, message: '请输入代码', trigger: 'blur' }],
        nameZh: [{ required: true, message: '请输入名称', trigger: 'blur' }]
      }
    };
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const { items } = await listEmployeeCategories();
        this.items = items || [];
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载失败'));
      } finally {
        this.loading = false;
      }
    },
    openCreate() {
      this.dialogMode = 'create';
      this.resetForm();
      this.dialog = true;
    },
    openEdit(row) {
      this.dialogMode = 'edit';
      this.editingId = row.id;
      this.form = {
        code: row.code,
        nameZh: row.nameZh,
        sortOrder: row.sortOrder,
        requireTwoFactor: !!row.requireTwoFactor,
        defaultPermissions: row.defaultPermissions ? { ...row.defaultPermissions } : {}
      };
      this.dialog = true;
    },
    resetForm() {
      this.editingId = null;
      this.form = {
        code: '',
        nameZh: '',
        sortOrder: 0,
        requireTwoFactor: false,
        defaultPermissions: {}
      };
      this.$nextTick(() => this.$refs.formRef && this.$refs.formRef.clearValidate());
    },
    async submit() {
      this.$refs.formRef.validate(async (ok) => {
        if (!ok) return;
        this.saving = true;
        try {
          if (this.dialogMode === 'create') {
            await createEmployeeCategory({
              code: this.form.code.trim().toLowerCase(),
              nameZh: this.form.nameZh.trim(),
              sortOrder: this.form.sortOrder,
              requireTwoFactor: this.form.requireTwoFactor,
              defaultPermissions: this.form.defaultPermissions
            });
            this.$message.success('已创建');
          } else {
            await updateEmployeeCategory(this.editingId, {
              nameZh: this.form.nameZh.trim(),
              sortOrder: this.form.sortOrder,
              requireTwoFactor: this.form.requireTwoFactor,
              defaultPermissions: this.form.defaultPermissions
            });
            this.$message.success('已保存');
          }
          this.dialog = false;
          this.load();
        } catch (e) {
          const code = e?.response?.data?.error;
          if (code === 'CODE_EXISTS') this.$message.error('代码已存在');
          else this.$message.error(code || '保存失败');
        } finally {
          this.saving = false;
        }
      });
    },
    async onDelete(row) {
      await this.$confirm(`确定删除类别「${row.nameZh}」？`, '提示', { type: 'warning' });
      try {
        await deleteEmployeeCategory(row.id);
        this.$message.success('已删除');
        this.load();
      } catch (e) {
        const code = e?.response?.data?.error;
        if (code === 'CATEGORY_IN_USE') this.$message.error('仍有员工绑定此类别，无法删除');
        else if (code === 'CANNOT_DELETE_BUILTIN') this.$message.error('内置类别不可删除');
        else this.$message.error(code || '删除失败');
      }
    }
  }
};
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.hint {
  font-size: 12px;
  color: #64748b;
}
.sub-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}
.mobile-list {
  display: none;
}
.mobile-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  margin-bottom: 8px;
}
.mobile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.mobile-code {
  font-size: 12px;
  color: #64748b;
}
.mobile-line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 3px 0;
  font-size: 13px;
  color: #475569;
}
.mobile-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
@media (max-width: 992px) {
  .toolbar {
    gap: 8px;
  }
  .toolbar .el-button {
    width: 100%;
  }
  .desktop-table {
    display: none;
  }
  .mobile-list {
    display: block;
  }
  .categories-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    margin-bottom: 6px;
  }
  .categories-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }
}
</style>
