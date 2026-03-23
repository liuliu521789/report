<template>
  <div>
    <div class="toolbar">
      <div class="left">
        <el-input v-model="q" placeholder="报告编号/产品名称" clearable style="width: 260px" @keyup.enter.native="load" />
        <el-input v-model="batchNo" placeholder="批次" clearable style="width: 180px; margin-left: 8px" @keyup.enter.native="load" />
        <el-select v-model="status" placeholder="状态" clearable style="width: 140px; margin-left: 8px" @change="load">
          <el-option label="有效" value="active" />
          <el-option label="作废" value="void" />
        </el-select>
        <el-button type="primary" style="margin-left: 8px" @click="load">查询</el-button>
      </div>
      <div class="right">
        <el-button v-if="perm('reports', 'create')" @click="$router.push('/reports/new')">新建报告</el-button>
        <el-button
          v-if="perm('qrcodes', 'create')"
          type="success"
          :disabled="selected.length === 0"
          :loading="qrLoading"
          @click="onGenQr"
        >
          生成二维码（合并）
        </el-button>
      </div>
    </div>

    <el-table :data="items" border @selection-change="selected = $event">
      <el-table-column v-if="perm('qrcodes', 'create')" type="selection" width="48" />
      <el-table-column prop="reportNo" label="报告编号" width="180" />
      <el-table-column prop="productName" label="产品名称" min-width="180" />
      <el-table-column prop="batchNo" label="批次" width="140" />
      <el-table-column prop="conclusion" label="判定" width="90">
        <template slot-scope="{ row }">
          <el-tag v-if="row.conclusion === 'pass'" type="success">合格</el-tag>
          <el-tag v-else-if="row.conclusion === 'fail'" type="danger">不合格</el-tag>
          <el-tag v-else type="info">未知</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90">
        <template slot-scope="{ row }">
          <el-tag v-if="row.status === 'active'">有效</el-tag>
          <el-tag v-else type="warning">作废</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="360">
        <template slot-scope="{ row }">
          <el-button v-if="perm('reports', 'previewPrint')" type="text" @click="onPreview(row)">预览</el-button>
          <el-button v-if="perm('reports', 'previewPrint')" type="text" @click="onPrint(row)">打印</el-button>
          <el-button
            v-if="perm('reports', 'view') || perm('reports', 'edit')"
            type="text"
            @click="$router.push(`/reports/${row.id}`)"
          >
            {{ perm('reports', 'edit') ? '编辑' : '查看' }}
          </el-button>
          <el-button v-if="row.status === 'active' && perm('reports', 'void')" type="text" @click="onVoid(row)">作废</el-button>
          <el-button v-else-if="row.status !== 'active' && perm('reports', 'activate')" type="text" @click="onActivate(row)">恢复有效</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog title="二维码" :visible.sync="qrDialog">
      <div v-if="qrResult">
        <div style="margin-bottom: 8px">扫码地址：<el-link :href="qrResult.scanUrl" target="_blank">{{ qrResult.scanUrl }}</el-link></div>
        <img :src="qrResult.qrDataUrl" alt="qr" style="width: 280px; height: 280px" />
        <div style="margin-top: 12px">
          <el-button @click="downloadQr">下载二维码图片</el-button>
        </div>
      </div>
    </el-dialog>

    <el-dialog
      title="报告预览"
      :visible.sync="previewDialog"
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
      <span slot="footer">
        <el-button @click="previewDialog = false">关闭</el-button>
        <el-button type="primary" :disabled="!previewUrl" @click="printPreview">打印</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { activateReport, createQrcode, listReports, voidReport } from '../api';
import { perm } from '../utils/permissions';

function customerReportPreviewUrl(reportId, { autoPrint = false } = {}) {
  const base = process.env.VUE_APP_API_BASE_URL || 'http://localhost:3001';
  const token = localStorage.getItem('token') || '';
  const q = new URLSearchParams({
    id: String(reportId),
    adminPreview: '1',
    accessToken: token
  });
  if (autoPrint) q.set('autoPrint', '1');
  return `${base}/miniprogram/report.html?${q.toString()}`;
}

export default {
  name: 'ReportsList',
  data() {
    return {
      q: '',
      batchNo: '',
      status: '',
      items: [],
      selected: [],
      qrLoading: false,
      qrDialog: false,
      qrResult: null,
      previewDialog: false,
      previewLoading: false,
      previewUrl: '',
      /** 弹窗内「打印」用；iframe 跨域时不能调用 contentWindow.print() */
      previewReportId: null
    };
  },
  mounted() {
    this.load();
  },
  methods: {
    perm,
    async load() {
      const { items } = await listReports({
        q: this.q || undefined,
        batchNo: this.batchNo || undefined,
        status: this.status || undefined,
        limit: 100
      });
      this.items = items;
    },
    async onVoid(row) {
      await this.$confirm(`确认将报告 ${row.reportNo} 作废？作废后客户预览将显示「此报告已作废」印章。`, '作废报告', {
        type: 'warning'
      });
      try {
        await voidReport(row.id);
        this.$message.success('已设为作废');
        this.load();
      } catch (e) {
        this.$message.error(e?.response?.data?.error || '作废失败');
      }
    },
    async onActivate(row) {
      await this.$confirm(`确认将报告 ${row.reportNo} 恢复为有效？`, '恢复有效', { type: 'warning' });
      try {
        await activateReport(row.id);
        this.$message.success('已恢复为有效');
        this.load();
      } catch (e) {
        this.$message.error(e?.response?.data?.error || '恢复失败');
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
        this.$message.error(e?.response?.data?.error || '生成失败');
      } finally {
        this.qrLoading = false;
      }
    },
    downloadQr() {
      if (!this.qrResult?.qrDataUrl) return;
      const a = document.createElement('a');
      a.href = this.qrResult.qrDataUrl;
      a.download = `qrcode-${this.qrResult.token}.png`;
      a.click();
    },
    onPreview(row) {
      if (!localStorage.getItem('token')) {
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
      if (!localStorage.getItem('token')) {
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
.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
.left,
.right {
  display: flex;
  align-items: center;
}
</style>

