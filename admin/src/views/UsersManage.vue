<template>
  <div class="users-page">
    <div class="toolbar">
      <el-input
        v-model="filters.keyword"
        placeholder="搜索用户名/姓名/手机号/企业微信 UserID"
        clearable
        class="kw-input"
        @keyup.enter="reload"
        @clear="reload"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-select v-model="filters.accountType" clearable placeholder="账号类型" class="filter-input" @change="reload">
        <el-option label="超级管理员" value="super_admin" />
        <el-option label="管理" value="manager" />
        <el-option label="员工" value="employee" />
      </el-select>
      <el-select v-model="filters.isActive" clearable placeholder="状态" class="filter-input" @change="reload">
        <el-option label="启用" value="1" />
        <el-option label="停用" value="0" />
      </el-select>
      <el-select v-model="filters.categoryId" clearable filterable placeholder="员工类别" class="filter-input" @change="reload">
        <el-option v-for="c in categories" :key="c.id" :label="c.nameZh" :value="c.id" />
      </el-select>
      <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
      <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
      <el-button type="success" :icon="Plus" @click="openCreate">新建账号</el-button>
      <span class="hint">仅超级管理员可操作；至少保留一名启用的超级管理员；删除为软删除。</span>
    </div>

    <el-table v-loading="loading" :data="items" border style="width: 100%" class="desktop-table">
      <el-table-column prop="id" label="ID" width="72" />
      <el-table-column prop="realName" label="员工姓名" min-width="120" show-overflow-tooltip />
      <el-table-column prop="loginId" label="LoginID" min-width="150" show-overflow-tooltip />
      <el-table-column prop="phone" label="手机号" width="130" />
      <el-table-column label="类型" width="110">
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
      <el-table-column label="2FA" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.totpEnabledAt" type="success" size="small">已绑定</el-tag>
          <el-tag v-else size="small" type="info">未绑定</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="待改密" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.forceChangePassword" type="warning" size="small">是</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ $dt(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          <el-button link :icon="Key" @click="onResetPassword(row)">重置密码</el-button>
          <el-dropdown @command="(c) => onMore(c, row)">
            <el-button link>更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="forceLogout">强制下线</el-dropdown-item>
                <el-dropdown-item command="delete" divided>
                  <span style="color: #dc2626">删除账号</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>

    <div class="mobile-list" v-loading="loading">
      <div v-for="row in items" :key="'m-' + row.id" class="mobile-card">
        <div class="mobile-head">
          <strong>{{ row.realName || '-' }}</strong>
          <el-tag v-if="row.accountType === 'super_admin'" type="danger" size="small">超级管理员</el-tag>
          <el-tag v-else-if="row.accountType === 'manager'" type="warning" size="small">管理</el-tag>
          <el-tag v-else type="info" size="small">员工</el-tag>
        </div>
        <div class="mobile-line"><span>LoginID</span><span>{{ row.loginId || '-' }}</span></div>
        <div class="mobile-line"><span>ID</span><span>{{ row.id }}</span></div>
        <div class="mobile-line"><span>员工类别</span><span>{{ row.categoryNameZh || '-' }}</span></div>
        <div class="mobile-line"><span>手机号</span><span>{{ row.phone || '-' }}</span></div>
        <div class="mobile-line"><span>所属部门</span><span>{{ row.departmentNameZh || '-' }}</span></div>
        <div class="mobile-line"><span>状态</span><span>{{ row.isActive ? '启用' : '停用' }}</span></div>
        <div class="mobile-line"><span>创建时间</span><span>{{ $dt(row.createdAt) }}</span></div>
        <div class="mobile-actions">
          <el-button size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" :icon="Key" @click="onResetPassword(row)">重置密码</el-button>
          <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
        </div>
      </div>
      <el-empty v-if="!items.length && !loading" description="暂无账号" />
    </div>

    <el-pagination
      v-if="total > 0"
      v-model:current-page="pagination.page"
      v-model:page-size="pagination.pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      class="pager"
      @current-change="reload"
      @size-change="reload"
    />

    <el-dialog
      :title="dialogMode === 'create' ? '新建账号' : '编辑账号'"
      v-model="dialog"
      width="640px"
      top="6vh"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="108px" class="users-form">
        <el-form-item v-if="dialogMode === 'create'" label="登录账号">
          <el-input model-value="系统自动生成（按账号类型/员工类别）" disabled />
          <div class="sub">示例：SA-2604-001、SALES-2604-001</div>
        </el-form-item>
        <el-form-item label="真实姓名" prop="realName">
          <el-input v-model="form.realName" autocomplete="off" maxlength="64" placeholder="请输入员工真实姓名" />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'create'" label="初始密码" prop="password">
          <el-input v-model="form.password" type="password" show-password autocomplete="new-password" />
          <div class="sub">默认要求初次登录强制修改</div>
        </el-form-item>
        <el-form-item label="账号类型" prop="accountType">
          <el-radio-group v-model="form.accountType" :disabled="dialogMode === 'edit' && !isSuperAdminUser">
            <el-radio value="super_admin">超级管理员</el-radio>
            <el-radio value="manager">管理</el-radio>
            <el-radio value="employee">员工</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.accountType === 'super_admin'" label="强制 2FA">
          <el-switch v-model="form.requireTwoFactor" active-text="启用" inactive-text="关闭" />
          <div class="sub">仅当此账号要使用动态码登录时启用；首次登录会引导绑定。</div>
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
          <el-select
            v-model="form.departmentId"
            clearable
            filterable
            placeholder="可选，先在「部门管理」中维护"
            style="width: 100%"
          >
            <el-option v-for="d in departmentSelectOptions" :key="d.id" :label="d.label" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input
            v-model="form.phone"
            maxlength="32"
            clearable
            placeholder="可选；若填写需唯一"
          />
        </el-form-item>
        <el-form-item v-if="isStaffAccountType(form.accountType)" label="企业微信 UserID">
          <el-input
            v-model="form.wecomUserId"
            maxlength="64"
            clearable
            placeholder="与通讯录成员账号一致；开发阶段允许重复绑定"
          />
        </el-form-item>
        <el-form-item v-if="isStaffAccountType(form.accountType)" label="权限">
          <div class="sub">与类别默认合并保存；可逐项调整。</div>
          <permission-toggles v-model="form.permissions" />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'edit'" label="状态">
          <el-switch v-model="form.isActive" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'create'" label="首次登录改密">
          <el-switch v-model="form.forceChangePassword" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :icon="Close" @click="dialog = false">取消</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog title="临时密码已生成" v-model="resetDialog" width="420px" :close-on-click-modal="false">
      <el-alert type="success" :closable="false" show-icon style="margin-bottom: 12px">
        请将临时密码发送给本人；该用户下次登录会强制修改密码。
      </el-alert>
      <el-input :model-value="resetDialogPassword" readonly>
        <template #append>
          <el-button :icon="DocumentCopy" @click="copyTempPassword">复制</el-button>
        </template>
      </el-input>
      <template #footer>
        <el-button type="primary" @click="resetDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowDown,
  Check,
  Close,
  DocumentCopy,
  Edit,
  Key,
  Plus,
  Refresh,
  Search
} from '@element-plus/icons-vue';

import {
  createUser,
  deleteUser,
  forceLogoutUser,
  getUserDetail,
  listDepartmentsFlat,
  listEmployeeCategories,
  listUsers,
  resetUserPassword,
  updateUser
} from '../api';
import PermissionToggles from '../components/PermissionToggles.vue';
import { emptyPermissionShape, mergeIntoShape } from '../utils/permissionDefaults';
import { isSuperAdmin } from '../utils/permissions';
import { axiosUserMessage } from '../utils/apiUserMessage';

const isSuperAdminUser = computed(() => isSuperAdmin());

const loading = ref(false);
const saving = ref(false);

const items = ref([]);
const total = ref(0);
const categories = ref([]);
const departmentsFlat = ref([]);

const filters = reactive({
  keyword: '',
  accountType: '',
  isActive: '',
  categoryId: null
});

const pagination = reactive({ page: 1, pageSize: 20 });

const dialog = ref(false);
const dialogMode = ref('create');
const editingId = ref(null);
const formRef = ref(null);

const form = reactive({
  username: '',
  realName: '',
  password: '',
  accountType: 'employee',
  employeeCategoryId: null,
  departmentId: null,
  wecomUserId: '',
  phone: '',
  permissions: {},
  isActive: true,
  requireTwoFactor: false,
  forceChangePassword: true
});

const resetDialog = ref(false);
const resetDialogPassword = ref('');

const departmentById = computed(() => {
  const m = {};
  for (const r of departmentsFlat.value) m[r.id] = r;
  return m;
});

const departmentSelectOptions = computed(() => {
  const path = (id) => {
    const parts = [];
    let cur = departmentById.value[id];
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.nameZh);
      cur = cur.parentId != null ? departmentById.value[cur.parentId] : null;
    }
    return parts.join(' / ');
  };
  return (departmentsFlat.value || [])
    .map((d) => ({ id: d.id, label: path(d.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
});

const formRules = computed(() => {
  const pwdRule = (rule, value, callback) => {
    if (!value || value.length < 6) callback(new Error('密码至少 6 位'));
    else callback();
  };
  const catRule = (rule, value, callback) => {
    if (isStaffAccountType(form.accountType) && !value) callback(new Error('请选择员工类别'));
    else callback();
  };
  if (dialogMode.value === 'create') {
    return {
      realName: [{ required: true, message: '请输入真实姓名', trigger: 'blur' }],
      password: [{ required: true, validator: pwdRule, trigger: 'blur' }],
      accountType: [{ required: true, message: '请选择类型', trigger: 'change' }],
      employeeCategoryId: [{ validator: catRule, trigger: 'change' }]
    };
  }
  return {
    realName: [{ required: true, message: '请输入真实姓名', trigger: 'blur' }],
    employeeCategoryId: [{ validator: catRule, trigger: 'change' }]
  };
});

function isStaffAccountType(at) {
  return at === 'employee' || at === 'manager';
}

function buildListParams() {
  const p = {
    page: pagination.page,
    pageSize: pagination.pageSize
  };
  if (filters.keyword) p.keyword = filters.keyword.trim();
  if (filters.accountType) p.accountType = filters.accountType;
  if (filters.isActive) p.isActive = filters.isActive;
  if (filters.categoryId) p.categoryId = filters.categoryId;
  return p;
}

async function load() {
  loading.value = true;
  try {
    const data = await listUsers(buildListParams());
    items.value = (data.items || []).map((r) => ({
      ...r,
      loginId: r.username || '',
      isActive: Number(r.isActive) === 1,
      forceChangePassword: Number(r.forceChangePassword) === 1
    }));
    total.value = Number(data.total || 0);
  } catch (e) {
    ElMessage.error(axiosUserMessage(e, '加载失败'));
  } finally {
    loading.value = false;
  }
}

async function loadCategories() {
  try {
    const { items: list } = await listEmployeeCategories();
    categories.value = list || [];
  } catch {
    categories.value = [];
  }
}

async function loadDepartments() {
  try {
    const { items: list } = await listDepartmentsFlat();
    departmentsFlat.value = list || [];
  } catch {
    departmentsFlat.value = [];
  }
}

function reload() {
  pagination.page = 1;
  return load();
}

function resetFilters() {
  filters.keyword = '';
  filters.accountType = '';
  filters.isActive = '';
  filters.categoryId = null;
  reload();
}

function openCreate() {
  dialogMode.value = 'create';
  editingId.value = null;
  resetForm();
  dialog.value = true;
}

async function openEdit(row) {
  dialogMode.value = 'edit';
  editingId.value = row.id;
  /** 列表不返回 permissions / wecom_userid，先拉详情 */
  let detail = null;
  try {
    const r = await getUserDetail(row.id);
    detail = r?.item || null;
  } catch {
    detail = null;
  }
  Object.assign(form, {
    username: row.username,
    realName: row.realName || detail?.realName || '',
    phone: row.phone || '',
    password: '',
    accountType: row.accountType,
    employeeCategoryId: row.employeeCategoryId || null,
    departmentId: row.departmentId || null,
    wecomUserId: detail?.wecomUserId || '',
    permissions: mergeIntoShape(emptyPermissionShape(), detail?.permissions || {}),
    isActive: !!row.isActive,
    requireTwoFactor: Number(detail?.requireTwoFactor || 0) === 1,
    forceChangePassword: Number(row.forceChangePassword || 0) === 1
  });
  dialog.value = true;
}

function resetForm() {
  const firstCategoryId = categories.value[0]?.id || null;
  Object.assign(form, {
    username: '',
    realName: '',
    password: '',
    accountType: 'employee',
    employeeCategoryId: firstCategoryId,
    departmentId: null,
    wecomUserId: '',
    phone: '',
    permissions: {},
    isActive: true,
    requireTwoFactor: false,
    forceChangePassword: true
  });
  if (firstCategoryId) applyCategoryDefaultPermissions(firstCategoryId);
  setTimeout(() => formRef.value && formRef.value.clearValidate(), 0);
}

function onEmployeeCategoryChange(val) {
  applyCategoryDefaultPermissions(val);
}

function applyCategoryDefaultPermissions(categoryId) {
  const c = categories.value.find((x) => x.id === categoryId);
  if (!c) return;
  form.permissions = mergeIntoShape(emptyPermissionShape(), c.defaultPermissions || {});
}

function mapErr(code) {
  if (code === 'USERNAME_EXISTS') return '用户名已存在';
  if (code === 'LAST_SUPER_ADMIN') return '至少需保留一名可用的超级管理员';
  if (code === 'CANNOT_DISABLE_SELF') return '不能停用自己的账号';
  if (code === 'CANNOT_DELETE_SELF') return '不能删除自己的账号';
  if (code === 'PHONE_DUPLICATE') return '手机号已被其他账号使用';
  if (code === 'BAD_DEPARTMENT') return '所选部门不存在';
  if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_SIMPLE') return '密码不符合策略，请重新输入';
  return code || '保存失败';
}

async function submit() {
  const ok = await formRef.value.validate().catch(() => false);
  if (!ok) return;
  saving.value = true;
  try {
    if (dialogMode.value === 'create') {
      const payload = {
        realName: (form.realName || '').trim(),
        password: form.password,
        accountType: form.accountType,
        phone: (form.phone || '').trim() || null,
        forceChangePassword: !!form.forceChangePassword
      };
      if (form.accountType === 'super_admin') payload.requireTwoFactor = !!form.requireTwoFactor;
      if (isStaffAccountType(form.accountType)) {
        payload.employeeCategoryId = form.employeeCategoryId;
        payload.departmentId = form.departmentId ?? null;
        payload.wecomUserId = (form.wecomUserId || '').trim() || null;
        payload.permissions = form.permissions;
      }
      const r = await createUser(payload);
      ElMessage.success(`已创建，登录账号：${r.loginId || '系统已生成'}`);
    } else {
      const payload = {
        realName: (form.realName || '').trim(),
        accountType: form.accountType,
        phone: (form.phone || '').trim() || null,
        isActive: form.isActive
      };
      if (form.accountType === 'super_admin') payload.requireTwoFactor = !!form.requireTwoFactor;
      if (isStaffAccountType(form.accountType)) {
        payload.employeeCategoryId = form.employeeCategoryId;
        payload.departmentId = form.departmentId ?? null;
        payload.wecomUserId = (form.wecomUserId || '').trim() || null;
        payload.permissions = form.permissions;
      }
      await updateUser(editingId.value, payload);
      ElMessage.success('已保存；若该账号当前在线，请退出后重新登录以刷新权限');
    }
    dialog.value = false;
    await load();
  } catch (e) {
    ElMessage.error(mapErr(e?.response?.data?.error));
  } finally {
    saving.value = false;
  }
}

async function onResetPassword(row) {
  let confirmed;
  try {
    confirmed = await ElMessageBox.confirm(
      `将为「${row.username}」生成一次性临时密码，并强制其下次登录修改。继续？`,
      '重置密码',
      { type: 'warning', confirmButtonText: '生成临时密码' }
    );
  } catch {
    return;
  }
  if (!confirmed) return;
  try {
    const { temporaryPassword } = await resetUserPassword(row.id);
    resetDialogPassword.value = temporaryPassword || '';
    resetDialog.value = true;
    await load();
  } catch (e) {
    ElMessage.error(mapErr(e?.response?.data?.error));
  }
}

async function copyTempPassword() {
  const text = resetDialogPassword.value || '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制到剪贴板');
  } catch {
    ElMessage.warning('复制失败，请手动选择');
  }
}

async function onMore(command, row) {
  if (command === 'forceLogout') return onForceLogout(row);
  if (command === 'delete') return onDelete(row);
}

async function onForceLogout(row) {
  try {
    await ElMessageBox.confirm(
      `将立即注销「${row.username}」的全部会话，下次需重新登录。继续？`,
      '强制下线',
      { type: 'warning' }
    );
  } catch {
    return;
  }
  try {
    await forceLogoutUser(row.id);
    ElMessage.success('已强制下线');
  } catch (e) {
    ElMessage.error(mapErr(e?.response?.data?.error));
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `软删除账号「${row.username}」？删除后该账号不可登录，相关业务数据保留。`,
      '删除账号',
      { type: 'error', confirmButtonText: '确认删除', confirmButtonClass: 'el-button--danger' }
    );
  } catch {
    return;
  }
  try {
    await deleteUser(row.id);
    ElMessage.success('已删除');
    await load();
  } catch (e) {
    ElMessage.error(mapErr(e?.response?.data?.error));
  }
}

onMounted(async () => {
  await Promise.all([loadCategories(), loadDepartments()]);
  await load();
});
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.kw-input {
  width: 280px;
}
.filter-input {
  width: 140px;
}
.hint {
  font-size: 12px;
  color: #64748b;
  margin-left: auto;
}
.sub {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}
.pager {
  margin-top: 14px;
  justify-content: flex-end;
  display: flex;
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
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
:deep(.el-table__row) {
  cursor: pointer;
}
:deep(.el-table__row:hover) {
  background-color: #f5f7fa;
}
@media (max-width: 992px) {
  .toolbar {
    gap: 8px;
  }
  .kw-input,
  .filter-input {
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
