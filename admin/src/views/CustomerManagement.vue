<template>
  <div class="customer-management">
    <div class="page-header">
      <h2>客户管理</h2>
      <div class="toolbar">
        <el-input
          v-model="searchQuery"
          placeholder="搜索客户编码 / 名称 / 联系人"
          style="width: 320px"
          clearable
          @keyup.enter="loadData"
          @clear="loadData"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button v-if="hasCreatePerm" type="primary" @click="openCreateDialog" icon=Plus>
          新增客户
        </el-button>
        <el-button @click="loadData" icon=Refresh>刷新</el-button>

        <!-- 批量操作按钮 - 选中后显示 -->
        <el-button
          v-if="multipleSelection.length > 0"
          icon="Delete"
          type="danger"
          @click="batchDelete"
        >
          删除 ({{ multipleSelection.length }})
        </el-button>
        <el-button
          v-if="multipleSelection.length > 0"
          icon="Download"
          type="success"
          @click="exportSelected"
        >
          导出选中
        </el-button>
        <el-button
          v-if="multipleSelection.length === 0"
          @click="exportAll"
         icon=Download>
          导出全部
        </el-button>
      </div>
    </div>

    <el-table
      v-loading="loading"
      :data="customerList"
      border
      stripe
      style="width: 100%"
      :default-sort="{ prop: 'customer_name', order: 'ascending' }"
      @selection-change="handleSelectionChange"
      @row-dblclick="handleRowDblClick"
      row-key="id"
    >
      <el-table-column type="selection" width="55" />
      <el-table-column prop="customer_code" label="客户编码" width="140" sortable />
      <el-table-column prop="customer_name" label="客户名称" min-width="180" sortable />
      <el-table-column prop="contact_name" label="联系人" width="120" />
      <el-table-column prop="phone" label="电话" width="130" />
      <el-table-column prop="address" label="地址" min-width="200" show-overflow-tooltip />
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-switch
            v-model="row.is_active"
            :active-value="1"
            :inactive-value="0"
            :disabled="!hasDisablePerm"
            @change="(val) => toggleStatus(row.id, val)"
          />
        </template>
      </el-table-column>
      <el-table-column label="关联" width="140" align="center">
        <template #default="{ row }">
          <template v-if="row.order_count || row.contract_count_approved">
            <div class="link-cell">
              <el-button
                v-if="row.order_count"
                type="primary"
                link
                size="small"
                @click="goToCustomerOrders(row)"
              >
                订单{{ row.order_count }}
              </el-button>
              <el-button
                v-if="row.contract_count_approved"
                type="success"
                link
                size="small"
                @click="goToCustomerContracts(row)"
              >
                合同{{ row.contract_count_approved }}
              </el-button>
            </div>
          </template>
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="hasEditPerm"
            link
            type="primary"
            size="small"
            @click="openEditDialog(row)"
           icon=Edit>
            编辑
          </el-button>
          <el-button
            v-if="hasViewPerm"
            link
            size="small"
            @click="viewStats(row)"
          >
            详情
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && !customerList.length" description="暂无客户数据" />

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
        <el-form-item v-if="dialogMode === 'edit'" label="客户编码">
          <el-input :model-value="formData.customer_code" disabled placeholder="-" />
        </el-form-item>
        <el-form-item v-else label="客户编码">
          <span class="code-hint">保存后由系统自动生成（WY + 8位随机大写字母数字）</span>
        </el-form-item>
        <el-form-item label="客户名称" prop="customer_name">
          <el-input v-model="formData.customer_name" placeholder="完整客户名称" maxlength="256" />
        </el-form-item>
        <el-form-item label="联系人" prop="contact_name">
          <el-input v-model="formData.contact_name" placeholder="可选" maxlength="128" />
        </el-form-item>
        <el-form-item label="电话" prop="phone">
          <el-input v-model="formData.phone" placeholder="可选联系电话" maxlength="64" />
        </el-form-item>
        <el-form-item label="地址" prop="address">
          <el-input v-model="formData.address" type="textarea" placeholder="可选详细地址" maxlength="512" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm" icon=Check>保存</el-button>
      </template>
    </el-dialog>

    <!-- Stats Dialog -->
    <el-dialog
      title="客户详情"
      v-model="statsDialogVisible"
      width="480px"
    >
      <div v-if="currentStats" class="stats-content">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="客户编码">{{ currentStats.customer_code }}</el-descriptions-item>
          <el-descriptions-item label="客户名称">{{ currentStats.customer_name }}</el-descriptions-item>
          <el-descriptions-item v-if="currentStats.contact_name" label="联系人">{{ currentStats.contact_name }}</el-descriptions-item>
          <el-descriptions-item v-if="currentStats.phone" label="电话">{{ currentStats.phone }}</el-descriptions-item>
          <el-descriptions-item v-if="currentStats.address" label="地址">{{ currentStats.address }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="currentStats.is_active ? 'success' : 'info'" size="small">
              {{ currentStats.is_active ? '启用' : '停用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="关联订单">
            <el-button
              v-if="currentStats.order_count"
              type="primary"
              link
              size="small"
              @click="goToCustomerOrders(currentStats)"
            >
              {{ currentStats.order_count }} 个订单
            </el-button>
            <span v-else class="muted">暂无</span>
          </el-descriptions-item>
          <el-descriptions-item label="关联合同">
            <el-button
              v-if="currentStats.contract_count_approved"
              type="primary"
              link
              size="small"
              @click="goToCustomerContracts(currentStats)"
            >
              {{ currentStats.contract_count_approved }} 个有效合同
            </el-button>
            <span v-else class="muted">暂无</span>
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <template #footer>
        <el-button @click="statsDialogVisible = false" icon=Close>关闭</el-button>
        <el-button v-if="hasEditPerm" type="primary" @click="editFromStats" icon=Edit>编辑</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { 
  listSalesCustomers, 
  createSalesCustomer, 
  updateSalesCustomer, 
  toggleCustomerStatus, 
  getCustomerStats,
  batchDeleteCustomers
} from '../api';
import { perm } from '../utils/permissions';
import { Search } from '@element-plus/icons-vue';

export default {
  name: 'CustomerManagement',
  components: {
    Search
  },
  data() {
    return {
      loading: false,
      exporting: false,
      customerList: [],
      searchQuery: '',
      currentPage: 1,
      pageSize: 20,
      total: 0,
      dialogVisible: false,
      statsDialogVisible: false,
      dialogMode: 'create',
      saving: false,
      currentStats: null,
      editingId: null,
      multipleSelection: [],
      formData: {
        customer_code: '',
        customer_name: '',
        contact_name: '',
        phone: '',
        address: ''
      },
      formRules: {
        customer_name: [
          { required: true, message: '请输入客户名称', trigger: 'blur' },
          { min: 1, max: 256, message: '名称长度1-256字符', trigger: 'blur' }
        ]
      }
    };
  },
  computed: {
    dialogTitle() {
      return this.dialogMode === 'create' ? '新增客户' : '编辑客户';
    },
    hasViewPerm() {
      return perm('customer_management', 'view');
    },
    hasCreatePerm() {
      return perm('customer_management', 'create');
    },
    hasEditPerm() {
      return perm('customer_management', 'edit');
    },
    hasDisablePerm() {
      return perm('customer_management', 'disable');
    },
    hasDeletePerm() {
      return perm('customer_management', 'edit') || perm('customer_management', 'disable');
    }
  },
  watch: {
    searchQuery(val) {
      if (!val) {
        this.currentPage = 1;
        this.loadData();
      }
    }
  },
  mounted() {
    this.loadData();
  },
  methods: {
    async loadData() {
      if (!this.hasViewPerm) return;
      this.loading = true;
      try {
        const params = {
          q: this.searchQuery || undefined,
          page: this.currentPage,
          pageSize: this.pageSize
        };
        const res = await listSalesCustomers(params);
        this.customerList = res.items || [];
        this.total = res.pagination?.total || 0;
      } catch (e) {
        this.$message.error(this.apiUserMsg(e, '加载客户列表失败'));
        this.customerList = [];
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
    handleRowDblClick(row) {
      if (this.hasViewPerm) {
        this.viewStats(row);
      } else if (this.hasEditPerm) {
        this.openEditDialog(row);
      }
    },
    openCreateDialog() {
      this.dialogMode = 'create';
      this.editingId = null;
      this.formData = {
        customer_code: '',
        customer_name: '',
        contact_name: '',
        phone: '',
        address: ''
      };
      this.dialogVisible = true;
    },
    openEditDialog(row) {
      this.dialogMode = 'edit';
      this.editingId = row.id;
      this.formData = {
        customer_code: row.customer_code || '',
        customer_name: row.customer_name || '',
        contact_name: row.contact_name || '',
        phone: row.phone || '',
        address: row.address || ''
      };
      this.dialogVisible = true;
    },
    resetDialogForm() {
      this.formData = {
        customer_code: '',
        customer_name: '',
        contact_name: '',
        phone: '',
        address: ''
      };
      this.editingId = null;
    },
    async submitForm() {
      if (!this.$refs.formRef) return;
      const valid = await this.$refs.formRef.validate().catch(() => false);
      if (!valid) return;

      this.saving = true;
      try {
        let res;
        if (this.dialogMode === 'create') {
          const { customer_name, contact_name, phone, address } = this.formData;
          res = await createSalesCustomer({ customer_name, contact_name, phone, address });
        } else {
          const { customer_name, contact_name, phone, address } = this.formData;
          res = await updateSalesCustomer(this.editingId, { customer_name, contact_name, phone, address });
        }
        this.$message.success('操作成功');
        this.dialogVisible = false;
        this.loadData(); // auto refresh
      } catch (e) {
        this.$message.error(this.apiUserMsg(e, '保存失败'));
      } finally {
        this.saving = false;
      }
    },
    async toggleStatus(id, isActive) {
      if (!this.hasDisablePerm) return;
      try {
        await toggleCustomerStatus(id, isActive);
        this.$message.success(isActive ? '已启用' : '已停用');
        // list auto refreshed by switch v-model but to sync other fields, reload
        this.loadData();
      } catch (e) {
        this.$message.error(this.apiUserMsg(e, '状态切换失败'));
        this.loadData(); // revert UI
      }
    },
    handleSelectionChange(val) {
      this.multipleSelection = val;
    },
    async batchDelete() {
      if (!this.hasDeletePerm || this.multipleSelection.length === 0) return;
      
      const ids = this.multipleSelection.map(item => item.id);
      this.$confirm(
        `确定要删除选中的 ${ids.length} 个客户吗？此操作不可恢复，且如果客户有关联订单或合同将无法删除。`,
        '警告',
        {
          confirmButtonText: '确定删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      ).then(async () => {
        try {
          await batchDeleteCustomers({ ids });
          this.$message.success(`成功删除 ${ids.length} 个客户`);
          this.multipleSelection = [];
          this.loadData();
        } catch (e) {
          const msg = this.apiUserMsg(e, '删除失败');
          if (msg.includes('关联') || msg.includes('foreign')) {
            this.$message.error('部分客户有关联订单或合同，无法删除');
          } else {
            this.$message.error(msg);
          }
        }
      }).catch(() => {});
    },
    exportSelected() {
      if (this.multipleSelection.length === 0) return;
      const ids = this.multipleSelection.map(item => item.id);
      this.$message.info(`正在导出 ${ids.length} 个选中客户...（后端导出功能待完善）`);
      // TODO: 调用 export API
      console.log('Export selected customers:', ids);
    },
    exportAll() {
      this.$message.info('正在导出全部客户...（后端导出功能待完善）');
      // TODO: 调用 export API
      console.log('Export all customers');
    },
    async viewStats(row) {
      try {
        const stats = await getCustomerStats(row.id);
        this.currentStats = stats;
        this.statsDialogVisible = true;
      } catch (e) {
        this.$message.error(this.apiUserMsg(e, '获取统计失败'));
      }
    },
    editFromStats() {
      if (!this.currentStats) return;
      this.statsDialogVisible = false;
      this.openEditDialog(this.currentStats);
    },
    goToCustomerOrders(row) {
      const orderCount = row.order_count || 0;
      if (!orderCount) {
        this.$message.info('该客户暂无订单');
        return;
      }
      this.$router.push({
        path: '/sales/orders',
        query: { customer_code: row.customer_code }
      });
    },
    goToCustomerContracts(row) {
      const contractCount = row.contract_count_approved || 0;
      if (!contractCount) {
        this.$message.info('该客户暂无有效合同');
        return;
      }
      this.$router.push({
        path: '/sales/contracts',
        query: { customer_code: row.customer_code }
      });
    },
    apiUserMsg(e, defaultMsg) {
      return e?.response?.data?.error || e?.message || defaultMsg || '操作失败';
    }
  }
};
</script>

<style scoped>
.customer-management {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}
.page-header h2 {
  margin: 0;
  color: #333;
}
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.toolbar .el-input {
  max-width: 280px;
}
.pagination-bar {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
.code-hint {
  color: #909399;
  font-size: 13px;
  line-height: 32px;
}
.muted {
  color: #c0c4cc;
}
.link-cell {
  display: flex;
  gap: 8px;
  justify-content: center;
}
:deep(.el-table__row) {
  cursor: pointer;
}
:deep(.el-table__row:hover) {
  background-color: #f5f7fa;
}
:deep(.el-button + .el-button) {
  margin-left: 8px;
}
:deep(.el-descriptions__label) {
  width: 100px;
}
</style>
