<template>
  <div class="ref-list-page reports-list-page ref-list-page--keep-panel">
    <div class="page-head">
      <div class="page-head__filters">
        <button
          type="button"
          class="type-pill"
          :class="{ 'is-active': status === '' }"
          @click="setStatusFilter('')"
        >
          全部
        </button>
        <button
          type="button"
          class="type-pill"
          :class="{ 'is-active': status === 'active' }"
          @click="setStatusFilter('active')"
        >
          有效
        </button>
        <button
          type="button"
          class="type-pill"
          :class="{ 'is-active': status === 'void' }"
          @click="setStatusFilter('void')"
        >
          作废
        </button>
      </div>
      <div class="page-head__actions">
        <el-button :icon="Refresh" :loading="listLoading" circle title="刷新列表" @click="load" />
        <el-button
          v-if="perm('templates', 'use') && perm('reports', 'create')"
          plain
          :icon="Brush"
          @click="$router.push('/reports/designer')"
        >
          设计报告
        </el-button>
        <el-button
          v-if="perm('reports', 'create')"
          type="primary"
          class="btn-create"
          :icon="Plus"
          @click="$router.push('/reports/new')"
        >
          新建报告
        </el-button>
      </div>
    </div>

    <div class="content-panel">
      <div class="filter-bar">
        <div class="filter-bar__left">
          <span class="filter-hint">支持按报告 ID、编号、产品、客户查询；单条可直接生成二维码，勾选多条可合并生成。</span>
        </div>
        <div class="filter-bar__right">
          <el-input
            v-model="batchNo"
            placeholder="批次"
            clearable
            class="filter-field"
            @keyup.enter="onSearch"
            @clear="onSearch"
          />
          <div class="search-box">
            <el-input
              v-model="q"
              placeholder="报告 ID / 编号 / 产品 / 客户"
              clearable
              class="search-input"
              @keyup.enter="onSearch"
              @clear="onSearch"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button type="primary" class="search-btn" :icon="Search" :loading="listLoading" @click="onSearch">
              查询
            </el-button>
          </div>
          <el-button :icon="RefreshLeft" @click="onReset">重置</el-button>
          <span class="result-count">共 {{ total }} 条</span>
        </div>
      </div>

      <div v-if="activeFilterTags.length" class="filter-tags">
        <span class="filter-tags__label">当前筛选</span>
        <el-tag
          v-for="tag in activeFilterTags"
          :key="tag.key"
          closable
          size="small"
          effect="plain"
          @close="clearFilterTag(tag.key)"
        >
          {{ tag.label }}
        </el-tag>
      </div>

      <div v-if="selected.length && hasBatchActions" class="batch-bar">
        <span class="batch-bar__tip">已选 {{ selected.length }} 条</span>
        <div class="batch-bar__actions">
          <el-button
            v-if="perm('reports', 'export')"
            type="info"
            :icon="Download"
            size="small"
            @click="onExportJson"
          >
            导出备案
          </el-button>
          <el-button v-if="canBulkPass" :icon="Check" type="success" size="small" @click="onBulkPass">
            批量判定合格
          </el-button>
          <el-button v-if="canBulkVoid" :icon="Warning" type="warning" size="small" @click="onBulkVoid">
            批量作废
          </el-button>
          <el-button v-if="canBulkActivate" :icon="RefreshRight" type="primary" size="small" @click="onBulkActivate">
            批量恢复有效
          </el-button>
          <el-button v-if="canBulkDelete" :icon="Delete" type="danger" size="small" plain @click="onBulkDelete">
            批量删除
          </el-button>
          <el-button
            v-if="perm('qrcodes', 'create')"
            type="success"
            :icon="Promotion"
            size="small"
            :loading="qrLoading && qrLoadingRowId === 'batch'"
            @click="onGenQr"
          >
            {{ batchQrButtonLabel }}
          </el-button>
        </div>
      </div>

      <div class="table-scroll">
        <el-table
          ref="reportTable"
          v-loading="listLoading"
          class="desktop-table ref-table"
          :data="items"
          stripe
          row-key="id"
          :row-class-name="reportRowClassName"
          @selection-change="selected = $event"
        >
          <el-table-column type="selection" width="48" fixed="left" />
          <el-table-column prop="reportUid" label="报告 ID" width="132" show-overflow-tooltip fixed="left" />
          <el-table-column prop="productName" label="产品名称" min-width="168" show-overflow-tooltip />
          <el-table-column prop="batchNo" label="批次" width="112" show-overflow-tooltip />
          <el-table-column label="客户" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ formatReportCustomer(row) }}</template>
          </el-table-column>
          <el-table-column prop="conclusion" label="判定" width="88" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.conclusion === 'pass'" type="success" size="small" effect="plain">合格</el-tag>
              <el-tag v-else-if="row.conclusion === 'fail'" type="danger" size="small" effect="plain">不合格</el-tag>
              <el-tag v-else type="info" size="small" effect="plain">未知</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'active'" type="success" size="small" effect="plain">有效</el-tag>
              <el-tag v-else type="warning" size="small" effect="plain">作废</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="更新时间" width="156">
            <template #default="{ row }">
              <span class="cell-muted">{{ formatReportDate(row.updatedAt || row.createdAt) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="460" fixed="right">
            <template #default="{ row }">
              <div class="report-actions">
                <el-button
                  v-if="perm('reports', 'previewPrint')"
                  type="info"
                  plain
                  size="small"
                  :icon="View"
                  @click="onPreview(row)"
                >
                  预览
                </el-button>
                <el-button
                  v-if="perm('reports', 'previewPrint')"
                  type="primary"
                  plain
                  size="small"
                  :icon="Printer"
                  @click="onPrint(row)"
                >
                  打印
                </el-button>
                <el-button
                  v-if="perm('reports', 'view') || perm('reports', 'edit')"
                  type="success"
                  plain
                  size="small"
                  :icon="Edit"
                  @click="$router.push(`/reports/${row.id}`)"
                >
                  {{ perm('reports', 'edit') ? '编辑' : '查看' }}
                </el-button>
                <el-tooltip
                  v-if="perm('qrcodes', 'create')"
                  :disabled="canGenerateQr(row)"
                  content="作废报告请先恢复有效"
                  placement="top"
                >
                  <span class="report-action-wrap">
                    <el-button
                      type="success"
                      plain
                      size="small"
                      :icon="Promotion"
                      :disabled="!canGenerateQr(row)"
                      :loading="qrLoading && qrLoadingRowId === row.id"
                      @click="onGenQrForRow(row)"
                    >
                      生成二维码
                    </el-button>
                  </span>
                </el-tooltip>
                <el-button
                  v-if="row.status === 'active' && perm('reports', 'void')"
                  type="warning"
                  plain
                  size="small"
                  :icon="Warning"
                  @click="onVoid(row)"
                >
                  作废
                </el-button>
                <el-button
                  v-else-if="row.status !== 'active' && perm('reports', 'activate')"
                  type="success"
                  plain
                  size="small"
                  :icon="RefreshRight"
                  @click="onActivate(row)"
                >
                  恢复有效
                </el-button>
              </div>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="emptyDescription" :image-size="96">
              <el-button v-if="perm('reports', 'create')" type="primary" :icon="Plus" @click="$router.push('/reports/new')">
                新建报告
              </el-button>
            </el-empty>
          </template>
        </el-table>
      </div>

      <div v-if="total > 0" class="table-footer">
        <span>第 {{ page }} / {{ totalPages }} 页，共 {{ total }} 条</span>
        <div class="table-footer__right">
          <el-pagination
            background
            layout="sizes, prev, pager, next, jumper"
            :current-page="page"
            :page-sizes="[10, 20, 50, 100]"
            :page-size="pageSize"
            :total="total"
            @current-change="onPageChange"
            @size-change="onSizeChange"
          />
        </div>
      </div>
    </div>

    <div class="mobile-list" v-loading="listLoading">
      <div v-for="row in items" :key="'m-' + row.id" class="mobile-card" :class="{ 'mobile-card--void': row.status === 'void' }">
        <div class="mobile-head">
          <div class="mobile-head-main">
            <div>
              <strong>{{ row.productName || '—' }}</strong>
              <span class="name-sub">{{ row.reportUid || row.reportNo || `#${row.id}` }}</span>
            </div>
          </div>
          <div class="mobile-tags">
            <el-tag v-if="row.conclusion === 'pass'" type="success" size="small" effect="plain">合格</el-tag>
            <el-tag v-else-if="row.conclusion === 'fail'" type="danger" size="small" effect="plain">不合格</el-tag>
            <el-tag v-if="row.status === 'active'" type="success" size="small">有效</el-tag>
            <el-tag v-else type="warning" size="small">作废</el-tag>
          </div>
        </div>
        <div class="mobile-line"><span>批次</span><span>{{ row.batchNo || '—' }}</span></div>
        <div class="mobile-line"><span>客户</span><span class="mobile-val">{{ formatReportCustomer(row) }}</span></div>
        <div class="mobile-line"><span>更新</span><span>{{ formatReportDate(row.updatedAt || row.createdAt) }}</span></div>
        <div class="mobile-actions">
          <el-button
            v-if="perm('reports', 'previewPrint')"
            size="small"
            @click="onPreview(row)"
          >
            预览
          </el-button>
          <el-button
            v-if="perm('reports', 'view') || perm('reports', 'edit')"
            size="small"
            type="primary"
            @click="$router.push(`/reports/${row.id}`)"
          >
            {{ perm('reports', 'edit') ? '编辑' : '查看' }}
          </el-button>
          <el-button
            v-if="perm('qrcodes', 'create')"
            size="small"
            type="success"
            plain
            :disabled="!canGenerateQr(row)"
            :loading="qrLoading && qrLoadingRowId === row.id"
            @click="onGenQrForRow(row)"
          >
            二维码
          </el-button>
          <el-button
            v-if="row.status === 'active' && perm('reports', 'void')"
            size="small"
            type="warning"
            plain
            @click="onVoid(row)"
          >
            作废
          </el-button>
          <el-button
            v-else-if="row.status !== 'active' && perm('reports', 'activate')"
            size="small"
            type="success"
            plain
            @click="onActivate(row)"
          >
            恢复
          </el-button>
        </div>
      </div>
      <el-empty v-if="!listLoading && !items.length" :description="emptyDescription" :image-size="72">
        <el-button v-if="perm('reports', 'create')" type="primary" :icon="Plus" @click="$router.push('/reports/new')">
          新建报告
        </el-button>
      </el-empty>
      <div v-if="total > 0" class="mobile-pager">
        <el-pagination
          background
          layout="total, prev, pager, next"
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          small
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </div>

    <el-dialog
      v-model="qrDialog"
      width="560px"
      align-center
      :close-on-click-modal="false"
      class="qr-result-dialog"
      @closed="onQrDialogClosed"
    >
      <template #header>
        <div class="qr-dialog-head">
          <el-icon class="qr-dialog-head__icon"><CircleCheck /></el-icon>
          <div>
            <div class="qr-dialog-head__title">{{ qrDialogTitle }}</div>
            <div class="qr-dialog-head__sub">{{ qrDialogSubtitle }}</div>
          </div>
        </div>
      </template>
      <div v-if="qrResult" class="qr-dialog-body">
        <ul v-if="qrContextRows.length" class="qr-report-list">
          <li v-for="item in qrContextRows" :key="item.id">
            <span class="qr-report-list__name">{{ item.productName || '—' }}</span>
            <span class="qr-report-list__meta">
              {{ item.reportUid || item.reportNo || `#${item.id}` }}
              <template v-if="item.batchNo"> · 批号 {{ item.batchNo }}</template>
            </span>
          </li>
        </ul>

        <div class="qr-image-wrap">
          <img :src="qrResult.qrDataUrl" alt="二维码" class="qr-image" />
        </div>

        <div v-if="qrResultQrcodeUid" class="qr-uid-box">
          <span class="qr-uid-label">二维码编号</span>
          <span class="qr-uid-value">{{ qrResultQrcodeUid }}</span>
          <el-button link type="primary" size="small" :icon="DocumentCopy" @click="copyQrcodeUid">
            复制
          </el-button>
        </div>

        <p class="qr-tip">客户扫码后可查看报告；请下载图片后转发给客户或打印粘贴。</p>

        <div class="qr-label-options">
          <div class="qr-label-options__row">
            <span class="qr-label-options__title">标签尺寸：</span>
            <el-select v-model="qrLabelPreset" size="small" class="qr-label-preset-select">
              <el-option
                v-for="item in labelPresetOptions"
                :key="item.key"
                :label="item.label"
                :value="item.key"
              />
            </el-select>
          </div>
          <span class="qr-label-options__title">标签上显示：</span>
          <el-checkbox-group v-model="qrLabelFields" class="qr-label-options__group">
            <el-checkbox value="qrcodeUid">二维码编号</el-checkbox>
            <el-checkbox value="product">产品</el-checkbox>
            <el-checkbox value="batch">批号</el-checkbox>
            <el-checkbox value="customer">客户</el-checkbox>
          </el-checkbox-group>
        </div>

        <div class="qr-content-box">
          <div class="qr-content-title">扫码链接</div>
          <div class="qr-url">{{ qrResult.scanUrl }}</div>
          <div class="qr-content-actions">
            <el-button size="small" :icon="DocumentCopy" @click="copyScanUrl">复制链接</el-button>
            <el-button size="small" text type="primary" @click="openQrcodesPage">前往二维码管理</el-button>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="qr-dialog-footer">
          <el-button @click="qrDialog = false">关闭</el-button>
          <el-button plain :icon="View" @click="onViewQrContent">预览扫码页</el-button>
          <el-button plain :icon="Printer" :loading="qrLabelBusy" @click="printQr">打印标签</el-button>
          <el-button type="primary" :icon="Download" :loading="qrLabelBusy" @click="downloadQr">下载二维码</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="previewDialog"
      :title="previewDialogTitle"
      width="920px"
      top="4vh"
      :close-on-click-modal="false"
      @close="onPreviewDialogClose"
    >
      <div v-loading="previewLoading" class="preview-dialog-body">
        <iframe
          v-if="previewUrl"
          :src="previewUrl"
          class="preview-iframe"
          title="报告预览"
          @load="previewLoading = false"
        />
      </div>
      <template #footer>
        <el-button :icon="Close" @click="previewDialog = false">关闭</el-button>
        <el-button type="primary" :disabled="!previewUrl" :icon="Printer" @click="printPreview">打印</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { activateReport, createQrcode, exportReportsJson, listReports, voidReport } from '../api';
import { bulkActivateReports, bulkDeleteReports, bulkPassReports, bulkVoidReports } from '../api';
import {
  Brush,
  Check,
  CircleCheck,
  Close,
  Delete,
  DocumentCopy,
  Download,
  Edit,
  Plus,
  Promotion,
  Printer,
  Refresh,
  RefreshLeft,
  RefreshRight,
  Search,
  View,
  Warning
} from '@element-plus/icons-vue';
import { perm } from '../utils/permissions';
import { getAuthToken } from '../stores/auth';
import { startDownload } from '../composables/useDownloadProgress.js';
import { customerReportPreviewUrl } from '../utils/customerReportPreviewUrl';
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

export default {
  name: 'ReportsList',
  components: { CircleCheck, DocumentCopy, Search },
  data() {
    return {
      Brush,
      Check,
      Close,
      Delete,
      DocumentCopy,
      Download,
      Edit,
      Plus,
      Promotion,
      Printer,
      Refresh,
      RefreshLeft,
      RefreshRight,
      Search,
      View,
      Warning,
      q: '',
      batchNo: '',
      status: '',
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      selected: [],
      listLoading: false,
      qrLoading: false,
      qrLoadingRowId: null,
      qrDialog: false,
      qrResult: null,
      qrContextRows: [],
      qrLabelFields: [...DEFAULT_QRCODE_LABEL_FIELDS],
      qrLabelPreset: DEFAULT_QRCODE_LABEL_PRESET,
      labelPresetOptions: QRCODE_LABEL_PRESET_OPTIONS,
      qrLabelBusy: false,
      previewDialog: false,
      previewLoading: false,
      previewUrl: '',
      previewReportId: null,
      previewReportRow: null,
      _skipActivatedLoadOnce: false
    };
  },
  computed: {
    canBulkPass() {
      return (
        perm('reports', 'bulkPass') ||
        perm('reports', 'edit') ||
        perm('reports', 'chairmanApprove')
      );
    },
    canBulkVoid() {
      return perm('reports', 'bulkVoid') || perm('reports', 'void');
    },
    canBulkActivate() {
      return perm('reports', 'bulkActivate') || perm('reports', 'activate');
    },
    canBulkDelete() {
      return perm('reports', 'bulkDelete') || perm('reports', 'void');
    },
    hasBatchActions() {
      return (
        perm('reports', 'export') ||
        this.canBulkPass ||
        this.canBulkVoid ||
        this.canBulkActivate ||
        this.canBulkDelete ||
        perm('qrcodes', 'create')
      );
    },
    totalPages() {
      return Math.max(1, Math.ceil(this.total / this.pageSize));
    },
    batchQrButtonLabel() {
      const n = this.selected.length;
      if (n <= 1) return '生成二维码';
      return `合并生成二维码（${n} 份）`;
    },
    qrDialogTitle() {
      if ((this.qrContextRows?.length || 0) > 1) return '合并二维码已生成';
      return '二维码已生成';
    },
    qrDialogSubtitle() {
      const n = this.qrContextRows?.length || 0;
      if (n > 1) return `已将 ${n} 份报告合并为 1 个扫码入口`;
      if (n === 1) {
        const row = this.qrContextRows[0];
        return row?.productName ? `${row.productName}${row.batchNo ? ` · ${row.batchNo}` : ''}` : '可直接下载或转发给客户';
      }
      return '可直接下载或转发给客户';
    },
    qrResultQrcodeUid() {
      return displayQrcodeUid(this.qrResult);
    },
    activeFilterTags() {
      const tags = [];
      const q = String(this.q || '').trim();
      const batch = String(this.batchNo || '').trim();
      if (q) tags.push({ key: 'q', label: `关键词：${q}` });
      if (batch) tags.push({ key: 'batchNo', label: `批次：${batch}` });
      if (this.status === 'active') tags.push({ key: 'status', label: '状态：有效' });
      if (this.status === 'void') tags.push({ key: 'status', label: '状态：作废' });
      return tags;
    },
    emptyDescription() {
      if (this.q || this.batchNo || this.status) return '没有符合条件的报告，请调整筛选条件';
      return '暂无报告，可先新建一份检验报告';
    },
    previewDialogTitle() {
      const row = this.previewReportRow;
      if (!row) return '报告预览';
      const name = String(row.productName || '').trim();
      const batch = String(row.batchNo || '').trim();
      if (name && batch) return `报告预览 · ${name}（${batch}）`;
      return `报告预览 · ${row.reportUid || row.reportNo || `#${row.id}`}`;
    }
  },
  mounted() {
    this._skipActivatedLoadOnce = true;
    this.load();
  },
  activated() {
    if (this._skipActivatedLoadOnce) {
      this._skipActivatedLoadOnce = false;
      return;
    }
    this.load();
  },
  methods: {
    perm,
    canGenerateQr(row) {
      return row?.status === 'active';
    },
    reportRowClassName({ row }) {
      return row?.status === 'void' ? 'report-row--void' : '';
    },
    formatReportCustomer(row) {
      const name = String(row?.customerName || '').trim();
      const contact = String(row?.customerContact || '').trim();
      if (name && contact && name !== contact) return `${name}（${contact}）`;
      return name || contact || '—';
    },
    formatReportDate(value) {
      if (!value) return '—';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    setStatusFilter(next) {
      if (this.status === next) return;
      this.status = next;
      this.onSearch();
    },
    clearFilterTag(key) {
      if (key === 'q') this.q = '';
      else if (key === 'batchNo') this.batchNo = '';
      else if (key === 'status') this.status = '';
      this.onSearch();
    },
    onReset() {
      this.q = '';
      this.batchNo = '';
      this.status = '';
      this.onSearch();
    },
    async load() {
      this.listLoading = true;
      try {
        const { items, total } = await listReports({
          q: this.q || undefined,
          batchNo: this.batchNo || undefined,
          status: this.status || undefined,
          limit: this.pageSize,
          offset: (this.page - 1) * this.pageSize
        });
        this.items = items || [];
        this.total = Number(total || 0);
        if (this.total > 0 && this.items.length === 0 && this.page > 1) {
          this.page -= 1;
          await this.load();
        }
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载报告列表失败'));
      } finally {
        this.listLoading = false;
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
      this.selected = [];
      this.$refs.reportTable?.clearSelection?.();
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
    async onGenQrForRow(row) {
      if (!row?.id || !this.canGenerateQr(row)) return;
      await this.generateQrcodeForReportIds([row.id], {
        rowId: row.id,
        contextRows: [row]
      });
    },
    async onGenQr() {
      const rows = this.selected.filter((r) => this.canGenerateQr(r));
      if (!rows.length) {
        this.$message.warning('请选择有效状态的报告再生成二维码');
        return;
      }
      if (rows.length < this.selected.length) {
        this.$message.info(`已跳过 ${this.selected.length - rows.length} 份作废报告`);
      }
      await this.generateQrcodeForReportIds(
        rows.map((r) => r.id),
        { rowId: 'batch', contextRows: rows }
      );
    },
    async generateQrcodeForReportIds(ids, { rowId = null, contextRows = [] } = {}) {
      if (!ids.length) return;

      this.qrLoading = true;
      this.qrLoadingRowId = rowId;
      try {
        let res;
        try {
          res = await createQrcode(ids);
        } catch (e) {
          const d = e?.response?.data;
          if (d?.error === 'REPORT_ALREADY_BOUND' && Array.isArray(d?.already_bound)) {
            const isSingle = ids.length === 1;
            const lines = d.already_bound
              .slice(0, 5)
              .map((r) => `• ${r.product_name || '未知产品'}（${r.batch_no || '无批号'}）`)
              .join('<br>');
            const more = d.already_bound.length > 5 ? `<br>… 另有 ${d.already_bound.length - 5} 条` : '';
            const body = isSingle
              ? '该报告已关联过二维码。重新生成将创建新的扫码入口，旧码仍可使用。是否继续？'
              : `<div style="text-align:left;">以下 ${d.already_bound.length} 份报告已关联二维码：<br>${lines}${more}<br><br>重新生成将创建新的合并码，旧码仍可使用。是否继续？</div>`;

            this.qrLoading = false;
            this.qrLoadingRowId = null;
            try {
              await this.$confirm(body, isSingle ? '报告已有二维码' : '部分报告已有二维码', {
                type: 'warning',
                confirmButtonText: '重新生成',
                cancelButtonText: '取消',
                dangerouslyUseHTMLString: !isSingle
              });
            } catch {
              return;
            }
            this.qrLoading = true;
            this.qrLoadingRowId = rowId;
            res = await createQrcode(ids, true);
          } else {
            throw e;
          }
        }

        this.qrResult = res;
        this.qrContextRows = contextRows.length
          ? contextRows
          : ids.map((id) => this.items.find((r) => r.id === id)).filter(Boolean);
        this.qrDialog = true;
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '生成失败'));
      } finally {
        this.qrLoading = false;
        this.qrLoadingRowId = null;
      }
    },
    onQrDialogClosed() {
      this.qrResult = null;
      this.qrContextRows = [];
    },
    openQrcodesPage() {
      this.qrDialog = false;
      this.$router.push('/qrcodes');
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
        const blob = await exportReportsJson(ids);
        startDownload({ request: blob, filename: `reports-export-${Date.now()}.json` });
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
        await this.$confirm(`确认将选中的 ${ids.length} 条报告恢复为有效？`, '批量恢复有效', { type: 'warning' });
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
      this.outputQrLabel('download');
    },
    printQr() {
      this.outputQrLabel('print');
    },
    async outputQrLabel(mode) {
      if (!this.qrResult?.qrDataUrl || this.qrLabelBusy) return;
      this.qrLabelBusy = true;
      try {
        const reportRows = enrichReportsForQrcodeLabel(
          this.qrContextRows,
          this.qrContextRows.map((r) => this.items.find((i) => i.id === r.id) || r)
        );
        const { dataUrl, labelFailed } = await buildQrcodeLabelDataUrl(
          this.qrResult.qrDataUrl,
          reportRows,
          this.qrLabelFields,
          { qrcodeUid: this.qrResultQrcodeUid },
          {
            labelPreset: this.qrLabelPreset,
            scene: mode === 'print' ? QRCODE_LABEL_SCENES.PRINT : QRCODE_LABEL_SCENES.DOWNLOAD
          }
        );
        if (labelFailed) {
          this.$message.warning('标签合成失败，已使用纯二维码');
        }
        if (mode === 'print') {
          this.$message.info('请在打印对话框中关闭「页眉和页脚」，边距选「无」，纸张选与标签尺寸一致');
          printQrcodeLabelImage(dataUrl, this.qrResultQrcodeUid || '二维码标签', this.qrLabelPreset);
          return;
        }
        const label =
          this.qrResultQrcodeUid ||
          (this.qrContextRows.length === 1
            ? `${this.qrContextRows[0]?.productName || 'report'}-${this.qrContextRows[0]?.batchNo || this.qrResult.token}`
            : `qrcode-${this.qrResult.token}`);
        downloadDataUrl(dataUrl, `${String(label).replace(/[^\w\u4e00-\u9fff-]+/g, '_')}.png`);
        this.$message.success('已开始下载');
      } finally {
        this.qrLabelBusy = false;
      }
    },
    async copyQrcodeUid() {
      const uid = this.qrResultQrcodeUid;
      if (!uid) return;
      try {
        await navigator.clipboard.writeText(uid);
        this.$message.success('编号已复制');
      } catch {
        this.$message.warning('复制失败，请手动选择编号复制');
      }
    },
    async copyScanUrl() {
      const url = this.qrResult?.scanUrl;
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        this.$message.success('链接已复制');
      } catch {
        this.$message.warning('复制失败，请手动选择链接复制');
      }
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
      this.previewReportRow = row;
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
      this.previewReportRow = null;
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
@import '../styles/refListPage.css';

.reports-list-page .filter-tags__label {
  font-size: 12px;
  color: var(--ref-muted);
  margin-right: 4px;
}
.reports-list-page .result-count {
  font-size: 13px;
  color: var(--ref-muted);
  white-space: nowrap;
}
.reports-list-page .batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 16px;
  border-bottom: 1px solid #dbeafe;
  background: linear-gradient(180deg, #eff6ff 0%, #f8fbff 100%);
}
.reports-list-page .batch-bar__tip {
  font-size: 13px;
  font-weight: 600;
  color: #1d4ed8;
}
.reports-list-page .batch-bar__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.reports-list-page .report-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.reports-list-page .report-action-wrap {
  display: inline-flex;
}
.reports-list-page :deep(.search-box) {
  display: inline-flex;
  align-items: stretch;
  gap: 0;
}
.reports-list-page :deep(.search-input) {
  width: 260px;
}
.reports-list-page :deep(.search-input .el-input__wrapper) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.reports-list-page :deep(.search-btn) {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.reports-list-page :deep(.report-row--void) {
  color: #94a3b8;
}
.reports-list-page :deep(.report-row--void .el-tag) {
  opacity: 0.85;
}
.preview-dialog-body {
  min-height: 65vh;
}
.preview-iframe {
  width: 100%;
  height: 70vh;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.qr-dialog-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.qr-dialog-head__icon {
  font-size: 28px;
  color: #16a34a;
  margin-top: 2px;
}
.qr-dialog-head__title {
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.3;
}
.qr-dialog-head__sub {
  margin-top: 4px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}
.qr-dialog-body {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
.qr-report-list {
  list-style: none;
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.qr-report-list li + li {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
}
.qr-report-list__name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  overflow-wrap: anywhere;
}
.qr-report-list__meta {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: #64748b;
}
.qr-image-wrap {
  align-self: center;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.qr-uid-box {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.qr-uid-label {
  font-size: 13px;
  color: #64748b;
}
.qr-uid-value {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  letter-spacing: 0.02em;
}
.qr-tip {
  margin: 12px 0 0;
  font-size: 13px;
  color: #64748b;
  text-align: center;
  line-height: 1.5;
}
.qr-label-options {
  margin: 12px 0 0;
  text-align: center;
}
.qr-label-options__row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
}
.qr-label-preset-select {
  width: 132px;
}
.qr-label-options__title {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: #64748b;
}
.qr-label-options__group {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 16px;
}
.qr-dialog-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.qr-image {
  width: 260px;
  height: 260px;
  display: block;
}
.qr-content-box {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #f8fafc;
  overflow: hidden;
}
.qr-content-title {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 8px;
}
.qr-url {
  display: block;
  max-width: 100%;
  font-size: 12.5px;
  color: #111827;
  overflow-wrap: anywhere;
  word-break: break-all;
  white-space: normal;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  line-height: 1.5;
}
.qr-content-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  justify-content: space-between;
}

.reports-list-page :deep(.qr-result-dialog .el-dialog__header) {
  margin-right: 0;
  padding-bottom: 8px;
}
.reports-list-page :deep(.qr-result-dialog .el-dialog__body) {
  padding-top: 8px;
  overflow-x: hidden;
}
.reports-list-page :deep(.qr-result-dialog .el-dialog) {
  max-width: calc(100vw - 32px);
}

.reports-list-page .mobile-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}
.reports-list-page .mobile-card--void {
  opacity: 0.88;
}

@media (max-width: 992px) {
  .reports-list-page .filter-bar__right {
    width: 100%;
  }
  .reports-list-page .search-box,
  .reports-list-page .search-input {
    width: 100%;
  }
  .reports-list-page :deep(.search-input .el-input__wrapper) {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .reports-list-page :deep(.search-btn) {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  .reports-list-page .batch-bar {
    align-items: stretch;
  }
  .reports-list-page .batch-bar__actions .el-button {
    flex: 1 1 calc(50% - 8px);
  }
  .reports-list-page .filter-hint {
    display: none;
  }
  .reports-list-page .page-head__actions .el-button:not(.btn-create) {
    flex: 0 0 auto;
  }
}
</style>

