<template>
  <div class="reports-list">
    <el-card class="report-title-card">
      <template #header>
        <div class="field-header">
          <div>报告标题设置</div>
        </div>
      </template>
      <el-form :model="reportTitleForm" label-width="180px" @submit.prevent>
        <el-form-item label="报告名称（中文）">
          <el-input v-model="reportTitleForm.reportTitleZh" :readonly="!canEditReportTitles" />
        </el-form-item>
        <el-form-item label="Report Title (English)">
          <el-input v-model="reportTitleForm.reportTitleEn" :readonly="!canEditReportTitles" />
        </el-form-item>
      </el-form>
      <div v-if="canManageCompany" class="report-title-actions">
        <el-button v-if="!reportTitleEditMode" @click="startEditReportTitles">编辑</el-button>
        <template v-else>
          <el-button @click="cancelEditReportTitles">取消</el-button>
          <el-button type="primary" :loading="reportTitleSaving" @click="saveReportTitles">保存标题</el-button>
        </template>
      </div>
    </el-card>

    <div class="toolbar">
      <div class="left">
        <el-input v-model="q" placeholder="报告ID/报告编号/产品名称" clearable class="field-q" @keyup.enter="onSearch" />
        <el-input v-model="batchNo" placeholder="批次" clearable class="field-batch" @keyup.enter="onSearch" />
        <el-select v-model="status" placeholder="状态" clearable class="field-status" @change="onSearch">
          <el-option label="有效" value="active" />
          <el-option label="作废" value="void" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
      </div>
      <div class="right">
        <el-button
          v-if="perm('reports', 'export')"
          type="info"
          :icon="Download"
          size="small"
          :disabled="selected.length === 0"
          @click="onExportJson"
        >
          导出备案(JSON)
        </el-button>
        <el-button
          v-if="canBulkPass"
          :icon="Check"
          type="success"
          size="small"
          :disabled="selected.length === 0"
          @click="onBulkPass"
        >批量判定合格</el-button>
        <el-button
          v-if="canBulkVoid"
          :icon="Warning"
          type="warning"
          size="small"
          :disabled="selected.length === 0"
          @click="onBulkVoid"
        >批量作废</el-button>
        <el-button
          v-if="canBulkActivate"
          :icon="RefreshRight"
          type="primary"
          size="small"
          :disabled="selected.length === 0"
          @click="onBulkActivate"
        >批量有效</el-button>
        <el-button
          v-if="canBulkDelete"
          :icon="Delete"
          type="danger"
          size="small"
          plain
          :disabled="selected.length === 0"
          @click="onBulkDelete"
        >批量删除</el-button>
        <el-button
          v-if="perm('templates', 'use') && perm('reports', 'create')"
          type="info"
          :icon="Brush"
          size="small"
          plain
          @click="$router.push('/reports/designer')"
        >
          设计报告
        </el-button>
        <el-button
          v-if="perm('reports', 'create')"
          type="primary"
          :icon="Plus"
          size="small"
          @click="$router.push('/reports/new')"
        >
          新建报告
        </el-button>
        <el-button
          v-if="perm('qrcodes', 'create')"
          type="success"
          :icon="Promotion"
          size="small"
          :disabled="selected.length === 0"
          :loading="qrLoading"
          @click="onGenQr"
        >
          生成二维码（合并）
        </el-button>
      </div>
    </div>

    <div class="table-wrap">
      <el-table :data="items" border @selection-change="selected = $event">
      <el-table-column type="selection" width="48" />
      <el-table-column prop="reportUid" label="报告ID" width="140" />
      <el-table-column prop="reportNo" label="报告编号" width="120" />
      <el-table-column prop="productName" label="产品名称" min-width="180" />
      <el-table-column prop="batchNo" label="批次" width="140" />
      <el-table-column prop="conclusion" label="判定" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.conclusion === 'pass'" type="success">合格</el-tag>
          <el-tag v-else-if="row.conclusion === 'fail'" type="danger">不合格</el-tag>
          <el-tag v-else type="info">未知</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.status === 'active'">有效</el-tag>
          <el-tag v-else type="warning">作废</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="360">
        <template #default="{ row }">
          <el-button v-if="perm('reports', 'previewPrint')" type="info" plain size="small" @click="onPreview(row)">
            预览
          </el-button>
          <el-button v-if="perm('reports', 'previewPrint')" type="primary" plain size="small" @click="onPrint(row)">
            打印
          </el-button>
          <el-button
            v-if="perm('reports', 'view') || perm('reports', 'edit')"
            type="success"
            plain
            size="small"
            @click="$router.push(`/reports/${row.id}`)"
          >
            {{ perm('reports', 'edit') ? '编辑' : '查看' }}
          </el-button>
          <el-button
            v-if="row.status === 'active' && perm('reports', 'void')"
            type="warning"
            plain
            size="small"
            @click="onVoid(row)"
          >
            作废
          </el-button>
          <el-button
            v-else-if="row.status !== 'active' && perm('reports', 'activate')"
            type="success"
            plain
            size="small"
            @click="onActivate(row)"
          >
            恢复有效
          </el-button>
        </template>
      </el-table-column>
      </el-table>
    </div>
    <div class="pagination-wrap">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next, jumper"
        :current-page="page"
        :page-sizes="[10, 20, 50, 100]"
        :page-size="pageSize"
        :total="total"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </div>

    <el-dialog title="二维码" v-model="qrDialog" width="580px" :close-on-click-modal="false">
      <div v-if="qrResult" class="qr-dialog-body">
        <div class="qr-image-wrap">
          <img :src="qrResult.qrDataUrl" alt="qr" class="qr-image" />
        </div>

        <div class="qr-actions-row">
          <el-button type="primary" plain @click="onViewQrContent">查看二维码内容</el-button>
          <el-button @click="downloadQr">下载二维码图片</el-button>
        </div>
      </div>
    </el-dialog>

    <el-dialog
      title="报告预览"
      v-model="previewDialog"
      width="920px"
      top="4vh"
      :close-on-click-modal="false"
      @close="onPreviewDialogClose"
    >
      <div v-loading="previewLoading" style="min-height: 65vh">
        <iframe
          v-if="previewUrl"
          :src="previewUrl"
          style="width: 100%; height: 70vh; border: 1px solid #e5e7eb; border-radius: 8px;"
          @load="previewLoading = false"
        />
      </div>
      <template #footer>
        <el-button @click="previewDialog = false">关闭</el-button>
        <el-button type="primary" :disabled="!previewUrl" @click="printPreview">打印</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import {
  activateReport,
  createQrcode,
  exportReportsJson,
  getCompanySettings,
  listReports,
  updateCompanySettings,
  voidReport
} from '../api';
import { bulkActivateReports, bulkDeleteReports, bulkPassReports, bulkVoidReports } from '../api';
import { Brush, Check, Delete, Download, Plus, Promotion, RefreshRight, Search, Warning } from '@element-plus/icons-vue';
import { perm } from '../utils/permissions';
import { getAuthToken } from '../stores/auth';
import { customerReportPreviewUrl } from '../utils/customerReportPreviewUrl';

export default {
  name: 'ReportsList',
  components: { Brush, Check, Delete, Download, Plus, Promotion, RefreshRight, Search, Warning },
  data() {
    return {
      q: '',
      batchNo: '',
      status: '',
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      selected: [],
      qrLoading: false,
      qrDialog: false,
      qrResult: null,
      previewDialog: false,
      previewLoading: false,
      previewUrl: '',
      /** 弹窗内「打印」用；iframe 跨域时不能调用 contentWindow.print() */
      previewReportId: null,
      reportTitleForm: {
        reportTitleZh: '',
        reportTitleEn: ''
      },
      reportTitleSaving: false,
      reportTitleEditMode: false
    };
  },
  computed: {
    canManageCompany() {
      return this.perm('company', 'manage');
    },
    canEditReportTitles() {
      return this.canManageCompany && this.reportTitleEditMode;
    },
    canBulkPass() {
      return (
        this.perm('reports', 'bulkPass') ||
        this.perm('reports', 'edit') ||
        this.perm('reports', 'chairmanApprove')
      );
    },
    canBulkVoid() {
      return this.perm('reports', 'bulkVoid') || this.perm('reports', 'void');
    },
    canBulkActivate() {
      return this.perm('reports', 'bulkActivate') || this.perm('reports', 'activate');
    },
    canBulkDelete() {
      return this.perm('reports', 'bulkDelete') || this.perm('reports', 'void');
    }
  },
  mounted() {
    this.load();
    this.loadReportTitles();
  },
  methods: {
    perm,
    async loadReportTitles() {
      try {
        const { settings } = await getCompanySettings();
        if (!settings) return;
        this.reportTitleForm = {
          reportTitleZh: settings.reportTitleZh || settings.report_title_zh || '',
          reportTitleEn: settings.reportTitleEn || settings.report_title_en || ''
        };
      } catch (_) {
        // ignore
      }
    },
    startEditReportTitles() {
      if (!this.canManageCompany) return;
      this.reportTitleEditMode = true;
    },
    async cancelEditReportTitles() {
      this.reportTitleEditMode = false;
      await this.loadReportTitles();
    },
    async saveReportTitles() {
      this.reportTitleSaving = true;
      try {
        const { settings } = await getCompanySettings();
        const current = settings || {};
        await updateCompanySettings({
          companyNameZh: current.companyNameZh || current.company_name_zh || '',
          companyNameEn: current.companyNameEn || current.company_name_en || '',
          reportTitleZh: this.reportTitleForm.reportTitleZh,
          reportTitleEn: this.reportTitleForm.reportTitleEn,
          descriptionZh: current.descriptionZh ?? current.description_zh ?? null,
          descriptionEn: current.descriptionEn ?? current.description_en ?? null,
          logoUrl: current.logoUrl ?? current.logo_url ?? null
        });
        this.$message.success('报告标题已保存');
        this.reportTitleEditMode = false;
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '保存失败'));
      } finally {
        this.reportTitleSaving = false;
      }
    },
    async load() {
      const { items, total } = await listReports({
        q: this.q || undefined,
        batchNo: this.batchNo || undefined,
        status: this.status || undefined,
        limit: this.pageSize,
        offset: (this.page - 1) * this.pageSize
      });
      this.items = items;
      this.total = Number(total || 0);
      if (this.total > 0 && this.items.length === 0 && this.page > 1) {
        this.page -= 1;
        await this.load();
      }
    },
    async onPageChange(p) {
      this.page = p;
      await this.load();
    },
    async onSizeChange(size) {
      this.pageSize = size;
      this.page = 1;
      await this.load();
    },
    async onSearch() {
      this.page = 1;
      await this.load();
    },
    async onVoid(row) {
      await this.$confirm(
        `确认将报告 ${row.reportUid || row.reportNo} 作废？作废后客户预览将显示「此报告已作废」印章。`,
        '作废报告',
        { type: 'warning' }
      );
      try {
        await voidReport(row.id);
        this.$message.success('已设为作废');
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '作废失败'));
      }
    },
    async onActivate(row) {
      await this.$confirm(`确认将报告 ${row.reportUid || row.reportNo} 恢复为有效？`, '恢复有效', {
        type: 'warning'
      });
      try {
        await activateReport(row.id);
        this.$message.success('已恢复为有效');
        this.load();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '恢复失败'));
      }
    },
    async onGenQr() {
      this.qrLoading = true;
      try {
        const ids = this.selected.map((r) => r.id);
        const res = await createQrcode(ids);
        this.qrResult = res;
        this.qrDialog = true;
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '生成失败'));
      } finally {
        this.qrLoading = false;
      }
    },
    async onBulkPass() {
      const ids = this.selected.map((r) => r.id);
      if (!ids.length) return;
      try {
        await this.$confirm(`确认将选中的 ${ids.length} 条报告判定为合格？`, '批量判定合格', { type: 'warning' });
        await bulkPassReports(ids);
        this.$message.success('批量判定完成');
        await this.load();
      } catch (_) {
        // cancelled
      }
    },
    async onExportJson() {
      const ids = this.selected.map((r) => r.id);
      if (!ids.length) return;
      try {
        await exportReportsJson(ids);
        this.$message.success('已开始下载');
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '导出失败'));
      }
    },
    async onBulkVoid() {
      const ids = this.selected.map((r) => r.id);
      if (!ids.length) return;
      try {
        await this.$confirm(`确认作废选中的 ${ids.length} 条报告？`, '批量作废', { type: 'warning' });
        await bulkVoidReports(ids);
        this.$message.success('批量作废完成');
        await this.load();
      } catch (_) {
        // cancelled
      }
    },
    async onBulkActivate() {
      const ids = this.selected.map((r) => r.id);
      if (!ids.length) return;
      try {
        await this.$confirm(`确认将选中的 ${ids.length} 条报告恢复为有效？`, '批量有效', { type: 'warning' });
        await bulkActivateReports(ids);
        this.$message.success('批量恢复完成');
        await this.load();
      } catch (_) {
        // cancelled
      }
    },
    async onBulkDelete() {
      const ids = this.selected.map((r) => r.id);
      if (!ids.length) return;
      try {
        await this.$confirm(`确认删除选中的 ${ids.length} 条报告？删除后不可恢复`, '批量删除', { type: 'warning' });
        await bulkDeleteReports(ids);
        this.$message.success('批量删除完成');
        await this.load();
      } catch (_) {
        // cancelled
      }
    },
    downloadQr() {
      if (!this.qrResult?.qrDataUrl) return;
      const a = document.createElement('a');
      a.href = this.qrResult.qrDataUrl;
      a.download = `qrcode-${this.qrResult.token}.png`;
      a.click();
    },
    onViewQrContent() {
      if (!this.qrResult?.scanUrl) return;
      this.qrDialog = false;
      const w = window.open(this.qrResult.scanUrl, '_blank');
      if (!w) window.location.href = this.qrResult.scanUrl;
    },
    onPreview(row) {
      if (!getAuthToken()) {
        this.$message.error('请先登录');
        return;
      }
      this.previewReportId = row.id;
      this.previewUrl = '';
      this.previewDialog = true;
      this.previewLoading = true;
      this.$nextTick(() => {
        this.previewUrl = customerReportPreviewUrl(row.id);
      });
    },
    onPreviewDialogClose() {
      this.previewUrl = '';
      this.previewReportId = null;
    },
    onPrint(row) {
      if (!getAuthToken()) {
        this.$message.error('请先登录');
        return;
      }
      const w = window.open(customerReportPreviewUrl(row.id, { autoPrint: true }), '_blank');
      if (!w) this.$message.warning('浏览器阻止了弹窗，请允许后重试');
    },
    printPreview() {
      if (this.previewReportId == null) return;
      const w = window.open(customerReportPreviewUrl(this.previewReportId, { autoPrint: true }), '_blank');
      if (!w) this.$message.warning('浏览器阻止了弹窗，请允许后重试');
    }
  }
};
</script>

<style scoped>
.report-title-card {
  margin-bottom: 12px;
}
.field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.report-title-actions {
  text-align: right;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 10px;
}
.left,
.right {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
}
.right .el-button {
  flex: 0 0 auto;
}
.right :deep(.el-button) {
  --el-button-padding-horizontal: 10px;
  border-radius: 8px;
}
.left :deep(.el-button) {
  border-radius: 8px;
}
.reports-list :deep(.el-card),
.reports-list :deep(.el-input__wrapper),
.reports-list :deep(.el-select__wrapper),
.reports-list :deep(.el-textarea__inner),
.reports-list :deep(.el-dialog),
.reports-list :deep(.el-table),
.reports-list :deep(.el-table__inner-wrapper),
.reports-list :deep(.el-pagination button),
.reports-list :deep(.el-pagination .el-pager li) {
  border-radius: 8px;
}
.field-q {
  width: 260px;
}
.field-batch {
  width: 180px;
}
.field-status {
  width: 140px;
}
.table-wrap {
  width: 100%;
  overflow-x: auto;
}
.table-wrap :deep(.el-table) {
  min-width: 980px;
}
.pagination-wrap {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.qr-dialog-body {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-image-wrap {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 12px;
}

.qr-image {
  width: 280px;
  height: 280px;
  display: block;
}

.qr-actions-row {
  width: 100%;
  display: flex;
  gap: 12px;
  margin-top: 14px;
  padding: 0 10px;
}

.qr-actions-row .el-button {
  flex: 1;
}

.qr-content-box {
  width: 100%;
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #f8fafc;
}

.qr-content-title {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 8px;
}

.qr-url {
  font-size: 12.5px;
  color: #111827;
  word-break: break-all;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  line-height: 1.5;
}

.qr-content-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  justify-content: space-between;
}

@media (max-width: 992px) {
  .report-title-actions {
    text-align: left;
  }
  .report-title-actions .el-button {
    width: 100%;
    min-height: 38px;
  }
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .left,
  .right {
    width: 100%;
  }
  .right {
    flex-wrap: wrap;
  }
  .field-q,
  .field-batch,
  .field-status {
    width: 100%;
  }
  .left .el-button,
  .right .el-button {
    flex: 1 1 calc(50% - 8px);
    min-width: 120px;
  }
  .pagination-wrap {
    justify-content: center;
  }
}
</style>

