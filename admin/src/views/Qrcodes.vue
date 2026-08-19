<template>
  <div class="qrcodes-page">
    <el-card class="toolbar-card" shadow="never">
      <div class="page-intro">
        <span>查看已生成的二维码及绑定报告；编号格式 QR-年份-序号（如 QR-2026-000001）；支持 Token、编号、ZJ-报告ID、产品、批次、客户搜索。</span>
        <el-button
          v-if="canCreateQrcode"
          type="primary"
          link
          :icon="Promotion"
          @click="$router.push('/reports')"
        >
          去报告列表生成二维码
        </el-button>
      </div>
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="q"
            placeholder="Token / QR-2026-000001 / ZJ-报告ID / 产品 / 批次 / 客户"
            clearable
            class="search-input"
            @keyup.enter="onSearch"
            @clear="onSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button type="primary" :icon="Search" :loading="listLoading" @click="onSearch">查询</el-button>
          <el-button :icon="RefreshLeft" @click="onReset">重置</el-button>
        </div>
        <div class="toolbar-right">
          <span v-if="selected.length" class="selected-tip">已选 {{ selected.length }} 条</span>
          <el-button :icon="Refresh" :loading="listLoading" @click="load">刷新</el-button>
        </div>
      </div>
      <div v-if="canDeleteQrcode" class="batch-actions">
        <el-button
          type="danger"
          plain
          size="small"
          :icon="Delete"
          :disabled="selected.length === 0"
          @click="removeSelected"
        >
          批量删除
        </el-button>
      </div>
    </el-card>

    <div class="table-wrap">
      <el-table
        v-loading="listLoading"
        class="desktop-table"
        :data="items"
        border
        stripe
        highlight-current-row
        row-key="id"
        @selection-change="selected = $event"
        @row-click="onRowClick"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="二维码编号" width="148" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="mono">{{ displayQrcodeUid(row) || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="二维码" width="88" align="center">
          <template #default="{ row }">
            <button
              v-if="row.qrThumbDataUrl && canViewDetail"
              type="button"
              class="qr-thumb-btn"
              title="点击查看详情"
              @click.stop="open(row)"
            >
              <img :src="row.qrThumbDataUrl" alt="二维码缩略图" class="qr-thumb" />
            </button>
            <img
              v-else-if="row.qrThumbDataUrl"
              :src="row.qrThumbDataUrl"
              alt="二维码缩略图"
              class="qr-thumb"
            />
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="Token" min-width="200">
          <template #default="{ row }">
            <div class="token-cell" @click.stop>
              <span class="token-text" :title="row.token">{{ truncateToken(row.token) }}</span>
              <el-button
                link
                type="primary"
                size="small"
                :icon="DocumentCopy"
                title="复制 Token"
                @click="copyText(row.token, 'Token 已复制')"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="绑定报告" width="108" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.reportCount > 0" type="success" effect="plain" round>
              {{ row.reportCount }} 份
            </el-tag>
            <span v-else class="muted">无</span>
          </template>
        </el-table-column>
        <el-table-column label="客户" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ formatQrcodeCustomers(row) }}</template>
        </el-table-column>
        <el-table-column label="关联报告（产品 / 批次）" min-width="300">
          <template #default="{ row }">
            <div class="tag-wrap">
              <el-tag
                v-for="(t, idx) in visibleReportTags(row)"
                :key="`${row.id}-${idx}`"
                size="small"
                type="info"
                effect="plain"
                class="report-tag"
              >
                {{ formatReportTag(t) }}
              </el-tag>
              <el-tag
                v-if="extraReportTagCount(row) > 0"
                size="small"
                type="info"
                effect="plain"
              >
                +{{ extraReportTagCount(row) }}
              </el-tag>
              <span v-if="!(row.reportTags && row.reportTags.length)" class="muted">无关联报告</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="168">
          <template #default="{ row }">{{ $dt(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="148" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canViewDetail"
              link
              type="primary"
              :icon="View"
              @click.stop="open(row)"
            >
              查看
            </el-button>
            <el-button
              v-if="canDeleteQrcode"
              link
              type="danger"
              :icon="Delete"
              @click.stop="removeOne(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="emptyDescription">
            <el-button v-if="canCreateQrcode" type="primary" @click="$router.push('/reports')">
              去报告列表生成
            </el-button>
          </el-empty>
        </template>
      </el-table>
    </div>

    <div class="mobile-list" v-loading="listLoading">
      <div
        v-for="row in items"
        :key="'m-' + row.id"
        class="mobile-card"
        :class="{ clickable: canViewDetail }"
        @click="canViewDetail && open(row)"
      >
        <div class="mobile-head">
          <div class="mobile-head-left">
            <img
              v-if="row.qrThumbDataUrl"
              :src="row.qrThumbDataUrl"
              alt="二维码"
              class="mobile-qr-thumb"
            />
            <strong>{{ displayQrcodeUid(row) || '—' }}</strong>
            <el-tag v-if="row.reportCount > 0" size="small" type="success" effect="plain" round>
              {{ row.reportCount }} 份报告
            </el-tag>
          </div>
          <span>{{ $dt(row.createdAt) }}</span>
        </div>
        <div class="mobile-line">
          <span>Token</span>
          <span class="mobile-token">
            {{ truncateToken(row.token) }}
            <el-button
              link
              type="primary"
              size="small"
              :icon="DocumentCopy"
              @click.stop="copyText(row.token, 'Token 已复制')"
            />
          </span>
        </div>
        <div class="mobile-line">
          <span>客户</span>
          <span>{{ formatQrcodeCustomers(row) }}</span>
        </div>
        <div class="mobile-tags">
          <el-tag
            v-for="(t, idx) in row.reportTags || []"
            :key="`${row.id}-m-${idx}`"
            size="small"
            type="info"
            effect="plain"
          >
            {{ formatReportTag(t) }}
          </el-tag>
          <span v-if="!(row.reportTags && row.reportTags.length)" class="muted">无关联报告</span>
        </div>
        <div class="mobile-actions" @click.stop>
          <el-button v-if="canViewDetail" size="small" type="primary" plain :icon="View" @click="open(row)">
            查看
          </el-button>
          <el-button
            v-if="canDeleteQrcode"
            size="small"
            type="danger"
            plain
            :icon="Delete"
            @click="removeOne(row)"
          >
            删除
          </el-button>
        </div>
      </div>
      <el-empty v-if="!listLoading && !items.length" :description="emptyDescription">
        <el-button v-if="canCreateQrcode" type="primary" @click="$router.push('/reports')">
          去报告列表生成
        </el-button>
      </el-empty>
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

    <el-drawer
      v-model="drawer"
      :title="drawerTitle"
      size="560px"
      class="qrcode-drawer"
      destroy-on-close
      @closed="onDrawerClosed"
    >
      <div v-loading="qrLoading" class="drawer-body">
        <template v-if="detail">
          <section class="qr-hero">
            <div v-if="qrDataUrl" class="qr-hero__img-wrap">
              <img :src="qrDataUrl" alt="二维码" class="qr-hero__img" />
            </div>
            <div class="qr-hero__main">
              <div class="qr-hero__head">
                <span class="qr-hero__uid">{{ qrQrcodeUid || '—' }}</span>
                <span v-if="detail.qrcode.createdAt" class="qr-hero__time">
                  {{ $dt(detail.qrcode.createdAt) }}
                </span>
              </div>
              <dl class="qr-info-list">
                <div class="qr-info-item">
                  <dt>扫码链接</dt>
                  <dd>
                    <span class="qr-info-value" :title="qrScanUrl">{{ truncateUrl(qrScanUrl) }}</span>
                    <span class="qr-info-actions">
                      <el-button
                        link
                        type="primary"
                        size="small"
                        :icon="DocumentCopy"
                        :disabled="!qrScanUrl"
                        @click="copyText(qrScanUrl, '扫码链接已复制')"
                      >
                        复制
                      </el-button>
                      <el-button
                        link
                        type="primary"
                        size="small"
                        :icon="View"
                        :disabled="!qrScanUrl"
                        @click="openScanUrl"
                      >
                        预览
                      </el-button>
                    </span>
                  </dd>
                </div>
                <div class="qr-info-item">
                  <dt>Token</dt>
                  <dd>
                    <span class="qr-info-value mono" :title="qrToken">{{ truncateToken(qrToken) }}</span>
                    <span class="qr-info-actions">
                      <el-button
                        link
                        type="primary"
                        size="small"
                        :icon="DocumentCopy"
                        :disabled="!qrToken"
                        @click="copyText(qrToken, 'Token 已复制')"
                      >
                        复制
                      </el-button>
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section class="qr-toolbar">
            <el-button size="small" :icon="Download" :loading="qrLabelBusy" :disabled="!qrDataUrl" @click="downloadQr">
              下载图片
            </el-button>
            <el-button size="small" :icon="Printer" :loading="qrLabelBusy" :disabled="!qrDataUrl" @click="printQr">
              打印标签
            </el-button>
          </section>

          <section class="qr-label-panel">
            <div class="qr-label-panel__head">标签设置</div>
            <div class="qr-label-panel__row">
              <span class="qr-label-panel__label">尺寸</span>
              <el-select v-model="labelPreset" size="small" class="qr-label-preset-select">
                <el-option
                  v-for="item in labelPresetOptions"
                  :key="item.key"
                  :label="item.label"
                  :value="item.key"
                />
              </el-select>
            </div>
            <div class="qr-label-panel__row qr-label-panel__row--fields">
              <span class="qr-label-panel__label">显示</span>
              <el-checkbox-group v-model="labelFields" class="qr-label-panel__checks">
                <el-checkbox value="qrcodeUid">二维码编号</el-checkbox>
                <el-checkbox value="product">产品</el-checkbox>
                <el-checkbox value="batch">批号</el-checkbox>
                <el-checkbox value="customer">客户</el-checkbox>
              </el-checkbox-group>
            </div>
          </section>

          <section class="reports-section">
            <div class="section-head">
              <h4>关联报告</h4>
              <span class="section-sub">{{ detail.qrcode.reports?.length || 0 }} 份</span>
            </div>
            <el-empty
              v-if="!(detail.qrcode.reports && detail.qrcode.reports.length)"
              description="暂无关联报告"
              :image-size="64"
            />
            <div v-else class="reports-table-wrap">
              <el-table
                :data="detail.qrcode.reports"
                border
                size="small"
                stripe
                @row-click="onReportRowClick"
              >
                <el-table-column prop="reportNo" label="报告编号" min-width="100" show-overflow-tooltip />
                <el-table-column prop="productName" label="产品" min-width="88" show-overflow-tooltip />
                <el-table-column prop="batchNo" label="批次" min-width="80" show-overflow-tooltip />
                <el-table-column label="判定" width="68" align="center">
                  <template #default="{ row }">
                    <el-tag v-if="row.conclusion === 'pass'" type="success" size="small">合格</el-tag>
                    <el-tag v-else-if="row.conclusion === 'fail'" type="danger" size="small">不合格</el-tag>
                    <el-tag v-else type="info" size="small">未知</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="60" align="center">
                  <template #default="{ row }">
                    <el-tag v-if="row.status === 'active'" size="small">有效</el-tag>
                    <el-tag v-else type="warning" size="small">作废</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="" width="48" align="center">
                  <template #default="{ row }">
                    <el-button
                      v-if="canOpenReport(row)"
                      link
                      type="primary"
                      size="small"
                      @click.stop="goReport(row)"
                    >
                      打开
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </section>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import {
  Delete,
  DocumentCopy,
  Download,
  Printer,
  Promotion,
  Refresh,
  RefreshLeft,
  Search,
  View
} from '@element-plus/icons-vue';
import { deleteQrcodes, getQrcode, getQrcodeQr, listQrcodes } from '../api';
import { isSuperAdmin, perm } from '../utils/permissions';
import {
  buildQrcodeLabelDataUrl,
  DEFAULT_QRCODE_LABEL_FIELDS,
  DEFAULT_QRCODE_LABEL_PRESET,
  downloadDataUrl,
  enrichReportsForQrcodeLabel,
  printQrcodeLabelImage,
  QRCODE_LABEL_SCENES,
  QRCODE_LABEL_PRESET_OPTIONS
} from '../utils/qrcodeLabelImage';
import { displayQrcodeUid } from '../utils/qrcodeUid';

const MAX_VISIBLE_TAGS = 3;

export default {
  name: 'Qrcodes',
  data() {
    return {
      Delete,
      DocumentCopy,
      Download,
      Printer,
      Promotion,
      Refresh,
      RefreshLeft,
      Search,
      View,
      q: '',
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      selected: [],
      listLoading: false,
      drawer: false,
      detail: null,
      qrDataUrl: '',
      qrToken: '',
      qrLoading: false,
      qrScanUrl: '',
      activeRowId: null,
      activeListRow: null,
      labelFields: [...DEFAULT_QRCODE_LABEL_FIELDS],
      labelPreset: DEFAULT_QRCODE_LABEL_PRESET,
      labelPresetOptions: QRCODE_LABEL_PRESET_OPTIONS,
      qrLabelBusy: false
    };
  },
  computed: {
    canDeleteQrcode() {
      if (isSuperAdmin()) return true;
      return perm('qrcodes', 'delete') || perm('qrcodes', 'create');
    },
    canViewDetail() {
      if (isSuperAdmin()) return true;
      return perm('qrcodes', 'viewDetail');
    },
    canCreateQrcode() {
      return perm('qrcodes', 'create');
    },
    drawerTitle() {
      if (!this.activeRowId) return '二维码详情';
      const uid =
        displayQrcodeUid(this.detail?.qrcode) ||
        displayQrcodeUid(this.items.find((r) => r.id === this.activeRowId)) ||
        '';
      return uid ? `二维码详情 ${uid}` : '二维码详情';
    },
    qrQrcodeUid() {
      return (
        displayQrcodeUid(this.detail?.qrcode) ||
        displayQrcodeUid(this.items.find((r) => r.id === this.activeRowId)) ||
        ''
      );
    },
    emptyDescription() {
      return this.q ? '未找到匹配的二维码，请调整搜索条件' : '暂无二维码，请先在报告列表勾选报告后生成';
    }
  },
  mounted() {
    this.load();
  },
  methods: {
    displayQrcodeUid,
    async load() {
      this.listLoading = true;
      try {
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
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载二维码列表失败'));
      } finally {
        this.listLoading = false;
      }
    },
    async onSearch() {
      this.page = 1;
      await this.load();
    },
    async onReset() {
      this.q = '';
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
    onRowClick(row) {
      if (!this.canViewDetail) return;
      this.open(row);
    },
    async open(row) {
      if (!this.canViewDetail) return;
      this.activeRowId = row.id;
      this.activeListRow = row;
      this.drawer = true;
      this.detail = null;
      this.qrLoading = true;
      this.qrDataUrl = '';
      this.qrScanUrl = '';
      this.qrToken = '';
      try {
        const [detail, qr] = await Promise.all([getQrcode(row.id), getQrcodeQr(row.id)]);
        this.detail = detail;
        this.qrToken = qr.token;
        this.qrScanUrl = qr.scanUrl;
        this.qrDataUrl = qr.qrDataUrl;
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '获取二维码详情失败'));
        this.drawer = false;
      } finally {
        this.qrLoading = false;
      }
    },
    onDrawerClosed() {
      this.detail = null;
      this.qrDataUrl = '';
      this.qrScanUrl = '';
      this.qrToken = '';
      this.activeRowId = null;
      this.activeListRow = null;
    },
    async doDelete(ids, hint) {
      await this.$confirm(`确认删除${hint}？删除后不可恢复`, '提示', { type: 'warning' });
      const idSet = new Set(ids);
      await deleteQrcodes(ids);
      this.$message.success('删除成功');
      if (this.activeRowId && ids.includes(this.activeRowId)) {
        this.drawer = false;
      }
      this.items = this.items.filter((row) => !idSet.has(row.id));
      this.total = Math.max(0, this.total - ids.length);
      this.selected = this.selected.filter((row) => !idSet.has(row.id));
      if (!this.items.length && this.page > 1 && this.total > 0) {
        this.page -= 1;
      }
      await this.load();
    },
    isConfirmDismiss(e) {
      return e === 'cancel' || e === 'close';
    },
    async removeOne(row) {
      try {
        await this.doDelete([row.id], `该二维码（${displayQrcodeUid(row) || row.id}）`);
      } catch (e) {
        if (this.isConfirmDismiss(e)) return;
        this.$message.error(this.$apiUserMsg(e, '删除失败'));
      }
    },
    async removeSelected() {
      const ids = (this.selected || []).map((x) => x.id).filter(Boolean);
      if (!ids.length) return;
      try {
        await this.doDelete(ids, `选中的 ${ids.length} 条二维码`);
      } catch (e) {
        if (this.isConfirmDismiss(e)) return;
        this.$message.error(this.$apiUserMsg(e, '删除失败'));
      }
    },
    downloadQr() {
      this.outputQrLabel('download');
    },
    printQr() {
      this.outputQrLabel('print');
    },
    async outputQrLabel(mode) {
      if (!this.qrDataUrl || this.qrLabelBusy) return;
      this.qrLabelBusy = true;
      try {
        const listRow = this.activeListRow || this.items.find((r) => r.id === this.activeRowId);
        const reportRows = enrichReportsForQrcodeLabel(
          this.detail?.qrcode?.reports || [],
          listRow?.reportTags || []
        );
        const { dataUrl, labelFailed } = await buildQrcodeLabelDataUrl(
          this.qrDataUrl,
          reportRows,
          this.labelFields,
          { qrcodeUid: this.qrQrcodeUid },
          {
            labelPreset: this.labelPreset,
            scene: mode === 'print' ? QRCODE_LABEL_SCENES.PRINT : QRCODE_LABEL_SCENES.DOWNLOAD
          }
        );
        if (labelFailed) {
          this.$message.warning('标签合成失败，已使用纯二维码');
        }
        if (mode === 'print') {
          this.$message.info('请在打印对话框中关闭「页眉和页脚」，边距选「无」，纸张选与标签尺寸一致');
          printQrcodeLabelImage(dataUrl, this.qrQrcodeUid || '二维码标签', this.labelPreset);
          return;
        }
        downloadDataUrl(dataUrl, `qrcode-${this.qrToken || this.activeRowId}.png`);
      } finally {
        this.qrLabelBusy = false;
      }
    },
    openScanUrl() {
      if (!this.qrScanUrl) return;
      window.open(this.qrScanUrl, '_blank');
    },
    async copyText(text, okMsg = '已复制') {
      const s = String(text ?? '').trim();
      if (!s) {
        this.$message.warning('内容为空，无法复制');
        return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(s);
        } else {
          const ta = document.createElement('textarea');
          ta.value = s;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        this.$message.success(okMsg);
      } catch {
        this.$message.error('复制失败');
      }
    },
    truncateToken(token) {
      const s = String(token || '');
      if (s.length <= 16) return s;
      return `${s.slice(0, 8)}…${s.slice(-6)}`;
    },
    truncateUrl(url) {
      const s = String(url || '');
      if (s.length <= 42) return s;
      return `${s.slice(0, 28)}…${s.slice(-10)}`;
    },
    formatReportTag(t) {
      return `${t.productName || '未命名产品'} / ${t.batchNo || '无批次'}`;
    },
    formatReportCustomer(row) {
      const name = String(row?.customerName || '').trim();
      const contact = String(row?.customerContact || '').trim();
      if (name && contact && name !== contact) return `${name}（${contact}）`;
      return name || contact || '—';
    },
    formatQrcodeCustomers(row) {
      const tags = row.customerTags || [];
      if (!tags.length) return '—';
      return tags.map((t) => this.formatReportCustomer(t)).join('、');
    },
    visibleReportTags(row) {
      return (row.reportTags || []).slice(0, MAX_VISIBLE_TAGS);
    },
    extraReportTagCount(row) {
      const n = (row.reportTags || []).length;
      return n > MAX_VISIBLE_TAGS ? n - MAX_VISIBLE_TAGS : 0;
    },
    canOpenReport(row) {
      return perm('reports', 'view') || perm('reports', 'edit');
    },
    goReport(row) {
      if (!row?.id) return;
      this.$router.push(`/reports/${row.id}`);
    },
    onReportRowClick(row) {
      if (this.canOpenReport(row)) this.goReport(row);
    }
  }
};
</script>

<style scoped>
.toolbar-card {
  margin-bottom: 12px;
}
.toolbar-card :deep(.el-card__body) {
  padding: 14px 16px;
}
.page-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.search-input {
  width: 280px;
}
.selected-tip {
  font-size: 13px;
  color: #64748b;
}
.batch-actions {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e5e7eb;
}
.table-wrap {
  width: 100%;
  overflow-x: auto;
}
.desktop-table {
  min-width: 1120px;
}
.mobile-list {
  display: none;
}
.mobile-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
  margin-bottom: 8px;
}
.mobile-card.clickable {
  cursor: pointer;
}
.mobile-card.clickable:active {
  background: #f8fafc;
}
.mobile-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #64748b;
}
.mobile-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.mobile-qr-thumb {
  width: 40px;
  height: 40px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
}
.mobile-line {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin: 4px 0;
  font-size: 13px;
  color: #475569;
}
.mobile-token {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  text-align: right;
  word-break: break-all;
}
.mobile-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.mobile-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
.pagination-wrap {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.muted {
  color: #94a3b8;
  font-size: 12px;
}
.qr-thumb-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  line-height: 0;
}
.qr-thumb-btn:hover .qr-thumb {
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.35);
}
.qr-thumb {
  width: 56px;
  height: 56px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fff;
}
.token-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.token-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.report-tag {
  max-width: 260px;
}
.drawer-body {
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.qrcode-drawer :deep(.el-drawer__body) {
  padding-top: 8px;
}
.qr-hero {
  display: flex;
  gap: 16px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
}
.qr-hero__img-wrap {
  flex: 0 0 auto;
}
.qr-hero__img {
  display: block;
  width: 148px;
  height: 148px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}
.qr-hero__main {
  flex: 1;
  min-width: 0;
}
.qr-hero__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
  margin-bottom: 12px;
}
.qr-hero__uid {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
  word-break: break-all;
}
.qr-hero__time {
  font-size: 12px;
  color: #94a3b8;
}
.qr-info-list {
  margin: 0;
}
.qr-info-item {
  margin: 0 0 10px;
}
.qr-info-item:last-child {
  margin-bottom: 0;
}
.qr-info-item dt {
  margin: 0 0 4px;
  font-size: 12px;
  color: #94a3b8;
  font-weight: 400;
}
.qr-info-item dd {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  min-width: 0;
}
.qr-info-value {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
  word-break: break-all;
}
.qr-info-value.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.qr-info-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.qr-info-actions :deep(.el-button) {
  padding: 0 4px;
  height: auto;
}
.qr-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.qr-label-panel {
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fafbfc;
}
.qr-label-panel__head {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}
.qr-label-panel__row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.qr-label-panel__row + .qr-label-panel__row {
  margin-top: 10px;
}
.qr-label-panel__row--fields {
  align-items: flex-start;
}
.qr-label-panel__label {
  flex: 0 0 36px;
  font-size: 13px;
  color: #64748b;
  line-height: 24px;
}
.qr-label-preset-select {
  width: 140px;
}
.qr-label-panel__checks {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
}
.qr-label-panel__checks :deep(.el-checkbox) {
  margin-right: 0;
  height: 24px;
}
.reports-section {
  margin-top: 4px;
}
.reports-table-wrap {
  overflow-x: auto;
}
.reports-section .section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}
.reports-section h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}
.section-sub {
  font-size: 13px;
  color: #94a3b8;
}
:deep(.el-table__row) {
  cursor: pointer;
}
@media (max-width: 992px) {
  .page-intro {
    flex-direction: column;
    align-items: flex-start;
  }
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar-left,
  .toolbar-right {
    width: 100%;
  }
  .search-input {
    width: 100%;
  }
  .desktop-table {
    display: none;
  }
  .mobile-list {
    display: block;
  }
  .pagination-wrap {
    justify-content: center;
  }
  .qrcode-drawer :deep(.el-drawer) {
    width: calc(100vw - 20px) !important;
  }
  .qr-hero {
    flex-direction: column;
    align-items: center;
  }
  .qr-hero__main {
    width: 100%;
  }
  .qr-hero__head {
    justify-content: center;
    text-align: center;
  }
  .qr-label-panel__row--fields {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .qr-label-panel__label {
    flex: none;
  }
}
</style>
