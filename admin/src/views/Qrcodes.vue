<template>
  <div>
    <div class="toolbar">
      <div />
      <div>
        <el-button @click="load">刷新</el-button>
      </div>
    </div>

    <el-table :data="items" border>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="token" label="Token" min-width="200" />
      <el-table-column prop="reportCount" label="绑定报告数" width="120" />
      <el-table-column prop="createdAt" label="创建时间" width="200" />
      <el-table-column label="操作" width="160">
        <template slot-scope="{ row }">
          <el-button type="text" @click="open(row)">查看</el-button>
          <el-button type="text" @click="showQr(row)">二维码</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer title="二维码详情" :visible.sync="drawer" size="40%">
      <div v-if="detail">
        <div style="margin-bottom: 8px">Token：{{ detail.qrcode.token }}</div>
        <div style="margin-bottom: 12px">
          <el-table :data="detail.qrcode.reports" border size="mini">
            <el-table-column prop="reportNo" label="报告编号" width="160" />
            <el-table-column prop="productName" label="产品名称" />
            <el-table-column prop="batchNo" label="批次" width="140" />
            <el-table-column prop="conclusion" label="判定" width="90" />
            <el-table-column prop="status" label="状态" width="90" />
          </el-table>
        </div>
      </div>
    </el-drawer>

    <el-dialog title="二维码" :visible.sync="qrDialog">
      <div v-loading="qrLoading">
        <div v-if="qrScanUrl" style="margin-bottom: 8px">
          扫码地址：<el-link :href="qrScanUrl" target="_blank">{{ qrScanUrl }}</el-link>
        </div>
        <div v-if="qrDataUrl">
          <img :src="qrDataUrl" alt="qr" style="width: 280px; height: 280px" />
          <div style="margin-top: 12px">
            <el-button @click="downloadQr">下载二维码图片</el-button>
          </div>
        </div>
        <div v-else-if="!qrLoading" class="muted">未获取到二维码</div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { getQrcode, getQrcodeQr, listQrcodes } from '../api';

export default {
  name: 'Qrcodes',
  data() {
    return {
      items: [],
      drawer: false,
      detail: null,
      qrDialog: false,
      qrDataUrl: '',
      qrToken: '',
      qrLoading: false,
      qrScanUrl: ''
    };
  },
  mounted() {
    this.load();
  },
  methods: {
    async load() {
      const { items } = await listQrcodes({ limit: 100 });
      this.items = items;
    },
    async open(row) {
      const data = await getQrcode(row.id);
      this.detail = data;
      this.drawer = true;
    },
    async showQr(row) {
      this.qrDialog = true;
      this.qrLoading = true;
      this.qrDataUrl = '';
      this.qrScanUrl = '';
      try {
        const data = await getQrcodeQr(row.id);
        this.qrToken = data.token;
        this.qrScanUrl = data.scanUrl;
        this.qrDataUrl = data.qrDataUrl;
      } catch (e) {
        this.$message.error(e?.response?.data?.error || '获取二维码失败');
      } finally {
        this.qrLoading = false;
      }
    },
    downloadQr() {
      if (!this.qrDataUrl) return;
      const a = document.createElement('a');
      a.href = this.qrDataUrl;
      a.download = `qrcode-${this.qrToken}.png`;
      a.click();
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
.muted {
  color: #666;
  font-size: 12px;
}
</style>

