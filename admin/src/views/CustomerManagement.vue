<template>
  <div class="customer-management">
    <div class="page-header">
      <h2>客户管理</h2>
      <div class="toolbar">
        <el-tabs v-model="activeSource" type="card" class="source-tabs" @tab-change="onSourceTabChange">
          <el-tab-pane label="康铭" name="kangming" />
          <el-tab-pane label="物源" name="wuyuan" />
        </el-tabs>
        <el-input
          v-model="searchQuery"
          class="search-input-with-btn"
          placeholder="搜索客户编码 / 全称 / 简称"
          clearable
          @keyup.enter="runSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
          <template #append>
            <el-button type="primary" @click="runSearch">搜索</el-button>
          </template>
        </el-input>
        <el-button v-if="hasCreatePerm" type="primary" @click="openCreateDialog" icon=Plus>
          新增客户
        </el-button>
        <el-button @click="loadData" icon=Refresh>刷新</el-button>
        <el-button
          v-if="hasEditPerm"
          type="warning"
          :loading="importing"
          @click="openImportDialog"
        >
          上传 Excel 同步
        </el-button>

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
          v-if="canExport && multipleSelection.length > 0"
          icon="Download"
          type="success"
          :loading="exporting"
          :disabled="exporting"
          @click="exportSelected"
        >
          导出选中
        </el-button>
        <el-button
          v-if="canExport && multipleSelection.length === 0"
          :loading="exporting"
          :disabled="exporting"
          @click="exportAll"
          icon="Download"
        >
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
      <el-table-column prop="customer_name" label="客户全称" min-width="200" sortable />
      <el-table-column prop="contact_name" label="客户简称" width="130" />
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
        <el-form-item label="客户全称" prop="customer_name">
          <el-input v-model="formData.customer_name" placeholder="工商注册或对外使用的完整名称" maxlength="256" />
        </el-form-item>
        <el-form-item label="客户简称" prop="contact_name">
          <el-input v-model="formData.contact_name" placeholder="对内常用简称" maxlength="128" />
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
          <el-descriptions-item label="客户全称">{{ currentStats.customer_name }}</el-descriptions-item>
          <el-descriptions-item label="客户简称">{{ currentStats.contact_name || '—' }}</el-descriptions-item>
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

    <el-dialog
      v-model="importDialogVisible"
      title="上传客户目录表"
      width="520px"
      destroy-on-close
      @close="resetImportDialog"
    >
      <p class="import-dialog-meta">
        当前分组：<strong>{{ activeSourceLabel }}</strong>，将读取您所选文件中工作表「<strong>{{ activeSheetName }}</strong>」。
      </p>
      <el-alert type="info" :closable="false" show-icon class="import-alert">
        <template #default>
          <div>
            表内需含「客户名称」「简称」列。同名客户将更新简称；表中有而库中无的将新增；
            库中有而表中无的：若无订单且无合同将删除，否则将停用。
          </div>
        </template>
      </el-alert>
      <el-upload
        ref="importUploadRef"
        class="import-upload"
        drag
        :auto-upload="false"
        accept=".xlsx,.xls"
        :limit="1"
        :on-exceed="onImportExceed"
        :on-change="onImportFileChange"
        :on-remove="onImportFileRemove"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">将文件拖到此处，或<em>点击选择</em></div>
        <template #tip>
          <div class="el-upload__tip">支持 .xlsx / .xls，单个文件不超过 8MB。</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" :disabled="!importFile" @click="submitCustomerImport">
          开始同步
        </el-button>
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
  batchDeleteCustomers,
  exportCustomers,
  importSalesCustomersExcel
} from '../api';
import { perm, isSuperAdmin } from '../utils/permissions';
import { Search, UploadFilled } from '@element-plus/icons-vue';

export default {
  name: 'CustomerManagement',
  components: {
    Search,
    UploadFilled
  },
  data() {
    return {
      loading: false,
      exporting: false,
      importing: false,
      activeSource: 'kangming',
      customerList: [],
      searchQuery: '',
      currentPage: 1,
      pageSize: 20,
      total: 0,
      dialogVisible: false,
      statsDialogVisible: false,
      importDialogVisible: false,
      importFile: null,
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
          { required: true, message: '请输入客户全称', trigger: 'blur' },
          { min: 1, max: 256, message: '全称长度 1–256 字符', trigger: 'blur' }
        ],
        contact_name: [
          { required: true, message: '请输入客户简称', trigger: 'blur' },
          { min: 1, max: 128, message: '简称长度 1–128 字符', trigger: 'blur' }
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
    },
    canExport() {
      return (
        isSuperAdmin() ||
        perm('data_management', 'data_export') ||
        perm('data_management', 'data_export_all')
      );
    },
    activeSourceLabel() {
      return this.activeSource === 'kangming' ? '康铭' : '物源';
    },
    activeSheetName() {
      return this.activeSource === 'kangming' ? '康铭' : '物源';
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
          pageSize: this.pageSize,
          customer_group: this.activeSource
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
    runSearch() {
      this.currentPage = 1;
      this.loadData();
    },
    onSourceTabChange() {
      this.currentPage = 1;
      this.multipleSelection = [];
      this.loadData();
    },
    handleRowDblClick(row) {
      if (this.hasViewPerm) {
        this.viewStats(row);
      } else if (this.hasEditPerm) {
        this.openEditDialog(row);
      }
    },
    openImportDialog() {
      if (!this.hasEditPerm) return;
      this.importDialogVisible = true;
    },
    resetImportDialog() {
      this.importFile = null;
      this.$nextTick(() => {
        this.$refs.importUploadRef?.clearFiles?.();
      });
    },
    onImportExceed() {
      this.$message.warning('仅可选择一个文件');
    },
    onImportFileChange(uploadFile) {
      this.importFile = uploadFile.raw || null;
    },
    onImportFileRemove() {
      this.importFile = null;
    },
    async submitCustomerImport() {
      if (!this.hasEditPerm || !this.importFile) {
        if (!this.importFile) this.$message.warning('请先选择 Excel 文件');
        return;
      }
      const fd = new FormData();
      fd.append('file', this.importFile);
      fd.append('customer_group', this.activeSource);
      this.importing = true;
      try {
        const res = await importSalesCustomersExcel(fd);
        const d = res && typeof res.data === 'object' && res.data !== null ? res.data : res;
        const parts = [
          `新增 ${d.inserted ?? 0}`,
          `更新 ${d.updated ?? 0}`,
          `删除 ${d.deleted ?? 0}`,
          `停用 ${d.deactivated ?? 0}`
        ];
        if ((d.skippedDup ?? 0) > 0) parts.push(`跳过重复行 ${d.skippedDup}`);
        this.$message.success(`同步完成：${parts.join('，')}`);
        this.importDialogVisible = false;
        this.importFile = null;
        await this.loadData();
      } catch (e) {
        this.$message.error(this.apiUserMsg(e, '同步失败'));
      } finally {
        this.importing = false;
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
          const payload = {
            customer_name,
            contact_name,
            phone,
            address,
            customer_group: this.activeSource
          };
          res = await createSalesCustomer(payload);
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
    async exportBlobErrorMessage(err, fallback) {
      const data = err?.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          const j = JSON.parse(text);
          return j.message || j.data?.error || j.error || fallback;
        } catch {
          return fallback;
        }
      }
      return (
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        fallback
      );
    },
    triggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    async exportSelected() {
      if (!this.canExport || this.multipleSelection.length === 0) return;
      const ids = this.multipleSelection.map((item) => item.id);
      this.exporting = true;
      try {
        const blob = await exportCustomers({ ids: ids.join(',') });
        this.triggerDownload(blob, `sales-customers-selected-${Date.now()}.xlsx`);
        this.$message.success(`已导出 ${ids.length} 条客户`);
      } catch (e) {
        const msg = await this.exportBlobErrorMessage(e, '导出失败');
        this.$message.error(msg);
      } finally {
        this.exporting = false;
      }
    },
    async exportAll() {
      if (!this.canExport) return;
      this.exporting = true;
      try {
        const params = {};
        const q = (this.searchQuery || '').trim();
        if (q) params.q = q;
        params.customer_group = this.activeSource;
        const blob = await exportCustomers(params);
        this.triggerDownload(blob, `sales-customers-${Date.now()}.xlsx`);
        this.$message.success('导出完成');
      } catch (e) {
        const msg = await this.exportBlobErrorMessage(e, '导出失败');
        this.$message.error(msg);
      } finally {
        this.exporting = false;
      }
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
      const d = e?.response?.data;
      return d?.message || d?.error || e?.message || defaultMsg || '操作失败';
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
.source-tabs {
  flex: 0 0 auto;
}
.source-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.source-tabs :deep(.el-tabs__item) {
  height: 36px;
  line-height: 36px;
  padding: 0 16px;
}
.toolbar .search-input-with-btn {
  width: 360px;
  max-width: 100%;
}
.toolbar .search-input-with-btn :deep(.el-input-group__append) {
  padding: 0;
  background: transparent;
}
.toolbar .search-input-with-btn :deep(.el-input-group__append .el-button) {
  margin: 0;
  border-radius: 0 4px 4px 0;
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
.import-dialog-meta {
  margin: 0 0 12px;
  font-size: 14px;
  color: #606266;
  line-height: 1.6;
}
.import-alert {
  margin-bottom: 16px;
}
.import-upload {
  width: 100%;
}
.import-upload :deep(.el-upload-dragger) {
  width: 100%;
}
</style>
