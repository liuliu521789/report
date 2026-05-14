<template>
  <div class="qc-yearbooks-page">
    <el-alert
      v-if="yearsLoadError"
      type="error"
      :closable="false"
      class="page-hint page-hint-err"
      :title="yearsLoadError"
      show-icon
    />

    <el-empty
      v-if="!yearsLoading && !years.length && !yearsLoadError"
      class="page-empty"
      description="未加载到任何年份。请重启后端服务以创建表并写入预置年份，或由管理员执行 server/migrations/046_qc_yearbook_data.sql。"
    >
      <div class="qc-empty-actions">
        <el-button :icon="Refresh" :loading="yearsLoading" @click="reloadYears">刷新年份</el-button>
        <el-button v-if="canMutate" type="warning" :icon="Upload" @click="openImportDialog">从 Excel 导入</el-button>
        <el-button v-if="canMutate" type="primary" :icon="Plus" @click="openYearDialog">新增年份</el-button>
      </div>
    </el-empty>

    <template v-else>
      <el-card class="panel panel-year" shadow="never" v-loading="yearsLoading">
        <div class="panel-year-inner">
          <div class="year-row-left">
            <span class="panel-label">统计年度</span>
            <el-select
              v-model="selectedYearId"
              placeholder="请选择年份"
              class="year-select"
              filterable
              :loading="yearsLoading"
              @change="onYearChange"
            >
              <el-option
                v-for="y in years"
                :key="y.id"
                :label="`${y.year} 年（${Number(y.fp_row_count) || 0} 条成品）`"
                :value="Number(y.id)"
              />
            </el-select>
            <el-tag v-if="selectedYearMeta" type="info" effect="plain" class="stat-tag">
              当前：{{ selectedYearMeta.year }} 年 · {{ selectedYearMeta.fpCount }} 条成品
            </el-tag>
          </div>
          <div class="year-row-right">
            <el-button :icon="Refresh" :loading="yearsLoading" @click="reloadYears">刷新年份</el-button>
            <el-button v-if="canMutate" type="warning" :icon="Upload" @click="openImportDialog">从 Excel 导入</el-button>
            <el-button v-if="canMutate" type="primary" :icon="Plus" @click="openYearDialog">新增年份</el-button>
            <el-button v-if="canMutate && selectedYearId" type="danger" plain :icon="Delete" @click="onDeleteYear">删除该年</el-button>
          </div>
        </div>
      </el-card>

      <el-card v-if="selectedYearId" class="panel panel-table" shadow="never">
        <template #header>
          <div class="table-card-header">
            <div class="table-card-head-text">
              <span class="table-card-title">成品检验台账</span>
              <span class="table-card-sub">
                左侧多选框（当前页）可「导出所选」「删除所选」；「全部导出」导出本年在当前搜索条件下的全部数据（CSV，可用 Excel 打开）。勾选「检验ID」控制列显示；点「编辑」显示行内操作。
              </span>
            </div>
            <div class="table-card-tools">
              <el-input
                v-model="fpKeyword"
                class="fp-search"
                clearable
                placeholder="型号 / 批号 / 外观 / 色度 / 结论 / 检验ID"
                @keyup.enter="loadFpRows(1)"
              >
                <template #prefix>
                  <el-icon class="fp-search-icon"><Search /></el-icon>
                </template>
              </el-input>
              <el-button type="primary" :icon="Search" @click="loadFpRows(1)">查询</el-button>
              <el-checkbox v-model="fpShowInspectionId" class="fp-tool-checkbox">检验ID</el-checkbox>
              <el-button
                v-if="canView"
                :icon="Download"
                :disabled="!fpBatchSelectedRows.length"
                @click="onExportSelectedRows"
              >
                导出所选
              </el-button>
              <el-button v-if="canView" :icon="Download" :loading="fpExportAllLoading" @click="onExportAllRows">
                全部导出
              </el-button>
              <el-button
                v-if="canMutate"
                :type="fpRowOpsVisible ? 'warning' : 'default'"
                plain
                :icon="fpRowOpsVisible ? CircleCheck : Edit"
                @click="fpRowOpsVisible = !fpRowOpsVisible"
              >
                {{ fpRowOpsVisible ? '完成' : '编辑' }}
              </el-button>
              <el-button v-if="canMutate" type="success" :icon="Plus" @click="openFpDialog(null)">新增成品行</el-button>
              <el-button
                v-if="canMutate"
                type="danger"
                plain
                :icon="Delete"
                :disabled="!fpBatchSelectedRows.length"
                :loading="fpBatchDeleting"
                @click="onFpBatchDeleteSelected"
              >
                删除所选
              </el-button>
            </div>
          </div>
        </template>
        <el-table
          ref="fpTableRef"
          row-key="id"
          :data="fpItems"
          v-loading="fpLoading"
          border
          stripe
          class="table-fp"
          empty-text="暂无成品行，请从 Excel 导入「成品」表或点击新增"
          @selection-change="onFpBatchSelectionChange"
        >
        <el-table-column v-if="canView" type="selection" width="48" fixed="left" />
        <el-table-column type="index" label="序号" width="56" :index="(i) => (fpPage - 1) * fpPageSize + i + 1" />
        <el-table-column v-if="fpShowInspectionId" prop="inspection_id" label="检验ID" min-width="108" show-overflow-tooltip />
        <el-table-column prop="product_model" label="产品型号" min-width="100" show-overflow-tooltip />
        <el-table-column prop="product_batch_no" label="产品批号" min-width="110" show-overflow-tooltip />
        <el-table-column prop="barrel_count" label="桶数" width="88" align="right" :formatter="fpCellFmt" />
        <el-table-column prop="initial_batch_kg" label="初检批量(Kg)" min-width="120" align="right" :formatter="fpCellFmt" />
        <el-table-column prop="inspection_batch_kg" label="检验批量(Kg)" min-width="120" align="right" :formatter="fpCellFmt" />
        <el-table-column prop="appearance" label="外观" width="88" show-overflow-tooltip />
        <el-table-column prop="color_fe_co" label="色度(Fe-Co)/#" min-width="110" show-overflow-tooltip />
        <el-table-column prop="solid_content_pct" label="固体份(%)" width="100" align="right" :formatter="fpCellFmt" />
        <el-table-column prop="viscosity_s_25c" label="粘度(s)/25℃" min-width="110" align="right" :formatter="fpCellFmt" />
        <el-table-column prop="acid_value_mgkoh_g" label="酸值(mgKOH/g)" min-width="120" align="right" :formatter="fpCellFmt" />
        <el-table-column prop="tolerance_g_ml" label="容忍度(g/ml)" min-width="110" align="right" :formatter="fpCellFmt" />
        <el-table-column prop="nco_content_pct" label="NCO含量(%)" min-width="105" align="right" :formatter="fpCellFmt" />
        <el-table-column prop="inspection_conclusion" label="检验结论" width="96" show-overflow-tooltip />
        <el-table-column v-if="canMutate && fpRowOpsVisible" label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Edit" @click="openFpDialog(row)">编辑</el-button>
            <el-button type="danger" link :icon="Delete" @click="onDeleteFpRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager-wrap">
        <el-pagination
          background
          layout="total, prev, pager, next, sizes"
          :total="fpTotal"
          :page-size="fpPageSize"
          :current-page="fpPage"
          :page-sizes="[20, 50, 100, 200]"
          @current-change="onFpPageChange"
          @size-change="onFpSizeChange"
        />
      </div>
      </el-card>
    </template>

    <!-- 从 Excel 导入 -->
    <el-dialog v-model="importDialogVisible" title="导入成品台账（Excel）" width="520px" destroy-on-close @open="onImportDialogOpen">
      <el-form label-width="120px">
        <el-form-item label="导入到年份" required>
          <el-input-number v-model="importYear" :min="2000" :max="2100" :step="1" controls-position="right" style="width: 100%" />
          <div class="form-tip">须与文件名中的年份一致（如 物源2026… 对应 2026）。</div>
        </el-form-item>
        <el-form-item label="导入前清空该年">
          <el-switch v-model="importReplace" active-text="是" inactive-text="否" />
          <div class="form-tip">开启后将删除该年在系统中的<strong>成品结构化行</strong>，再写入 Excel「成品」表数据。</div>
        </el-form-item>
        <el-form-item label="数据来源" required>
          <el-radio-group v-model="importSource">
            <el-radio value="public">服务器 public 目录</el-radio>
            <el-radio value="upload">本地上传</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="importSource === 'public'" label="选择文件">
          <el-select
            v-model="importPublicFilename"
            filterable
            placeholder="请先刷新年份后在此选择"
            style="width: 100%"
            :loading="publicFilesLoading"
          >
            <el-option v-for="f in publicFiles" :key="f.name" :label="f.name" :value="f.name" />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="选择文件">
          <el-upload
            :auto-upload="false"
            :limit="1"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            :on-change="onImportFileChange"
            :on-exceed="onImportExceed"
          >
            <el-button type="primary" :icon="Document">选择 .xlsx</el-button>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :icon="Close" @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :icon="Upload" :loading="importRunning" @click="submitImport">开始导入</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="yearDialogVisible" title="新增年份" width="420px" destroy-on-close @closed="resetYearForm">
      <el-form :model="yearForm" label-width="88px">
        <el-form-item label="年份" required>
          <el-input-number v-model="yearForm.year" :min="2000" :max="2100" :step="1" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="yearForm.remark" type="textarea" :rows="2" maxlength="255" show-word-limit placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :icon="Close" @click="yearDialogVisible = false">取消</el-button>
        <el-button type="primary" :icon="Check" :loading="yearSaving" @click="submitYear">保存</el-button>
      </template>
    </el-dialog>

    <!-- 成品检验台账：新增 / 编辑 -->
    <el-dialog
      v-model="fpDialogVisible"
      :title="fpEditingId ? '编辑成品行' : '新增成品行'"
      width="680px"
      destroy-on-close
      @closed="resetFpForm"
    >
      <el-form :model="fpForm" label-width="132px" class="fp-edit-form">
        <el-form-item v-if="fpEditingId" label="检验ID">
          <el-input :model-value="fpForm.inspectionId" disabled />
        </el-form-item>
        <el-form-item v-else label="检验ID">
          <span class="form-tip">保存后由系统自动生成（格式：统计年度-五位序号）</span>
        </el-form-item>
        <el-form-item label="产品型号" required>
          <el-input v-model="fpForm.productModel" maxlength="128" show-word-limit placeholder="必填" />
        </el-form-item>
        <el-form-item label="产品批号" required>
          <el-input v-model="fpForm.productBatchNo" maxlength="64" show-word-limit placeholder="必填" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="桶数">
              <el-input-number v-model="fpForm.barrelCount" :precision="4" :step="0.01" controls-position="right" style="width: 100%" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="初检批量(Kg)">
              <el-input-number v-model="fpForm.initialBatchKg" :precision="4" :step="1" controls-position="right" style="width: 100%" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="检验批量(Kg)">
              <el-input-number v-model="fpForm.inspectionBatchKg" :precision="4" :step="1" controls-position="right" style="width: 100%" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="外观">
              <el-input v-model="fpForm.appearance" maxlength="64" show-word-limit clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="色度(Fe-Co)/#">
              <el-input v-model="fpForm.colorFeCo" maxlength="32" show-word-limit clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="固体份(%)">
              <el-input-number v-model="fpForm.solidContentPct" :precision="4" :step="0.01" controls-position="right" style="width: 100%" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="粘度(s)/25℃">
              <el-input-number v-model="fpForm.viscosityS25c" :precision="4" :step="0.1" controls-position="right" style="width: 100%" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="酸值(mgKOH/g)">
              <el-input-number v-model="fpForm.acidValueMgkohG" :precision="4" :step="0.1" controls-position="right" style="width: 100%" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="容忍度(g/ml)">
              <el-input-number v-model="fpForm.toleranceGml" :precision="6" :step="0.0001" controls-position="right" style="width: 100%" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="NCO含量(%)">
              <el-input-number v-model="fpForm.ncoContentPct" :precision="4" :step="0.01" controls-position="right" style="width: 100%" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="检验结论">
          <el-input v-model="fpForm.inspectionConclusion" maxlength="64" show-word-limit clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :icon="Close" @click="fpDialogVisible = false">取消</el-button>
        <el-button type="primary" :icon="Check" :loading="fpSaving" @click="submitFpRow">保存</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Search,
  Refresh,
  Upload,
  Plus,
  Delete,
  Edit,
  CircleCheck,
  Document,
  Close,
  Check,
  Download
} from '@element-plus/icons-vue';
import {
  listQcYearbookYears,
  createQcYearbookYear,
  deleteQcYearbookYear,
  listQcYearbookPublicExcelFiles,
  importQcYearbookFromXlsx,
  listQcYearbookFinishedProductRows,
  createQcYearbookFinishedProductRow,
  updateQcYearbookFinishedProductRow,
  deleteQcYearbookFinishedProductRow
} from '../api';
import { perm, isSuperAdmin } from '../utils/permissions';

const years = ref([]);
const yearsLoading = ref(false);
const yearsLoadError = ref('');
const selectedYearId = ref(null);

const fpItems = ref([]);
const fpTotal = ref(0);
const fpPage = ref(1);
const fpPageSize = ref(50);
const fpLoading = ref(false);
const fpKeyword = ref('');
/** 表格是否展示「检验ID」列（默认不显示） */
const fpShowInspectionId = ref(false);
/** 点击工具栏「编辑」后为 true，展示行内「编辑 / 删除」操作列 */
const fpRowOpsVisible = ref(false);
const fpTableRef = ref(null);
const fpBatchSelectedRows = ref([]);
const fpBatchDeleting = ref(false);
const fpExportAllLoading = ref(false);

const fpDialogVisible = ref(false);
const fpSaving = ref(false);
const fpEditingId = ref(null);

function fpFormDefault() {
  return {
    inspectionId: '',
    productModel: '',
    productBatchNo: '',
    barrelCount: undefined,
    initialBatchKg: undefined,
    inspectionBatchKg: undefined,
    appearance: '',
    colorFeCo: '',
    solidContentPct: undefined,
    viscosityS25c: undefined,
    acidValueMgkohG: undefined,
    toleranceGml: undefined,
    ncoContentPct: undefined,
    inspectionConclusion: ''
  };
}

const fpForm = ref(fpFormDefault());

const yearDialogVisible = ref(false);
const yearSaving = ref(false);
const yearForm = ref({ year: 2027, remark: '' });

const importDialogVisible = ref(false);
const importYear = ref(2026);
const importReplace = ref(false);
const importSource = ref('public');
const importPublicFilename = ref('');
const publicFiles = ref([]);
const publicFilesLoading = ref(false);
const importRunning = ref(false);
const importLocalFile = ref(null);

const canView = computed(() => isSuperAdmin() || perm('qc_yearbooks', 'view') || perm('qc_yearbooks', 'upload'));
const canMutate = computed(() => isSuperAdmin() || perm('qc_yearbooks', 'upload'));

const selectedYearMeta = computed(() => {
  const row = years.value.find((x) => Number(x.id) === Number(selectedYearId.value));
  if (!row) return null;
  return {
    year: Number(row.year),
    fpCount: Number(row.fp_row_count) || 0
  };
});

function pickDefaultYearId(list) {
  if (!list.length) return null;
  const y2026 = list.find((x) => Number(x.year) === 2026);
  return Number((y2026 ?? list[0]).id);
}

function selectedYearNumber() {
  const row = years.value.find((x) => Number(x.id) === Number(selectedYearId.value));
  return row ? Number(row.year) : null;
}

/** 与后端 public 文件名规则一致，用于从所选文件名同步「导入到年份」 */
function yearFromYearbookBasename(name) {
  const base = String(name || '')
    .replace(/^.*[/\\]/, '')
    .trim();
  const m = /^物源(\d{4})年度品质管控数据表\s*\.xlsx$/i.exec(base);
  return m ? Number(m[1]) : null;
}

function syncImportYearFromFilename(name) {
  const y = yearFromYearbookBasename(name);
  if (y != null) importYear.value = y;
}

watch(importPublicFilename, (name) => {
  if (!importDialogVisible.value || importSource.value !== 'public') return;
  if (!String(name || '').trim()) return;
  syncImportYearFromFilename(name);
});

watch(importSource, (src) => {
  if (src !== 'public' || !importDialogVisible.value) return;
  syncImportYearFromFilename(importPublicFilename.value);
});

async function loadPublicExcelList() {
  publicFilesLoading.value = true;
  try {
    const data = await listQcYearbookPublicExcelFiles();
    publicFiles.value = Array.isArray(data?.files) ? data.files : [];
    if (!importPublicFilename.value && publicFiles.value.length) {
      const prefer =
        publicFiles.value.find((f) => /^物源2026年度品质管控数据表\s*\.xlsx$/i.test(f.name)) || publicFiles.value[0];
      importPublicFilename.value = prefer.name;
    }
  } catch (e) {
    publicFiles.value = [];
    const msg = e?.response?.data?.message || e?.message || '读取 public 文件列表失败';
    ElMessage.warning(msg);
  } finally {
    publicFilesLoading.value = false;
  }
}

function openImportDialog() {
  importYear.value = selectedYearNumber() || 2026;
  importReplace.value = false;
  importSource.value = 'public';
  importPublicFilename.value = '';
  importLocalFile.value = null;
  importDialogVisible.value = true;
}

function onImportDialogOpen() {
  loadPublicExcelList();
}

function onImportFileChange(file) {
  importLocalFile.value = file?.raw || null;
  if (file?.raw?.name) syncImportYearFromFilename(file.raw.name);
}

function onImportExceed() {
  ElMessage.warning('每次仅选择一个 Excel 文件');
}

async function submitImport() {
  const y = Number(importYear.value);
  if (!Number.isFinite(y) || y < 2000 || y > 2100) {
    ElMessage.warning('请填写有效导入年份');
    return;
  }
  if (importSource.value === 'public') {
    if (!String(importPublicFilename.value || '').trim()) {
      ElMessage.warning('请选择 public 目录下的 Excel 文件');
      return;
    }
  } else if (!importLocalFile.value) {
    ElMessage.warning('请选择本地 Excel 文件');
    return;
  }

  if (importReplace.value) {
    try {
      await ElMessageBox.confirm(
        `将清空系统中「${y} 年」的成品结构化行，再从 Excel「成品」表写入。此操作不可撤销。是否继续？`,
        '确认覆盖导入',
        { type: 'warning', confirmButtonText: '继续导入', cancelButtonText: '取消' }
      );
    } catch {
      return;
    }
  }

  const fd = new FormData();
  fd.append('year', String(y));
  fd.append('replaceExisting', importReplace.value ? '1' : '0');
  if (importSource.value === 'public') {
    fd.append('publicFilename', String(importPublicFilename.value).trim());
  } else {
    fd.append('file', importLocalFile.value);
  }

  importRunning.value = true;
  try {
    const res = await importQcYearbookFromXlsx(fd);
    ElMessage.success(
      `导入完成：已处理「成品」工作表 ${res.sheetsImported ?? 0} 个，写入 ${res.finishedProductRowsInserted ?? 0} 行`
    );
    importDialogVisible.value = false;
    await reloadYears();
    const target = years.value.find((row) => Number(row.year) === y);
    if (target) selectedYearId.value = Number(target.id);
    await loadFpRows(1);
  } catch (e) {
    const d = e?.response?.data;
    const base = d?.message || e?.message || '导入失败';
    const code = d?.error ? `（${d.error}）` : '';
    ElMessage.error(`${base}${code}`);
  } finally {
    importRunning.value = false;
  }
}

async function reloadYears() {
  yearsLoading.value = true;
  yearsLoadError.value = '';
  try {
    const data = await listQcYearbookYears();
    years.value = Array.isArray(data?.years) ? data.years : [];
    if (!selectedYearId.value || !years.value.some((x) => Number(x.id) === Number(selectedYearId.value))) {
      selectedYearId.value = pickDefaultYearId(years.value);
    }
    if (selectedYearId.value) await loadFpRows(1);
    else {
      fpItems.value = [];
      fpTotal.value = 0;
    }
  } catch (e) {
    years.value = [];
    selectedYearId.value = null;
    fpItems.value = [];
    fpTotal.value = 0;
    yearsLoadError.value = e?.response?.data?.message || e?.message || '加载年份失败';
    ElMessage.error(yearsLoadError.value);
  } finally {
    yearsLoading.value = false;
  }
}

function fpCellFmt(_row, _column, cellValue) {
  if (cellValue == null || cellValue === '') return '';
  return String(cellValue);
}

async function loadFpRows(p, opts = { fixEmptyPage: true }) {
  if (!canView.value) return;
  const yid = Number(selectedYearId.value);
  if (!Number.isFinite(yid) || yid < 1) {
    fpItems.value = [];
    fpTotal.value = 0;
    return;
  }
  const curP = p || 1;
  fpPage.value = curP;
  fpLoading.value = true;
  try {
    const data = await listQcYearbookFinishedProductRows(yid, {
      page: fpPage.value,
      pageSize: fpPageSize.value,
      keyword: fpKeyword.value.trim() || undefined
    });
    fpItems.value = Array.isArray(data?.items) ? data.items : [];
    fpTotal.value = Number(data?.total) || 0;
    fpPage.value = Number(data?.page) || fpPage.value;
    fpPageSize.value = Number(data?.pageSize) || fpPageSize.value;
    if (
      opts.fixEmptyPage &&
      fpItems.value.length === 0 &&
      fpTotal.value > 0 &&
      fpPage.value > 1
    ) {
      await loadFpRows(fpPage.value - 1, { fixEmptyPage: false });
    }
  } catch (e) {
    fpItems.value = [];
    fpTotal.value = 0;
    const msg = e?.response?.data?.message || e?.message || '加载成品台账失败';
    ElMessage.error(msg);
  } finally {
    fpLoading.value = false;
    fpBatchSelectedRows.value = [];
    nextTick(() => fpTableRef.value?.clearSelection?.());
  }
}

function onFpPageChange(p) {
  fpPage.value = p;
  loadFpRows(p);
}

function onFpSizeChange(s) {
  fpPageSize.value = s;
  loadFpRows(1);
}

function resetFpForm() {
  fpEditingId.value = null;
  fpForm.value = fpFormDefault();
}

function openFpDialog(row) {
  if (!selectedYearId.value) {
    ElMessage.warning('请先选择年份');
    return;
  }
  if (row) {
    fpEditingId.value = row.id;
    fpForm.value = {
      inspectionId: row.inspection_id || '',
      productModel: row.product_model || '',
      productBatchNo: row.product_batch_no || '',
      barrelCount: row.barrel_count != null ? Number(row.barrel_count) : undefined,
      initialBatchKg: row.initial_batch_kg != null ? Number(row.initial_batch_kg) : undefined,
      inspectionBatchKg: row.inspection_batch_kg != null ? Number(row.inspection_batch_kg) : undefined,
      appearance: row.appearance || '',
      colorFeCo: row.color_fe_co || '',
      solidContentPct: row.solid_content_pct != null ? Number(row.solid_content_pct) : undefined,
      viscosityS25c: row.viscosity_s_25c != null ? Number(row.viscosity_s_25c) : undefined,
      acidValueMgkohG: row.acid_value_mgkoh_g != null ? Number(row.acid_value_mgkoh_g) : undefined,
      toleranceGml: row.tolerance_g_ml != null ? Number(row.tolerance_g_ml) : undefined,
      ncoContentPct: row.nco_content_pct != null ? Number(row.nco_content_pct) : undefined,
      inspectionConclusion: row.inspection_conclusion || ''
    };
  } else {
    fpEditingId.value = null;
    fpForm.value = fpFormDefault();
  }
  fpDialogVisible.value = true;
}

function buildFpPayload() {
  const f = fpForm.value;
  const num = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    productModel: String(f.productModel || '').trim(),
    productBatchNo: String(f.productBatchNo || '').trim(),
    barrelCount: num(f.barrelCount),
    initialBatchKg: num(f.initialBatchKg),
    inspectionBatchKg: num(f.inspectionBatchKg),
    appearance: String(f.appearance || '').trim() || null,
    colorFeCo: String(f.colorFeCo || '').trim() || null,
    solidContentPct: num(f.solidContentPct),
    viscosityS25c: num(f.viscosityS25c),
    acidValueMgkohG: num(f.acidValueMgkohG),
    toleranceGml: num(f.toleranceGml),
    ncoContentPct: num(f.ncoContentPct),
    inspectionConclusion: String(f.inspectionConclusion || '').trim() || null
  };
}

async function submitFpRow() {
  const payload = buildFpPayload();
  if (!payload.productModel) {
    ElMessage.warning('请填写产品型号');
    return;
  }
  if (!payload.productBatchNo) {
    ElMessage.warning('请填写产品批号');
    return;
  }
  const yearId = Number(selectedYearId.value);
  if (!Number.isFinite(yearId) || yearId < 1) {
    ElMessage.warning('请先选择有效年份');
    return;
  }
  fpSaving.value = true;
  try {
    const wasEdit = !!fpEditingId.value;
    if (wasEdit) {
      await updateQcYearbookFinishedProductRow(fpEditingId.value, payload);
      ElMessage.success('已保存');
    } else {
      const created = await createQcYearbookFinishedProductRow(yearId, payload);
      const iid = created?.inspection_id;
      ElMessage.success(iid ? `已新增，检验ID：${iid}` : '已新增');
    }
    fpDialogVisible.value = false;
    await reloadYears();
    if (wasEdit) {
      await loadFpRows(fpPage.value);
    } else {
      await loadFpRows(1);
    }
  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || '保存失败';
    ElMessage.error(msg);
  } finally {
    fpSaving.value = false;
  }
}

async function onDeleteFpRow(row) {
  if (!row?.id) return;
  try {
    await ElMessageBox.confirm('确定删除该条成品检验记录？', '确认删除', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await deleteQcYearbookFinishedProductRow(row.id);
    ElMessage.success('已删除');
    await reloadYears();
    await loadFpRows(fpPage.value);
  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || '删除失败';
    ElMessage.error(msg);
  }
}

function onFpBatchSelectionChange(rows) {
  fpBatchSelectedRows.value = Array.isArray(rows) ? rows : [];
}

function escapeCsvCell(val) {
  if (val == null || val === '') return '';
  const s = String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCellVal(v) {
  if (v == null || v === '') return '';
  return String(v);
}

function buildFinishedProductCsv(rows) {
  const headers = [
    '检验ID',
    '产品型号',
    '产品批号',
    '桶数',
    '初检批量(Kg)',
    '检验批量(Kg)',
    '外观',
    '色度(Fe-Co)/#',
    '固体份(%)',
    '粘度(s)/25℃',
    '酸值(mgKOH/g)',
    '容忍度(g/ml)',
    'NCO含量(%)',
    '检验结论'
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        escapeCsvCell(exportCellVal(r.inspection_id)),
        escapeCsvCell(exportCellVal(r.product_model)),
        escapeCsvCell(exportCellVal(r.product_batch_no)),
        escapeCsvCell(exportCellVal(r.barrel_count)),
        escapeCsvCell(exportCellVal(r.initial_batch_kg)),
        escapeCsvCell(exportCellVal(r.inspection_batch_kg)),
        escapeCsvCell(exportCellVal(r.appearance)),
        escapeCsvCell(exportCellVal(r.color_fe_co)),
        escapeCsvCell(exportCellVal(r.solid_content_pct)),
        escapeCsvCell(exportCellVal(r.viscosity_s_25c)),
        escapeCsvCell(exportCellVal(r.acid_value_mgkoh_g)),
        escapeCsvCell(exportCellVal(r.tolerance_g_ml)),
        escapeCsvCell(exportCellVal(r.nco_content_pct)),
        escapeCsvCell(exportCellVal(r.inspection_conclusion))
      ].join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

function downloadCsvFile(filename, csvBody) {
  const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fpExportFilenameBase() {
  const y = selectedYearMeta.value?.year;
  const t = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}_${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;
  return Number.isFinite(y) ? `成品检验台账_${y}年_${ts}` : `成品检验台账_${ts}`;
}

function onExportSelectedRows() {
  const rows = (fpTableRef.value?.getSelectionRows?.() || fpBatchSelectedRows.value).slice();
  if (!rows.length) {
    ElMessage.warning('请先勾选要导出的行');
    return;
  }
  const name = `${fpExportFilenameBase()}_所选${rows.length}条.csv`;
  downloadCsvFile(name, buildFinishedProductCsv(rows));
  ElMessage.success(`已导出 ${rows.length} 条`);
}

async function fetchAllFinishedProductRowsForExport() {
  const yid = Number(selectedYearId.value);
  if (!Number.isFinite(yid) || yid < 1) return [];
  const kw = fpKeyword.value.trim() || undefined;
  const pageSize = 200;
  let page = 1;
  const all = [];
  let total = null;
  const maxPages = 500;
  while (page <= maxPages) {
    const data = await listQcYearbookFinishedProductRows(yid, { page, pageSize, keyword: kw });
    const items = Array.isArray(data?.items) ? data.items : [];
    if (total == null) {
      const t = Number(data?.total);
      total = Number.isFinite(t) ? t : items.length;
    }
    all.push(...items);
    if (items.length === 0 || all.length >= total) break;
    if (items.length < pageSize) break;
    page += 1;
  }
  return all;
}

async function onExportAllRows() {
  if (!selectedYearId.value) {
    ElMessage.warning('请先选择年份');
    return;
  }
  fpExportAllLoading.value = true;
  try {
    const rows = await fetchAllFinishedProductRowsForExport();
    if (!rows.length) {
      ElMessage.warning('没有可导出的数据');
      return;
    }
    const name = `${fpExportFilenameBase()}_全部${rows.length}条.csv`;
    downloadCsvFile(name, buildFinishedProductCsv(rows));
    ElMessage.success(`已导出 ${rows.length} 条`);
  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || '导出失败';
    ElMessage.error(msg);
  } finally {
    fpExportAllLoading.value = false;
  }
}

async function onFpBatchDeleteSelected() {
  const rows = (fpTableRef.value?.getSelectionRows?.() || fpBatchSelectedRows.value).slice();
  if (!rows.length) {
    ElMessage.warning('请先在表格中勾选要删除的行');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定删除所选的 ${rows.length} 条成品检验记录？此操作不可恢复。`,
      '确认批量删除',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  fpBatchDeleting.value = true;
  let ok = 0;
  let fail = 0;
  let lastErr = '';
  for (const row of rows) {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id < 1) {
      fail += 1;
      continue;
    }
    try {
      await deleteQcYearbookFinishedProductRow(id);
      ok += 1;
    } catch (e) {
      fail += 1;
      lastErr = e?.response?.data?.message || e?.message || '请求失败';
    }
  }
  fpBatchDeleting.value = false;
  if (ok && !fail) {
    ElMessage.success(`已删除 ${ok} 条`);
  } else if (ok && fail) {
    ElMessage.warning(`已删除 ${ok} 条，失败 ${fail} 条${lastErr ? `（${lastErr}）` : ''}`);
  } else {
    ElMessage.error(lastErr || '批量删除失败');
  }
  fpBatchSelectedRows.value = [];
  nextTick(() => fpTableRef.value?.clearSelection?.());
  await reloadYears();
}

function onYearChange() {
  fpRowOpsVisible.value = false;
  fpBatchSelectedRows.value = [];
  nextTick(() => fpTableRef.value?.clearSelection?.());
  loadFpRows(1);
}

function openYearDialog() {
  const nextY = years.value.length ? Math.max(...years.value.map((x) => Number(x.year))) + 1 : 2026;
  yearForm.value = { year: Math.min(2100, Math.max(2000, nextY)), remark: '' };
  yearDialogVisible.value = true;
}

function resetYearForm() {
  yearForm.value = { year: 2027, remark: '' };
}

async function submitYear() {
  const y = Number(yearForm.value.year);
  if (!Number.isFinite(y) || y < 2000 || y > 2100) {
    ElMessage.warning('请输入有效年份');
    return;
  }
  yearSaving.value = true;
  try {
    const created = await createQcYearbookYear({
      year: y,
      remark: yearForm.value.remark?.trim() || null
    });
    ElMessage.success('已新增年份');
    yearDialogVisible.value = false;
    await reloadYears();
    if (created?.id) {
      selectedYearId.value = created.id;
      await loadFpRows(1);
    }
  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || '保存失败';
    ElMessage.error(msg);
  } finally {
    yearSaving.value = false;
  }
}

async function onDeleteYear() {
  if (!canMutate.value || !selectedYearId.value) return;
  const y = years.value.find((x) => Number(x.id) === Number(selectedYearId.value));
  const label = y ? `${y.year} 年` : '当前年份';
  try {
    await ElMessageBox.confirm(`将删除「${label}」及其下全部成品台账数据，且不可恢复。是否继续？`, '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    });
  } catch {
    return;
  }
  try {
    await deleteQcYearbookYear(selectedYearId.value);
    ElMessage.success('已删除');
    selectedYearId.value = null;
    await reloadYears();
  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || '删除失败';
    ElMessage.error(msg);
  }
}

onMounted(() => {
  reloadYears();
});
</script>

<style scoped>
.qc-yearbooks-page {
  margin: 0 12px 24px;
  max-width: 1680px;
}

/* 工具栏实体按钮统一高度（与 Element 默认尺寸对齐） */
.qc-yearbooks-page .year-row-right > .el-button,
.qc-yearbooks-page .table-card-tools > .el-button,
.qc-yearbooks-page .qc-empty-actions .el-button,
.qc-yearbooks-page :deep(.el-dialog__footer .el-button) {
  height: var(--el-component-size, 32px);
  min-height: var(--el-component-size, 32px);
  padding-top: 0;
  padding-bottom: 0;
  box-sizing: border-box;
}

.qc-empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 8px;
}

.page-hint {
  margin-bottom: 12px;
}

.page-hint-err {
  margin-bottom: 16px;
}

.page-empty {
  margin-top: 24px;
}

.panel {
  margin-bottom: 16px;
  border-radius: 8px;
}

.panel-year :deep(.el-card__body) {
  padding: 14px 18px;
}

.panel-year-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}

.year-row-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.year-row-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 500;
  color: #606266;
}

.year-select {
  width: 220px;
  max-width: 100%;
}

.stat-tag {
  font-weight: 500;
}

.panel-table :deep(.el-card__header) {
  padding: 14px 18px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.panel-table :deep(.el-card__body) {
  padding: 16px 18px 18px;
}

.table-card-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px 16px;
}

.table-card-head-text {
  min-width: 0;
}

.table-card-title {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
}

.table-card-sub {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  font-weight: normal;
  color: #909399;
}

.table-card-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.fp-tool-checkbox {
  margin-right: 0;
  white-space: nowrap;
}

.fp-search {
  width: 260px;
  max-width: 100%;
}

.fp-search-icon {
  color: #909399;
}

.table-fp {
  width: 100%;
}

.pager-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.form-tip {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
  margin-top: 4px;
}

.fp-edit-form {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 4px;
}

@media (max-width: 768px) {
  .year-row-right {
    margin-left: 0;
    width: 100%;
  }

  .table-card-tools {
    width: 100%;
  }

  .fp-search {
    width: 100%;
  }
}
</style>
