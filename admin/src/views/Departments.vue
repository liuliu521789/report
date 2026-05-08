<template>
  <div class="dept-page">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate" icon=Plus>新增部门</el-button>
      <span class="hint"
        >多级组织架构；删除前请先移除子部门，并将成员调离本部门（员工账号中修改所属部门）。</span
      >
    </div>

    <el-table v-loading="loading" :data="items" border class="desktop-table">
      <el-table-column prop="id" label="ID" width="72" />
      <el-table-column label="部门" min-width="200">
        <template #default="{ row }">{{ deptPathLabel(row.id) }}</template>
      </el-table-column>
      <el-table-column label="直属上级" width="160">
        <template #default="{ row }">{{ parentName(row.parentId) }}</template>
      </el-table-column>
      <el-table-column prop="memberCount" label="人数" width="80" />
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link @click="openEdit(row)" icon=Edit>编辑</el-button>
          <el-button link type="danger" @click="onDelete(row)" icon=Delete>删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="mobile-list" v-loading="loading">
      <div v-for="row in items" :key="'m-' + row.id" class="mobile-card">
        <div class="mobile-head">
          <strong>{{ deptPathLabel(row.id) }}</strong>
        </div>
        <div class="mobile-line"><span>ID</span><span>{{ row.id }}</span></div>
        <div class="mobile-line"><span>人数</span><span>{{ row.memberCount }}</span></div>
        <div class="mobile-actions">
          <el-button size="small" @click="openEdit(row)" icon=Edit>编辑</el-button>
          <el-button size="small" type="danger" @click="onDelete(row)" icon=Delete>删除</el-button>
        </div>
      </div>
      <el-empty v-if="!items.length && !loading" description="暂无部门" />
    </div>

    <el-dialog :title="dialogMode === 'create' ? '新增部门' : '编辑部门'" v-model="dialog" width="520px" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" class="dept-form">
        <el-form-item label="名称" prop="nameZh">
          <el-input v-model="form.nameZh" maxlength="128" placeholder="如：财务部" />
        </el-form-item>
        <el-form-item label="上级部门">
          <el-select v-model="form.parentId" clearable filterable placeholder="无（顶级部门）" style="width: 100%">
            <el-option v-for="o in parentOptions" :key="o.id" :label="deptPathLabel(o.id)" :value="o.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="99999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit" icon=Check>保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { createDepartment, deleteDepartment, listDepartmentsFlat, updateDepartment } from '../api';

export default {
  name: 'Departments',
  data() {
    return {
      loading: false,
      items: [],
      dialog: false,
      dialogMode: 'create',
      saving: false,
      editingId: null,
      form: {
        nameZh: '',
        parentId: null,
        sortOrder: 0
      },
      rules: {
        nameZh: [{ required: true, message: '请输入部门名称', trigger: 'blur' }]
      }
    };
  },
  computed: {
    byId() {
      const m = {};
      for (const r of this.items) m[r.id] = r;
      return m;
    },
    parentOptions() {
      if (this.dialogMode !== 'edit' || !this.editingId) return this.items;
      const ex = new Set([this.editingId]);
      const addDesc = (pid) => {
        for (const r of this.items) {
          if (r.parentId === pid) {
            ex.add(r.id);
            addDesc(r.id);
          }
        }
      };
      addDesc(this.editingId);
      return this.items.filter((r) => !ex.has(r.id));
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    deptPathLabel(id) {
      if (id == null) return '';
      const parts = [];
      let cur = this.byId[id];
      const seen = new Set();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        parts.unshift(cur.nameZh);
        cur = cur.parentId != null ? this.byId[cur.parentId] : null;
      }
      return parts.join(' / ') || '—';
    },
    parentName(parentId) {
      if (parentId == null) return '—';
      return this.deptPathLabel(parentId);
    },
    async load() {
      this.loading = true;
      try {
        const { items } = await listDepartmentsFlat();
        this.items = items || [];
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载失败'));
        this.items = [];
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
        nameZh: row.nameZh,
        parentId: row.parentId ?? null,
        sortOrder: row.sortOrder ?? 0
      };
      this.dialog = true;
    },
    resetForm() {
      this.editingId = null;
      this.form = {
        nameZh: '',
        parentId: null,
        sortOrder: 0
      };
      this.$nextTick(() => this.$refs.formRef && this.$refs.formRef.clearValidate());
    },
    submit() {
      this.$refs.formRef.validate(async (ok) => {
        if (!ok) return;
        this.saving = true;
        try {
          if (this.dialogMode === 'create') {
            await createDepartment({
              nameZh: this.form.nameZh.trim(),
              parentId: this.form.parentId ?? null,
              sortOrder: this.form.sortOrder
            });
            this.$message.success('已创建');
          } else {
            await updateDepartment(this.editingId, {
              nameZh: this.form.nameZh.trim(),
              parentId: this.form.parentId ?? null,
              sortOrder: this.form.sortOrder
            });
            this.$message.success('已保存');
          }
          this.dialog = false;
          this.load();
        } catch (e) {
          const code = e?.response?.data?.error;
          if (code === 'BAD_PARENT' || code === 'INVALID_PARENT') this.$message.error('上级部门无效');
          else this.$message.error(code || '保存失败');
        } finally {
          this.saving = false;
        }
      });
    },
    async onDelete(row) {
      try {
        await this.$confirm(`确定删除「${this.deptPathLabel(row.id)}」？`, '提示', { type: 'warning' });
      } catch {
        return;
      }
      try {
        await deleteDepartment(row.id);
        this.$message.success('已删除');
        this.load();
      } catch (e) {
        const code = e?.response?.data?.error;
        if (code === 'HAS_CHILD_DEPARTMENTS') this.$message.error('请先删除或调整下级部门');
        else if (code === 'HAS_MEMBERS') this.$message.error('仍有员工属于该部门，请先在账号管理中调整');
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
  margin-bottom: 8px;
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
  .desktop-table {
    display: none;
  }
  .mobile-list {
    display: block;
  }
  .dept-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    margin-bottom: 6px;
  }
  .dept-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }
}
:deep(.el-table__row) {
  cursor: pointer;
}
:deep(.el-table__row:hover) {
  background-color: #f5f7fa;
}
</style>
