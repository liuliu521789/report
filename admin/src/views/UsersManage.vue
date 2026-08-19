<template>
  <div class="users-page">
    <div class="page-head">
      <div class="page-head__filters">
        <button
          v-for="pill in typeFilterPills"
          :key="pill.key || 'all'"
          type="button"
          class="type-pill"
          :class="{ 'is-active': filters.accountType === pill.key }"
          @click="setAccountTypeFilter(pill.key)"
        >
          {{ pill.label }}
          <span v-if="pill.key === '' && total > 0" class="type-pill__count">{{ total }}</span>
        </button>
      </div>
      <div class="page-head__actions">
        <el-button :icon="Refresh" :loading="loading" circle @click="load" />
        <el-button type="primary" class="btn-create" :icon="Plus" @click="openCreate">新建账号</el-button>
      </div>
    </div>

    <div class="content-panel">
      <div class="filter-bar">
        <div class="filter-bar__left">
          <el-select
            v-model="filters.categoryId"
            clearable
            filterable
            placeholder="岗位"
            class="filter-select"
            @change="reload"
          >
            <el-option v-for="c in categories" :key="c.id" :label="c.nameZh" :value="c.id" />
          </el-select>
          <el-select
            v-model="filters.departmentId"
            clearable
            filterable
            placeholder="部门"
            class="filter-select filter-select--wide"
            @change="reload"
          >
            <el-option v-for="d in departmentSelectOptions" :key="d.id" :label="d.label" :value="d.id" />
          </el-select>
        </div>
        <div class="filter-bar__right">
          <div class="search-box">
            <el-input
              v-model="filters.keyword"
              placeholder="搜索用户编号 / 姓名 / 手机号"
              clearable
              class="search-input"
              @keyup.enter="reload"
              @clear="reload"
            />
            <el-button type="primary" class="search-btn" :icon="Search" @click="reload">搜索</el-button>
          </div>
        </div>
      </div>

      <div v-if="activeFilterTags.length" class="filter-tags">
        <el-tag
          v-for="tag in activeFilterTags"
          :key="tag.key"
          closable
          size="small"
          effect="plain"
          @close="clearFilter(tag.key)"
        >
          {{ tag.label }}
        </el-tag>
        <el-button link type="primary" size="small" @click="resetFilters">清空筛选</el-button>
      </div>

      <div class="table-scroll">
        <el-table
          v-loading="loading"
          :data="items"
          class="desktop-table users-table"
          row-key="id"
          :row-class-name="rowClassName"
          @row-dblclick="openEdit"
        >
          <el-table-column label="类型" width="108" fixed="left">
            <template #default="{ row }">
              <div class="type-cell">
                <span :class="['type-icon', `type-icon--${row.accountType}`]">
                  <el-icon><component :is="accountTypeIcon(row.accountType)" /></el-icon>
                </span>
                <span class="type-label">{{ accountTypeTag(row.accountType).label }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="成员" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="member-cell">
                <span :class="['member-avatar', `member-avatar--${row.accountType}`]">
                  {{ avatarInitial(row) }}
                </span>
                <div class="member-info">
                  <span class="member-name">{{ row.realName || '—' }}</span>
                  <span class="member-login-row">
                    <span class="member-login">{{ row.loginId || '—' }}</span>
                    <el-button
                      v-if="row.loginId"
                      link
                      type="primary"
                      class="copy-btn"
                      :icon="DocumentCopy"
                      title="复制用户编号"
                      @click.stop="copyText(row.loginId, '用户编号')"
                    />
                  </span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="岗位" min-width="108" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row._role.muted" class="role-tag role-tag--empty">—</span>
              <span v-else class="role-tag">{{ row._role.text }}</span>
            </template>
          </el-table-column>
          <el-table-column label="部门" min-width="148" show-overflow-tooltip>
            <template #default="{ row }">{{ row.departmentPath || '—' }}</template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" width="124" show-overflow-tooltip>
            <template #default="{ row }">{{ row.phone || '—' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="76" align="center">
            <template #default="{ row }">
              <div class="status-cell" @click.stop>
                <el-tooltip
                  :disabled="!(myUserId != null && Number(row.id) === myUserId && row.isActive)"
                  content="不能停用自己的账号"
                  placement="top"
                >
                  <el-switch
                    :model-value="row.isActive"
                    size="small"
                    :loading="isToggling(row, 'isActive')"
                    :disabled="isStatusSwitchDisabled(row)"
                    @change="(val) => onStatusChange(row, val)"
                  />
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="安全" width="168" class-name="col-security">
            <template #default="{ row }">
              <div class="security-cell" @click.stop>
                <div class="security-chip">
                  <span class="security-chip__label">2FA</span>
                  <el-tag :type="row.totpBound ? 'success' : 'info'" size="small" effect="light" class="chip-tag">
                    {{ row.totpBound ? '已绑' : '未绑' }}
                  </el-tag>
                  <el-tooltip :disabled="!row.categoryRequireTwoFactor" content="岗位类别已强制要求" placement="top">
                    <el-switch
                      :model-value="row.require2faEffective"
                      size="small"
                      :loading="isToggling(row, 'requireTwoFactor')"
                      :disabled="is2faRequireSwitchDisabled(row)"
                      @change="(val) => onRequire2faChange(row, val)"
                    />
                  </el-tooltip>
                  <el-button
                    v-if="row.totpBound"
                    link
                    type="primary"
                    size="small"
                    class="mini-link"
                    :loading="isToggling(row, 'resetTotp')"
                    @click="onResetTotp(row)"
                  >
                    解绑
                  </el-button>
                </div>
                <div class="security-chip">
                  <span class="security-chip__label">改密</span>
                  <el-switch
                    :model-value="row.forceChangePassword"
                    size="small"
                    :loading="isToggling(row, 'forceChangePassword')"
                    :disabled="isToggling(row, 'forceChangePassword')"
                    @change="(val) => onForceChangePasswordChange(row, val)"
                  />
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="168" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="cell-muted">{{ $dt(row.createdAt) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="64" fixed="right" align="center">
            <template #default="{ row }">
              <el-dropdown trigger="click" @command="(c) => onRowAction(c, row)">
                <el-button link class="more-btn" @click.stop>
                  <el-icon :size="18"><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit" :icon="Edit">编辑</el-dropdown-item>
                    <el-dropdown-item command="resetPassword" :icon="Key">重置密码</el-dropdown-item>
                    <el-dropdown-item v-if="row.totpBound" command="resetTotp" divided>解绑 2FA</el-dropdown-item>
                    <el-dropdown-item command="forceLogout" :divided="!row.totpBound">强制下线</el-dropdown-item>
                    <el-dropdown-item command="delete" divided>
                      <span class="danger-text">删除账号</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="没有符合条件的账号" :image-size="88">
              <el-button v-if="hasActiveFilters" @click="resetFilters">恢复默认</el-button>
              <el-button type="primary" :icon="Plus" @click="openCreate">新建账号</el-button>
            </el-empty>
          </template>
        </el-table>
      </div>

      <div v-if="total > 0" class="table-footer">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          small
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>
    </div>

    <div class="mobile-list" v-loading="loading">
      <div
        v-for="row in items"
        :key="'m-' + row.id"
        class="mobile-card"
        :class="{ 'mobile-card-inactive': !row.isActive }"
        @click="openEdit(row)"
      >
        <div class="mobile-head">
          <div class="mobile-head-main">
            <span :class="['member-avatar member-avatar--sm', `member-avatar--${row.accountType}`]">
              {{ avatarInitial(row) }}
            </span>
            <div>
              <strong>{{ row.realName || row.loginId || '—' }}</strong>
              <span v-if="row.realName" class="mobile-sub">{{ row.loginId }}</span>
            </div>
          </div>
          <el-tag :type="accountTypeTag(row.accountType).type" size="small" effect="light">
            {{ accountTypeTag(row.accountType).label }}
          </el-tag>
        </div>
        <div class="mobile-tags">
          <el-tag v-if="row.isActive" type="success" size="small" effect="plain">启用</el-tag>
          <el-tag v-else type="info" size="small" effect="plain">停用</el-tag>
          <el-tag :type="row.totpBound ? 'success' : 'info'" size="small" effect="plain">
            2FA{{ row.totpBound ? '已绑' : '未绑' }}
          </el-tag>
          <el-tag v-if="row.forceChangePassword" type="warning" size="small" effect="plain">待改密</el-tag>
        </div>
        <div class="mobile-line"><span>岗位</span><span>{{ row._role.text }}</span></div>
        <div class="mobile-line"><span>部门</span><span class="mobile-val">{{ row.departmentPath || '—' }}</span></div>
        <div class="mobile-line"><span>手机号</span><span>{{ row.phone || '—' }}</span></div>
        <div class="mobile-security" @click.stop>
          <div class="security-chip">
            <span class="security-chip__label">启用</span>
            <el-tooltip
              :disabled="!(myUserId != null && Number(row.id) === myUserId && row.isActive)"
              content="不能停用自己的账号"
              placement="top"
            >
              <el-switch
                :model-value="row.isActive"
                size="small"
                :loading="isToggling(row, 'isActive')"
                :disabled="isStatusSwitchDisabled(row)"
                @change="(val) => onStatusChange(row, val)"
              />
            </el-tooltip>
          </div>
          <div class="security-chip">
            <span class="security-chip__label">2FA</span>
            <el-tag :type="row.totpBound ? 'success' : 'info'" size="small" effect="light" class="chip-tag">
              {{ row.totpBound ? '已绑' : '未绑' }}
            </el-tag>
            <el-switch
              :model-value="row.require2faEffective"
              size="small"
              :loading="isToggling(row, 'requireTwoFactor')"
              :disabled="is2faRequireSwitchDisabled(row)"
              @change="(val) => onRequire2faChange(row, val)"
            />
            <el-button
              v-if="row.totpBound"
              link
              type="primary"
              size="small"
              class="mini-link"
              :loading="isToggling(row, 'resetTotp')"
              @click="onResetTotp(row)"
            >
              解绑
            </el-button>
          </div>
          <div class="security-chip">
            <span class="security-chip__label">改密</span>
            <el-switch
              :model-value="row.forceChangePassword"
              size="small"
              :loading="isToggling(row, 'forceChangePassword')"
              :disabled="isToggling(row, 'forceChangePassword')"
              @change="(val) => onForceChangePasswordChange(row, val)"
            />
          </div>
        </div>
        <div class="mobile-line"><span>创建时间</span><span class="cell-muted">{{ $dt(row.createdAt) }}</span></div>
        <div class="mobile-actions" @click.stop>
          <el-button size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" :icon="Key" @click="onResetPassword(row)">重置密码</el-button>
          <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
        </div>
      </div>
      <el-empty v-if="!items.length && !loading" description="没有符合条件的账号">
        <el-button v-if="hasActiveFilters" @click="resetFilters">清空筛选</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建账号</el-button>
      </el-empty>
      <div v-if="total > 0" class="mobile-pager">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, prev, pager, next"
          small
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>
    </div>

    <el-dialog
      :title="dialogMode === 'create' ? '新建账号' : '编辑账号'"
      v-model="dialog"
      width="680px"
      top="5vh"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      @close="resetForm"
    >
      <div v-if="dialogMode === 'edit'" class="dialog-head">
        <div class="dialog-head-main">
          <strong>{{ form.realName || form.username }}</strong>
          <span class="dialog-head-login">{{ form.username }}</span>
        </div>
        <div class="dialog-head-tags">
          <span class="dialog-head-role">{{ editRoleText }}</span>
          <el-tag v-if="!form.isActive" type="info" size="small">已停用</el-tag>
          <el-tag v-if="form.forceChangePassword" type="warning" size="small">待改密</el-tag>
        </div>
      </div>
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="108px" class="users-form">
        <div class="form-section-title">基本信息</div>
        <el-form-item v-if="dialogMode === 'edit'" label="用户编号">
          <el-input :model-value="form.username" disabled />
        </el-form-item>
        <el-form-item v-if="dialogMode === 'create'" label="用户编号">
          <el-input model-value="保存后自动生成" disabled />
          <div class="sub">按账号类型与岗位生成，如 SA-2604-001、SALES-2604-001</div>
        </el-form-item>
        <el-form-item label="姓名" prop="realName">
          <el-input v-model="form.realName" autocomplete="off" maxlength="64" placeholder="员工真实姓名，用于界面展示与通知" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input
            v-model="form.phone"
            maxlength="32"
            clearable
            placeholder="可选；若填写需唯一，可用于登录"
          />
        </el-form-item>

        <div class="form-section-title">角色与组织</div>
        <el-form-item label="账号类型" prop="accountType">
          <el-radio-group v-model="form.accountType" :disabled="dialogMode === 'edit' && !isSuperAdminUser">
            <el-radio value="super_admin">超级管理员</el-radio>
            <el-radio value="manager">管理</el-radio>
            <el-radio value="employee">员工</el-radio>
          </el-radio-group>
          <div class="sub">超级管理员可进全部后台；管理/员工须指定岗位并继承默认权限。</div>
        </el-form-item>
        <el-form-item v-if="isStaffAccountType(form.accountType)" label="岗位" prop="employeeCategoryId">
          <el-select
            v-model="form.employeeCategoryId"
            placeholder="选择岗位"
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
        <el-form-item v-if="isStaffAccountType(form.accountType)" label="企业微信">
          <el-input
            v-model="form.wecomUserId"
            maxlength="64"
            clearable
            placeholder="通讯录 UserID，用于消息通知"
          />
        </el-form-item>

        <div class="form-section-title">登录与安全</div>
        <el-form-item v-if="dialogMode === 'create'" label="初始密码" prop="password">
          <div class="password-row">
            <el-input v-model="form.password" type="password" show-password autocomplete="new-password" />
            <el-button @click="fillDefaultPassword">默认 8 个 8</el-button>
            <el-button @click="fillRandomPassword">随机生成</el-button>
          </div>
          <div class="sub">未改则默认为 88888888；可用用户编号或姓名全称登录。</div>
        </el-form-item>
        <el-form-item v-if="dialogMode === 'create'" label="首次登录改密">
          <el-switch v-model="form.forceChangePassword" active-text="要求" inactive-text="不要求" />
        </el-form-item>
        <el-form-item v-if="form.accountType === 'super_admin'" label="强制 2FA">
          <el-switch v-model="form.requireTwoFactor" active-text="启用" inactive-text="关闭" />
          <div class="sub">启用后须绑定验证器 App 才能登录。</div>
        </el-form-item>
        <el-form-item v-if="dialogMode === 'edit'" label="账号状态">
          <el-switch v-model="form.isActive" active-text="启用" inactive-text="停用" />
        </el-form-item>

        <el-collapse v-if="isStaffAccountType(form.accountType)" v-model="permCollapse" class="perm-collapse">
          <el-collapse-item name="perm" title="个性化权限（可选，默认继承岗位）">
            <permission-toggles v-model="form.permissions" />
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <el-button :icon="Close" @click="dialog = false">取消</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="submit">保存</el-button>
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
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Avatar,
  Check,
  Close,
  DocumentCopy,
  Edit,
  Key,
  Medal,
  MoreFilled,
  Plus,
  Refresh,
  Search,
  User
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
  resetUserTotp,
  updateUser
} from '../api';
import PermissionToggles from '../components/PermissionToggles.vue';
import { emptyPermissionShape, mergeIntoShape } from '../utils/permissionDefaults';
import { isSuperAdmin } from '../utils/permissions';
import { axiosUserMessage } from '../utils/apiUserMessage';

const DEFAULT_INITIAL_PASSWORD = '88888888';

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
  categoryId: null,
  departmentId: null
});

const pagination = reactive({ page: 1, pageSize: 20 });

const dialog = ref(false);
const dialogMode = ref('create');
const editingId = ref(null);
const formRef = ref(null);
const permCollapse = ref([]);
const skipAccountTypeWatch = ref(false);

const form = reactive({
  username: '',
  realName: '',
  password: DEFAULT_INITIAL_PASSWORD,
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
const togglingKey = ref('');

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

const categoryById = computed(() => {
  const m = {};
  for (const c of categories.value) m[c.id] = c;
  return m;
});

const accountTypeLabels = {
  super_admin: '超级管理员',
  manager: '管理',
  employee: '员工'
};

const typeFilterPills = [
  { key: '', label: '全部' },
  { key: 'super_admin', label: '超管' },
  { key: 'manager', label: '管理' },
  { key: 'employee', label: '员工' }
];

const accountTypeIconMap = {
  super_admin: Medal,
  manager: Avatar,
  employee: User
};

const hasActiveFilters = computed(() => activeFilterTags.value.length > 0);

const activeFilterTags = computed(() => {
  const tags = [];
  if (filters.keyword.trim()) {
    tags.push({ key: 'keyword', label: `关键词「${filters.keyword.trim()}」` });
  }
  if (filters.accountType) {
    tags.push({ key: 'accountType', label: accountTypeLabels[filters.accountType] || filters.accountType });
  }
  if (filters.categoryId) {
    const name = categoryById.value[filters.categoryId]?.nameZh || '岗位';
    tags.push({ key: 'categoryId', label: `岗位：${name}` });
  }
  if (filters.departmentId) {
    const dept = departmentSelectOptions.value.find((d) => d.id === filters.departmentId);
    tags.push({ key: 'departmentId', label: `部门：${dept?.label || filters.departmentId}` });
  }
  return tags;
});

const editRoleText = computed(() => {
  if (form.accountType === 'super_admin') return '超级管理员';
  const cat = categoryById.value[form.employeeCategoryId]?.nameZh;
  if (cat) return cat;
  if (form.accountType === 'manager') return '管理';
  return '—';
});

const myUserId = computed(() => {
  const raw = localStorage.getItem('token');
  if (!raw) return null;
  try {
    const part = raw.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const p = JSON.parse(atob(b64));
    return p.userId != null ? Number(p.userId) : null;
  } catch {
    return null;
  }
});

const formRules = computed(() => {
  const pwdRule = (rule, value, callback) => {
    if (!value || value.length < 6) callback(new Error('密码至少 6 位'));
    else callback();
  };
  const catRule = (rule, value, callback) => {
    if (isStaffAccountType(form.accountType) && !value) callback(new Error('请选择岗位'));
    else callback();
  };
  if (dialogMode.value === 'create') {
    return {
      realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
      password: [{ required: true, validator: pwdRule, trigger: 'blur' }],
      accountType: [{ required: true, message: '请选择账号类型', trigger: 'change' }],
      employeeCategoryId: [{ validator: catRule, trigger: 'change' }]
    };
  }
  return {
    realName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
    employeeCategoryId: [{ validator: catRule, trigger: 'change' }]
  };
});

function isStaffAccountType(at) {
  return at === 'employee' || at === 'manager';
}

function accountTypeLabel(at) {
  return accountTypeLabels[at] || '—';
}

const accountTypeTagMap = {
  super_admin: { label: '超管', type: 'danger' },
  manager: { label: '管理', type: 'warning' },
  employee: { label: '员工', type: 'info' }
};

function accountTypeTag(at) {
  return accountTypeTagMap[at] || { label: accountTypeLabel(at), type: 'info' };
}

function accountTypeIcon(at) {
  return accountTypeIconMap[at] || User;
}

function avatarInitial(row) {
  const name = String(row.realName || row.loginId || '?').trim();
  return name.charAt(0).toUpperCase();
}

function setAccountTypeFilter(type) {
  if (filters.accountType === type) return;
  filters.accountType = type;
  reload();
}

function buildDepartmentPath(departmentId) {
  if (!departmentId) return '';
  const parts = [];
  let cur = departmentById.value[departmentId];
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.nameZh);
    cur = cur.parentId != null ? departmentById.value[cur.parentId] : null;
  }
  return parts.join(' / ');
}

/** 列表「岗位」列：只显示岗位名，超管/无岗位时用固定文案 */
function roleDisplay(row) {
  if (row.accountType === 'super_admin') {
    return { text: '超级管理员', muted: false };
  }
  if (row.categoryNameZh) {
    return { text: row.categoryNameZh, muted: false };
  }
  if (row.accountType === 'manager') {
    return { text: '管理', muted: false };
  }
  return { text: '—', muted: true };
}

function memberLabel(row) {
  const name = String(row.realName || '').trim();
  const login = row.loginId || row.username || '';
  return name ? `${name}（${login}）` : login;
}

function rowClassName({ row }) {
  return row.isActive ? '' : 'row-inactive';
}

function isStatusSwitchDisabled(row) {
  if (isToggling(row, 'isActive')) return true;
  if (myUserId.value != null && Number(row.id) === myUserId.value && row.isActive) return true;
  return false;
}

function is2faRequireSwitchDisabled(row) {
  if (isToggling(row, 'requireTwoFactor')) return true;
  if (row.categoryRequireTwoFactor) return true;
  return false;
}

function parseTotpBound(r) {
  if (Number(r.totpBound) === 1) return true;
  const at = r.totpEnabledAt ?? r.totp_enabled_at;
  if (at == null || at === '') return false;
  if (typeof at === 'string') return at.length > 0 && !at.startsWith('0000');
  if (at instanceof Date) return !Number.isNaN(at.getTime());
  return !!at;
}

function isToggling(row, field) {
  return togglingKey.value === `${row.id}:${field}`;
}

function setToggling(row, field) {
  togglingKey.value = field ? `${row.id}:${field}` : '';
}

function buildListParams() {
  const p = {
    page: pagination.page,
    pageSize: pagination.pageSize
  };
  if (filters.keyword) p.keyword = filters.keyword.trim();
  if (filters.accountType) p.accountType = filters.accountType;
  if (filters.categoryId) p.categoryId = filters.categoryId;
  if (filters.departmentId) p.departmentId = filters.departmentId;
  return p;
}

function normalizeUserRow(r) {
  const requireTwoFactor = Number(r.requireTwoFactor) === 1;
  const categoryRequireTwoFactor = Number(r.categoryRequireTwoFactor) === 1;
  const totpBound = parseTotpBound(r);
  const row = {
    ...r,
    loginId: r.username || '',
    isActive: Number(r.isActive) === 1,
    forceChangePassword: Number(r.forceChangePassword) === 1,
    requireTwoFactor,
    categoryRequireTwoFactor,
    totpBound,
    require2faEffective: requireTwoFactor || categoryRequireTwoFactor,
    departmentPath: buildDepartmentPath(r.departmentId)
  };
  row._role = roleDisplay(row);
  return row;
}

async function load() {
  loading.value = true;
  try {
    const data = await listUsers(buildListParams());
    const nextTotal = Number(data.total || 0);
    const list = data.items || [];

    if (!list.length && nextTotal > 0 && pagination.page > 1) {
      pagination.page -= 1;
      loading.value = false;
      return load();
    }

    items.value = list.map(normalizeUserRow);
    total.value = nextTotal;
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

function onPageChange() {
  return load();
}

function onPageSizeChange() {
  pagination.page = 1;
  return load();
}

function resetFilters() {
  filters.keyword = '';
  filters.accountType = '';
  filters.categoryId = null;
  filters.departmentId = null;
  reload();
}

function clearFilter(key) {
  if (key === 'keyword') filters.keyword = '';
  else if (key === 'accountType') filters.accountType = '';
  else if (key === 'categoryId') filters.categoryId = null;
  else if (key === 'departmentId') filters.departmentId = null;
  reload();
}

async function copyText(text, label = '内容') {
  const v = String(text || '').trim();
  if (!v) return;
  try {
    await navigator.clipboard.writeText(v);
    ElMessage.success(`已复制${label}`);
  } catch {
    ElMessage.warning('复制失败，请手动选择');
  }
}

async function patchUserField(row, field, payload, successMsg) {
  setToggling(row, field);
  try {
    await updateUser(row.id, payload);
    if (successMsg) ElMessage.success(successMsg);
    await load();
  } catch (e) {
    ElMessage.error(mapErr(e?.response?.data?.error));
    await load();
  } finally {
    setToggling(row, '');
  }
}

async function onStatusChange(row, nextActive) {
  if (Boolean(nextActive) === Boolean(row.isActive)) return;

  if (myUserId.value != null && Number(row.id) === myUserId.value && !nextActive) {
    ElMessage.warning('不能停用自己的账号');
    return;
  }

  if (!nextActive) {
    try {
      await ElMessageBox.confirm(
        `确定停用 ${memberLabel(row)}？停用后将强制下线且不可登录。`,
        '停用账号',
        { type: 'warning', confirmButtonText: '确认停用' }
      );
    } catch {
      return;
    }
  }

  setToggling(row, 'isActive');
  try {
    await updateUser(row.id, { isActive: nextActive });
    ElMessage.success(nextActive ? '已启用' : '已停用');
    await load();
  } catch (e) {
    ElMessage.error(mapErr(e?.response?.data?.error));
    await load();
  } finally {
    setToggling(row, '');
  }
}

async function onRequire2faChange(row, nextVal) {
  if (row.categoryRequireTwoFactor) return;
  if (Boolean(nextVal) === Boolean(row.requireTwoFactor)) return;
  if (nextVal) {
    try {
      await ElMessageBox.confirm(
        `开启后，${memberLabel(row)} 登录须绑定并使用双因素认证。继续？`,
        '要求 2FA',
        { type: 'warning', confirmButtonText: '确认开启' }
      );
    } catch {
      return;
    }
  }
  await patchUserField(
    row,
    'requireTwoFactor',
    { requireTwoFactor: nextVal },
    nextVal ? '已要求双因素认证' : '已取消双因素认证要求'
  );
}

async function onForceChangePasswordChange(row, nextVal) {
  if (Boolean(nextVal) === Boolean(row.forceChangePassword)) return;
  if (nextVal) {
    try {
      await ElMessageBox.confirm(
        `开启后，${memberLabel(row)} 下次登录须修改密码。继续？`,
        '要求改密',
        { type: 'warning', confirmButtonText: '确认开启' }
      );
    } catch {
      return;
    }
  }
  await patchUserField(
    row,
    'forceChangePassword',
    { forceChangePassword: nextVal },
    nextVal ? '已标记为待改密' : '已取消待改密'
  );
}

async function onResetTotp(row) {
  try {
    await ElMessageBox.confirm(
      `解绑 ${memberLabel(row)} 的双因素认证？解绑后须重新绑定验证器才能登录。`,
      '解绑 2FA',
      { type: 'warning', confirmButtonText: '确认解绑' }
    );
  } catch {
    return;
  }
  setToggling(row, 'resetTotp');
  try {
    await resetUserTotp(row.id);
    ElMessage.success('已解绑双因素认证');
    await load();
  } catch (e) {
    ElMessage.error(mapErr(e?.response?.data?.error));
    await load();
  } finally {
    setToggling(row, '');
  }
}

function fillDefaultPassword() {
  form.password = DEFAULT_INITIAL_PASSWORD;
  formRef.value?.clearValidate?.('password');
}

function fillRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 10; i += 1) pwd += chars[Math.floor(Math.random() * chars.length)];
  form.password = pwd;
  formRef.value?.clearValidate?.('password');
}

function openCreate() {
  dialogMode.value = 'create';
  editingId.value = null;
  permCollapse.value = [];
  resetForm();
  dialog.value = true;
}

async function openEdit(row) {
  dialogMode.value = 'edit';
  editingId.value = row.id;
  permCollapse.value = [];
  let detail = null;
  try {
    const r = await getUserDetail(row.id);
    detail = r?.item || null;
  } catch {
    detail = null;
  }
  skipAccountTypeWatch.value = true;
  Object.assign(form, {
    username: row.username || row.loginId || '',
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
  skipAccountTypeWatch.value = false;
  dialog.value = true;
}

function resetForm() {
  const firstCategoryId = categories.value[0]?.id || null;
  skipAccountTypeWatch.value = true;
  Object.assign(form, {
    username: '',
    realName: '',
    password: DEFAULT_INITIAL_PASSWORD,
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
  skipAccountTypeWatch.value = false;
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
  if (code === 'USERNAME_EXISTS') return '用户编号已存在';
  if (code === 'LAST_SUPER_ADMIN') return '至少需保留一名可用的超级管理员';
  if (code === 'CANNOT_DISABLE_SELF') return '不能停用自己的账号';
  if (code === 'CANNOT_DELETE_SELF') return '不能删除自己的账号';
  if (code === 'PHONE_DUPLICATE') return '手机号已被其他账号使用';
  if (code === 'BAD_DEPARTMENT') return '所选部门不存在';
  if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_SIMPLE') return '密码不符合策略，请重新输入';
  if (code === 'TOTP_NOT_BOUND') return '该账号尚未绑定双因素认证';
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
      ElMessage.success(`已创建，用户编号：${r.loginId || '系统已生成'}`);
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
  try {
    await ElMessageBox.confirm(
      `将为 ${memberLabel(row)} 生成一次性临时密码，并强制其下次登录修改。继续？`,
      '重置密码',
      { type: 'warning', confirmButtonText: '生成临时密码' }
    );
  } catch {
    return;
  }
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

async function onRowAction(command, row) {
  if (command === 'edit') return openEdit(row);
  if (command === 'resetPassword') return onResetPassword(row);
  if (command === 'resetTotp') return onResetTotp(row);
  if (command === 'forceLogout') return onForceLogout(row);
  if (command === 'delete') return onDelete(row);
}

async function onForceLogout(row) {
  try {
    await ElMessageBox.confirm(
      `将立即注销 ${memberLabel(row)} 的全部会话，下次需重新登录。继续？`,
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
      `软删除 ${memberLabel(row)}？删除后不可登录，相关业务数据保留。`,
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

watch(
  () => form.accountType,
  (next, prev) => {
    if (skipAccountTypeWatch.value || !dialog.value || next === prev) return;
    if (next === 'super_admin') {
      form.employeeCategoryId = null;
      form.departmentId = null;
      form.wecomUserId = '';
      form.permissions = {};
      permCollapse.value = [];
    } else if (isStaffAccountType(next) && !form.employeeCategoryId) {
      const firstCategoryId = categories.value[0]?.id || null;
      form.employeeCategoryId = firstCategoryId;
      if (firstCategoryId) applyCategoryDefaultPermissions(firstCategoryId);
    }
  }
);
</script>

<style scoped>
.users-page {
  --users-primary: #2f74ff;
  --users-primary-soft: #eef4ff;
  --users-border: #e8edf3;
  --users-muted: #64748b;
  --users-text: #334155;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.page-head__filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.page-head__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.type-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--users-border);
  border-radius: 8px;
  background: #fff;
  color: var(--users-text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.type-pill:hover {
  border-color: #c7d7fe;
  color: var(--users-primary);
}
.type-pill.is-active {
  background: var(--users-primary);
  border-color: var(--users-primary);
  color: #fff;
  box-shadow: 0 4px 12px rgba(47, 116, 255, 0.28);
}
.type-pill__count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.type-pill:not(.is-active) .type-pill__count {
  background: #f1f5f9;
  color: var(--users-muted);
}
.btn-create {
  height: 38px;
  padding: 0 18px;
  border: none;
  background: linear-gradient(135deg, #4d8dff 0%, #2f74ff 100%);
  box-shadow: 0 4px 14px rgba(47, 116, 255, 0.32);
}
.btn-create:hover {
  background: linear-gradient(135deg, #3d82ff 0%, #2568ef 100%);
}

.content-panel {
  background: #fff;
  border: 1px solid var(--users-border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
  overflow: hidden;
}
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
  flex-wrap: wrap;
}
.filter-bar__left,
.filter-bar__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.filter-select {
  width: 132px;
}
.filter-select--wide {
  width: 168px;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 0;
}
.search-input {
  width: 260px;
}
.search-input :deep(.el-input__wrapper) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.search-btn {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  background: var(--users-primary);
  border-color: var(--users-primary);
}
.filter-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid #f1f5f9;
  background: #fafbfc;
}
.table-scroll {
  overflow-x: auto;
}
.users-table {
  width: 100%;
  min-width: 1080px;
}
.users-table :deep(.el-table__inner-wrapper::before) {
  display: none;
}
.users-table :deep(th.el-table__cell) {
  background: #f8fafc !important;
  color: var(--users-text);
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid #eef2f7;
}
.users-table :deep(td.el-table__cell) {
  border-bottom: 1px solid #f1f5f9;
  padding: 14px 0;
}
.users-table :deep(.el-table__row:hover > td.el-table__cell) {
  background: #f8fbff !important;
}
.table-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid #f1f5f9;
  background: #fafbfc;
}

.type-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 16px;
}
.type-icon--super_admin {
  background: #fef2f2;
  color: #ef4444;
}
.type-icon--manager {
  background: #fff7ed;
  color: #f97316;
}
.type-icon--employee {
  background: var(--users-primary-soft);
  color: var(--users-primary);
}
.type-label {
  font-size: 13px;
  color: var(--users-text);
}

.member-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.member-avatar {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}
.member-avatar--sm {
  width: 32px;
  height: 32px;
  font-size: 13px;
  border-radius: 8px;
}
.member-avatar--super_admin {
  background: linear-gradient(135deg, #f87171, #ef4444);
}
.member-avatar--manager {
  background: linear-gradient(135deg, #fb923c, #f97316);
}
.member-avatar--employee {
  background: linear-gradient(135deg, #60a5fa, #2f74ff);
}
.member-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.member-name {
  font-weight: 500;
  color: #1e293b;
  line-height: 1.35;
}
.member-login {
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.member-login-row {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
}

.role-tag {
  display: inline-block;
  max-width: 100%;
  padding: 2px 10px;
  border-radius: 6px;
  background: var(--users-primary-soft);
  color: var(--users-primary);
  font-size: 12px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.role-tag--empty {
  background: transparent;
  color: #cbd5e1;
  padding: 0;
}

.status-cell {
  display: flex;
  justify-content: center;
}
.status-cell :deep(.el-switch.is-checked .el-switch__core) {
  background: var(--users-primary);
  border-color: var(--users-primary);
}

.security-cell {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.security-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.security-chip__label {
  flex: 0 0 28px;
  font-size: 12px;
  color: var(--users-muted);
}
.chip-tag {
  border: none;
}
.security-cell :deep(.el-switch.is-checked .el-switch__core) {
  background: var(--users-primary);
  border-color: var(--users-primary);
}

.more-btn {
  padding: 4px;
  color: #64748b;
}
.more-btn:hover {
  color: var(--users-primary);
}
.cell-muted {
  font-size: 13px;
  color: #94a3b8;
}
.copy-btn,
.mini-link {
  padding: 0 4px;
  min-height: auto;
  flex-shrink: 0;
}
.mini-link {
  font-size: 12px;
}

.dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #eef2f7;
}
.dialog-head-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dialog-head-main strong {
  font-size: 16px;
  color: #1e293b;
}
.dialog-head-login {
  font-size: 12px;
  color: #94a3b8;
  word-break: break-all;
}
.dialog-head-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}
.dialog-head-role {
  font-size: 13px;
  color: #475569;
  padding: 2px 0;
}
.password-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.password-row .el-input {
  flex: 1;
}
.sub {
  font-size: 12px;
  color: var(--users-muted);
  margin-top: 4px;
  line-height: 1.45;
}
.form-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--users-text);
  margin: 4px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid #eef2f7;
}
.form-section-title:not(:first-child) {
  margin-top: 16px;
}
.perm-collapse {
  margin-top: 8px;
  border: none;
}
.perm-collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: #475569;
  border: none;
  background: #f8fafc;
  padding: 0 12px;
  border-radius: 6px;
  height: 40px;
}
.perm-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}
:deep(.row-inactive) {
  opacity: 0.62;
}
:deep(.row-inactive .member-name) {
  color: var(--users-muted);
}
:deep(.col-security) {
  vertical-align: middle;
}
.danger-text {
  color: #dc2626;
}

.mobile-list {
  display: none;
}
.mobile-list :deep(.el-empty) {
  padding: 24px 0;
}
.mobile-card {
  border: 1px solid var(--users-border);
  border-radius: 12px;
  padding: 12px;
  background: #fff;
  margin-bottom: 10px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
}
.mobile-card-inactive {
  opacity: 0.82;
  background: #fafafa;
}
.mobile-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.mobile-head-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.mobile-sub {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  word-break: break-all;
}
.mobile-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.mobile-security {
  margin: 8px 0;
  padding: 8px 10px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #eef2f7;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mobile-security .security-chip {
  justify-content: space-between;
}
.mobile-line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 4px 0;
  font-size: 13px;
  color: #475569;
}
.mobile-val {
  text-align: right;
  word-break: break-word;
}
.mobile-actions {
  margin-top: 10px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.mobile-pager {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}
:deep(.desktop-table .el-table__row) {
  cursor: pointer;
}

@media (max-width: 992px) {
  .page-head {
    flex-direction: column;
    align-items: stretch;
  }
  .page-head__filters {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 2px;
  }
  .page-head__actions {
    justify-content: flex-end;
  }
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .filter-bar__left,
  .filter-bar__right,
  .search-box {
    width: 100%;
  }
  .filter-select,
  .filter-select--wide,
  .search-input {
    width: 100%;
  }
  .content-panel,
  .table-footer {
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
