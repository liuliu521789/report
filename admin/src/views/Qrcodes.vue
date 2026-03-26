<template>
  <div>
    <div class="toolbar">
      <div>
        <el-input
          v-model="q"
          placeholder="产品名称/批次号"
          clearable
          style="width: 260px; margin-right: 8px"
          @keyup.enter.native="onSearch"
        />
        <el-button type="primary" @click="onSearch">查询</el-button>
        <el-button
          type="danger"
          plain
          v-if="canDeleteQrcode"
          :disabled="selected.length === 0"
          @click="removeSelected"
        >批量删除</el-button>
      </div>
      <div>
        <el-button @click="load">刷新</el-button>
      </div>
    </div>

    <el-table :data="items" border @selection-change="selected = $event">
      <el-table-column type="selection" width="48" />
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="二维码" width="100">
        <template slot-scope="{ row }">
          <img v-if="row.qrThumbDataUrl" :src="row.qrThumbDataUrl" alt="qr-thumb" class="qr-thumb" />
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="token" label="Token" min-width="200" />
      <el-table-column prop="reportCount" label="绑定报告数" width="120" />
      <el-table-column label="关联报告（产品/批次）" min-width="320">
        <template slot-scope="{ row }">
          <div class="tag-wrap">
            <el-tag
              v-for="(t, idx) in row.reportTags || []"
              :key="`${row.id}-${idx}`"
              size="mini"
              type="info"
              effect="plain"
              class="report-tag"
            >
              {{ (t.productName || '未命名产品') + ' / ' + (t.batchNo || '无批次') }}
            </el-tag>
            <span v-if="!(row.reportTags && row.reportTags.length)" class="muted">无</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="200" />
      <el-table-column label="操作" width="180">
        <template slot-scope="{ row }">
          <el-button type="text" @click="open(row)">查看</el-button>
          <el-button v-if="canDeleteQrcode" type="text" style="color:#f56c6c" @click="removeOne(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
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

    <el-drawer title="二维码详情" :visible.sync="drawer" size="48%">
      <div v-loading="qrLoading" v-if="detail">
        <div style="margin-bottom: 12px">
          <el-table :data="detail.qrcode.reports" border size="mini">
            <el-table-column prop="reportNo" label="报告编号" width="160" />
            <el-table-column prop="productName" label="产品名称" />
            <el-table-column prop="batchNo" label="批次" width="140" />
            <el-table-column label="判定" width="90">
              <template slot-scope="{ row }">
                {{ formatConclusion(row.conclusion) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template slot-scope="{ row }">
                {{ formatStatus(row.status) }}
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-if="qrDataUrl" class="qr-preview-wrap">
          <img :src="qrDataUrl" alt="qr" class="qr-preview-image" />
          <div class="qr-actions">
            <el-button size="mini" type="primary" plain :disabled="!qrScanUrl" @click="openScanUrl">预览二维码</el-button>
            <el-button size="mini" @click="downloadQr">下载二维码</el-button>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import { deleteQrcodes, getQrcode, getQrcodeQr, listQrcodes } from '../api';
import { isSuperAdmin, perm } from '../utils/permissions';

export default {
  name: 'Qrcodes',
  computed: {
    canDeleteQrcode() {
      if (isSuperAdmin()) return true;
      return perm('qrcodes', 'delete') || perm('qrcodes', 'create');
    }
  },
  data() {
    return {
      q: '',
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      selected: [],
      drawer: false,
      detail: null,
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
      const { items, total } = await listQrcodes({
        q: this.q || undefined,
        limit: this.pageSize,
        offset: (this.page - 1) * this.pageSize
      });
      this.items = items;
      this.total = Number(total || 0);
      this.selected = [];
      if (this.total > 0 && this.items.length === 0 && this.page > 1) {
        this.page -= 1;
        await this.load();
      }
    },
    async onSearch() {
      this.page = 1;
      await this.load();
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
    async open(row) {
      this.drawer = true;
      this.qrLoading = true;
      this.qrDataUrl = '';
      this.qrScanUrl = '';
      try {
        const [detail, qr] = await Promise.all([getQrcode(row.id), getQrcodeQr(row.id)]);
        this.detail = detail;
        this.qrToken = qr.token;
        this.qrScanUrl = qr.scanUrl;
        this.qrDataUrl = qr.qrDataUrl;
      } catch (e) {
        this.$message.error(e?.response?.data?.error || '获取二维码详情失败');
      } finally {
        this.qrLoading = false;
      }
    },
    async doDelete(ids, hint) {
      await this.$confirm(`确认删除${hint}？删除后不可恢复`, '提示', { type: 'warning' });
      await deleteQrcodes(ids);
      this.$message.success('删除成功');
      await this.load();
    },
    async removeOne(row) {
      try {
        await this.doDelete([row.id], `该二维码（ID: ${row.id}）`);
      } catch (_) {
        // cancelled
      }
    },
    async removeSelected() {
      const ids = (this.selected || []).map((x) => x.id).filter(Boolean);
      if (!ids.length) return;
      try {
        await this.doDelete(ids, `选中的 ${ids.length} 条二维码`);
      } catch (_) {
        // cancelled
      }
    },
    downloadQr() {
      if (!this.qrDataUrl) return;
      const a = document.createElement('a');
      a.href = this.qrDataUrl;
      a.download = `qrcode-${this.qrToken}.png`;
      a.click();
    },
    openScanUrl() {
      if (!this.qrScanUrl) return;
      window.open(this.qrScanUrl, '_blank');
    },
    formatConclusion(v) {
      if (v === 'pass') return '合格';
      if (v === 'fail') return '不合格';
      return '未知';
    },
    formatStatus(v) {
      if (v === 'active') return '有效';
      if (v === 'void') return '作废';
      return '未知';
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
.pagination-wrap {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.muted {
  color: #666;
  font-size: 12px;
}
.qr-thumb {
  width: 56px;
  height: 56px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
}
.tag-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.report-tag {
  max-width: 280px;
}
.qr-preview-wrap {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.qr-preview-image {
  width: 220px;
  height: 220px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}
.qr-actions {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
</style>

