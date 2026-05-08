<template>
  <div class="report-edit-root">
    <div class="toolbar">
      <div>
        <el-button @click="$router.push('/reports')" icon=Back>返回</el-button>
      </div>
      <div class="toolbar-right">
        <span class="toolbar-label">判定结论</span>
        <el-select
          v-model="form.conclusion"
          size="small"
          class="conclusion-select"
          :disabled="!fieldEditable('conclusion')"
        >
          <el-option label="合格" value="pass" />
          <el-option label="不合格" value="fail" />
          <el-option label="未知" value="unknown" />
        </el-select>
        <el-button
          v-if="(isNew ? perm('reports', 'create') : perm('reports', 'edit')) && perm('templates', 'use')"
          :disabled="!canSaveAsTemplate"
          @click="openSaveTemplate"
        >
          {{ designerMode ? '保存报告样式' : '保存为模板' }}
        </el-button>
        <el-button
          v-if="isNew ? perm('reports', 'create') : perm('reports', 'edit')"
          type="primary"
          :loading="saving"
          @click="save"
         icon=Check>
          保存报告
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="!isNew && perm('reports', 'view') && !perm('reports', 'edit')"
      type="info"
      show-icon
      :closable="false"
      class="top-alert"
      title="当前为只读查看。若需编辑部分字段，请由超级管理员为您开启「编辑」并在报告字段中勾选可编辑项。"
    />

    <el-alert
      v-if="isNew"
      type="info"
      show-icon
      :closable="false"
      class="top-alert"
      title="新增报告：可选模板套用，或空白报告；版式与打印预览一致"
    />
    <el-alert
      v-if="designerMode"
      type="success"
      show-icon
      :closable="false"
      class="top-alert"
      title="设计模式：可拖拽调整字段与检验项目顺序，完成后点「保存报告样式」即可沉淀为模板"
    />

    <div class="top-cards-row">
      <el-card v-if="isNew" class="tpl-card tpl-card-half">
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

      <el-card v-if="form.templateId" class="tpl-card tpl-card-half">
        <template #header>
          <div class="field-header">
            <div>模板信息</div>
            <el-button v-if="!templateEditMode && perm('templates', 'use')" text type="primary" @click="startEditTemplate">编辑</el-button>
            <div v-else-if="templateEditMode">
              <el-button @click="cancelEditTemplate">取消</el-button>
              <el-button type="primary" :loading="templateSaving" @click="saveTemplate">保存</el-button>
            </div>
          </div>
        </template>
        <el-form :model="templateForm" label-width="100px">
          <el-form-item label="模板名称">
            <el-input v-model="templateForm.name" :readonly="!templateEditMode" maxlength="128" show-word-limit />
          </el-form-item>
          <el-form-item label="模板描述">
            <el-input v-model="templateForm.description" :readonly="!templateEditMode" maxlength="255" show-word-limit />
          </el-form-item>
        </el-form>
      </el-card>
    </div>

    <el-card v-if="isNew" class="tpl-card">
      <template #header>
        <div class="field-header">
          <div>创建方式</div>
        </div>
      </template>
      <div class="create-row">
        <el-select
          v-model="selectedTemplateId"
          placeholder="选择模板（可选）"
          clearable
          filterable
          style="width: 320px"
          :loading="tplLoading"
        >
          <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
        </el-select>
        <el-button type="primary" :disabled="!selectedTemplateId" @click="applyTemplate">套用模板</el-button>
        <el-button @click="startBlank">空白报告</el-button>
        <span class="text-muted">套用模板会覆盖当前纸张内容</span>
      </div>
    </el-card>

    <div class="paper-wrap">
      <div class="report-container">
        <div
          class="header-logo"
          :class="{ 'has-img': !!company.logoUrl }"
          :style="logoBlockStyle"
        />
        <div v-if="company.descriptionZh || company.descriptionEn" class="header-desc">
          <div>{{ company.descriptionZh }}</div>
          <div v-if="company.descriptionEn" class="header-desc-en">{{ company.descriptionEn }}</div>
        </div>

        <div class="header-doc-no">
          <div class="doc-no-row">
            <span class="doc-no-lbl">报告编号</span>
            <input
              v-model="form.reportNo"
              type="text"
              class="doc-no-input is-readonly"
              name="qc-report-no"
              autocomplete="off"
              placeholder="JL-8.8-05"
              readonly
            />
          </div>
          <div class="doc-no-row">
            <span class="doc-no-lbl">报告ID</span>
            <input
              type="text"
              class="doc-no-input is-readonly"
              autocomplete="off"
              :value="form.reportUid || (isNew ? '保存后自动生成' : '—')"
              readonly
            />
          </div>
        </div>
        <div class="company-name">{{ company.companyNameZh || '公司名称' }}</div>
        <h1 class="report-title">{{ company.reportTitleZh || '产品质量检验报告单' }}</h1>
        <div class="report-title-en">{{ company.reportTitleEn || 'Certificate of Analysis' }}</div>

        <div id="formContainer" class="form-container-inner">
          <div class="form-grid">
            <div
              v-for="(row, idx) in metaFields"
              :key="row.fieldKey + '-' + idx"
              class="form-row"
              draggable="true"
              @dragstart="onMetaDragStart(row)"
              @dragover.prevent
              @drop="onMetaDrop(row)"
            >
              <div class="form-label">
                <input
                  v-model="row.fieldLabel"
                  class="label-cn"
                  type="text"
                  :readonly="!rowEditable(row)"
                  @input="syncFieldLabelEn(row)"
                />
                <input
                  v-model="row.fieldLabelEn"
                  class="label-en"
                  type="text"
                  placeholder="English"
                  :readonly="!rowEditable(row)"
                />
              </div>
              <div class="form-value-wrap">
                <input
                  v-model="row.fieldValue.zh"
                  type="text"
                  class="form-input"
                  :class="{ 'is-readonly': !rowEditable(row) }"
                  placeholder="请输入"
                  :readonly="!rowEditable(row)"
                  @input="onMetaValueZh(row)"
                />
                <div v-if="rowEditable(row)" class="action-icons">
                  <span class="drag-icon" title="拖拽排序">
                    <el-icon><Rank /></el-icon>
                  </span>
                  <span class="del-icon" title="删除行" @click="deleteMetaRow(row)">
                    <el-icon><Delete /></el-icon>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          v-if="fieldEditable('custom_fields')"
          type="button"
          class="add-row-btn"
          @click="addMetaRow"
        >
          + 添加字段
        </button>

        <table v-if="inspectionTable" class="test-table">
          <thead>
            <tr>
              <th v-for="(col, ci) in tableColumnLabels" :key="'col-' + ci">
                <input
                  v-model="col.zh"
                  class="th-title-cn"
                  type="text"
                  :readonly="!fieldEditable('inspection_table')"
                  @input="syncColEn(ci)"
                />
                <input
                  v-model="col.en"
                  class="th-title-en"
                  type="text"
                  placeholder="English"
                  :readonly="!fieldEditable('inspection_table')"
                />
              </th>
              <th v-if="fieldEditable('inspection_table')">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(tr, ri) in tableDataRows"
              :key="'tr-' + ri"
              draggable="true"
              @dragstart="onTableRowDragStart(ri)"
              @dragover.prevent
              @drop="onTableRowDrop(ri)"
            >
              <td>
                <input
                  v-model="tr.item.zh"
                  class="cell-plain"
                  type="text"
                  :readonly="!fieldEditable('inspection_table')"
                  @input="syncTableCellEn(tr.item)"
                />
                <input
                  v-model="tr.item.en"
                  class="cell-plain cell-en"
                  type="text"
                  placeholder="EN"
                  :readonly="!fieldEditable('inspection_table')"
                />
              </td>
              <td>
                <input
                  v-model="tr.unit.zh"
                  class="cell-plain"
                  type="text"
                  :readonly="!fieldEditable('inspection_table')"
                  @input="syncTableCellEn(tr.unit)"
                />
              </td>
              <td>
                <input
                  v-model="tr.standard.zh"
                  class="test-input"
                  type="text"
                  :readonly="!fieldEditable('inspection_table')"
                  @input="syncTableCellEn(tr.standard)"
                />
              </td>
              <td>
                <input
                  v-model="tr.result.zh"
                  class="test-input"
                  type="text"
                  :readonly="!fieldEditable('inspection_table')"
                  @input="syncTableCellEn(tr.result)"
                />
              </td>
              <td v-if="hasInspectionBasisColumn">
                <input
                  v-model="tr.basis.zh"
                  class="test-input"
                  type="text"
                  :readonly="!fieldEditable('inspection_table')"
                  @input="syncTableCellEn(tr.basis)"
                />
              </td>
              <td v-if="fieldEditable('inspection_table')">
                <div class="table-action">
                  <span class="drag-icon" title="拖拽排序">
                    <el-icon><Rank /></el-icon>
                  </span>
                  <span class="del-icon" title="删除检验项" @click="removeTableRow(ri)">
                    <el-icon><Delete /></el-icon>
                  </span>
                </div>
              </td>
            </tr>
            <tr v-if="conclusionField && conclusionField.fieldValue">
              <td :colspan="hasInspectionBasisColumn ? 4 : 3" class="cell-merged">
                检验结论
                <div class="item-en">Test conclusion</div>
              </td>
              <td class="stamp-cell" :colspan="fieldEditable('inspection_table') ? 2 : 1">
                <input
                  v-model="conclusionField.fieldValue.zh"
                  type="text"
                  class="conclusion-input"
                  :class="{ 'is-readonly': !fieldEditable('test_conclusion') }"
                  placeholder="请输入"
                  :readonly="!fieldEditable('test_conclusion')"
                  @input="syncFieldValueEn(conclusionField)"
                />
                <div v-if="getSealImage('pass')" class="cell-stamp-wrap">
                  <img :src="getSealImage('pass')" class="cell-stamp-img" alt="合格章" />
                  <span
                    v-if="perm('reports', 'seals')"
                    class="stamp-remove"
                    title="取消盖章"
                    @click="removeSeal('pass')"
                  >
                    ×
                  </span>
                </div>
              </td>
            </tr>
            <tr v-if="remarksField && remarksField.fieldValue">
              <td :colspan="hasInspectionBasisColumn ? 4 : 3" class="cell-merged">
                备注
                <div class="item-en">Remarks</div>
              </td>
              <td class="stamp-cell" :colspan="fieldEditable('inspection_table') ? 2 : 1">
                <input
                  v-model="remarksField.fieldValue.zh"
                  type="text"
                  class="remark-input"
                  :class="{ 'is-readonly': !fieldEditable('remarks') }"
                  placeholder="请输入"
                  :readonly="!fieldEditable('remarks')"
                  @input="syncFieldValueEn(remarksField)"
                />
                <div v-if="getSealImage('recheck')" class="cell-stamp-wrap">
                  <img :src="getSealImage('recheck')" class="cell-stamp-img" alt="复检章" />
                  <span
                    v-if="perm('reports', 'seals')"
                    class="stamp-remove"
                    title="取消盖章"
                    @click="removeSeal('recheck')"
                  >
                    ×
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <button
          v-if="fieldEditable('inspection_table')"
          type="button"
          class="add-row-btn"
          @click="addTableRow"
        >
          + 添加检验项目
        </button>
        <button
          v-if="fieldEditable('inspection_table') && !hasInspectionBasisColumn"
          type="button"
          class="add-row-btn"
          @click="toggleBasisColumn(true)"
        >
          + 添加单项检验依据列
        </button>
        <button
          v-if="fieldEditable('inspection_table') && hasInspectionBasisColumn"
          type="button"
          class="add-row-btn"
          @click="toggleBasisColumn(false)"
        >
          - 移除单项检验依据列
        </button>

        <div class="footer-section">
          <div class="footer-item">
            <div class="footer-label">主检（签字）</div>
            <div class="footer-label-en">Inspector</div>
            <div class="stamp-item-wrap">
              <img v-if="getSealImage('inspector')" :src="getSealImage('inspector')" class="stamp-item-img" alt="主检章" />
              <div v-else class="stamp-item" />
              <span
                v-if="perm('reports', 'seals') && getSealImage('inspector')"
                class="stamp-remove"
                title="取消盖章"
                @click="removeSeal('inspector')"
              >
                ×
              </span>
            </div>
          </div>
          <div class="footer-item">
            <div class="footer-label">审核（签字）</div>
            <div class="footer-label-en">Supervisor</div>
            <div class="stamp-item-wrap">
              <img v-if="getSealImage('supervisor')" :src="getSealImage('supervisor')" class="stamp-item-img" alt="审核章" />
              <div v-else class="stamp-item" />
              <span
                v-if="perm('reports', 'seals') && getSealImage('supervisor')"
                class="stamp-remove"
                title="取消盖章"
                @click="removeSeal('supervisor')"
              >
                ×
              </span>
            </div>
          </div>
          <div class="footer-item">
            <div class="footer-label">部门</div>
            <div class="footer-label-en">Department</div>
            <div class="stamp-item-wrap">
              <img v-if="getSealImage('department_qc')" :src="getSealImage('department_qc')" class="stamp-item-img" alt="质检章" />
              <div v-else class="stamp-item" />
              <span
                v-if="perm('reports', 'seals') && getSealImage('department_qc')"
                class="stamp-remove"
                title="取消盖章"
                @click="removeSeal('department_qc')"
              >
                ×
              </span>
            </div>
          </div>
        </div>

        <div v-if="perm('reports', 'seals')" class="seal-toolbar">
          <span class="text-muted">盖章操作（可取消）</span>
          <el-button
            type="primary"
            size="small"
            :disabled="hasSeal('department_qc')"
            :loading="sealLoading"
            @click="onStampAction('department_qc')"
          >
            质检章
          </el-button>
          <el-button
            type="primary"
            size="small"
            :disabled="hasSeal('inspector')"
            :loading="sealLoading"
            @click="onStampAction('inspector')"
          >
            主检章
          </el-button>
          <el-button
            type="primary"
            size="small"
            :disabled="hasSeal('supervisor')"
            :loading="sealLoading"
            @click="onStampAction('supervisor')"
          >
            审核章
          </el-button>
          <el-button
            type="success"
            size="small"
            :disabled="hasSeal('pass')"
            :loading="sealLoading"
            @click="onStampAction('pass')"
          >
            合格章
          </el-button>
          <el-button
            type="warning"
            size="small"
            :disabled="hasSeal('recheck')"
            :loading="sealLoading"
            @click="onStampAction('recheck')"
          >
            复检章
          </el-button>
        </div>
      </div>
    </div>

    <el-dialog title="保存为模板" v-model="tplDialog" width="520px">
      <el-form :model="tplForm" label-width="110px">
        <el-form-item label="模板名称">
          <el-input v-model="tplForm.name" placeholder="例如：常规化工检测报告模板" />
        </el-form-item>
        <el-form-item label="模板描述">
          <el-input v-model="tplForm.description" placeholder="可选" />
        </el-form-item>
        <el-form-item label="带默认值">
          <el-switch v-model="tplForm.includeValues" />
          <div class="text-muted" style="margin-top: 6px">开启后会把当前字段的「值」作为模板默认值</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tplDialog = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="tplSaving" @click="saveAsTemplate" icon=Check>保存</el-button>
      </template>
    </el-dialog>

    <el-dialog title="报告模板管理" v-model="styleManageDialog" width="760px">
      <div class="style-manage-toolbar">
        <span class="text-muted">可在此重命名/删除，修改后新建报告页可直接套用。</span>
        <el-button text type="primary" :loading="styleManageLoading" @click="loadTemplates" icon=Refresh>刷新</el-button>
      </div>
      <el-table :data="templates" border size="small" v-loading="styleManageLoading">
        <el-table-column prop="name" label="模板名称" min-width="220" />
        <el-table-column prop="description" label="描述" min-width="240" />
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">{{ $dt(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button link type="primary" @click="openStyleEdit(row)">修改</el-button>
            <el-button link type="danger" :loading="styleDeletingId === row.id" @click="deleteStyle(row)" icon=Delete>删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="styleManageDialog = false" icon=Close>关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog title="修改模板" v-model="styleEditDialog" width="520px">
      <el-form :model="styleEditForm" label-width="110px">
        <el-form-item label="模板名称">
          <el-input v-model="styleEditForm.name" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="模板描述">
          <el-input v-model="styleEditForm.description" maxlength="255" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="styleEditDialog = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="styleEditSaving" @click="saveStyleEdit" icon=Check>保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import {
  createReport,
  createTemplate,
  getCompanySettings,
  updateCompanySettings,
  getReport,
  applyReportSeals,
  removeReportSeal,
  getReportSeals,
  getTemplate,
  listTemplates,
  deleteTemplate,
  saveReportAsTemplate,
  translateZhToEn,
  updateTemplate,
  updateReport
} from '../api';
import { Delete, Edit, Rank } from '@element-plus/icons-vue';
import { canEditReportFieldKey, perm } from '../utils/permissions';
import { isCustomFieldKey } from '../utils/reportFieldEditDefinitions';

const TABLE_KEY = 'inspection_table';
const PROTECTED_KEYS = new Set([TABLE_KEY, 'product_name', 'packing', 'batch_weight', 'batch_no', 'analysis_date', 'ex_mill_date', 'test_conclusion', 'remarks']);
const FIXED_REPORT_NO = 'JL-8.8-05';
const LEGACY_TABLE_KEYS = ['item', 'unit', 'standard', 'result', 'basis'];

function svgUrl(svg) {
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

const LOGO_FALLBACK_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M20 20 L50 10 L80 20 L80 80 L50 90 L20 80 Z" fill="none" stroke="#000" stroke-width="8"/><path d="M35 30 L65 30 L65 70 L35 70 Z" fill="none" stroke="#000" stroke-width="8"/><path d="M35 50 L65 50" fill="none" stroke="#000" stroke-width="8"/></svg>`;

export default {
  name: 'ReportEdit',
  components: { Delete, Edit, Rank },
  props: {
    id: { type: [String, Number], default: null }
  },
  data() {
    return {
      saving: false,
      sealLoading: false,
      appliedSeals: {
        department_qc: null,
        inspector: null,
        supervisor: null,
        pass: null,
        recheck: null
      },
      tplLoading: false,
      templates: [],
      selectedTemplateId: null,
      tplDialog: false,
      tplSaving: false,
      tplForm: { name: '', description: '', includeValues: false },
      templateEditMode: false,
      templateSaving: false,
      templateForm: { name: '', description: '' },
      styleManageDialog: false,
      styleManageLoading: false,
      styleDeletingId: null,
      styleEditDialog: false,
      styleEditSaving: false,
      styleEditForm: { id: null, name: '', description: '' },
      translateFallbackToZh: true,
      company: {
        companyNameZh: '',
        companyNameEn: '',
        reportTitleZh: '',
        reportTitleEn: '',
        logoUrl: '',
        descriptionZh: '',
        descriptionEn: ''
      },
      form: {
        reportNo: FIXED_REPORT_NO,
        reportUid: '',
        templateId: null,
        // 默认判定结论：未选择时按“合格”保存
        conclusion: 'pass',
        fields: []
      },
      draggingMetaFieldKey: '',
      draggingTableRowIndex: -1,
      reportTitleForm: {
        reportTitleZh: '',
        reportTitleEn: ''
      },
      reportTitleSaving: false,
      reportTitleEditMode: false
    };
  },
  computed: {
    isNew() {
      return !this.id;
    },
    designerMode() {
      return this.isNew && String(this.$route?.query?.designer || '') === '1';
    },
    canSaveAsTemplate() {
      return (this.form.fields || []).length > 0;
    },
    canManageCompany() {
      return perm('company', 'manage');
    },
    canEditReportTitles() {
      return this.canManageCompany && this.reportTitleEditMode;
    },
    logoBlockStyle() {
      if (this.company.logoUrl) {
        return {
          backgroundImage: `url("${this.company.logoUrl}")`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center'
        };
      }
      return {
        backgroundImage: svgUrl(LOGO_FALLBACK_SVG),
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center'
      };
    },
    metaFields() {
      return (this.form.fields || []).filter(
        (f) =>
          f.fieldType !== 'table' &&
          f.fieldKey !== 'test_conclusion' &&
          f.fieldKey !== 'remarks'
      );
    },
    inspectionTable() {
      const list = this.form.fields || [];
      return (
        list.find((f) => f.fieldKey === TABLE_KEY && f.fieldType === 'table') ||
        list.find((f) => f.fieldType === 'table') ||
        null
      );
    },
    conclusionField() {
      return (this.form.fields || []).find((f) => f.fieldKey === 'test_conclusion') || null;
    },
    remarksField() {
      return (this.form.fields || []).find((f) => f.fieldKey === 'remarks') || null;
    },
    tableColumnLabels() {
      const t = this.inspectionTable;
      if (!t?.fieldValue?.columnLabels || t.fieldValue.columnLabels.length < 4) {
        return this.defaultColumnLabels();
      }
      return t.fieldValue.columnLabels;
    },
    hasInspectionBasisColumn() {
      return (this.tableColumnLabels || []).length >= 5;
    },
    tableDataRows() {
      const t = this.inspectionTable;
      if (!t?.fieldValue?.rows) return [];
      return t.fieldValue.rows;
    }
  },
  async mounted() {
    await Promise.all([this.loadTemplates(), this.loadCompany()]);
    if (this.id) {
      const { report } = await getReport(this.id);
      this.form = {
        reportNo: FIXED_REPORT_NO,
        reportUid: report.reportUid || '',
        templateId: report.templateId || null,
        conclusion: report.conclusion || 'pass',
        fields: (report.fields || []).map((f) => ({
          fieldKey: f.fieldKey,
          fieldLabel: f.fieldLabel,
          fieldLabelEn: f.fieldLabelEn || '',
          fieldType: f.fieldType,
          fieldValue: this.normalizeFieldValue(f.fieldValue, f.fieldType),
          sortOrder: f.sortOrder || 0
        }))
      };
      this.ensurePaperShape(report);
      await this.loadAppliedSeals();
      await this.loadTemplateInfo();
    } else {
      this.seedDefaultPaper();
      this.loadSuggestedReportNo();
      const queryTemplateId = Number(this.$route?.query?.templateId);
      if (Number.isFinite(queryTemplateId) && queryTemplateId > 0) {
        this.selectedTemplateId = queryTemplateId;
        await this.applyTemplateById(queryTemplateId, { skipConfirm: true });
      }
    }
  },
  methods: {
    perm,
    fieldEditable(key) {
      if (this.isNew) return true;
      return canEditReportFieldKey({ fieldKey: key });
    },
    rowEditable(row) {
      if (this.isNew) return true;
      if (isCustomFieldKey(row.fieldKey)) return canEditReportFieldKey({ fieldKey: 'custom_fields' });
      return canEditReportFieldKey({ fieldKey: row.fieldKey });
    },
    defaultColumnLabels() {
      return [
        { key: 'item', zh: '检验项目', en: 'Test item' },
        { key: 'unit', zh: '单位', en: 'Unit' },
        { key: 'standard', zh: '标准值', en: 'Normal value' },
        { key: 'result', zh: '检测值', en: 'Test value' }
      ];
    },
    defaultTableRows() {
      const row = (itemZh, itemEn, uZh, uEn, sZh, sEn) => ({
        item: { zh: itemZh, en: itemEn },
        unit: { zh: uZh, en: uEn },
        standard: { zh: sZh, en: sEn },
        result: { zh: '', en: '' },
        basis: { zh: '', en: '' }
      });
      return [
        row('外观', 'Appearance', '-', '-', '透明', 'Transparent'),
        row('色度', 'Color(Fe-Co)', '#', '#', '≤3', '≤3'),
        row('固体份', 'Solidity', '%', '%', '68-72', '68-72'),
        row('粘度', 'Viscosity', 's', 's', '450-650', '450-650'),
        row('酸值', 'Acid value', 'mgKOH/g', 'mgKOH/g', '≤10', '≤10')
      ];
    },
    textField(key, label, labelEn, zh, en, order) {
      return {
        fieldKey: key,
        fieldLabel: label,
        fieldLabelEn: labelEn,
        fieldType: 'text',
        fieldValue: { zh: zh || '', en: en || '' },
        sortOrder: order
      };
    },
    loadSuggestedReportNo() {
      if (!this.isNew || !perm('reports', 'create')) return;
      this.form.reportNo = FIXED_REPORT_NO;
      this.form.reportUid = '';
    },
    seedDefaultPaper() {
      this.form.templateId = null;
      this.form.fields = [
        this.textField('product_name', '产品名称', 'Product Name', '', '', 10),
        this.textField('packing', '包装规格', 'Packing', '', '', 20),
        this.textField('batch_weight', '本批数量', 'Batch Weight', '', '', 30),
        this.textField('batch_no', '生产批号', 'Batch No.', '', '', 40),
        this.textField('analysis_date', '检验日期', 'Analysis Date', '', '', 50),
        this.textField('ex_mill_date', '出厂日期', 'EX-mill Date', '', '', 60),
        {
          fieldKey: TABLE_KEY,
          fieldLabel: '检测项目表',
          fieldLabelEn: 'Inspection items',
          fieldType: 'table',
          fieldValue: {
            columnLabels: this.defaultColumnLabels(),
            rows: this.defaultTableRows()
          },
          sortOrder: 70
        },
        this.textField('test_conclusion', '检验结论', 'Test conclusion', '', '', 80),
        this.textField('remarks', '备注', 'Remarks', '', '', 90)
      ];
    },
    async loadCompany() {
      try {
        const { settings } = await getCompanySettings();
        if (!settings) return;
        this.company = {
          companyNameZh: settings.companyNameZh || settings.company_name_zh || '',
          companyNameEn: settings.companyNameEn || settings.company_name_en || '',
          reportTitleZh: settings.reportTitleZh || settings.report_title_zh || '',
          reportTitleEn: settings.reportTitleEn || settings.report_title_en || '',
          logoUrl: settings.logoUrl || settings.logo_url || '',
          descriptionZh: settings.descriptionZh || settings.description_zh || '',
          descriptionEn: settings.descriptionEn || settings.description_en || ''
        };
        this.reportTitleForm = {
          reportTitleZh: this.company.reportTitleZh || '',
          reportTitleEn: this.company.reportTitleEn || ''
        };
      } catch (e) {
        /* ignore */
      }
    },
    startEditReportTitles() {
      if (!this.canManageCompany) return;
      this.reportTitleEditMode = true;
    },
    async cancelEditReportTitles() {
      this.reportTitleEditMode = false;
      await this.loadCompany();
    },
    async saveReportTitles() {
      if (!this.canManageCompany) return;
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
        this.company.reportTitleZh = this.reportTitleForm.reportTitleZh || '';
        this.company.reportTitleEn = this.reportTitleForm.reportTitleEn || '';
        this.$message.success('报告标题已保存');
        this.reportTitleEditMode = false;
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '保存失败'));
      } finally {
        this.reportTitleSaving = false;
      }
    },
    normalizeFieldValue(v, fieldType) {
      if (fieldType === 'table') return this.normalizeTableValue(v);
      if (v == null) return { zh: '', en: '' };
      if (typeof v === 'string') return { zh: v, en: '' };
      if (typeof v === 'object') {
        if ('zh' in v || 'en' in v || 'cn' in v) {
          return { zh: v.zh ?? v.cn ?? v.valueZh ?? '', en: v.en ?? v.valueEn ?? '' };
        }
      }
      return { zh: '', en: '' };
    },
    normalizeTableValue(v) {
      const defaults = { columnLabels: this.defaultColumnLabels(), rows: [] };
      if (v == null) return { ...defaults, rows: this.defaultTableRows() };
      let parsed = v;
      if (typeof v === 'string') {
        try {
          parsed = JSON.parse(v);
        } catch (e) {
          parsed = {};
        }
      }
      if (Array.isArray(parsed)) {
        return {
          columnLabels: this.defaultColumnLabels(),
          rows: this.rowsFromLegacyArray(parsed)
        };
      }
      const rowsRaw = parsed.rows || parsed.items || parsed.tests || [];
      const colIn = parsed.columnLabels;
      const columnLabels =
        Array.isArray(colIn) && colIn.length >= 4
          ? colIn.map((c, idx) => ({
              key: typeof c === 'object' && c?.key ? String(c.key) : LEGACY_TABLE_KEYS[idx] || `col_${idx}`,
              zh: typeof c === 'object' ? c.zh ?? '' : String(c),
              en: typeof c === 'object' ? c.en ?? '' : ''
            }))
          : this.defaultColumnLabels();
      const rows = (rowsRaw || []).length ? this.rowsFromLegacyArray(rowsRaw) : this.defaultTableRows();
      const forceBasisColumn = parsed?.hasBasisColumn === true;
      if (forceBasisColumn && columnLabels.length < 5) {
        columnLabels.push({ key: 'basis', zh: '单项检验依据', en: 'Inspection basis' });
      }
      if (columnLabels.length >= 5) {
        rows.forEach((r) => {
          if (!r.basis) this.$set(r, 'basis', { zh: '', en: '' });
        });
      }
      return { columnLabels, rows, hasBasisColumn: columnLabels.length >= 5 };
    },
    rowsFromLegacyArray(arr) {
      const toBi = (val) => {
        if (val == null) return { zh: '', en: '' };
        if (typeof val === 'object') {
          return { zh: val.zh ?? val.cn ?? val.valueZh ?? '', en: val.en ?? val.valueEn ?? '' };
        }
        return { zh: String(val), en: '' };
      };
      return arr.map((r) => ({
        item: toBi(r.item ?? r.name ?? ''),
        unit: toBi(r.unit ?? r.unitName ?? ''),
        standard: toBi(r.standard ?? r.spec ?? ''),
        result: toBi(r.result ?? r.value ?? ''),
        basis: toBi(r.basis ?? r.reference ?? '')
      }));
    },
    ensurePaperShape(report) {
      const fields = this.form.fields;
      const ensureTextEnd = (key, label, labelEn, sortOrder) => {
        if (!fields.some((f) => f.fieldKey === key)) {
          fields.push(this.textField(key, label, labelEn, '', '', sortOrder));
        }
      };
      if (!fields.some((f) => f.fieldKey === 'product_name')) {
        fields.unshift(this.textField('product_name', '产品名称', 'Product Name', '', '', 10));
      }
      if (!fields.some((f) => f.fieldKey === 'batch_no')) {
        const w = fields.findIndex((f) => f.fieldKey === 'batch_weight');
        const row = this.textField('batch_no', '生产批号', 'Batch No.', '', '', 40);
        if (w >= 0) fields.splice(w + 1, 0, row);
        else fields.splice(1, 0, row);
      }
      ensureTextEnd('test_conclusion', '检验结论', 'Test conclusion', 80);
      ensureTextEnd('remarks', '备注', 'Remarks', 90);
      const tableField =
        fields.find((f) => f.fieldKey === TABLE_KEY && f.fieldType === 'table') ||
        fields.find((f) => f.fieldType === 'table');
      if (!tableField) {
        fields.push({
          fieldKey: TABLE_KEY,
          fieldLabel: '检测项目表',
          fieldLabelEn: 'Inspection items',
          fieldType: 'table',
          fieldValue: {
            columnLabels: this.defaultColumnLabels(),
            rows: this.defaultTableRows()
          },
          sortOrder: 70
        });
      } else {
        tableField.fieldValue = this.normalizeTableValue(tableField.fieldValue);
      }
      const prod = fields.find((f) => f.fieldKey === 'product_name');
      if (prod && report) {
        if (!String(prod.fieldValue?.zh || '').trim() && report.productName) {
          this.$set(prod.fieldValue, 'zh', report.productName);
        }
        if (!String(prod.fieldValue?.en || '').trim() && report.productNameEn) {
          this.$set(prod.fieldValue, 'en', report.productNameEn);
        }
      }
      const batch = fields.find((f) => f.fieldKey === 'batch_no');
      if (batch && report) {
        if (!String(batch.fieldValue?.zh || '').trim() && report.batchNo) {
          this.$set(batch.fieldValue, 'zh', report.batchNo);
        }
        if (!String(batch.fieldValue?.en || '').trim() && report.batchNoEn) {
          this.$set(batch.fieldValue, 'en', report.batchNoEn);
        }
      }
      const conc = fields.find((f) => f.fieldKey === 'test_conclusion');
      const rem = fields.find((f) => f.fieldKey === 'remarks');
      if (conc && !conc.fieldValue) this.$set(conc, 'fieldValue', { zh: '', en: '' });
      if (rem && !rem.fieldValue) this.$set(rem, 'fieldValue', { zh: '', en: '' });
    },
    syncColEn(ci) {
      const cols = this.inspectionTable?.fieldValue?.columnLabels;
      if (!cols || !cols[ci]) return;
      const key = `col:${ci}`;
      if (this._transTimers?.[key]) clearTimeout(this._transTimers[key]);
      this._transTimers = this._transTimers || {};
      const zh = cols[ci].zh;
      this._transTimers[key] = setTimeout(async () => {
        const en = await this.translateZhToEn(zh);
        this.$set(cols[ci], 'en', en);
      }, 600);
    },
    onMetaValueZh(row) {
      this.syncFieldValueEn(row);
    },
    focusLabel(row) {
      /* labels are always editable inputs */
      void row;
    },
    deleteMetaRow(row) {
      if (!this.rowEditable(row)) {
        this.$message.warning('该字段为只读');
        return;
      }
      if (PROTECTED_KEYS.has(row.fieldKey)) {
        this.$message.warning('该行为固定字段，不能删除');
        return;
      }
      this.$confirm('确定删除该行？', '提示', { type: 'warning' })
        .then(() => {
          const i = this.form.fields.indexOf(row);
          if (i >= 0) this.form.fields.splice(i, 1);
          this.reindexSortOrders();
        })
        .catch(() => {});
    },
    addMetaRow() {
      if (!this.fieldEditable('custom_fields')) return;
      const tableIdx = this.form.fields.findIndex((f) => f.fieldKey === TABLE_KEY && f.fieldType === 'table');
      const altIdx = tableIdx >= 0 ? tableIdx : this.form.fields.findIndex((f) => f.fieldType === 'table');
      const insertAt = altIdx >= 0 ? altIdx : this.form.fields.length;
      const n = this.form.fields.length + 1;
      const row = this.textField(`field_${n}`, '自定义字段', 'Custom Field', '', '', insertAt * 10);
      if (altIdx >= 0) this.form.fields.splice(altIdx, 0, row);
      else this.form.fields.push(row);
      this.reindexSortOrders();
    },
    addTableRow() {
      if (!this.fieldEditable('inspection_table')) return;
      const t = this.inspectionTable;
      if (!t?.fieldValue?.rows) return;
      const row = {
        item: { zh: '新项目', en: 'New Item' },
        unit: { zh: '', en: '' },
        standard: { zh: '', en: '' },
        result: { zh: '', en: '' }
      };
      if (this.hasInspectionBasisColumn) row.basis = { zh: '', en: '' };
      t.fieldValue.rows.push(row);
    },
    toggleBasisColumn(enable) {
      if (!this.fieldEditable('inspection_table')) return;
      const t = this.inspectionTable;
      if (!t?.fieldValue) return;
      const cols = Array.isArray(t.fieldValue.columnLabels) ? t.fieldValue.columnLabels : this.defaultColumnLabels();
      const hasBasis = cols.length >= 5;
      if (enable && !hasBasis) {
        cols.push({ key: 'basis', zh: '单项检验依据', en: 'Inspection basis' });
        (t.fieldValue.rows || []).forEach((r) => {
          if (!r.basis) this.$set(r, 'basis', { zh: '', en: '' });
        });
      } else if (!enable && hasBasis) {
        cols.splice(4);
      }
      this.$set(t.fieldValue, 'columnLabels', cols);
      this.$set(t.fieldValue, 'hasBasisColumn', cols.length >= 5);
    },
    removeTableRow(ri) {
      if (!this.fieldEditable('inspection_table')) return;
      this.$confirm('确定删除该检验项目？', '提示', { type: 'warning' })
        .then(() => {
          this.inspectionTable.fieldValue.rows.splice(ri, 1);
          this.reindexSortOrders();
        })
        .catch(() => {});
    },
    onMetaDragStart(row) {
      if (!row || !this.rowEditable(row)) return;
      this.draggingMetaFieldKey = row.fieldKey;
    },
    onMetaDrop(targetRow) {
      if (!this.draggingMetaFieldKey || !targetRow) return;
      const fromIndex = this.form.fields.findIndex((f) => f.fieldKey === this.draggingMetaFieldKey);
      const toIndex = this.form.fields.findIndex((f) => f.fieldKey === targetRow.fieldKey);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      const fromField = this.form.fields[fromIndex];
      if (!this.rowEditable(fromField) || !this.rowEditable(targetRow)) {
        this.draggingMetaFieldKey = '';
        return;
      }
      const [moved] = this.form.fields.splice(fromIndex, 1);
      const targetIndexAfterRemove = this.form.fields.findIndex((f) => f.fieldKey === targetRow.fieldKey);
      this.form.fields.splice(targetIndexAfterRemove, 0, moved);
      this.draggingMetaFieldKey = '';
      this.reindexSortOrders();
    },
    onTableRowDragStart(rowIndex) {
      if (!this.fieldEditable('inspection_table')) return;
      this.draggingTableRowIndex = rowIndex;
    },
    onTableRowDrop(targetIndex) {
      const rows = this.inspectionTable?.fieldValue?.rows;
      if (!Array.isArray(rows)) return;
      const from = this.draggingTableRowIndex;
      const to = targetIndex;
      if (from < 0 || to < 0 || from === to || from >= rows.length || to >= rows.length) return;
      const [moved] = rows.splice(from, 1);
      rows.splice(to, 0, moved);
      this.draggingTableRowIndex = -1;
      this.reindexSortOrders();
    },
    reindexSortOrders() {
      (this.form.fields || []).forEach((f, idx) => {
        f.sortOrder = (idx + 1) * 10;
      });
    },
    getSealImage(sealType) {
      const url = this.appliedSeals?.[sealType]?.imageUrl || '';
      if (!url) return '';
      // Convert absolute URL to relative path for proxy
      try {
        const u = new URL(url);
        return u.pathname;
      } catch {
        return url;
      }
    },
    hasSeal(sealType) {
      return !!this.getSealImage(sealType);
    },
    footerStampStyle(slot) {
      const imageUrl = this.getSealImage(slot);
      if (!imageUrl) return {};
      const isSvg = imageUrl.toLowerCase().endsWith('.svg');
      return {
        backgroundImage: `url("${imageUrl}")`,
        backgroundSize: isSvg ? '100% 100%' : 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center'
      };
    },
    async onStampAction(sealType) {
      if (!this.id) {
        this.$message.warning('请先保存报告，再执行盖章操作');
        return;
      }
      await this.applySeal(sealType);
    },
    async translateZhToEn(zh) {
      const text = zh == null ? '' : String(zh).trim();
      if (!text) return '';
      try {
        const en = await translateZhToEn(text);
        if (en && String(en).trim()) return String(en).trim();
        return this.translateFallbackToZh ? text : '';
      } catch (e) {
        return this.translateFallbackToZh ? text : '';
      }
    },
    syncFieldLabelEn(row) {
      if (!row) return;
      const key = `${row.fieldKey || 'unknown'}:label`;
      const zh = row.fieldLabel;
      if (this._transTimers && this._transTimers[key]) clearTimeout(this._transTimers[key]);
      this._transTimers = this._transTimers || {};
      this._transTimers[key] = setTimeout(async () => {
        const en = await this.translateZhToEn(zh);
        this.$set(row, 'fieldLabelEn', en);
      }, 600);
    },
    syncFieldValueEn(row) {
      if (!row || !row.fieldValue) return;
      const key = `${row.fieldKey || 'unknown'}:value`;
      const zh = row.fieldValue.zh;
      if (this._transTimers && this._transTimers[key]) clearTimeout(this._transTimers[key]);
      this._transTimers = this._transTimers || {};
      this._transTimers[key] = setTimeout(async () => {
        const en = await this.translateZhToEn(zh);
        this.$set(row.fieldValue, 'en', en);
      }, 600);
    },
    syncTableCellEn(cell) {
      if (!cell) return;
      const zh = cell.zh;
      const key = cell._enKey || Math.random().toString(16).slice(2);
      this.$set(cell, '_enKey', key);
      if (this._transTimers && this._transTimers[key]) clearTimeout(this._transTimers[key]);
      this._transTimers = this._transTimers || {};
      this._transTimers[key] = setTimeout(async () => {
        const en = await this.translateZhToEn(zh);
        this.$set(cell, 'en', en);
      }, 600);
    },
    async loadAppliedSeals() {
      if (!this.id) return;
      this.sealLoading = true;
      try {
        const { appliedSeals } = await getReportSeals(this.id);
        this.appliedSeals = appliedSeals || this.appliedSeals;
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '加载盖章状态失败'));
      } finally {
        this.sealLoading = false;
      }
    },
    isSealed(sealType) {
      return !!this.appliedSeals?.[sealType];
    },
    async applySeal(sealType) {
      if (!this.id) return;
      this.sealLoading = true;
      try {
        await applyReportSeals(this.id, [sealType]);
        this.$message.success('盖章成功');
        await this.loadAppliedSeals();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '盖章失败'));
      } finally {
        this.sealLoading = false;
      }
    },
    async removeSeal(sealType) {
      if (this.id) {
        this.sealLoading = true;
        try {
          await removeReportSeal(this.id, sealType);
          this.$message.success('已取消盖章');
          await this.loadAppliedSeals();
        } catch (e) {
          this.$message.error(this.$apiUserMsg(e, '取消盖章失败'));
        } finally {
          this.sealLoading = false;
        }
        return;
      }
      this.$message.warning('当前报告未保存，暂无可取消的盖章记录');
    },
    async loadTemplates() {
      this.tplLoading = true;
      if (this.styleManageDialog) this.styleManageLoading = true;
      try {
        const { items } = await listTemplates({ limit: 200 });
        this.templates = items;
      } catch (e) {
        this.templates = [];
      } finally {
        this.tplLoading = false;
        this.styleManageLoading = false;
      }
    },
    openStyleManager() {
      this.styleManageDialog = true;
      this.loadTemplates();
    },
    async loadTemplateInfo() {
      if (!this.form.templateId) return;
      try {
        const { template } = await getTemplate(this.form.templateId);
        this.templateForm = {
          name: template.name || '',
          description: template.description || ''
        };
      } catch (e) {
        // ignore
      }
    },
    startEditTemplate() {
      this.templateEditMode = true;
    },
    cancelEditTemplate() {
      this.templateEditMode = false;
      this.loadTemplateInfo();
    },
    async saveTemplate() {
      if (!this.form.templateId) return;
      const name = String(this.templateForm.name || '').trim();
      if (!name) {
        this.$message.warning('请输入模板名称');
        return;
      }
      this.templateSaving = true;
      try {
        const { template } = await getTemplate(this.form.templateId);
        await updateTemplate(this.form.templateId, {
          name,
          description: String(this.templateForm.description || '').trim() || null,
          fields: template.fields || []
        });
        this.$message.success('模板已更新');
        this.templateEditMode = false;
        await this.loadTemplates();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '保存模板失败'));
      } finally {
        this.templateSaving = false;
      }
    },
    openStyleEdit(row) {
      this.styleEditForm = {
        id: row.id,
        name: row.name || '',
        description: row.description || ''
      };
      this.styleEditDialog = true;
    },
    async saveStyleEdit() {
      const id = Number(this.styleEditForm.id);
      if (!Number.isFinite(id) || id <= 0) return;
      const name = String(this.styleEditForm.name || '').trim();
      if (!name) {
        this.$message.warning('请输入模板名称');
        return;
      }
      this.styleEditSaving = true;
      try {
        const { template } = await getTemplate(id);
        await updateTemplate(id, {
          name,
          description: String(this.styleEditForm.description || '').trim() || null,
          fields: template.fields || []
        });
        this.$message.success('模板已更新');
        this.styleEditDialog = false;
        await this.loadTemplates();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '模板更新失败'));
      } finally {
        this.styleEditSaving = false;
      }
    },
    async deleteStyle(row) {
      const id = Number(row?.id);
      if (!Number.isFinite(id) || id <= 0) return;
      const ok = await this.$confirm(`确认删除模板「${row.name || id}」？`, '删除模板', { type: 'warning' }).catch(() => false);
      if (!ok) return;
      this.styleDeletingId = id;
      try {
        await deleteTemplate(id);
        if (Number(this.selectedTemplateId) === id) this.selectedTemplateId = null;
        this.$message.success('模板已删除');
        await this.loadTemplates();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '删除模板失败'));
      } finally {
        this.styleDeletingId = null;
      }
    },
    async applyTemplateById(templateId, { skipConfirm = false } = {}) {
      const targetId = Number(templateId);
      if (!Number.isFinite(targetId) || targetId <= 0) return;
      if (!skipConfirm) {
        const ok = await this.$confirm('套用模板会覆盖当前字段设计，确认继续？', '提示', { type: 'warning' }).catch(() => false);
        if (!ok) return;
      }
      const { template } = await getTemplate(targetId);
      this.form.templateId = template.id;
      this.form.fields = (template.fields || []).map((f) => ({
        fieldKey: f.fieldKey,
        fieldLabel: f.fieldLabel,
        fieldLabelEn: f.fieldLabelEn || '',
        fieldType: f.fieldType,
        fieldValue: this.normalizeFieldValue(f.defaultValue, f.fieldType),
        sortOrder: f.sortOrder || 0
      }));
      this.ensurePaperShape(null);
      this.templateForm = {
        name: template.name || '',
        description: template.description || ''
      };
      this.$message.success('已套用模板');
    },
    async applyTemplate() {
      if (!this.selectedTemplateId) return;
      await this.applyTemplateById(this.selectedTemplateId);
    },
    async startBlank() {
      this.selectedTemplateId = null;
      this.form.conclusion = 'pass';
      this.seedDefaultPaper();
      await this.loadSuggestedReportNo();
      this.$message.success('已切换为空白版式');
    },
    openSaveTemplate() {
      this.tplDialog = true;
      this.tplForm = { name: '', description: '', includeValues: false };
    },
    buildPayload() {
      this.reindexSortOrders();
      const prod = this.form.fields.find((f) => f.fieldKey === 'product_name');
      const batch = this.form.fields.find((f) => f.fieldKey === 'batch_no');
      const productName = String(prod?.fieldValue?.zh || '').trim();
      if (!productName) {
        this.$message.warning('请填写产品名称');
        return null;
      }
      const tf = this.inspectionTable;
      if (tf) {
        tf.fieldValue = {
          columnLabels: tf.fieldValue.columnLabels || this.defaultColumnLabels(),
          rows: tf.fieldValue.rows || []
        };
      }
      return {
        reportNo: FIXED_REPORT_NO,
        productName,
        productNameEn: prod?.fieldValue?.en || null,
        batchNo: batch?.fieldValue?.zh?.trim() || null,
        batchNoEn: batch?.fieldValue?.en || null,
        templateId: this.form.templateId || null,
        conclusion: this.form.conclusion || 'pass',
        fields: this.form.fields.map((f) => ({
          fieldKey: f.fieldKey,
          fieldLabel: f.fieldLabel,
          fieldLabelEn: f.fieldLabelEn || null,
          fieldType: f.fieldType,
          fieldValue: f.fieldValue,
          sortOrder: f.sortOrder || 0
        }))
      };
    },
    async saveAsTemplate() {
      if (!this.perm('templates', 'use')) return;
      if (this.id && !this.perm('reports', 'edit')) return;
      if (!this.id && !this.perm('reports', 'create')) return;
      if (!this.tplForm.name) {
        this.$message.warning('请输入模板名称');
        return;
      }
      if ((this.form.fields || []).length === 0) {
        this.$message.warning('当前没有字段可保存为模板');
        return;
      }
      this.tplSaving = true;
      try {
        this.reindexSortOrders();
        if (this.id) {
          await saveReportAsTemplate(this.id, this.tplForm);
        } else {
          const payload = {
            name: this.tplForm.name,
            description: this.tplForm.description || null,
            fields: this.form.fields.map((f) => ({
              fieldKey: f.fieldKey,
              fieldLabel: f.fieldLabel,
              fieldLabelEn: f.fieldLabelEn || null,
              fieldType: f.fieldType,
              defaultValue: this.tplForm.includeValues ? f.fieldValue : undefined,
              sortOrder: f.sortOrder || 0
            }))
          };
          await createTemplate(payload);
        }
        this.$message.success('已保存为模板');
        this.tplDialog = false;
        this.loadTemplates();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '保存模板失败'));
      } finally {
        this.tplSaving = false;
      }
    },
    async save() {
      if (this.id && !this.perm('reports', 'edit')) return;
      if (!this.id && !this.perm('reports', 'create')) return;
      const payload = this.buildPayload();
      if (!payload) return;
      this.saving = true;
      try {
        if (this.id) {
          await updateReport(this.id, payload);
          this.$message.success('已保存');
        } else {
          const data = await createReport(payload);
          const uid = data?.reportUid ? `，报告ID：${data.reportUid}` : '';
          this.$message.success(`已创建${uid}`);
          if (data?.id) {
            this.$router.push(`/reports/${data.id}`);
          } else {
            this.$router.push('/reports');
          }
        }
      } catch (e) {
        const code = e?.response?.data?.error;
        const conflict =
          code === 'REPORT_NO_EXISTS'
            ? '报告编号已被使用，请更换为未占用的编号'
            : code === 'REPORT_UID_EXISTS'
              ? '报告ID 冲突，请重试保存'
              : code === 'REPORT_FIELD_KEY_DUPLICATE'
                ? '字段标识（field key）重复，请检查并删除或合并重复字段'
                : '';
        this.$message.error(conflict || code || '保存失败');
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<style scoped>
.report-edit-root {
  padding-bottom: 32px;
  background: #f0f2f5;
  min-height: 100vh;
}

/* 顶部工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 16px 20px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.toolbar-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}
.conclusion-select {
  width: 120px;
}
.top-alert {
  margin-bottom: 16px;
  border-radius: 8px;
}

/* 卡片样式 */
.tpl-card {
  margin-bottom: 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.tpl-card :deep(.el-card__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #ebeef5;
  background: #fafbfc;
}
.tpl-card :deep(.el-card__body) {
  padding: 20px;
}
.field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.create-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.report-title-actions {
  text-align: right;
  margin-top: 16px;
}
.top-cards-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}
.tpl-card-half {
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}
.style-manage-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.text-muted {
  color: #909399;
  font-size: 13px;
}

/* 报告纸张区域 */
.paper-wrap {
  background: #f0f2f5;
  padding: 24px;
  overflow: auto;
}

.report-container {
  width: 210mm;
  min-height: 297mm;
  background: #fff;
  margin: 0 auto;
  padding: 30mm 20mm 20mm;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  position: relative;
  box-sizing: border-box;
  font-family: 'Microsoft YaHei', 'SimSun', sans-serif;
  border-radius: 4px;
}

/* Logo和描述 */
.header-logo {
  position: absolute;
  top: 20mm;
  left: 20mm;
  width: 64px;
  height: 64px;
}
.header-logo.has-img {
  width: 76px;
  height: 76px;
}

.header-desc {
  position: absolute;
  top: 20mm;
  left: 20mm;
  margin-top: 72px;
  max-width: 140px;
  font-size: 11px;
  color: #333;
  line-height: 1.4;
}
.header-desc-en {
  font-size: 10px;
  color: #666;
  margin-top: 4px;
}

/* 报告编号 */
.header-doc-no {
  text-align: right;
  font-size: 14px;
  color: #333;
  margin-bottom: 32px;
}
.doc-no-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 8px;
}
.doc-no-row:last-child {
  margin-bottom: 0;
}
.doc-no-lbl {
  flex: 0 0 auto;
  font-size: 13px;
  color: #606266;
}
.doc-no-input {
  border: none;
  border-bottom: 1px solid #333;
  font-size: 14px;
  text-align: right;
  min-width: 160px;
  outline: none;
  background: transparent;
  padding: 4px 0;
  transition: border-color 0.2s;
}
.doc-no-input:focus {
  border-bottom: 2px solid #409eff;
}
.doc-no-input.is-readonly,
.form-input.is-readonly,
.conclusion-input.is-readonly,
.remark-input.is-readonly {
  background: #f5f7fa !important;
  cursor: default;
  border-bottom-color: #dcdfe6 !important;
}
.doc-no-input.is-readonly:focus,
.form-input.is-readonly:focus,
.conclusion-input.is-readonly:focus,
.remark-input.is-readonly:focus {
  border-bottom-width: 1px;
}

/* 公司名称和报告标题 */
.company-name {
  text-align: center;
  font-size: 22px;
  color: #333;
  margin-bottom: 12px;
  font-weight: 500;
}
.report-title {
  text-align: center;
  font-size: 36px;
  font-weight: bold;
  color: #222;
  margin: 0 0 12px;
  letter-spacing: 2px;
}
.report-title-en {
  text-align: center;
  font-size: 20px;
  color: #333;
  margin-bottom: 32px;
  font-style: italic;
}

/* 字段信息网格布局 */
.form-container-inner {
  margin-bottom: 24px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px 24px;
  width: 100%;
  box-sizing: border-box;
}
.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fafbfc;
  border-radius: 6px;
  border: 1px solid #ebeef5;
  transition: all 0.2s;
  box-sizing: border-box;
  min-width: 0;
  overflow: hidden;
}
.form-row:hover {
  border-color: #c0c4cc;
  background: #fff;
}
.form-label {
  width: 100px;
  font-size: 14px;
  color: #333;
  text-align: right;
  padding-right: 8px;
  flex-shrink: 0;
  box-sizing: border-box;
}
.label-cn {
  display: block;
  width: 100%;
  border: none;
  font-size: 14px;
  color: #333;
  text-align: right;
  background: transparent;
  outline: none;
  font-weight: 500;
}
.label-en {
  display: block;
  width: 100%;
  border: none;
  font-size: 11px;
  color: #909399;
  text-align: right;
  background: transparent;
  outline: none;
  margin-top: 2px;
}
.form-value-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.form-input {
  flex: 1;
  height: 32px;
  border: none;
  border-bottom: 1px solid #dcdfe6;
  font-size: 14px;
  padding: 0 4px;
  outline: none;
  background: transparent;
  transition: border-color 0.2s;
  min-width: 0;
}
.form-input:focus {
  border-bottom: 2px solid #409eff;
}
.action-icons {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
}
.edit-icon,
.del-icon,
.drag-icon {
  width: 24px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}
.edit-icon :deep(.el-icon),
.del-icon :deep(.el-icon),
.drag-icon :deep(.el-icon) {
  font-size: 14px;
}
.drag-icon {
  color: #909399;
}
.drag-icon:hover {
  background: #e6e8eb;
}
.edit-icon {
  color: #409eff;
}
.edit-icon:hover {
  background: #ecf5ff;
}
.del-icon {
  color: #f56c6c;
}
.del-icon:hover {
  background: #fef0f0;
}

/* 添加按钮 */
.add-row-btn {
  margin: 0 0 24px 0;
  padding: 8px 16px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.add-row-btn:hover {
  background: #66b1ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
}

/* 检验参数表格 */
.test-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin-top: 24px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.test-table th,
.test-table td {
  border-right: 1px solid #dcdfe6;
  border-bottom: 1px solid #dcdfe6;
  padding: 14px 12px;
  text-align: center;
  font-size: 14px;
  vertical-align: middle;
  transition: background-color 0.2s;
}
.test-table th {
  background: linear-gradient(180deg, #f8f9fb 0%, #f2f3f5 100%);
  font-weight: 600;
  color: #303133;
  position: relative;
  border-top: none;
  border-left: none;
}
.test-table td {
  border-top: none;
  border-left: none;
}
.test-table tr:first-child th {
  border-top: none;
}
.test-table tr:first-child th:first-child {
  border-left: none;
}
.test-table tr:nth-child(even) td {
  background-color: #fafbfc;
}
.test-table tr:hover td {
  background-color: #ecf5ff;
  transition: background-color 0.15s ease;
}
.test-table .cell-merged {
  background: linear-gradient(180deg, #f8f9fb 0%, #f2f3f5 100%);
  font-weight: 600;
  color: #303133;
}
.th-title-cn {
  width: 100%;
  border: none;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  background: transparent;
  outline: none;
  color: #303133;
  padding: 4px 0;
}
.th-title-cn:focus {
  color: #409eff;
}
.th-title-en {
  width: 100%;
  border: none;
  text-align: center;
  font-size: 11px;
  color: #909399;
  background: transparent;
  outline: none;
  margin-top: 4px;
  padding: 2px 0;
}
.cell-plain {
  width: 100%;
  border: none;
  text-align: center;
  font-size: 14px;
  outline: none;
  background: transparent;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}
.cell-plain:focus {
  background: #ecf5ff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}
.cell-en {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
}
.test-input {
  width: 100%;
  border: none;
  outline: none;
  text-align: center;
  font-size: 14px;
  background: transparent;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}
.test-input:focus {
  background: #ecf5ff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}
.cell-merged {
  text-align: center;
  font-weight: 600;
  color: #303133;
}
.item-en {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
  font-weight: normal;
}
.conclusion-input,
.remark-input {
  width: 85%;
  height: 44px;
  border: none;
  border-bottom: 2px solid #dcdfe6;
  font-size: 18px;
  text-align: center;
  outline: none;
  background: transparent;
  color: #f56c6c;
  font-weight: bold;
  transition: all 0.3s;
  padding: 0 8px;
  border-radius: 4px;
}
.conclusion-input:hover,
.remark-input:hover {
  border-bottom-color: #c0c4cc;
}
.conclusion-input:focus,
.remark-input:focus {
  border-bottom: 2px solid #409eff;
  background: #fafbfc;
}
.stamp-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cell-stamp-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cell-stamp-img {
  width: 80px;
  height: 80px;
  object-fit: contain;
  opacity: 0.9;
}
.cell-stamp-img[src$=".svg"] {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.table-action {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
}
.table-action .drag-icon,
.table-action .del-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.table-action .drag-icon {
  color: #909399;
  background: #f5f7fa;
}
.table-action .drag-icon:hover {
  background: #e6e8eb;
  color: #606266;
}
.table-action .del-icon {
  color: #f56c6c;
  background: #fef0f0;
}
.table-action .del-icon:hover {
  background: #fde2e2;
  color: #f56c6c;
}

/* 盖章工具栏 */
.seal-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 24px 0 12px;
  padding: 16px;
  background: #f9fafc;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

/* 签字盖章区域 */
.footer-section {
  display: flex;
  justify-content: space-around;
  margin-top: 32px;
  text-align: center;
  margin-bottom: 24px;
}
.footer-item {
  text-align: center;
}
.footer-label {
  font-size: 16px;
  margin-bottom: 4px;
  font-weight: 500;
  color: #303133;
}
.footer-label-en {
  font-size: 13px;
  color: #909399;
  margin-bottom: 16px;
}
.stamp-item {
  width: 100px;
  height: 100px;
  margin: 0 auto;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.stamp-item-img {
  width: 100px;
  height: 100px;
  margin: 0 auto;
  object-fit: contain;
  display: block;
}
.stamp-item-img[src$=".svg"] {
  width: 100%;
  height: 100%;
  object-fit: fill;
}
.stamp-item-wrap {
  width: 100px;
  margin: 0 auto;
  position: relative;
}
.stamp-remove {
  position: absolute;
  right: -8px;
  top: -8px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s;
}
.stamp-remove:hover {
  background: rgba(0, 0, 0, 0.9);
}

/* 打印样式 */
@media print {
  .toolbar,
  .top-alert,
  .tpl-card,
  .action-icons,
  .add-row-btn,
  .table-action,
  .stamp-remove,
  .seal-toolbar {
    display: none !important;
  }
  .paper-wrap {
    background: #fff;
    padding: 0;
  }
  .report-container {
    box-shadow: none;
  }
  .stamp-cell {
    position: relative;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .cell-stamp-wrap {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cell-stamp-img {
    width: 80px;
    height: 80px;
    object-fit: contain;
    opacity: 0.9;
  }
  .cell-stamp-img[src$=".svg"] {
    width: 100%;
    height: 100%;
    object-fit: fill;
  }
}

/* 响应式布局 */
@media (max-width: 992px) {
  .report-edit-root {
    padding-bottom: 16px;
  }
  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 12px;
  }
  .toolbar-right {
    width: 100%;
    justify-content: flex-start;
  }
  .toolbar-right .el-button {
    flex: 1;
  }
  .conclusion-select {
    width: 100%;
  }
  .paper-wrap {
    padding: 12px;
  }
  .report-container {
    min-width: auto;
    width: 100%;
    min-height: auto;
    padding: 16mm 10mm 10mm;
  }
  .form-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .form-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .form-label {
    width: 100%;
    text-align: left;
    padding-right: 0;
  }
  .label-cn,
  .label-en {
    text-align: left;
  }
  .form-value-wrap {
    width: 100%;
  }
  .edit-icon,
  .del-icon,
  .drag-icon {
    width: 28px;
    height: 28px;
    border-radius: 6px;
  }
  .edit-icon :deep(.el-icon),
  .del-icon :deep(.el-icon),
  .drag-icon :deep(.el-icon) {
    font-size: 16px;
  }
  .add-row-btn {
    width: 100%;
    justify-content: center;
    padding: 12px;
  }
  .seal-toolbar {
    gap: 10px;
    padding: 12px;
  }
  .seal-toolbar .el-button {
    flex: 1;
    min-width: 80px;
  }
  .stamp-remove {
    width: 24px;
    height: 24px;
    line-height: 24px;
    font-size: 14px;
    right: -10px;
    top: -10px;
  }
  .footer-section {
    flex-direction: column;
    gap: 20px;
  }
}
</style>
