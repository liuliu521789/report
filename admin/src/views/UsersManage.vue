<template>
  <div class="users-page">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新建账号</el-button>
      <span class="hint">仅超级管理员可操作；须至少保留一名启用的超级管理员。</span>
    </div>

    <el-table v-loading="loading" :data="items" border style="width: 100%" class="desktop-table">
      <el-table-column prop="id" label="ID" width="72" />
      <el-table-column prop="username" label="用户名" min-width="120" />
      <el-table-column label="类型" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.accountType === 'super_admin'" type="danger" size="small">超级管理员</el-tag>
          <el-tag v-else-if="row.accountType === 'manager'" type="warning" size="small">管理</el-tag>
          <el-tag v-else type="info" size="small">员工</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="categoryNameZh" label="员工类别" width="120" />
      <el-table-column prop="departmentNameZh" label="所属部门" min-width="140" show-overflow-tooltip />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.isActive" type="success" size="small">启用</el-tag>
          <el-tag v-else type="info" size="small">停用</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ $dt(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div class="mobile-list" v-loading="loading">
      <div v-for="row in items" :key="'m-' + row.id" class="mobile-card">
        <div class="mobile-head">
          <strong>{{ row.username }}</strong>
          <el-tag v-if="row.accountType === 'super_admin'" type="danger" size="small">超级管理员</el-tag>
          <el-tag v-else-if="row.accountType === 'manager'" type="warning" size="small">管理</el-tag>
          <el-tag v-else type="info" size="small">员工</el-tag>
        </div>
        <div class="mobile-line"><span>ID</span><span>{{ row.id }}</span></div>
        <div class="mobile-line"><span>员工类别</span><span>{{ row.categoryNameZh || '-' }}</span></div>
        <div class="mobile-line"><span>所属部门</span><span>{{ row.departmentNameZh || '-' }}</span></div>
        <div class="mobile-line"><span>状态</span><span>{{ row.isActive ? '启用' : '停用' }}</span></div>
        <div class="mobile-line"><span>创建时间</span><span>{{ $dt(row.createdAt) }}</span></div>
        <div class="mobile-actions">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
        </div>
      </div>
      <el-empty v-if="!items.length && !loading" description="暂无账号" />
    </div>

    <el-dialog :title="dialogMode === 'create' ? '新建账号' : '编辑账号'" v-model="dialog" width="640px" top="6vh" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="108px" class="users-form">
        <el-form-item v-if="dialogMode === 'create'" label="用户名" prop="username">
          <el-input v-model="form.username" autocomplete="off" maxlength="64" />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'create'" label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="账号类型" prop="accountType">
          <el-radio-group v-model="form.accountType" :disabled="dialogMode === 'edit' && !isSuperAdminUser">
            <el-radio label="super_admin">超级管理员</el-radio>
            <el-radio label="manager">管理</el-radio>
            <el-radio label="employee">员工</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="isStaffAccountType(form.accountType)" label="员工类别" prop="employeeCategoryId">
          <el-select
            v-model="form.employeeCategoryId"
            placeholder="选择类别"
            style="width: 100%"
            @change="onEmployeeCategoryChange"
          >
            <el-option v-for="c in categories" :key="c.id" :label="c.nameZh" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="isStaffAccountType(form.accountType)" label="所属部门">
          <el-select v-model="form.departmentId" clearable filterable placeholder="可选，先在「部门管理」中维护" style="width: 100%">
            <el-option v-for="d in departmentSelectOptions" :key="d.id" :label="d.label" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="isStaffAccountType(form.accountType)" label="企业微信 UserID">
          <el-input v-model="form.wecomUserId" maxlength="64" clearable placeholder="与通讯录成员账号一致；财务快捷账号填此项后可收提交审核通知" />
        </el-form-item>
        <el-form-item v-if="isStaffAccountType(form.accountType)" label="权限">
          <div class="sub">与类别默认合并保存；可逐项调整。</div>
          <permission-toggles v-model="form.permissions" />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'edit'" label="状态">
          <el-switch v-model="form.isActive" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'edit'" label="新密码" prop="passwordEdit">
          <el-input v-model="form.passwordEdit" type="password" show-password placeholder="不修改请留空" autocomplete="new-password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { createUser, listDepartmentsFlat, listEmployeeCategories, listUsers, updateUser } from '../api';
import PermissionToggles from '../components/PermissionToggles.vue';
import { emptyPermissionShape, mergeIntoShape } from '../utils/permissionDefaults';
import { isSuperAdmin } from '../utils/permissions';

export default {
  name: 'UsersManage',
  components: { PermissionToggles },
  data() {
    return {
      loading: false,
      items: [],
      categories: [],
      departmentsFlat: [],
      dialog: false,
      dialogMode: 'create',
      saving: false,
      editingId: null,
      form: {
        username: '',
        password: '',
        accountType: 'employee',
        employeeCategoryId: null,
        departmentId: null,
        wecomUserId: '',
        permissions: {},
        isActive: true,
        passwordEdit: ''
      }
    };
  },
  computed: {
    isSuperAdminUser() {
      return isSuperAdmin();
    },
    departmentById() {
      const m = {};
      for (const r of this.departmentsFlat) m[r.id] = r;
      return m;
    },
    departmentSelectOptions() {
      const path = (id) => {
        const parts = [];
        let cur = this.departmentById[id];
        const seen = new Set();
        while (cur && !seen.has(cur.id)) {
          seen.add(cur.id);
          parts.unshift(cur.nameZh);
          cur = cur.parentId != null ? this.departmentById[cur.parentId] : null;
        }
        return parts.join(' / ');
      };
      return (this.departmentsFlat || [])
        .map((d) => ({ id: d.id, label: path(d.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
    },
    formRules() {
      const pwdRule = (rule, value, callback) => {
        if (!value || value.length < 6) callback(new Error('密码至少 6 位'));
        else callback();
      };
      const pwdEditRule = (rule, value, callback) => {
        if (!value) return callback();
        if (value.length < 6) callback(new Error('密码至少 6 位'));
        else callback();
      };
      const catRule = (rule, value, callback) => {
        if (this.isStaffAccountType(this.form.accountType) && !value) callback(new Error('请选择员工类别'));
        else callback();
      };
      if (this.dialogMode === 'create') {
        return {
          username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
          password: [{ required: true, validator: pwdRule, trigger: 'blur' }],
          accountType: [{ required: true, message: '请选择类型', trigger: 'change' }],
          employeeCategoryId: [{ validator: catRule, trigger: 'change' }]
        };
      }
      return {
        employeeCategoryId: [{ validator: catRule, trigger: 'change' }],
        passwordEdit: [{ validator: pwdEditRule, trigger: 'blur' }]
      };
    }
  },
  mounted() {
    this.load();
    this.loadCategories();
    this.loadDepartments();
  },
  methods: {
    isStaffAccountType(at) {
      return at === 'employee' || at === 'manager';
    },
    async loadDepartments() {
      try {
        const { items } = await listDepartmentsFlat();
        this.departmentsFlat = items || [];
      } catch (_) {
        this.departmentsFlat = [];
      }
    },
    async loadCategories() {
      try {
        const { items } = await listEmployeeCategories();
        this.categories = items || [];
      } catch (_) {
        this.categories = [];
      }
    },
    async load() {
      this.loading = true;
      try {
        const { items } = await listUsers();
        this.items = (items || []).map((r) => ({
          ...r,
          isActive: Number(r.isActive) === 1
        }));
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载失败'));
      } finally {
        this.loading = false;
      }
    },
    openCreate() {
      this.dialogMode = 'create';
      this.editingId = null;
      this.resetForm();
      this.dialog = true;
    },
    openEdit(row) {
      this.dialogMode = 'edit';
      this.editingId = row.id;
      this.form = {
        username: row.username,
        password: '',
        accountType: row.accountType,
        employeeCategoryId: row.employeeCategoryId || null,
        departmentId: row.departmentId || null,
        wecomUserId: row.wecomUserId || '',
        permissions: mergeIntoShape(emptyPermissionShape(), row.permissions || {}),
        isActive: !!row.isActive,
        passwordEdit: ''
      };
      this.dialog = true;
    },
    resetForm() {
      const firstCategoryId = this.categories[0]?.id || null;
      this.form = {
        username: '',
        password: '',
        accountType: 'employee',
        employeeCategoryId: firstCategoryId,
        departmentId: null,
        wecomUserId: '',
        permissions: {},
        isActive: true,
        passwordEdit: ''
      };
      // 根据初始员工类别设置默认权限（若已加载类别）
      if (firstCategoryId) {
        this.applyCategoryDefaultPermissions(firstCategoryId);
      }
      this.$nextTick(() => this.$refs.formRef && this.$refs.formRef.clearValidate());
    },
    onEmployeeCategoryChange(val) {
      this.applyCategoryDefaultPermissions(val);
    },
    applyCategoryDefaultPermissions(categoryId) {
      const category = this.categories.find((c) => c.id === categoryId);
      if (!category) return;
      const defaults = category.defaultPermissions || {};
      this.form.permissions = mergeIntoShape(emptyPermissionShape(), defaults);
    },
    submit() {
      this.$refs.formRef.validate(async (ok) => {
        if (!ok) return;
        this.saving = true;
        try {
          if (this.dialogMode === 'create') {
            const payload = {
              username: this.form.username.trim(),
              password: this.form.password,
              accountType: this.form.accountType
            };
            if (this.isStaffAccountType(this.form.accountType)) {
              payload.employeeCategoryId = this.form.employeeCategoryId;
              payload.departmentId = this.form.departmentId ?? null;
              payload.wecomUserId = (this.form.wecomUserId || '').trim() || null;
              payload.permissions = this.form.permissions;
            }
            await createUser(payload);
            this.$message.success('已创建');
          } else {
            const payload = {
              accountType: this.form.accountType,
              isActive: this.form.isActive
            };
            if (this.isStaffAccountType(this.form.accountType)) {
              payload.employeeCategoryId = this.form.employeeCategoryId;
              payload.departmentId = this.form.departmentId ?? null;
              payload.wecomUserId = (this.form.wecomUserId || '').trim() || null;
              payload.permissions = this.form.permissions;
            }
            if (this.form.passwordEdit && this.form.passwordEdit.length >= 6) {
              payload.password = this.form.passwordEdit;
            }
            await updateUser(this.editingId, payload);
            this.$message.success('已保存');
          }
          this.dialog = false;
          this.load();
          this.loadDepartments();
        } catch (e) {
          const code = e?.response?.data?.error;
          if (code === 'USERNAME_EXISTS') this.$message.error('用户名已存在');
          else if (code === 'LAST_SUPER_ADMIN') this.$message.error('至少需保留一名可用的超级管理员');
          else if (code === 'CANNOT_DISABLE_SELF') this.$message.error('不能停用自己的账号');
          else this.$message.error(code || '保存失败');
        } finally {
          this.saving = false;
        }
      });
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
.sub {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 8px;
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
  .users-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    margin-bottom: 6px;
  }
  .users-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }
}
</style>
