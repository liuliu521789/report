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
        <el-button v-if="canMutate" :icon="Calendar" @click="openYearManageDialog">年份管理</el-button>
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
                :label="`${y.year} 年 · ${Number(y.fp_row_count) || 0} 条`"
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
            <el-button v-if="canMutate" :icon="Calendar" @click="openYearManageDialog">年份管理</el-button>
          </div>
        </div>
      </el-card>

      <el-card v-if="selectedYearId" class="panel panel-table" shadow="never">
        <template #header>
          <div class="table-card-header">
            <div class="table-card-head-text">
              <span class="table-card-title">成品检验台账</span>
              <span v-if="selectedYearMeta" class="table-card-sub">
                {{ selectedYearMeta.year }} 年 · 共 {{ fpTotal }} 条
                <template v-if="fpKeyword.trim()"> · 当前筛选 {{ fpItems.length }} 条</template>
                <template v-if="canMutate"> · 双击行可编辑</template>
              </span>
            </div>
          </div>
          <div class="table-toolbar">
            <div class="table-toolbar-filter">
              <el-input
                v-model="fpKeyword"
                class="fp-search"
                clearable
                placeholder="搜索型号、批号、外观、色度、结论、检验ID"
                @keyup.enter="onFpSearch"
                @clear="onFpSearch"
              >
                <template #prefix>
                  <el-icon class="fp-search-icon"><Search /></el-icon>
                </template>
              </el-input>
              <el-button type="primary" :icon="Search" @click="onFpSearch">查询</el-button>
              <el-button :icon="RefreshLeft" :disabled="!fpKeyword.trim() && !fpLoading" @click="onFpResetSearch">重置</el-button>
              <el-tag v-if="fpKeyword.trim()" type="primary" effect="plain" closable class="filter-tag" @close="onFpResetSearch">
                关键词：{{ fpKeyword.trim() }}
              </el-tag>
            </div>
            <div class="table-toolbar-actions">
              <el-checkbox v-model="fpShowInspectionId" class="fp-tool-checkbox">显示检验ID</el-checkbox>
              <el-dropdown v-if="canView" trigger="click" @command="onExportCommand">
                <el-button :icon="Download" :loading="fpExportAllLoading">
                  导出
                  <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="selected" :disabled="!fpBatchSelectedRows.length">
                      导出所选（{{ fpBatchSelectedRows.length }} 条）
                    </el-dropdown-item>
                    <el-dropdown-item command="all">全部导出（CSV）</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button v-if="canMutate" type="success" :icon="Plus" @click="openFpDialog(null)">新增成品行</el-button>
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
          highlight-current-row
          class="table-fp"
          :class="{ 'table-fp--editable': canMutate }"
          @selection-change="onFpBatchSelectionChange"
          @row-dblclick="onFpRowDblClick"
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
        <el-table-column prop="inspection_conclusion" label="检验结论" width="108">
          <template #default="{ row }">
            <el-tag v-if="row.inspection_conclusion" :type="fpConclusionTagType(row.inspection_conclusion)" effect="light" size="small">
              {{ row.inspection_conclusion }}
            </el-tag>
            <span v-else class="cell-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column v-if="canMutate" label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Edit" @click="openFpDialog(row)">编辑</el-button>
            <el-button type="danger" link :icon="Delete" @click="onDeleteFpRow(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :image-size="72" :description="fpEmptyDescription">
            <div v-if="canMutate" class="qc-table-empty-actions">
              <el-button type="primary" :icon="Upload" @click="openImportDialog">从 Excel 导入</el-button>
              <el-button :icon="Plus" @click="openFpDialog(null)">手动新增</el-button>
            </div>
          </el-empty>
        </template>
      </el-table>
      <transition name="qc-batch-bar-fade">
        <div v-if="fpBatchSelectedRows.length" class="qc-batch-bar">
          <div class="qc-batch-bar__left">
            <span class="qc-batch-bar__count">已选 {{ fpBatchSelectedRows.length }} 条</span>
            <el-popover placement="top-start" :width="320" trigger="click">
              <template #reference>
                <el-button link type="primary" size="small">查看清单</el-button>
              </template>
              <div class="qc-batch-bar__list">
                <div v-for="r in fpBatchSelectedRows" :key="r.id" class="qc-batch-bar__item">
                  {{ r.product_model || '—' }} · {{ r.product_batch_no || '—' }}
                  <span v-if="r.inspection_id" class="qc-batch-bar__item-id">（{{ r.inspection_id }}）</span>
                </div>
              </div>
            </el-popover>
            <el-button link size="small" @click="clearFpSelection">清空选择</el-button>
          </div>
          <div class="qc-batch-bar__actions">
            <el-button v-if="canView" size="small" :icon="Download" @click="onExportSelectedRows">导出所选</el-button>
            <el-button
              v-if="canMutate"
              size="small"
              type="danger"
              plain
              :icon="Delete"
              :loading="fpBatchDeleting"
              @click="onFpBatchDeleteSelected"
            >
              删除所选
            </el-button>
          </div>
        </div>
      </transition>
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
    <el-dialog
      v-model="yearManageVisible"
      title="年份管理"
      width="min(620px, 96vw)"
      class="year-manage-dialog"
      destroy-on-close
      @open="onYearManageOpen"
      @closed="resetYearForm"
    >
      <section class="year-manage-add">
        <div class="year-manage-section-title">新增统计年度</div>
        <p class="year-manage-section-desc">每个自然年对应一份成品检验台账；创建后可导入 Excel 或手动录入。</p>
        <el-form ref="yearFormRef" :model="yearForm" :rules="yearFormRules" label-width="72px" class="year-manage-form">
          <el-form-item label="年份" prop="year">
            <div v-if="yearAddSuggestions.length" class="year-quick-picks">
              <el-check-tag
                v-for="y in yearAddSuggestions"
                :key="y"
                :checked="Number(yearForm.year) === y"
                class="year-quick-tag"
                @change="(checked) => checked && pickAddYear(y)"
              >
                {{ y }} 年
              </el-check-tag>
            </div>
            <el-input-number
              v-model="yearForm.year"
              :min="2000"
              :max="2100"
              :step="1"
              controls-position="right"
              class="w-full"
            />
          </el-form-item>
          <el-form-item label="备注">
            <el-input
              v-model="yearForm.remark"
              type="textarea"
              :rows="2"
              maxlength="255"
              show-word-limit
              placeholder="可选，如：2026 年度台账"
            />
          </el-form-item>
          <el-form-item label="">
            <el-checkbox v-model="yearOpenImportAfterCreate">创建后打开 Excel 导入</el-checkbox>
          </el-form-item>
        </el-form>
        <div class="year-manage-add-actions">
          <el-button type="primary" :icon="Plus" :loading="yearSaving" @click="submitYear">创建年份</el-button>
        </div>
      </section>

      <el-divider class="year-manage-divider" />

      <section class="year-manage-list">
        <div class="year-manage-section-title">已有年度（{{ years.length }}）</div>
        <el-table :data="years" size="small" border stripe max-height="300" empty-text="暂无年度，请先创建">
          <el-table-column label="年份" min-width="120">
            <template #default="{ row }">
              <span>{{ row.year }} 年</span>
              <el-tag v-if="Number(row.id) === Number(selectedYearId)" type="success" effect="plain" size="small" class="year-current-tag">
                当前
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="成品数据" width="96" align="right">
            <template #default="{ row }">
              <span :class="{ 'year-count-empty': !(Number(row.fp_row_count) > 0) }">
                {{ Number(row.fp_row_count) || 0 }} 条
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
          <el-table-column label="操作" width="128" fixed="right" align="center">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                size="small"
                :disabled="Number(row.id) === Number(selectedYearId)"
                @click="selectYearFromManage(row)"
              >
                切换
              </el-button>
              <el-tooltip
                :disabled="!isYearDeleteBlocked(row)"
                :content="yearDeleteBlockedTip(row)"
                placement="top"
              >
                <span class="year-delete-btn-wrap">
                  <el-button
                    link
                    type="danger"
                    size="small"
                    :disabled="isYearDeleteBlocked(row)"
                    :loading="yearDeletingId === Number(row.id)"
                    @click="confirmDeleteYearRow(row)"
                  >
                    删除
                  </el-button>
                </span>
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
        <p class="year-manage-list-tip">
          当前年度有成品数据时不可删除；其他年度无数据可直接删除，有数据需输入年份数字二次确认。
        </p>
      </section>

      <template #footer>
        <el-button :icon="Close" @click="yearManageVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 成品检验台账：新增 / 编辑 -->
    <el-dialog
      v-model="fpDialogVisible"
      width="min(760px, 96vw)"
      top="6vh"
      class="fp-row-dialog"
      destroy-on-close
      @closed="resetFpForm"
      @opened="onFpDialogOpened"
    >
      <template #header>
        <div class="fp-dialog-header">
          <span class="fp-dialog-header__title">{{ fpEditingId ? '编辑成品行' : '新增成品行' }}</span>
          <div class="fp-dialog-header__meta">
            <el-tag v-if="selectedYearMeta" type="info" effect="plain" size="small">{{ selectedYearMeta.year }} 年</el-tag>
            <el-tag v-if="fpEditingId && fpForm.inspectionId" effect="plain" size="small">{{ fpForm.inspectionId }}</el-tag>
            <span v-else class="fp-dialog-header__hint">检验ID 保存后自动生成</span>
          </div>
        </div>
      </template>

      <div class="fp-dialog-body" @keydown="onFpFormKeydown">
        <el-form
          ref="fpFormRef"
          :model="fpForm"
          :rules="fpFormRules"
          label-position="top"
          class="fp-edit-form"
          @submit.prevent
        >
          <section class="fp-form-section">
            <div class="fp-form-section__title">基本信息</div>
            <el-row :gutter="16">
              <el-col :xs="24" :sm="12">
                <el-form-item label="产品型号" prop="productModel">
                  <el-autocomplete
                    ref="fpModelInputRef"
                    v-model="fpForm.productModel"
                    :fetch-suggestions="fetchFpModelSuggestions"
                    :trigger-on-focus="!!fpSuggestCache.models.length"
                    clearable
                    maxlength="128"
                    show-word-limit
                    placeholder="必填，可联想已有型号"
                    class="w-full"
                    value-key="value"
                  >
                    <template #default="{ item }">
                      <span>{{ item.value }}</span>
                    </template>
                  </el-autocomplete>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="产品批号" prop="productBatchNo">
                  <el-input
                    ref="fpBatchNoInputRef"
                    v-model="fpForm.productBatchNo"
                    maxlength="64"
                    show-word-limit
                    clearable
                    placeholder="必填"
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </section>

          <section class="fp-form-section">
            <div class="fp-form-section__head">
              <span class="fp-form-section__title">批量信息</span>
              <el-button
                v-if="!fpEditingId && fpMetricTemplateSource"
                link
                type="primary"
                size="small"
                @click="applyFpMetricTemplate"
              >
                沿用{{ fpMetricTemplateSource.label }}指标
              </el-button>
            </div>
            <el-row :gutter="16">
              <el-col :xs="24" :sm="8">
                <el-form-item label="桶数">
                  <el-input-number
                    v-model="fpForm.barrelCount"
                    :precision="4"
                    :step="0.01"
                    controls-position="right"
                    class="w-full"
                    placeholder="可选"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="8">
                <el-form-item label="初检批量 (Kg)">
                  <el-input-number
                    v-model="fpForm.initialBatchKg"
                    :precision="4"
                    :step="1"
                    controls-position="right"
                    class="w-full"
                    placeholder="可选"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="8">
                <el-form-item label="检验批量 (Kg)">
                  <el-input-number
                    v-model="fpForm.inspectionBatchKg"
                    :precision="4"
                    :step="1"
                    controls-position="right"
                    class="w-full"
                    placeholder="可选"
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </section>

          <section class="fp-form-section">
            <div class="fp-form-section__title">检验指标</div>
            <el-row :gutter="16">
              <el-col :xs="24" :sm="12">
                <el-form-item label="外观">
                  <el-autocomplete
                    v-model="fpForm.appearance"
                    :fetch-suggestions="fetchFpAppearanceSuggestions"
                    :trigger-on-focus="!!fpSuggestCache.appearances.length"
                    clearable
                    maxlength="64"
                    show-word-limit
                    placeholder="可选"
                    class="w-full"
                    value-key="value"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="色度 (Fe-Co) / #">
                  <el-input v-model="fpForm.colorFeCo" maxlength="32" show-word-limit clearable placeholder="可选" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="固体份 (%)">
                  <el-input-number
                    v-model="fpForm.solidContentPct"
                    :precision="4"
                    :step="0.01"
                    controls-position="right"
                    class="w-full"
                    placeholder="可选"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="粘度 (s) / 25℃">
                  <el-input-number
                    v-model="fpForm.viscosityS25c"
                    :precision="4"
                    :step="0.1"
                    controls-position="right"
                    class="w-full"
                    placeholder="可选"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="酸值 (mgKOH/g)">
                  <el-input-number
                    v-model="fpForm.acidValueMgkohG"
                    :precision="4"
                    :step="0.1"
                    controls-position="right"
                    class="w-full"
                    placeholder="可选"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="容忍度 (g/ml)">
                  <el-input-number
                    v-model="fpForm.toleranceGml"
                    :precision="6"
                    :step="0.0001"
                    controls-position="right"
                    class="w-full"
                    placeholder="可选"
                  />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="NCO 含量 (%)">
                  <el-input-number
                    v-model="fpForm.ncoContentPct"
                    :precision="4"
                    :step="0.01"
                    controls-position="right"
                    class="w-full"
                    placeholder="可选"
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </section>

          <section class="fp-form-section fp-form-section--last">
            <div class="fp-form-section__title">检验结论</div>
            <el-form-item prop="inspectionConclusion">
              <div class="fp-conclusion-quick">
                <el-check-tag
                  v-for="opt in FP_CONCLUSION_PRESETS"
                  :key="opt"
                  :checked="fpForm.inspectionConclusion === opt"
                  class="fp-conclusion-tag"
                  @change="(checked) => onFpConclusionQuickPick(opt, checked)"
                >
                  {{ opt }}
                </el-check-tag>
              </div>
              <el-select
                v-model="fpForm.inspectionConclusion"
                filterable
                allow-create
                clearable
                default-first-option
                placeholder="选择常用结论或输入自定义内容"
                class="w-full"
              >
                <el-option v-for="opt in fpConclusionOptions" :key="opt" :label="opt" :value="opt" />
              </el-select>
            </el-form-item>
          </section>
        </el-form>
      </div>

      <template #footer>
        <div class="fp-dialog-footer">
          <span class="fp-dialog-footer__hint">Ctrl + Enter 快捷保存</span>
          <div class="fp-dialog-footer__actions">
            <el-button :icon="Close" @click="fpDialogVisible = false">取消</el-button>
            <el-button
              v-if="!fpEditingId"
              :icon="Plus"
              :loading="fpSaving"
              @click="submitFpRow({ keepOpen: true })"
            >
              保存并继续
            </el-button>
            <el-button type="primary" :icon="Check" :loading="fpSaving" @click="submitFpRow()">保存</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Search,
  Refresh,
  Upload,
  Plus,
  Delete,
  Edit,
  Document,
  Close,
  Check,
  Download,
  ArrowDown,
  RefreshLeft,
  Calendar
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
const fpTableRef = ref(null);
const fpBatchSelectedRows = ref([]);
const fpBatchDeleting = ref(false);
const fpExportAllLoading = ref(false);

const fpDialogVisible = ref(false);
const fpSaving = ref(false);
const fpEditingId = ref(null);
const fpFormRef = ref(null);
const fpModelInputRef = ref(null);
const fpBatchNoInputRef = ref(null);
const fpLastSavedSnapshot = ref(null);

const FP_CONCLUSION_PRESETS = ['合格', '不合格', '让步接收'];

const fpFormRules = {
  productModel: [{ required: true, message: '请填写产品型号', trigger: 'blur' }],
  productBatchNo: [{ required: true, message: '请填写产品批号', trigger: 'blur' }]
};

const fpSuggestCache = ref({
  models: [],
  appearances: [],
  conclusions: []
});

const fpConclusionOptions = computed(() => {
  const set = new Set([...FP_CONCLUSION_PRESETS, ...fpSuggestCache.value.conclusions]);
  return [...set].filter(Boolean);
});

const fpMetricTemplateSource = computed(() => {
  if (fpLastSavedSnapshot.value) {
    return { label: '上一行', data: fpLastSavedSnapshot.value };
  }
  const row = fpItems.value[0];
  if (!row) return null;
  return { label: '列表首行', data: fpMetricSnapshotFromRow(row) };
});

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

const yearManageVisible = ref(false);
const yearSaving = ref(false);
const yearDeletingId = ref(null);
const yearFormRef = ref(null);
const yearOpenImportAfterCreate = ref(false);
const yearForm = ref({ year: new Date().getFullYear(), remark: '' });

const yearFormRules = {
  year: [
    { required: true, message: '请填写年份', trigger: 'change' },
    {
      validator: (_rule, value, callback) => {
        const y = Number(value);
        if (!Number.isFinite(y) || y < 2000 || y > 2100) {
          callback(new Error('年份须在 2000–2100 之间'));
          return;
        }
        if (years.value.some((row) => Number(row.year) === y)) {
          callback(new Error('该年份已存在，请直接切换或选择其他年份'));
          return;
        }
        callback();
      },
      trigger: 'change'
    }
  ]
};

const yearAddSuggestions = computed(() => {
  const existing = new Set(years.value.map((row) => Number(row.year)));
  const now = new Date().getFullYear();
  const candidates = [];
  if (years.value.length) {
    candidates.push(Math.max(...years.value.map((row) => Number(row.year))) + 1);
  }
  candidates.push(now, now + 1, now - 1);
  const out = [];
  for (const y of candidates) {
    if (y >= 2000 && y <= 2100 && !existing.has(y) && !out.includes(y)) out.push(y);
  }
  for (let y = now; y <= now + 6 && out.length < 5; y += 1) {
    if (!existing.has(y) && !out.includes(y)) out.push(y);
  }
  return out.slice(0, 5);
});

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

const fpEmptyDescription = computed(() => {
  if (fpKeyword.value.trim()) return '未找到匹配的成品记录，请调整关键词后重试';
  return '暂无成品数据，可导入 Excel「成品」表或手动新增';
});

let fpSearchDebounceTimer = null;
let fpKeywordWatchReady = false;
const fpSearchSilent = ref(false);

function fpConclusionTagType(text) {
  const s = String(text || '').trim();
  if (!s) return 'info';
  if (/不合格|拒收|失败|fail/i.test(s)) return 'danger';
  if (/合格|pass/i.test(s)) return 'success';
  if (/让步|特采|评审|待检/i.test(s)) return 'warning';
  return 'info';
}

function onFpSearch() {
  if (fpSearchDebounceTimer) {
    clearTimeout(fpSearchDebounceTimer);
    fpSearchDebounceTimer = null;
  }
  loadFpRows(1);
}

function onFpResetSearch() {
  fpSearchSilent.value = true;
  fpKeyword.value = '';
  fpSearchSilent.value = false;
  if (fpSearchDebounceTimer) {
    clearTimeout(fpSearchDebounceTimer);
    fpSearchDebounceTimer = null;
  }
  loadFpRows(1);
}

function clearFpSelection() {
  fpBatchSelectedRows.value = [];
  nextTick(() => fpTableRef.value?.clearSelection?.());
}

function onFpRowDblClick(row) {
  if (!canMutate.value || !row) return;
  openFpDialog(row);
}

function onExportCommand(cmd) {
  if (cmd === 'selected') onExportSelectedRows();
  else if (cmd === 'all') onExportAllRows();
}

function openYearManageDialog() {
  yearManageVisible.value = true;
}

function onYearManageOpen() {
  resetYearForm();
  const suggest = yearAddSuggestions.value[0];
  if (suggest != null) yearForm.value.year = suggest;
  nextTick(() => yearFormRef.value?.clearValidate?.());
}

function pickAddYear(y) {
  yearForm.value.year = y;
  nextTick(() => yearFormRef.value?.validateField?.('year'));
}

function selectYearFromManage(row) {
  if (!row?.id) return;
  selectedYearId.value = Number(row.id);
  yearManageVisible.value = false;
  onYearChange();
}

function resetYearForm() {
  yearForm.value = { year: new Date().getFullYear(), remark: '' };
  yearOpenImportAfterCreate.value = false;
}

function calendarYearNow() {
  return new Date().getFullYear();
}

function isYearDeleteBlocked(row) {
  if (!row) return false;
  const count = Number(row.fp_row_count) || 0;
  return Number(row.year) === calendarYearNow() && count > 0;
}

function yearDeleteBlockedTip(row) {
  const y = Number(row?.year);
  const count = Number(row?.fp_row_count) || 0;
  return `当前年度（${y} 年）已有 ${count} 条成品数据，不允许删除`;
}

async function confirmYearDeletion(yearNum, fpCount) {
  const y = Number(yearNum);
  const count = Number(fpCount) || 0;
  try {
    if (count <= 0) {
      await ElMessageBox.confirm(
        `「${y} 年」下暂无成品数据，删除后仅移除年度配置。是否继续？`,
        '删除空年度',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
      );
      return true;
    }
    await ElMessageBox.prompt(
      `「${y} 年」下有 ${count} 条成品记录，删除后不可恢复。\n\n请输入年份数字 ${y} 以确认删除：`,
      '删除年度及全部数据',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        inputPlaceholder: String(y),
        inputPattern: new RegExp(`^\\s*${y}\\s*$`),
        inputErrorMessage: `请输入 ${y} 以确认`
      }
    );
    return true;
  } catch {
    return false;
  }
}

async function deleteYearById(yearId, yearNum) {
  yearDeletingId.value = Number(yearId);
  try {
    await deleteQcYearbookYear(yearId);
    ElMessage.success(`已删除 ${yearNum} 年`);
    if (Number(selectedYearId.value) === Number(yearId)) {
      selectedYearId.value = null;
    }
    await reloadYears();
  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || '删除失败';
    ElMessage.error(msg);
  } finally {
    yearDeletingId.value = null;
  }
}

async function confirmDeleteYearRow(row) {
  if (!canMutate.value || !row?.id) return;
  if (isYearDeleteBlocked(row)) {
    ElMessage.warning(yearDeleteBlockedTip(row));
    return;
  }
  const yearNum = Number(row.year);
  const fpCount = Number(row.fp_row_count) || 0;
  const ok = await confirmYearDeletion(yearNum, fpCount);
  if (!ok) return;
  await deleteYearById(Number(row.id), yearNum);
}

function pickDefaultYearId(list) {
  if (!list.length) return null;
  const now = new Date().getFullYear();
  const current = list.find((x) => Number(x.year) === now);
  if (current) return Number(current.id);
  return Number(list[0].id);
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

watch(fpKeyword, () => {
  if (!fpKeywordWatchReady) {
    fpKeywordWatchReady = true;
    return;
  }
  if (fpSearchSilent.value) return;
  if (fpSearchDebounceTimer) clearTimeout(fpSearchDebounceTimer);
  fpSearchDebounceTimer = setTimeout(() => {
    fpSearchDebounceTimer = null;
    loadFpRows(1);
  }, 450);
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
    mergeFpSuggestFromRows(fpItems.value);
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
  nextTick(() => fpFormRef.value?.clearValidate?.());
}

function mergeFpSuggestFromRows(rows) {
  const models = new Set(fpSuggestCache.value.models);
  const appearances = new Set(fpSuggestCache.value.appearances);
  const conclusions = new Set(fpSuggestCache.value.conclusions);
  for (const r of rows || []) {
    const model = String(r?.product_model || '').trim();
    const appearance = String(r?.appearance || '').trim();
    const conclusion = String(r?.inspection_conclusion || '').trim();
    if (model) models.add(model);
    if (appearance) appearances.add(appearance);
    if (conclusion) conclusions.add(conclusion);
  }
  const sortZh = (a, b) => a.localeCompare(b, 'zh');
  fpSuggestCache.value = {
    models: [...models].sort(sortZh),
    appearances: [...appearances].sort(sortZh),
    conclusions: [...conclusions].sort(sortZh)
  };
}

function fetchFpAutocompleteSuggestions(list, queryString, cb) {
  const q = String(queryString || '').trim().toLowerCase();
  const items = (q ? list.filter((v) => v.toLowerCase().includes(q)) : list).slice(0, 20);
  cb(items.map((value) => ({ value })));
}

function fetchFpModelSuggestions(queryString, cb) {
  fetchFpAutocompleteSuggestions(fpSuggestCache.value.models, queryString, cb);
}

function fetchFpAppearanceSuggestions(queryString, cb) {
  fetchFpAutocompleteSuggestions(fpSuggestCache.value.appearances, queryString, cb);
}

function fpMetricSnapshotFromRow(row) {
  if (!row) return null;
  return {
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
}

function fpMetricSnapshotFromForm(form = fpForm.value) {
  return {
    barrelCount: form.barrelCount,
    initialBatchKg: form.initialBatchKg,
    inspectionBatchKg: form.inspectionBatchKg,
    appearance: form.appearance || '',
    colorFeCo: form.colorFeCo || '',
    solidContentPct: form.solidContentPct,
    viscosityS25c: form.viscosityS25c,
    acidValueMgkohG: form.acidValueMgkohG,
    toleranceGml: form.toleranceGml,
    ncoContentPct: form.ncoContentPct,
    inspectionConclusion: form.inspectionConclusion || ''
  };
}

function applyFpMetricTemplate() {
  const src = fpMetricTemplateSource.value?.data;
  if (!src) return;
  const keep = {
    inspectionId: fpForm.value.inspectionId,
    productModel: fpForm.value.productModel,
    productBatchNo: fpForm.value.productBatchNo
  };
  fpForm.value = { ...fpFormDefault(), ...keep, ...src };
  ElMessage.success('已沿用检验指标');
}

function onFpConclusionQuickPick(opt, checked) {
  fpForm.value.inspectionConclusion = checked ? opt : '';
}

function onFpDialogOpened(focusTarget = 'model') {
  nextTick(() => {
    if (focusTarget === 'batch') {
      fpBatchNoInputRef.value?.focus?.();
      return;
    }
    fpModelInputRef.value?.focus?.();
  });
}

function onFpFormKeydown(e) {
  if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
  e.preventDefault();
  submitFpRow();
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

async function submitFpRow(opts = {}) {
  const keepOpen = !!opts.keepOpen;
  const form = fpFormRef.value;
  if (form) {
    try {
      await form.validate();
    } catch {
      return;
    }
  }
  const payload = buildFpPayload();
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
      fpLastSavedSnapshot.value = fpMetricSnapshotFromForm();
      const iid = created?.inspection_id;
      ElMessage.success(iid ? `已新增，检验ID：${iid}` : '已新增');
    }
    await reloadYears();
    if (wasEdit) {
      await loadFpRows(fpPage.value);
      fpDialogVisible.value = false;
    } else if (keepOpen) {
      const keepModel = fpForm.value.productModel;
      fpEditingId.value = null;
      fpForm.value = fpFormDefault();
      fpForm.value.productModel = keepModel;
      nextTick(() => {
        fpFormRef.value?.clearValidate?.();
        onFpDialogOpened('batch');
      });
      await loadFpRows(1);
    } else {
      fpDialogVisible.value = false;
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
  await loadFpRows(fpPage.value);
}

function onYearChange() {
  fpBatchSelectedRows.value = [];
  nextTick(() => fpTableRef.value?.clearSelection?.());
  loadFpRows(1);
}

async function submitYear() {
  const form = yearFormRef.value;
  if (form) {
    try {
      await form.validate();
    } catch {
      return;
    }
  }
  const y = Number(yearForm.value.year);
  const openImportAfter = yearOpenImportAfterCreate.value;
  yearSaving.value = true;
  try {
    const created = await createQcYearbookYear({
      year: y,
      remark: yearForm.value.remark?.trim() || null
    });
    ElMessage.success(`已创建 ${y} 年`);
    await reloadYears();
    if (created?.id) {
      selectedYearId.value = created.id;
      await loadFpRows(1);
    }
    resetYearForm();
    const suggest = yearAddSuggestions.value[0];
    if (suggest != null) yearForm.value.year = suggest;
    if (openImportAfter) {
      yearManageVisible.value = false;
      openImportDialog();
    }
  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || '创建失败';
    ElMessage.error(msg);
  } finally {
    yearSaving.value = false;
  }
}

onMounted(() => {
  reloadYears();
});

onBeforeUnmount(() => {
  if (fpSearchDebounceTimer) clearTimeout(fpSearchDebounceTimer);
});
</script>

<style scoped>
.qc-yearbooks-page {
  margin: 0 12px 24px;
  max-width: 1680px;
}

/* 工具栏实体按钮统一高度（与 Element 默认尺寸对齐） */
.qc-yearbooks-page .year-row-right > .el-button,
.qc-yearbooks-page .table-toolbar-actions > .el-button,
.qc-yearbooks-page .table-toolbar-filter > .el-button,
.qc-yearbooks-page .fp-dialog-footer__actions .el-button,
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
  width: 240px;
  max-width: 100%;
}

.year-manage-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 6px;
}

.year-manage-section-desc,
.year-manage-list-tip {
  margin: 0 0 12px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.year-manage-list-tip {
  margin: 10px 0 0;
}

.year-quick-picks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.year-quick-tag {
  font-size: 13px;
}

.year-manage-add-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.year-manage-divider {
  margin: 18px 0;
}

.year-current-tag {
  margin-left: 6px;
  vertical-align: middle;
}

.year-count-empty {
  color: #c0c4cc;
}

.year-delete-btn-wrap {
  display: inline-flex;
}

.year-manage-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.year-manage-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
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
  margin-bottom: 12px;
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

.table-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
}

.table-toolbar-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.table-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.filter-tag {
  max-width: 240px;
}

.filter-tag :deep(.el-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fp-tool-checkbox {
  margin-right: 0;
  white-space: nowrap;
}

.fp-search {
  width: min(320px, 100%);
  max-width: 100%;
}

.fp-search-icon {
  color: #909399;
}

.table-fp {
  width: 100%;
}

.table-fp--editable :deep(.el-table__body tr) {
  cursor: pointer;
}

.cell-muted {
  color: #c0c4cc;
}

.qc-table-empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.qc-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding: 10px 14px;
  background: linear-gradient(180deg, #f0fdf4 0%, #fff 100%);
  border: 1px solid #bbf7d0;
  border-radius: 10px;
}

.qc-batch-bar__left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.qc-batch-bar__count {
  font-size: 13px;
  font-weight: 600;
  color: #15803d;
}

.qc-batch-bar__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.qc-batch-bar__list {
  max-height: 220px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.qc-batch-bar__item {
  font-size: 13px;
  color: #334155;
  line-height: 1.4;
  word-break: break-all;
}

.qc-batch-bar__item-id {
  color: #64748b;
}

.qc-batch-bar-fade-enter-active,
.qc-batch-bar-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.qc-batch-bar-fade-enter-from,
.qc-batch-bar-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
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
  max-height: min(68vh, 640px);
  overflow-y: auto;
  padding-right: 4px;
}

.w-full {
  width: 100%;
}

.fp-row-dialog :deep(.el-dialog__header) {
  margin-right: 0;
  padding-bottom: 8px;
}

.fp-row-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
}

.fp-dialog-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
}

.fp-dialog-header__title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.fp-dialog-header__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.fp-dialog-header__hint {
  font-size: 12px;
  color: #909399;
}

.fp-dialog-body {
  outline: none;
}

.fp-form-section {
  margin-bottom: 18px;
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.fp-form-section--last {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.fp-form-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.fp-form-section__title {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 10px;
}

.fp-form-section__head .fp-form-section__title {
  margin-bottom: 0;
}

.fp-form-section :deep(.el-form-item) {
  margin-bottom: 14px;
}

.fp-form-section :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  padding-bottom: 4px;
  line-height: 1.4;
}

.fp-conclusion-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.fp-conclusion-tag {
  font-size: 13px;
}

.fp-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
}

.fp-dialog-footer__hint {
  font-size: 12px;
  color: #94a3b8;
}

.fp-dialog-footer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}

@media (max-width: 768px) {
  .year-row-right {
    margin-left: 0;
    width: 100%;
  }

  .table-toolbar-filter,
  .table-toolbar-actions {
    width: 100%;
  }

  .fp-search {
    width: 100%;
  }
}
</style>
