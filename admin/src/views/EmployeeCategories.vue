<template>
  <div class="ref-list-page categories-page">
    <div class="page-head">
      <div class="page-head__filters">
        <button
          v-for="pill in filterPills"
          :key="pill.key || 'all'"
          type="button"
          class="type-pill"
          :class="{ 'is-active': activePill === pill.key }"
          @click="setPillFilter(pill.key)"
        >
          {{ pill.label }}
          <span class="type-pill__count">{{ pill.count }}</span>
        </button>
      </div>
      <div class="page-head__actions">
        <el-button :icon="Refresh" :loading="loading" circle @click="load" />
        <el-button type="primary" class="btn-create" :icon="Plus" @click="openCreate">新增类别</el-button>
      </div>
    </div>

    <div class="content-panel">
      <div class="filter-bar">
        <div class="filter-bar__left">
          <span class="filter-hint">可编辑名称、排序、双因素与默认权限；删除前需无员工绑定。</span>
        </div>
        <div class="filter-bar__right">
          <div class="search-box">
            <el-input
              v-model="keyword"
              placeholder="搜索名称 / 代码"
              clearable
              class="search-input"
              @keyup.enter="applySearch"
              @clear="applySearch"
            />
            <el-button type="primary" class="search-btn" :icon="Search" @click="applySearch">搜索</el-button>
          </div>
        </div>
      </div>

      <div v-if="keyword.trim()" class="filter-tags">
        <el-tag closable size="small" effect="plain" @close="clearSearch">
          关键词「{{ keyword.trim() }}」
        </el-tag>
        <el-button link type="primary" size="small" @click="clearSearch">清空</el-button>
      </div>

      <div class="table-scroll">
        <el-table
          v-loading="loading"
          :data="displayItems"
          class="desktop-table ref-table"
          row-key="id"
          @row-dblclick="openEdit"
        >
          <el-table-column label="岗位类别" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="name-cell">
                <span class="name-icon">
                  <el-icon><Briefcase /></el-icon>
                </span>
                <div class="name-info">
                  <span class="name-title">{{ row.nameZh }}</span>
                  <span v-if="row.isBuiltin" class="name-sub">系统内置</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="代码" width="140" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="code-tag">{{ row.code }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="80" align="center" />
          <el-table-column label="强制 2FA" width="96" align="center">
            <template #default="{ row }">
              <div class="status-cell" @click.stop>
                <el-switch
                  :model-value="row.requireTwoFactor"
                  size="small"
                  :loading="isToggling(row)"
                  :disabled="isToggling(row)"
                  @change="(val) => on2faChange(row, val)"
                />
              </div>
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
                    <el-dropdown-item command="delete" divided>
                      <span class="danger-text">删除类别</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="emptyText" :image-size="88">
              <el-button v-if="hasFilter" @click="resetFilters">恢复默认</el-button>
              <el-button type="primary" :icon="Plus" @click="openCreate">新增类别</el-button>
            </el-empty>
          </template>
        </el-table>
      </div>

      <div v-if="displayItems.length" class="table-footer">
        <span>共 {{ displayItems.length }} 个类别</span>
      </div>
    </div>

    <div class="mobile-list" v-loading="loading">
      <div v-for="row in displayItems" :key="'m-' + row.id" class="mobile-card" @click="openEdit(row)">
        <div class="mobile-head">
          <div class="mobile-head-main">
            <span class="name-icon name-icon--sm">
              <el-icon><Briefcase /></el-icon>
            </span>
            <div>
              <strong>{{ row.nameZh }}</strong>
              <span class="name-sub">{{ row.code }}</span>
            </div>
          </div>
          <el-tag v-if="row.requireTwoFactor" type="success" size="small" effect="light">2FA</el-tag>
        </div>
        <div class="mobile-line"><span>排序</span><span>{{ row.sortOrder }}</span></div>
        <div class="mobile-line mobile-line-switch" @click.stop>
          <span>强制 2FA</span>
          <el-switch
            :model-value="row.requireTwoFactor"
            size="small"
            :loading="isToggling(row)"
            :disabled="isToggling(row)"
            @change="(val) => on2faChange(row, val)"
          />
        </div>
        <div class="mobile-actions" @click.stop>
          <el-button size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
        </div>
      </div>
      <el-empty v-if="!displayItems.length && !loading" :description="emptyText">
        <el-button v-if="hasFilter" @click="resetFilters">清空筛选</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增类别</el-button>
      </el-empty>
    </div>

    <el-dialog
      :title="dialogMode === 'create' ? '新增员工类别' : '编辑员工类别'"
      v-model="dialog"
      width="680px"
      class="category-dialog"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" class="categories-form">
        <el-form-item label="岗位类别" prop="nameZh">
          <el-autocomplete
            v-if="dialogMode === 'create'"
            v-model="form.nameZh"
            :fetch-suggestions="fetchCategorySuggestions"
            :trigger-on-focus="true"
            clearable
            maxlength="64"
            value-key="value"
            placeholder="输入或选择常用岗位，如 品管、销售"
            class="name-autocomplete"
            @select="onNamePresetSelect"
            @input="onNameZhInput"
            @blur="onNameZhBlur"
          >
            <template #default="{ item }">
              <span>{{ item.label }}</span>
            </template>
          </el-autocomplete>
          <el-input v-else v-model="form.nameZh" maxlength="64" />
          <div v-if="dialogMode === 'create'" class="sub-hint">可从常用岗位中选择，或自行输入；匹配成功将自动填入英文代码。</div>
        </el-form-item>
        <el-form-item v-if="dialogMode === 'create'" label="英文代码" prop="code">
          <el-input
            v-model="form.code"
            placeholder="如 warehouse，输入岗位名称后可自动匹配"
            maxlength="32"
            @input="onCodeManualInput"
          />
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="强制双因素认证">
          <el-switch v-model="form.requireTwoFactor" active-text="开启" inactive-text="关闭" />
          <div class="sub-hint">开启后，该类员工须绑定验证器 App，登录时除密码外需输入 6 位动态码（如董事长岗位）。</div>
        </el-form-item>
        <el-form-item label="默认权限" class="perm-form-item">
          <div class="perm-panel">
            <div class="perm-panel-head">
              <div class="perm-summary">
                已开启 <strong>{{ permEnabledCount }}</strong> 项权限
                <span v-if="permTemplateHint" class="perm-summary-hint">{{ permTemplateHint }}</span>
              </div>
              <div class="perm-panel-actions">
                <el-select
                  v-model="permRefCategoryId"
                  placeholder="参考已有岗位"
                  clearable
                  filterable
                  size="small"
                  class="perm-ref-select"
                  @change="applyRefCategoryPermissions"
                >
                  <el-option
                    v-for="c in permRefCategoryOptions"
                    :key="c.id"
                    :label="c.nameZh"
                    :value="c.id"
                  >
                    <span>{{ c.nameZh }}</span>
                    <span class="perm-ref-code">{{ c.code }}</span>
                  </el-option>
                </el-select>
                <el-button
                  size="small"
                  type="primary"
                  plain
                  :disabled="!canApplyRoleDefaults"
                  :loading="applyingRoleDefaults"
                  @click="applyRoleDefaultPermissions()"
                >
                  应用系统推荐
                </el-button>
                <el-button size="small" link type="danger" @click="clearAllPermissions">全部关闭</el-button>
              </div>
            </div>
            <el-collapse v-model="permDetailOpen" class="perm-detail-collapse">
              <el-collapse-item name="detail">
                <template #title>
                  <span>逐项调整权限</span>
                  <el-tag size="small" type="info" effect="plain" class="perm-advanced-tag">高级</el-tag>
                </template>
                <permission-toggles
                  :model-value="form.defaultPermissions"
                  @update:model-value="onPermissionsUpdate"
                />
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false" :icon="Close">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit" :icon="Check">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import {
  Briefcase,
  Check,
  Close,
  Edit,
  MoreFilled,
  Plus,
  Refresh,
  Search
} from '@element-plus/icons-vue';
import {
  createEmployeeCategory,
  deleteEmployeeCategory,
  getRoleDefaultPermissions,
  listEmployeeCategories,
  updateEmployeeCategory
} from '../api';
import {
  filterEmployeeCategoryPresets,
  lookupEmployeeCategoryCode
} from '../utils/employeeCategoryPresets';
import {
  BUILTIN_ROLE_CODES,
  countEnabledPermissions,
  emptyPermissionShape,
  mergeIntoShape
} from '../utils/permissionDefaults';
import PermissionToggles from '../components/PermissionToggles.vue';

export default {
  name: 'EmployeeCategories',
  components: {
    PermissionToggles,
    Briefcase,
    Check,
    Close,
    Edit,
    MoreFilled,
    Plus,
    Refresh,
    Search
  },
  data() {
    return {
      Plus,
      Refresh,
      Search,
      Edit,
      Close,
      Check,
      MoreFilled,
      Briefcase,
      loading: false,
      items: [],
      keyword: '',
      searchKeyword: '',
      activePill: '',
      togglingId: null,
      dialog: false,
      dialogMode: 'create',
      saving: false,
      editingId: null,
      codeManuallyEdited: false,
      autoFillingCode: false,
      permissionsManuallyEdited: false,
      applyingPermissions: false,
      applyingRoleDefaults: false,
      permRefCategoryId: null,
      permDetailOpen: [],
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
  computed: {
    twoFaCount() {
      return this.items.filter((r) => r.requireTwoFactor).length;
    },
    filterPills() {
      return [
        { key: '', label: '全部', count: this.items.length },
        { key: '2fa', label: '强制 2FA', count: this.twoFaCount }
      ];
    },
    displayItems() {
      let list = this.items;
      if (this.activePill === '2fa') {
        list = list.filter((r) => r.requireTwoFactor);
      }
      const kw = this.searchKeyword.trim().toLowerCase();
      if (!kw) return list;
      return list.filter((r) => {
        const name = String(r.nameZh || '').toLowerCase();
        const code = String(r.code || '').toLowerCase();
        return name.includes(kw) || code.includes(kw);
      });
    },
    hasFilter() {
      return !!this.searchKeyword.trim() || this.activePill !== '';
    },
    emptyText() {
      return this.hasFilter ? '没有符合条件的类别' : '暂无类别';
    },
    existingCategoryCodes() {
      return new Set(
        (this.items || [])
          .map((r) => String(r.code || '').trim().toLowerCase())
          .filter(Boolean)
      );
    },
    permEnabledCount() {
      return countEnabledPermissions(this.form.defaultPermissions);
    },
    canApplyRoleDefaults() {
      const code = String(this.form.code || '').trim().toLowerCase();
      return BUILTIN_ROLE_CODES.includes(code);
    },
    permTemplateHint() {
      const code = String(this.form.code || '').trim().toLowerCase();
      if (BUILTIN_ROLE_CODES.includes(code)) {
        return '可一键应用系统推荐，或在下方逐项微调';
      }
      if (this.permEnabledCount === 0) {
        return '建议先参考相近岗位，或应用系统推荐（内置岗位）';
      }
      return '';
    },
    permRefCategoryOptions() {
      if (this.dialogMode === 'edit' && this.editingId) {
        return (this.items || []).filter((c) => c.id !== this.editingId);
      }
      return this.items || [];
    }
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
    setPillFilter(key) {
      this.activePill = key;
    },
    applySearch() {
      this.searchKeyword = this.keyword;
    },
    clearSearch() {
      this.keyword = '';
      this.searchKeyword = '';
    },
    resetFilters() {
      this.keyword = '';
      this.searchKeyword = '';
      this.activePill = '';
    },
    isToggling(row) {
      return this.togglingId === row.id;
    },
    async on2faChange(row, nextVal) {
      if (Boolean(nextVal) === Boolean(row.requireTwoFactor)) return;
      if (nextVal) {
        try {
          await this.$confirm(
            `开启后，「${row.nameZh}」类员工登录须绑定并使用双因素认证。继续？`,
            '强制 2FA',
            { type: 'warning', confirmButtonText: '确认开启' }
          );
        } catch {
          return;
        }
      }
      this.togglingId = row.id;
      try {
        await updateEmployeeCategory(row.id, { requireTwoFactor: nextVal });
        this.$message.success(nextVal ? '已开启强制 2FA' : '已关闭强制 2FA');
        await this.load();
      } catch (e) {
        const code = e?.response?.data?.error;
        this.$message.error(code || '保存失败');
        await this.load();
      } finally {
        this.togglingId = null;
      }
    },
    onRowAction(command, row) {
      if (command === 'edit') return this.openEdit(row);
      if (command === 'delete') return this.onDelete(row);
    },
    openCreate() {
      this.dialogMode = 'create';
      this.resetForm();
      this.dialog = true;
    },
    openEdit(row) {
      this.dialogMode = 'edit';
      this.editingId = row.id;
      this.permissionsManuallyEdited = false;
      this.permRefCategoryId = null;
      this.permDetailOpen = [];
      this.form = {
        code: row.code,
        nameZh: row.nameZh,
        sortOrder: row.sortOrder,
        requireTwoFactor: !!row.requireTwoFactor,
        defaultPermissions: mergeIntoShape(emptyPermissionShape(), row.defaultPermissions || {})
      };
      this.dialog = true;
    },
    resetForm() {
      this.editingId = null;
      this.codeManuallyEdited = false;
      this.autoFillingCode = false;
      this.permissionsManuallyEdited = false;
      this.applyingPermissions = false;
      this.applyingRoleDefaults = false;
      this.permRefCategoryId = null;
      this.permDetailOpen = [];
      this.form = {
        code: '',
        nameZh: '',
        sortOrder: 0,
        requireTwoFactor: false,
        defaultPermissions: emptyPermissionShape()
      };
      this.$nextTick(() => this.$refs.formRef && this.$refs.formRef.clearValidate());
    },
    fetchCategorySuggestions(query, cb) {
      try {
        cb(
          filterEmployeeCategoryPresets(query, {
            excludeCodes: this.existingCategoryCodes
          })
        );
      } catch (e) {
        cb([]);
      }
    },
    applyAutoCodeFromName(nameZh) {
      if (this.dialogMode !== 'create' || this.codeManuallyEdited) return;
      const matched = lookupEmployeeCategoryCode(nameZh);
      if (!matched) return;
      this.autoFillingCode = true;
      this.form.code = matched;
      this.$nextTick(() => {
        this.autoFillingCode = false;
        this.tryAutoApplyPermissions();
      });
    },
    onNamePresetSelect(item) {
      if (!item) return;
      if (item.value) this.form.nameZh = item.value;
      if (item.code && !this.codeManuallyEdited) {
        this.autoFillingCode = true;
        this.form.code = item.code;
        this.$nextTick(() => {
          this.autoFillingCode = false;
          this.tryAutoApplyPermissions();
        });
      }
    },
    onNameZhInput() {
      this.applyAutoCodeFromName(this.form.nameZh);
    },
    onNameZhBlur() {
      this.applyAutoCodeFromName(this.form.nameZh);
    },
    onCodeManualInput(val) {
      if (this.autoFillingCode) return;
      const trimmed = String(val ?? '').trim();
      if (!trimmed) {
        this.codeManuallyEdited = false;
        return;
      }
      const auto = lookupEmployeeCategoryCode(this.form.nameZh);
      this.codeManuallyEdited = trimmed.toLowerCase() !== String(auto || '').toLowerCase();
      if (!this.codeManuallyEdited) this.tryAutoApplyPermissions();
    },
    setPermissions(partial) {
      this.applyingPermissions = true;
      this.form.defaultPermissions = mergeIntoShape(emptyPermissionShape(), partial || {});
      this.$nextTick(() => {
        this.applyingPermissions = false;
      });
    },
    onPermissionsUpdate(val) {
      this.form.defaultPermissions = val;
      if (!this.applyingPermissions) this.permissionsManuallyEdited = true;
    },
    applyRefCategoryPermissions(categoryId) {
      if (!categoryId) return;
      const cat = this.items.find((c) => c.id === categoryId);
      if (!cat?.defaultPermissions) return;
      this.setPermissions(cat.defaultPermissions);
      this.permissionsManuallyEdited = true;
      this.$message.success(`已套用「${cat.nameZh}」的权限配置`);
    },
    async applyRoleDefaultPermissions(opts = {}) {
      const silent = !!opts.silent;
      const code = String(this.form.code || '').trim().toLowerCase();
      if (!code) {
        if (!silent) this.$message.warning('请先填写英文代码');
        return;
      }
      if (!BUILTIN_ROLE_CODES.includes(code)) {
        if (!silent) {
          this.$message.info('该岗位暂无系统推荐权限，请从「参考已有岗位」中选择相近配置');
        }
        return;
      }
      this.applyingRoleDefaults = true;
      try {
        const { permissions } = await getRoleDefaultPermissions(code);
        this.setPermissions(permissions || {});
        if (!silent) this.$message.success('已应用系统推荐权限');
      } catch (e) {
        if (!silent) this.$message.error(this.$apiUserMsg(e, '加载推荐权限失败'));
      } finally {
        this.applyingRoleDefaults = false;
      }
    },
    async tryAutoApplyPermissions() {
      if (this.permissionsManuallyEdited || this.permEnabledCount > 0) return;
      const code = String(this.form.code || '').trim().toLowerCase();
      if (!BUILTIN_ROLE_CODES.includes(code)) return;
      await this.applyRoleDefaultPermissions({ silent: true });
    },
    clearAllPermissions() {
      this.setPermissions({});
      this.permissionsManuallyEdited = true;
      this.permRefCategoryId = null;
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
      try {
        await this.$confirm(`确定删除类别「${row.nameZh}」？`, '提示', { type: 'warning' });
      } catch {
        return;
      }
      try {
        await deleteEmployeeCategory(row.id);
        this.$message.success('已删除');
        this.load();
      } catch (e) {
        const code = e?.response?.data?.error;
        if (code === 'CATEGORY_IN_USE') this.$message.error('仍有员工绑定此类别，无法删除');
        else this.$message.error(code || '删除失败');
      }
    }
  }
};
</script>

<style scoped>
@import '../styles/refListPage.css';

.name-autocomplete {
  width: 100%;
}
.name-autocomplete :deep(.el-input) {
  width: 100%;
}
.sub-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}
.perm-form-item :deep(.el-form-item__content) {
  line-height: 1.4;
}
.perm-panel {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  overflow: hidden;
}
.perm-panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}
.perm-summary {
  font-size: 13px;
  color: #334155;
}
.perm-summary strong {
  color: #2563eb;
  font-weight: 600;
}
.perm-summary-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}
.perm-panel-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.perm-ref-select {
  width: 148px;
}
.perm-ref-code {
  float: right;
  font-size: 12px;
  color: #94a3b8;
}
.perm-detail-collapse {
  border: none;
  background: transparent;
}
.perm-detail-collapse :deep(.el-collapse-item__header) {
  padding: 0 14px;
  height: 42px;
  font-size: 13px;
  background: #fff;
  border-bottom: none;
}
.perm-detail-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
  background: #fff;
}
.perm-detail-collapse :deep(.el-collapse-item__content) {
  padding: 0 14px 14px;
}
.perm-advanced-tag {
  margin-left: 8px;
}
.perm-detail-collapse :deep(.perm-toggles) {
  max-height: 360px;
  overflow-y: auto;
  padding-right: 4px;
}
.mobile-line-switch {
  align-items: center;
}
@media (max-width: 992px) {
  .perm-panel-head {
    flex-direction: column;
    align-items: stretch;
  }
  .perm-panel-actions {
    width: 100%;
  }
  .perm-ref-select {
    width: 100%;
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
