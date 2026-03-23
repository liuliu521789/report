<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新建账号</el-button>
      <span class="hint">仅超级管理员可操作；须至少保留一名启用的超级管理员。</span>
    </div>

    <el-table v-loading="loading" :data="items" border style="width: 100%">
      <el-table-column prop="id" label="ID" width="72" />
      <el-table-column prop="username" label="用户名" min-width="120" />
      <el-table-column label="类型" width="120">
        <template slot-scope="{ row }">
          <el-tag v-if="row.accountType === 'super_admin'" type="danger" size="small">超级管理员</el-tag>
          <el-tag v-else type="info" size="small">员工</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="categoryNameZh" label="员工类别" width="120" />
      <el-table-column label="状态" width="90">
        <template slot-scope="{ row }">
          <el-tag v-if="row.isActive" type="success" size="small">启用</el-tag>
          <el-tag v-else type="info" size="small">停用</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="180" />
      <el-table-column label="操作" width="100" fixed="right">
        <template slot-scope="{ row }">
          <el-button type="text" @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog :title="dialogMode === 'create' ? '新建账号' : '编辑账号'" :visible.sync="dialog" width="640px" top="6vh" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="108px">
        <el-form-item v-if="dialogMode === 'create'" label="用户名" prop="username">
          <el-input v-model="form.username" autocomplete="off" maxlength="64" />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'create'" label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="账号类型" prop="accountType">
          <el-radio-group v-model="form.accountType" :disabled="dialogMode === 'edit'">
            <el-radio label="super_admin">超级管理员</el-radio>
            <el-radio label="employee">员工</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.accountType === 'employee'" label="员工类别" prop="employeeCategoryId">
          <el-select v-model="form.employeeCategoryId" placeholder="选择类别" style="width: 100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.nameZh" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.accountType === 'employee'" label="权限">
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
      <span slot="footer">
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { createUser, listEmployeeCategories, listUsers, updateUser } from '../api';
import PermissionToggles from '../components/PermissionToggles.vue';
import { emptyPermissionShape, mergeIntoShape } from '../utils/permissionDefaults';

export default {
  name: 'UsersManage',
  components: { PermissionToggles },
  data() {
    return {
      loading: false,
      items: [],
      categories: [],
      dialog: false,
      dialogMode: 'create',
      saving: false,
      editingId: null,
      form: {
        username: '',
        password: '',
        accountType: 'employee',
        employeeCategoryId: null,
        permissions: {},
        isActive: true,
        passwordEdit: ''
      }
    };
  },
  computed: {
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
        if (this.form.accountType === 'employee' && !value) callback(new Error('请选择员工类别'));
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
  },
  methods: {
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
        this.$message.error(e?.response?.data?.error || '加载失败');
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
        permissions: mergeIntoShape(emptyPermissionShape(), row.permissions || {}),
        isActive: !!row.isActive,
        passwordEdit: ''
      };
      this.dialog = true;
    },
    resetForm() {
      this.form = {
        username: '',
        password: '',
        accountType: 'employee',
        employeeCategoryId: this.categories[0]?.id || null,
        permissions: {},
        isActive: true,
        passwordEdit: ''
      };
      this.$nextTick(() => this.$refs.formRef && this.$refs.formRef.clearValidate());
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
            if (this.form.accountType === 'employee') {
              payload.employeeCategoryId = this.form.employeeCategoryId;
              payload.permissions = this.form.permissions;
            }
            await createUser(payload);
            this.$message.success('已创建');
          } else {
            const payload = {
              accountType: this.form.accountType,
              isActive: this.form.isActive
            };
            if (this.form.accountType === 'employee') {
              payload.employeeCategoryId = this.form.employeeCategoryId;
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
</style>
