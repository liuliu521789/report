<template>
  <div class="customer-models">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-left">
        <el-button @click="goBack" icon="ArrowLeft" plain>返回客户管理</el-button>
        <div class="header-title-group">
          <h2><el-icon><Collection /></el-icon> 产品型号设置</h2>
          <el-tag type="info" effect="plain" class="customer-name-tag">{{ customerName }}</el-tag>
        </div>
      </div>
      <div class="toolbar">
        <el-input
          v-model="searchQuery"
          placeholder="搜索客户型号 / 内部编码"
          style="width: 240px"
          clearable
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button
          v-if="hasEditPerm"
          type="primary"
          @click="openCreateDialog"
          icon="Plus"
        >
          新增客户型号
        </el-button>
        <el-tooltip content="型号对照与单价" placement="top">
          <el-button type="success" :loading="saving" @click="savePrices" icon="Check">
            <template v-if="!saving">保存{{ dirtyCount ? ` (${dirtyCount})` : '' }}</template>
          </el-button>
        </el-tooltip>
        <el-button @click="loadData" icon="Refresh" plain>刷新</el-button>
      </div>
    </div>

    <!-- 统计栏 -->
    <div class="stats-bar" v-if="mappings.length">
      <div class="stat-item">
        <span class="stat-label">合计</span>
        <span class="stat-value">{{ mappings.length }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">已编辑</span>
        <span class="stat-value" :class="{ 'is-dirty': dirtyCount > 0 }">{{ dirtyCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Excel 导入</span>
        <span class="stat-value">{{ excelSourceCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">手动维护</span>
        <span class="stat-value">{{ dbSourceCount }}</span>
      </div>
      <div class="stat-legend">
        <span class="legend-dot excel-dot"></span>Excel
        <span class="legend-dot db-dot"></span>手动
      </div>
    </div>

    <!-- 数据表格 -->
    <div class="table-wrap">
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="paginatedList"
        stripe
        style="width: 100%"
        :default-sort="{ prop: 'customer_model', order: 'ascending' }"
        :row-class-name="rowClassName"
        size="small"
        @sort-change="onSortChange"
      >
        <el-table-column type="index" label="#" width="44" align="center" />

        <el-table-column label="客户型号" sortable prop="customer_model" min-width="170">
          <template #default="{ row }">
            <div class="editable-cell">
              <el-input
                v-model="row.customer_model"
                size="small"
                placeholder="输入客户型号"
                :class="{ 'is-empty': !String(row.customer_model || '').trim() }"
                @input="markMappingDirty(row)"
              />
            </div>
          </template>
        </el-table-column>

        <el-table-column label="内部编码" sortable prop="internal_model" min-width="170">
          <template #default="{ row }">
            <div class="editable-cell">
              <el-input
                v-model="row.internal_model"
                size="small"
                placeholder="输入内部编码"
                :class="{ 'is-empty': !String(row.internal_model || '').trim() }"
                @input="markMappingDirty(row)"
              />
            </div>
          </template>
        </el-table-column>

        <el-table-column label="单价（元/kg）" width="140">
          <template #default="{ row }">
            <div class="price-cell">
              <el-input-number
                v-model="row.unit_price"
                :min="0"
                :precision="4"
                :controls="false"
                size="small"
                placeholder="0"
              />
              <el-icon
                v-if="row._persisted"
                class="price-icon"
                title="已保存价格"
                color="#67c23a"
              ><CircleCheck /></el-icon>
              <el-icon
                v-else-if="row._priceId"
                class="price-icon"
                title="已有价格"
                color="#e6a23c"
              ><Coin /></el-icon>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="76" align="center">
          <template #default="{ row }">
            <div class="action-btns">
              <el-tooltip content="删除该型号对照" placement="top">
                <el-button
                  text
                  type="danger"
                  size="small"
                  @click="handleDelete(row)"
                  style="font-size: 15px"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip v-if="row._mappingDirty" content="已修改，未保存" placement="top">
                <el-icon class="dirty-indicator" color="#e6a23c"><EditPen /></el-icon>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 空状态 -->
    <div class="empty-wrap" v-if="!loading && !mappings.length">
      <el-empty description="暂未找到该客户的产品型号对照数据">
        <template #image>
          <el-icon style="font-size: 56px; color: #c9cdd4"><Collection /></el-icon>
        </template>
        <el-button v-if="hasEditPerm" type="primary" @click="openCreateDialog" icon="Plus">
          新增客户型号
        </el-button>
      </el-empty>
    </div>

    <!-- 分页 -->
    <div class="pagination-bar" v-if="total > 0">
      <el-pagination
        v-model:current-page="currentPage"
        :page-sizes="[10, 20, 50, 100]"
        :page-size="pageSize"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
        background
      />
    </div>

    <!-- 新增客户型号 -->
    <el-dialog
      title="新增客户型号"
      v-model="createDialogVisible"
      width="480px"
      @close="resetCreateForm"
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createFormRules"
        label-width="110px"
      >
        <el-form-item label="客户型号" prop="customer_model">
          <el-input
            v-model="createForm.customer_model"
            placeholder="客户侧产品型号"
            maxlength="256"
            clearable
          />
        </el-form-item>
        <el-form-item label="内部编码" prop="internal_model">
          <el-input
            v-model="createForm.internal_model"
            placeholder="对应内部编码（可选）"
            maxlength="256"
            clearable
          />
        </el-form-item>
        <el-form-item label="单价（元/kg）">
          <el-input-number
            v-model="createForm.unit_price"
            :min="0"
            :precision="4"
            :controls="false"
            placeholder="0"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import {
  listCustomerModelMappings,
  listCustomerPrices,
  listCustomerPriceSuggestions,
  createCustomerPrice,
  patchCustomerPrice,
  deleteCustomerPrice,
  updateCustomerModelMapping,
  deleteCustomerModelMapping
} from '../api';
import { perm } from '../utils/permissions';
import {
  Search, ArrowLeft, Collection, CircleCheck, Coin,
  Delete, EditPen, InfoFilled, Plus
} from '@element-plus/icons-vue';

export default {
  name: 'CustomerModels',
  components: { Search, Delete, EditPen, Plus },
  data() {
    return {
      loading: false,
      saving: false,
      creating: false,
      customerId: null,
      customerName: '',
      mappings: [],
      searchQuery: '',
      sortKey: 'customer_model',
      sortOrder: 'ascending',
      currentPage: 1,
      pageSize: 20,
      total: 0,
      createDialogVisible: false,
      createForm: {
        customer_model: '',
        internal_model: '',
        unit_price: 0
      },
      createFormRules: {
        customer_model: [
          { required: true, message: '请输入客户型号', trigger: 'blur' },
          { min: 1, max: 256, message: '客户型号长度 1-256 字符', trigger: 'blur' }
        ]
      }
    };
  },
  computed: {
    hasEditPerm() {
      return perm('customer_management', 'edit');
    },
    filteredList() {
      const q = (this.searchQuery || '').trim().toLowerCase();
      if (!q) return this.mappings;
      return this.mappings.filter(
        item =>
          (item.customer_model || '').toLowerCase().includes(q) ||
          (item.internal_model || '').toLowerCase().includes(q)
      );
    },
    paginatedList() {
      let list = [...this.filteredList];
      if (this.sortKey) {
        list.sort((a, b) => {
          const va = String(a[this.sortKey] || '').toLowerCase();
          const vb = String(b[this.sortKey] || '').toLowerCase();
          const cmp = va.localeCompare(vb, 'zh');
          return this.sortOrder === 'descending' ? -cmp : cmp;
        });
      }
      const start = (this.currentPage - 1) * this.pageSize;
      return list.slice(start, start + this.pageSize);
    },
    dirtyCount() {
      return this.mappings.filter(m => m._mappingDirty).length;
    },
    excelSourceCount() {
      return this.mappings.filter(m => m.id == null).length;
    },
    dbSourceCount() {
      return this.mappings.filter(m => m.id != null).length;
    }
  },
  watch: {
    searchQuery() {
      this.currentPage = 1;
      this.updateTotal();
    }
  },
  mounted() {
    this.customerId = this.$route.params.customerId;
    this.customerName = this.$route.query.customerName || '';
    this.loadData();
  },
  methods: {
    rowClassName({ row }) {
      const classes = [];
      if (row._mappingDirty) classes.push('row-dirty');
      if (row.id != null) classes.push('row-db-source');
      return classes.join(' ');
    },
    onSortChange({ prop, order }) {
      this.sortKey = prop || 'customer_model';
      this.sortOrder = order || 'ascending';
    },
    async loadData() {
      if (!this.customerId) return;
      this.loading = true;
      try {
        const [mappingsRes, priceRes, suggestRes] = await Promise.all([
          listCustomerModelMappings(this.customerId),
          listCustomerPrices(this.customerId),
          listCustomerPriceSuggestions(this.customerId)
        ]);
        const priceMap = {};
        for (const p of (priceRes.items || [])) {
          priceMap[p.product_model] = { _priceId: p.id, unit_price: Number(p.unit_price), _persisted: true };
        }
        for (const s of (suggestRes.items || [])) {
          if (!priceMap[s.product_model]) {
            priceMap[s.product_model] = { _priceId: null, unit_price: Number(s.unit_price), _persisted: false };
          }
        }
        this.mappings = (mappingsRes.items || []).map(m => {
          const priceInfo = priceMap[m.customer_model] || { _priceId: null, unit_price: 0, _persisted: false };
          return {
            ...m,
            customer_model: m.customer_model || '',
            internal_model: m.internal_model || '',
            _originalModel: m.customer_model || '',
            _mappingDirty: false,
            ...priceInfo
          };
        });
        this.currentPage = 1;
        this.updateTotal();
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || '加载失败';
        this.$message.error(msg);
        this.mappings = [];
      } finally {
        this.loading = false;
      }
    },
    updateTotal() {
      this.total = this.filteredList.length;
    },
    handleSizeChange(size) {
      this.pageSize = size;
      this.currentPage = 1;
    },
    handlePageChange(page) {
      this.currentPage = page;
    },
    goBack() {
      this.$router.push('/sales/customers');
    },
    openCreateDialog() {
      this.resetCreateForm();
      this.createDialogVisible = true;
    },
    resetCreateForm() {
      this.createForm = {
        customer_model: '',
        internal_model: '',
        unit_price: 0
      };
      this.$refs.createFormRef?.clearValidate?.();
    },
    async submitCreate() {
      if (!this.customerId) return;
      try {
        await this.$refs.createFormRef.validate();
      } catch {
        return;
      }
      const cm = String(this.createForm.customer_model || '').trim();
      const im = String(this.createForm.internal_model || '').trim();
      const price = Number(this.createForm.unit_price);
      const duplicate = this.mappings.some(
        m => String(m.customer_model || '').trim().toLowerCase() === cm.toLowerCase()
      );
      if (duplicate) {
        this.$message.warning('该客户型号已存在');
        return;
      }
      this.creating = true;
      try {
        await updateCustomerModelMapping(this.customerId, 'new', {
          customer_model: cm,
          internal_model: im
        });
        if (Number.isFinite(price) && price > 0) {
          await createCustomerPrice(this.customerId, {
            product_model: cm,
            unit_price: price,
            notes: ''
          });
        }
        this.$message.success('已新增');
        this.createDialogVisible = false;
        await this.loadData();
      } catch (e) {
        this.$message.error(this.apiUserMsg(e, '新增失败'));
      } finally {
        this.creating = false;
      }
    },
    apiUserMsg(e, defaultMsg) {
      const d = e?.response?.data;
      return d?.message || d?.error || e?.message || defaultMsg || '操作失败';
    },
    markMappingDirty(row) {
      row._mappingDirty = true;
    },
    async saveModels() {
      const dirty = this.mappings.filter(m => m._mappingDirty);
      if (!dirty.length) return;
      for (const item of dirty) {
        const cm = String(item.customer_model || '').trim();
        const im = String(item.internal_model || '').trim();
        if (!cm) continue;

        const renamed = item._originalModel && item._originalModel !== cm;

        // 改名时，如果目标型号名已被其他 DB 记录占用，先删除冲突记录
        if (renamed) {
          const conflict = this.mappings.find(
            m => m !== item && m.customer_model === cm && m.id != null
          );
          if (conflict) {
            await deleteCustomerModelMapping(this.customerId, conflict.id);
          }
        }

        if (item.id != null) {
          await updateCustomerModelMapping(this.customerId, item.id, {
            customer_model: cm,
            internal_model: im
          });
        } else {
          await updateCustomerModelMapping(this.customerId, 'new', {
            customer_model: cm,
            internal_model: im
          });
        }

        if (renamed) {
          await deleteCustomerModelMapping(this.customerId, 'by-model', {
            customer_model: item._originalModel
          });
          await this.migratePrice(item, cm);
        }
      }
    },
    async migratePrice(item, newModel) {
      const price = Number(item.unit_price);
      if (!item._priceId || price <= 0) return;
      try {
        await deleteCustomerPrice(this.customerId, item._priceId);
        item._priceId = null;
        await createCustomerPrice(this.customerId, {
          product_model: newModel,
          unit_price: price,
          notes: ''
        });
      } catch (e) {
        if (e?.response?.status === 409) return;
        console.warn('价格迁移失败', e?.response?.data || e?.message);
      }
    },
    async handleDelete(row) {
      try {
        await this.$confirm('确定要隐藏该型号对照吗？', '确认', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        });
      } catch {
        return;
      }
      if (row.id != null) {
        await deleteCustomerModelMapping(this.customerId, row.id);
      } else {
        await deleteCustomerModelMapping(this.customerId, 'by-model', {
          customer_model: row._originalModel || row.customer_model
        });
      }
      this.$message.success('已隐藏');
      await this.loadData();
    },
    async savePrices() {
      if (!this.customerId) return;
      this.saving = true;
      try {
        await this.saveModels();
        // 重新获取最新价格列表（型号改名后价格可能已迁移，需刷新 _priceId）
        const freshPriceRes = await listCustomerPrices(this.customerId);
        const freshPriceMap = {};
        for (const p of (freshPriceRes.items || [])) {
          freshPriceMap[p.product_model] = { _priceId: p.id, unit_price: Number(p.unit_price) };
        }
        for (const item of this.mappings) {
          const price = Number(item.unit_price);
          const fresh = freshPriceMap[item.customer_model];
          if (fresh) {
            await patchCustomerPrice(this.customerId, fresh._priceId, {
              product_model: item.customer_model,
              unit_price: price,
              notes: ''
            });
          } else if (price > 0) {
            await createCustomerPrice(this.customerId, {
              product_model: item.customer_model,
              unit_price: price,
              notes: ''
            });
          }
        }
        this.$message.success('已保存');
        await this.loadData();
      } catch (e) {
        this.$message.error(this.apiUserMsg(e, '保存失败'));
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<style scoped>
.customer-models {
  padding: 20px 24px;
  background: #f5f7fa;
  min-height: 100vh;
}

/* ───── 页面头部 ───── */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.header-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header-title-group h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1d2129;
  display: flex;
  align-items: center;
  gap: 6px;
}
.customer-name-tag {
  font-size: 12px;
  padding: 0 8px;
  line-height: 22px;
  border-radius: 3px;
}
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* ───── 统计栏 ───── */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 10px 16px;
  margin-bottom: 12px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e5e6eb;
  flex-wrap: wrap;
}
.stat-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.stat-item + .stat-item {
  padding-left: 24px;
  border-left: 1px solid #e5e6eb;
}
.stat-label {
  font-size: 12px;
  color: #86909c;
  white-space: nowrap;
}
.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: #1d2129;
  min-width: 18px;
  text-align: center;
  line-height: 1;
}
.stat-value.is-dirty {
  color: #e6a23c;
}
.stat-legend {
  margin-left: auto;
  font-size: 12px;
  color: #86909c;
  display: flex;
  align-items: center;
  gap: 10px;
}
.legend-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.excel-dot {
  background: #c9cdd4;
}
.db-dot {
  background: #e6a23c;
}

/* ───── 表格容器 ───── */
.table-wrap {
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e5e6eb;
  overflow: hidden;
}

/* ───── 表格 ───── */
.el-table {
  border: none !important;
}
.el-table :deep(th.el-table__cell) {
  background-color: #f7f8fa !important;
  color: #4e5969;
  font-weight: 600;
  font-size: 13px;
  padding: 8px 0;
  border-bottom: 1px solid #e5e6eb !important;
}
.el-table :deep(td.el-table__cell) {
  padding: 4px 0;
  border-bottom: 1px solid #f2f3f5;
}
.el-table :deep(.el-table__body tr.el-table__row:last-child td) {
  border-bottom: none;
}
.el-table :deep(.el-table__body tr.el-table__row--striped td) {
  background-color: #fafafa;
}

/* ───── 可编辑单元格 ───── */
.editable-cell {
  margin: -4px 0;
}
.editable-cell .el-input {
  width: 100%;
}
.editable-cell .el-input :deep(.el-input__wrapper) {
  padding: 1px 8px;
  border: 1px solid transparent;
  background: transparent;
  box-shadow: none !important;
  transition: all 0.2s ease;
  border-radius: 4px;
}
.editable-cell .el-input :deep(.el-input__wrapper:hover) {
  border-color: #c9cdd4;
  background: #fff;
}
.editable-cell .el-input :deep(.el-input__wrapper.is-focus) {
  border-color: #4080ff;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(64, 128, 255, 0.15) !important;
}
.editable-cell .el-input :deep(.el-input__inner) {
  height: 30px;
  font-size: 13px;
  color: #1d2129;
}
.editable-cell .el-input.is-empty :deep(.el-input__inner) {
  color: #c9cdd4;
}

/* ───── 来源标签 ───── */
.source-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  padding: 0 8px;
  line-height: 20px;
  border-radius: 3px;
  font-weight: 500;
}

/* ───── 单价列 ───── */
.price-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}
.price-cell .el-input-number :deep(.el-input__inner) {
  font-size: 13px;
  height: 30px;
}
.price-cell .el-input-number :deep(.el-input-number__increase),
.price-cell .el-input-number :deep(.el-input-number__decrease) {
  display: none;
}
.price-cell .el-input-number :deep(.el-input__wrapper) {
  padding-right: 8px;
}
.price-icon {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.7;
}

/* ───── 操作列 ───── */
.action-btns {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}
.action-btns .el-button {
  opacity: 0.5;
  transition: opacity 0.15s;
}
.el-table__row:hover .action-btns .el-button {
  opacity: 1;
}
.dirty-indicator {
  font-size: 13px;
  animation: blink 1.2s ease-in-out infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ───── 行状态 ───── */
:deep(.el-table .row-dirty td) {
  background-color: #fffbe6 !important;
}
:deep(.el-table .row-dirty:hover td) {
  background-color: #fff5cc !important;
}
:deep(.el-table .row-db-source:hover td) {
  background-color: #f0f9eb !important;
}

/* ───── 分页 ───── */
.pagination-bar {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  padding: 8px 0;
}

/* ───── 空状态 ───── */
.empty-wrap {
  padding: 60px 0;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e5e6eb;
}

/* ───── 响应式 ───── */
@media (max-width: 768px) {
  .customer-models {
    padding: 12px;
  }
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .toolbar {
    width: 100%;
    flex-wrap: wrap;
  }
  .toolbar .el-input {
    flex: 1;
    min-width: 160px;
  }
  .stat-item + .stat-item {
    padding-left: 16px;
  }
  .stats-bar {
    gap: 16px;
  }
  .stat-legend {
    margin-left: 0;
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
