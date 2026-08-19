<template>
  <div class="ref-list-page dept-page">
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
        <el-button type="primary" class="btn-create" :icon="Plus" @click="openCreate">新增部门</el-button>
      </div>
    </div>

    <div class="content-panel">
      <div class="filter-bar">
        <div class="filter-bar__left">
          <span class="filter-hint">多级组织架构；删除前请先移除子部门，并将成员调离本部门。</span>
        </div>
        <div class="filter-bar__right">
          <div class="search-box">
            <el-input
              v-model="keyword"
              placeholder="搜索部门名称"
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
          <el-table-column label="部门" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="name-cell">
                <span class="name-icon name-icon--dept">
                  <el-icon><OfficeBuilding /></el-icon>
                </span>
                <div class="name-info">
                  <span class="name-title">{{ row.nameZh }}</span>
                  <span v-if="row.parentId != null" class="name-sub">{{ deptPathLabel(row.id) }}</span>
                  <span v-else class="name-sub">顶级部门</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="完整路径" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ deptPathLabel(row.id) }}</template>
          </el-table-column>
          <el-table-column label="直属上级" width="160" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="cell-muted">{{ parentName(row.parentId) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="人数" width="88" align="center">
            <template #default="{ row }">
              <span :class="['count-tag', { 'is-active': Number(row.memberCount) > 0 }]">
                {{ row.memberCount ?? 0 }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="80" align="center" />
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
                      <span class="danger-text">删除部门</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="emptyText" :image-size="88">
              <el-button v-if="hasFilter" @click="resetFilters">恢复默认</el-button>
              <el-button type="primary" :icon="Plus" @click="openCreate">新增部门</el-button>
            </el-empty>
          </template>
        </el-table>
      </div>

      <div v-if="displayItems.length" class="table-footer">
        <span>共 {{ displayItems.length }} 个部门</span>
      </div>
    </div>

    <div class="mobile-list" v-loading="loading">
      <div v-for="row in displayItems" :key="'m-' + row.id" class="mobile-card" @click="openEdit(row)">
        <div class="mobile-head">
          <div class="mobile-head-main">
            <span class="name-icon name-icon--dept name-icon--sm">
              <el-icon><OfficeBuilding /></el-icon>
            </span>
            <div>
              <strong>{{ deptPathLabel(row.id) }}</strong>
              <span class="name-sub">{{ parentName(row.parentId) }}</span>
            </div>
          </div>
          <span :class="['count-tag', { 'is-active': Number(row.memberCount) > 0 }]">
            {{ row.memberCount ?? 0 }} 人
          </span>
        </div>
        <div class="mobile-line"><span>排序</span><span>{{ row.sortOrder }}</span></div>
        <div class="mobile-actions" @click.stop>
          <el-button size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" plain @click="onDelete(row)">删除</el-button>
        </div>
      </div>
      <el-empty v-if="!displayItems.length && !loading" :description="emptyText">
        <el-button v-if="hasFilter" @click="resetFilters">清空筛选</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增部门</el-button>
      </el-empty>
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
        <el-button @click="dialog = false" :icon="Close">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit" :icon="Check">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import {
  Check,
  Close,
  Edit,
  MoreFilled,
  OfficeBuilding,
  Plus,
  Refresh,
  Search
} from '@element-plus/icons-vue';
import { createDepartment, deleteDepartment, listDepartmentsFlat, updateDepartment } from '../api';

export default {
  name: 'Departments',
  components: {
    Check,
    Close,
    Edit,
    MoreFilled,
    OfficeBuilding,
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
      OfficeBuilding,
      loading: false,
      items: [],
      keyword: '',
      searchKeyword: '',
      activePill: '',
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
    rootCount() {
      return this.items.filter((r) => r.parentId == null).length;
    },
    filterPills() {
      return [
        { key: '', label: '全部', count: this.items.length },
        { key: 'root', label: '顶级', count: this.rootCount }
      ];
    },
    displayItems() {
      let list = this.items;
      if (this.activePill === 'root') {
        list = list.filter((r) => r.parentId == null);
      }
      const kw = this.searchKeyword.trim().toLowerCase();
      if (!kw) return list;
      return list.filter((r) => this.deptPathLabel(r.id).toLowerCase().includes(kw));
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
    },
    hasFilter() {
      return !!this.searchKeyword.trim() || this.activePill !== '';
    },
    emptyText() {
      return this.hasFilter ? '没有符合条件的部门' : '暂无部门';
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
    onRowAction(command, row) {
      if (command === 'edit') return this.openEdit(row);
      if (command === 'delete') return this.onDelete(row);
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
@import '../styles/refListPage.css';

@media (max-width: 992px) {
  .dept-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    margin-bottom: 6px;
  }
  .dept-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }
}
</style>
