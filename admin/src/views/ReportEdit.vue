<template>
  <div class="report-edit-root">
    <div class="toolbar">
      <div>
        <el-button @click="goBackFromEdit" icon=Back>返回</el-button>
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
          {{ designerMode ? '保存报告样式' : '另存为新模板' }}
        </el-button>
        <el-button
          v-if="primarySaveIsTemplate ? perm('reports', 'create') && perm('templates', 'use') : isNew ? perm('reports', 'create') : perm('reports', 'edit')"
          type="primary"
          :loading="saving"
          @click="save"
         icon=Check>
          {{ primarySaveIsTemplate ? '保存模板' : '保存报告' }}
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
      v-if="isNew && reportCustomerLabel"
      type="warning"
      show-icon
      :closable="false"
      class="top-alert"
      :title="`本报告将关联客户：${reportCustomerLabel}（同产品同批号的不同客户需分别生成，互不影响）`"
    />
    <el-alert
      v-if="!isNew && reportCustomerLabel"
      type="info"
      show-icon
      :closable="false"
      class="top-alert"
      :title="`关联客户：${reportCustomerLabel}`"
    />
    <el-alert
      v-if="isNew && !primarySaveIsTemplate && !reportCustomerLabel"
      type="info"
      show-icon
      :closable="false"
      class="top-alert"
      title="新增报告：可选模板套用，或空白报告；填写产品名称与生产批号后将自动联想检验项目"
    />
    <el-alert
      v-if="primarySaveIsTemplate"
      type="info"
      show-icon
      :closable="false"
      class="top-alert"
      title="正在编辑已有报告模板：主按钮「保存模板」会更新该模板的版式与字段默认值，不会创建业务报告；「另存为新模板」可复制为一份新模板。"
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
      <div ref="reportCustomerRow" class="create-row customer-row">
        <span class="create-row-label">关联客户</span>
        <el-select
          v-if="!customerFromOrderLocked"
          ref="reportCustomerSelect"
          v-model="form.customerId"
          placeholder="搜索并选择客户（临时开报告时建议填写）"
          clearable
          filterable
          remote
          :remote-method="searchReportCustomers"
          :loading="customerSearchLoading"
          style="width: 320px"
          @change="onReportCustomerChange"
          @visible-change="(open) => open && !customerOptions.length && searchReportCustomers('')"
        >
          <el-option
            v-for="c in customerOptions"
            :key="c.id"
            :label="c.label"
            :value="c.id"
          />
        </el-select>
        <el-input v-else :model-value="reportCustomerLabel" readonly style="width: 320px" />
        <span class="text-muted">
          {{ customerFromOrderLocked ? '已从订单自动带入' : '不选则报告不关联客户；同批多客户请分别选择' }}
        </span>
      </div>
    </el-card>

    <el-card v-if="!isNew && perm('reports', 'edit')" class="tpl-card">
      <template #header>
        <div class="field-header">
          <div>关联客户</div>
        </div>
      </template>
      <div class="create-row customer-row">
        <el-select
          v-model="form.customerId"
          placeholder="搜索并选择客户"
          clearable
          filterable
          remote
          :remote-method="searchReportCustomers"
          :loading="customerSearchLoading"
          style="width: 320px"
          @change="onReportCustomerChange"
          @visible-change="(open) => open && ensureCustomerOptionLoaded()"
        >
          <el-option
            v-for="c in customerOptions"
            :key="c.id"
            :label="c.label"
            :value="c.id"
          />
        </el-select>
        <span class="text-muted">修改后保存报告即可更新列表中的客户列</span>
      </div>
    </el-card>

    <div class="report-edit-split">
      <div class="report-edit-panel">
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
                <el-date-picker
                  v-if="isReportDateField(row)"
                  v-model="row.fieldValue.zh"
                  type="date"
                  value-format="YYYY-MM-DD"
                  format="YYYY-MM-DD"
                  placeholder="选择日期"
                  class="form-date-input"
                  :disabled="!rowEditable(row)"
                  clearable
                  @change="onReportDateChange(row)"
                />
                <div v-else-if="isReportQtyField(row)" class="report-field-with-unit">
                  <input
                    :value="reportQtyNumberDisplay(row)"
                    type="text"
                    class="form-input report-qty-input"
                    :class="{ 'is-readonly': !rowEditable(row) }"
                    placeholder="请输入数值"
                    :readonly="!rowEditable(row)"
                    @input="onReportQtyNumberInput(row, $event.target.value)"
                  />
                  <span class="report-field-unit-fixed">kg</span>
                </div>
                <div v-else-if="isProductNameField(row)" class="product-name-autocomplete-wrap">
                  <el-autocomplete
                    :model-value="row.fieldValue.zh"
                    :fetch-suggestions="fetchProductNameSuggestions"
                    :trigger-on-focus="false"
                    clearable
                    fit-input-width
                    popper-class="report-product-name-ac"
                    class="form-input-autocomplete"
                    placeholder="请输入产品名称"
                    :disabled="!rowEditable(row)"
                    @update:model-value="onProductNameValueChange(row, $event)"
                    @select="onProductNameSelect(row, $event)"
                  />
                </div>
                <input
                  v-else
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

        <div v-if="inspectionTable" class="inspection-table-block">
          <div v-if="fieldEditable('inspection_table')" class="inspection-table-bar">
            <el-button size="small" type="primary" :icon="Plus" @click="addTableRow">
              添加检验项目
            </el-button>
            <span class="inspection-table-tip">Enter 跳转下一格 · ↑↓ 选择检验项目联想</span>
            <el-button
              v-if="!hasInspectionBasisColumn"
              size="small"
              text
              type="primary"
              @click="toggleBasisColumn(true)"
            >
              添加检验依据列
            </el-button>
            <el-button
              v-else
              size="small"
              text
              type="primary"
              @click="toggleBasisColumn(false)"
            >
              移除检验依据列
            </el-button>
            <div class="inspection-result-format">
              <span class="inspection-result-format__label">检测值格式</span>
              <el-radio-group
                :model-value="inspectionResultFormat"
                size="small"
                @change="onInspectionResultFormatChange"
              >
                <el-radio-button value="decimal2">保留两位小数</el-radio-button>
                <el-radio-button value="integer">取整数</el-radio-button>
              </el-radio-group>
            </div>
          </div>

          <datalist id="report-unit-options">
            <option v-for="u in unitSuggestionOptions" :key="u" :value="u" />
          </datalist>

          <div class="test-table-scroll">
          <table class="test-table">
          <thead>
            <tr>
              <th
                v-for="(col, ci) in tableColumnLabels"
                :key="'col-' + ci"
                :class="'col-' + col.key"
              >
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
              <th v-if="fieldEditable('inspection_table')" class="col-ops">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-if="fieldEditable('inspection_table') && !tableDataRows.length"
              class="test-table-empty-row"
            >
              <td :colspan="tableBodyColspan" class="test-table-empty-cell">
                暂无检验项目，点击上方「添加检验项目」开始填写
              </td>
            </tr>
            <tr
              v-for="(tr, ri) in tableDataRows"
              :key="'tr-' + ri"
              :class="{
                'is-row-active': activeTableRowIndex === ri,
                'is-drag-over': dragOverTableRowIndex === ri && draggingTableRowIndex !== ri
              }"
              @focusin="activeTableRowIndex = ri"
              @dragover.prevent="onTableRowDragOver(ri)"
              @dragleave="onTableRowDragLeave(ri)"
              @drop="onTableRowDrop(ri)"
            >
              <td class="col-item">
                <textarea
                  v-model="tableCell(tr, 'item').zh"
                  class="cell-plain cell-area"
                  rows="1"
                  placeholder="检验项目"
                  :data-cell="`${ri}-item_zh`"
                  :title="tableCell(tr, 'item').zh"
                  :readonly="!fieldEditable('inspection_table')"
                  @focus="openInspectionItemSuggest(ri)"
                  @blur="closeInspectionItemSuggest(ri)"
                  @input="onInspectionItemZhInput(tr, ri, $event)"
                  @keydown="onInspectionItemKeydown($event, tr, ri)"
                />
                <textarea
                  v-model="tableCell(tr, 'item').en"
                  class="cell-plain cell-en cell-area"
                  rows="1"
                  placeholder="EN"
                  :data-cell="`${ri}-item_en`"
                  :title="tableCell(tr, 'item').en"
                  :readonly="!fieldEditable('inspection_table')"
                  @input="autoResizeTableCell($event.target)"
                  @keydown="onTableCellKeydown($event, ri, 'item_en')"
                />
              </td>
              <td class="col-unit">
                <span
                  v-if="!fieldEditable('inspection_table')"
                  class="cell-unit-display"
                  :title="tableCell(tr, 'unit').zh"
                >{{ tableCell(tr, 'unit').zh }}</span>
                <input
                  v-else
                  v-model="tableCell(tr, 'unit').zh"
                  class="cell-plain cell-unit-input"
                  type="text"
                  placeholder="单位"
                  list="report-unit-options"
                  :data-cell="`${ri}-unit`"
                  :title="tableCell(tr, 'unit').zh"
                  @input="syncTableCellEn(tableCell(tr, 'unit'))"
                  @keydown="onTableCellKeydown($event, ri, 'unit')"
                />
              </td>
              <td class="col-standard">
                <textarea
                  v-model="tableCell(tr, 'standard').zh"
                  class="test-input cell-area"
                  rows="1"
                  placeholder="标准值"
                  :data-cell="`${ri}-standard`"
                  :title="tableCell(tr, 'standard').zh"
                  :readonly="!fieldEditable('inspection_table')"
                  @input="onTableDataCellInput(tr, { key: 'standard' }, $event)"
                  @keydown="onTableCellKeydown($event, ri, 'standard')"
                />
              </td>
              <td class="col-result">
                <textarea
                  v-model="tableCell(tr, 'result').zh"
                  class="test-input test-input--result cell-area"
                  rows="1"
                  placeholder="检测值"
                  :data-cell="`${ri}-result`"
                  :title="tableCell(tr, 'result').zh"
                  :readonly="!fieldEditable('inspection_table')"
                  @input="onTableDataCellInput(tr, { key: 'result' }, $event)"
                  @blur="onResultCellBlur(tr)"
                  @keydown="onTableCellKeydown($event, ri, 'result')"
                />
              </td>
              <td v-if="hasInspectionBasisColumn" class="col-basis">
                <textarea
                  v-model="tableCell(tr, 'basis').zh"
                  class="test-input cell-area"
                  rows="1"
                  placeholder="检验依据"
                  :data-cell="`${ri}-basis`"
                  :title="tableCell(tr, 'basis').zh"
                  :readonly="!fieldEditable('inspection_table')"
                  @input="onTableDataCellInput(tr, { key: 'basis' }, $event)"
                  @keydown="onTableCellKeydown($event, ri, 'basis')"
                />
              </td>
              <td v-if="fieldEditable('inspection_table')" class="col-ops">
                <div class="table-action">
                  <el-tooltip content="拖拽排序" placement="top">
                    <span
                      class="action-btn action-btn--drag"
                      draggable="true"
                      @dragstart.stop="onTableRowDragStart(ri)"
                    >
                      <el-icon><Rank /></el-icon>
                    </span>
                  </el-tooltip>
                  <el-dropdown trigger="click" @command="(cmd) => onTableRowCommand(cmd, ri)">
                    <span class="action-btn action-btn--more">
                      <el-icon><MoreFilled /></el-icon>
                    </span>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="insert">
                          <el-icon><Plus /></el-icon>
                          在下方插入
                        </el-dropdown-item>
                        <el-dropdown-item command="copy">
                          <el-icon><CopyDocument /></el-icon>
                          复制本行
                        </el-dropdown-item>
                        <el-dropdown-item command="delete" divided>
                          <el-icon><Delete /></el-icon>
                          删除
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </td>
            </tr>
            <tr v-if="conclusionField && conclusionField.fieldValue" class="table-summary-row">
              <td :colspan="hasInspectionBasisColumn ? 4 : 3" class="cell-merged">
                检验结论
                <div class="item-en">Test conclusion</div>
              </td>
              <td
                class="stamp-cell"
                :class="{ 'has-table-seal': getSealImage('pass') }"
                :colspan="fieldEditable('inspection_table') ? 2 : 1"
              >
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
            <tr v-if="remarksField && remarksField.fieldValue" class="table-summary-row">
              <td :colspan="hasInspectionBasisColumn ? 4 : 3" class="cell-merged">
                备注
                <div class="item-en">Remarks</div>
              </td>
              <td
                class="stamp-cell"
                :class="{ 'has-table-seal': getSealImage('recheck') }"
                :colspan="fieldEditable('inspection_table') ? 2 : 1"
              >
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
          </div>

          <Teleport to="body">
            <ul
              v-if="inspectionItemAcOpenIndex != null && inspectionItemSuggestList.length && activeSuggestTableRow"
              class="inspection-item-suggest inspection-item-suggest--portal"
              :style="inspectionItemDropdownStyle"
              @mousedown.prevent
            >
              <li
                v-for="(item, si) in inspectionItemSuggestList"
                :key="item.zh + '-' + si"
                :class="{ 'is-highlight': inspectionItemSuggestHighlight === si }"
                @mouseenter="inspectionItemSuggestHighlight = si"
                @click="pickInspectionItemSuggest(item, activeSuggestTableRow)"
              >
                <span class="insp-ac-item__zh">{{ item.zh }}</span>
                <span class="insp-ac-item__en">{{ item.en }}</span>
              </li>
            </ul>
          </Teleport>
        </div>

        <div class="footer-section" :class="'footer-seal-pos--' + footerSealPosition">
          <div class="footer-item">
            <div class="footer-text-block">
              <div class="footer-label">主检</div>
              <div class="footer-label-en">Inspector</div>
            </div>
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
            <div class="footer-text-block">
              <div class="footer-label">审核</div>
              <div class="footer-label-en">Supervisor</div>
            </div>
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
            <div class="footer-text-block">
              <div class="footer-label">部门</div>
              <div class="footer-label-en">Department</div>
            </div>
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
          <div class="seal-position-row">
            <span class="seal-position-label">底部章位置</span>
            <el-radio-group
              v-model="footerSealPosition"
              size="small"
              :disabled="footerSealPositionSaving"
              @change="onFooterSealPositionChange"
            >
              <el-radio-button value="above">文字上方</el-radio-button>
              <el-radio-button value="below">下方</el-radio-button>
              <el-radio-button value="right">右侧</el-radio-button>
            </el-radio-group>
          </div>
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
      </div>

      <aside class="report-preview-panel">
        <div class="report-preview-head">
          <span>预览</span>
          <el-button
            v-if="canShowCustomerPreview && id"
            text
            type="primary"
            size="small"
            :loading="previewLoading"
            @click="refreshPreview"
          >
            刷新预览
          </el-button>
        </div>
        <div class="report-preview-body">
          <iframe
            v-if="canShowCustomerPreview && previewUrl"
            :key="previewRefreshKey"
            :src="previewUrl"
            class="report-preview-iframe"
            title="报告预览"
            @load="previewLoading = false"
          />
          <el-empty
            v-else-if="!id"
            description="保存后可预览"
            :image-size="88"
          />
          <el-empty
            v-else
            description="暂无预览权限"
            :image-size="88"
          />
        </div>
      </aside>
    </div>

    <el-dialog title="另存为新模板" v-model="tplDialog" width="520px">
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
        <el-button type="primary" :loading="tplSaving" @click="saveAsTemplate" icon=Check>确认另存</el-button>
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
  updateFooterSealPosition,
  getReport,
  applyReportSeals,
  removeReportSeal,
  getReportSeals,
  getTemplate,
  listTemplates,
  suggestTemplateByProduct,
  getSalesOrderReportPrefill,
  lookupQcYearbookForReport,
  deleteTemplate,
  saveReportAsTemplate,
  translateZhToEn,
  updateTemplate,
  updateReport,
  listSalesCustomers,
  suggestReportProductNames
} from '../api';
import { CopyDocument, Delete, Edit, MoreFilled, Plus, Rank, Setting } from '@element-plus/icons-vue';
import { customerReportPreviewUrl } from '../utils/customerReportPreviewUrl';
import { canEditReportFieldKey, perm } from '../utils/permissions';
import { isCustomFieldKey } from '../utils/reportFieldEditDefinitions';
import { normalizeReportDateInput, normalizeReportDateFieldValue, REPORT_DATE_FIELD_KEYS } from '../utils/reportDate';
import {
  formatReportQtyKg,
  normalizeReportQtyFieldValue,
  parseReportQtyNumber,
  REPORT_QTY_FIELD_KEYS
} from '../utils/reportQtyFields';
import {
  filterInspectionItemSuggestions,
  lookupInspectionItemEn
} from '../utils/inspectionItemSuggestions';
import { REPORT_PREFILL_FROM_ORDER_KEY } from '../utils/orderReportPrefill';
import { applyQcYearbookFieldsToFormFields } from '../utils/qcYearbookReportPrefill';
import {
  applyResultFormatToTable,
  formatInspectionResultCell,
  normalizeResultFormat,
  syncResultRawFromDisplay
} from '../utils/inspectionResultFormat';
import { normalizeProductNameCase } from '../utils/productNameInput';

const TABLE_KEY = 'inspection_table';
const PROTECTED_KEYS = new Set([TABLE_KEY, 'product_name', 'packing', 'batch_weight', 'batch_no', 'analysis_date', 'ex_mill_date', 'test_conclusion', 'remarks']);
const FIXED_REPORT_NO = 'JL-8.8-05';
const LEGACY_TABLE_KEYS = ['item', 'unit', 'standard', 'result', 'basis'];
const PROTECTED_TABLE_COLUMN_KEYS = new Set(['item']);
const MIN_INSPECTION_TABLE_COLUMNS = 2;
const UNIT_SUGGESTION_OPTIONS = ['-', '%', '#', 's', 'mgKOH/g', 'kg', 'g/L', 'μm', '℃'];

function svgUrl(svg) {
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

const LOGO_FALLBACK_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M20 20 L50 10 L80 20 L80 80 L50 90 L20 80 Z" fill="none" stroke="#000" stroke-width="8"/><path d="M35 30 L65 30 L65 70 L35 70 Z" fill="none" stroke="#000" stroke-width="8"/><path d="M35 50 L65 50" fill="none" stroke="#000" stroke-width="8"/></svg>`;

export default {
  name: 'ReportEdit',
  components: { CopyDocument, Delete, Edit, MoreFilled, Plus, Rank, Setting },
  props: {
    id: { type: [String, Number], default: null }
  },
  data() {
    return {
      saving: false,
      sealLoading: false,
      footerSealPosition: 'below',
      footerSealPositionSaving: false,
      previewLoading: false,
      previewRefreshKey: Date.now(),
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
      /** 从报告模板管理进入 /reports/new?templateId= 时，主保存走更新模板而非创建报告 */
      editingExistingTemplate: false,
      /** 产品名称+批号均已填写后完成联想，避免仅输入型号就套模板 */
      lastReportAutoFillKey: '',
      inspectionItemAcOpenIndex: null,
      inspectionItemSuggestList: [],
      inspectionItemSuggestHighlight: -1,
      activeSuggestTableRow: null,
      inspectionItemDropdownStyle: { top: '0px', left: '0px', width: '280px' },
      activeTableRowIndex: null,
      dragOverTableRowIndex: -1,
      unitSuggestionOptions: UNIT_SUGGESTION_OPTIONS,
      /** 已从订单预填的 orderId，避免 keep-alive 重复/漏填 */
      lastAppliedFromOrderId: null,
      _reportAutoFillTimer: null,
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
        customerId: null,
        customerName: '',
        customerContact: '',
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
      reportTitleEditMode: false,
      customerOptions: [],
      customerSearchLoading: false
    };
  },
  computed: {
    isNew() {
      return !this.id;
    },
    designerMode() {
      return this.isNew && String(this.$route?.query?.designer || '') === '1';
    },
    /** 模板管理「编辑」入口：新建页且仍绑定从 URL 带入的模板 */
    primarySaveIsTemplate() {
      return (
        this.isNew &&
        this.editingExistingTemplate &&
        !!this.form.templateId &&
        Number(this.$route?.query?.templateId) === Number(this.form.templateId)
      );
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
      return (this.tableColumnLabels || []).some((c) => c.key === 'basis');
    },
    conclusionLabelColspan() {
      return Math.max(1, (this.tableColumnLabels || []).length - 1);
    },
    tableDataRows() {
      const t = this.inspectionTable;
      if (!t?.fieldValue?.rows) return [];
      return t.fieldValue.rows;
    },
    tableBodyColspan() {
      let n = this.tableColumnLabels.length;
      if (this.fieldEditable('inspection_table')) n += 1;
      return n;
    },
    canShowCustomerPreview() {
      if (!this.id) return false;
      return (
        this.perm('reports', 'view') ||
        this.perm('reports', 'edit') ||
        this.perm('reports', 'previewPrint')
      );
    },
    previewUrl() {
      if (!this.canShowCustomerPreview) return '';
      return customerReportPreviewUrl(this.id, { t: this.previewRefreshKey });
    },
    reportCustomerLabel() {
      const name = String(this.form.customerName || '').trim();
      const contact = String(this.form.customerContact || '').trim();
      if (name && contact && name !== contact) return `${name}（${contact}）`;
      return name || contact || '';
    },
    customerFromOrderLocked() {
      const fromOrder = Number(this.$route?.query?.fromOrder);
      return Number.isFinite(fromOrder) && fromOrder > 0;
    },
    inspectionResultFormat() {
      return normalizeResultFormat(this.inspectionTable?.fieldValue?.resultFormat);
    }
  },
  watch: {
    '$route.fullPath'(newPath, oldPath) {
      if (this.$route.path !== '/reports/new' || this.id) return;
      const fromOrder = Number(this.$route?.query?.fromOrder);
      const hadReportId = /^\/reports\/\d+/.test(String(oldPath || ''));
      if ((Number.isFinite(fromOrder) && fromOrder > 0) || hadReportId) {
        this.lastAppliedFromOrderId = null;
        this.initNewReportPage();
      }
    }
  },
  activated() {
    if (!this.id && this.$route.path === '/reports/new') {
      const fromOrder = Number(this.$route?.query?.fromOrder);
      if (Number.isFinite(fromOrder) && fromOrder > 0 && this.lastAppliedFromOrderId !== fromOrder) {
        this.initNewReportPage();
      }
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
        customerId: report.customerId || null,
        customerName: report.customerName || '',
        customerContact: report.customerContact || '',
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
      this.syncInspectionResultDisplay();
      this.syncCustomerOptionFromForm();
      await this.loadAppliedSeals();
      await this.loadTemplateInfo();
      this.resizeTableCellsInView();
      this.refreshPreview();
    } else {
      await this.initNewReportPage();
    }
    this._onInspectionSuggestReposition = () => {
      if (this.inspectionItemAcOpenIndex != null) this.updateInspectionItemDropdownPosition();
    };
    window.addEventListener('resize', this._onInspectionSuggestReposition);
    window.addEventListener('scroll', this._onInspectionSuggestReposition, true);
    this.resizeTableCellsInView();
  },
  beforeUnmount() {
    if (this._onInspectionSuggestReposition) {
      window.removeEventListener('resize', this._onInspectionSuggestReposition);
      window.removeEventListener('scroll', this._onInspectionSuggestReposition, true);
    }
  },
  methods: {
    perm,
    formatCustomerOptionLabel(c) {
      const name = String(c?.customer_name || c?.customerName || '').trim();
      const contact = String(c?.contact_name || c?.customerContact || c?.contactName || '').trim();
      if (name && contact && name !== contact) return `${name}（${contact}）`;
      return name || contact || `客户#${c?.id || ''}`;
    },
    mapCustomerOption(c) {
      return {
        id: Number(c.id),
        label: this.formatCustomerOptionLabel(c),
        customer_name: String(c.customer_name || c.customerName || '').trim(),
        contact_name: String(c.contact_name || c.customerContact || c.contactName || '').trim()
      };
    },
    syncCustomerOptionFromForm() {
      const id = Number(this.form.customerId);
      if (!Number.isFinite(id) || id <= 0) return;
      const existing = this.customerOptions.find((c) => c.id === id);
      if (existing) return;
      if (this.form.customerName || this.form.customerContact) {
        this.customerOptions = [
          {
            id,
            label: this.reportCustomerLabel || this.formatCustomerOptionLabel(this.form),
            customer_name: this.form.customerName,
            contact_name: this.form.customerContact
          }
        ];
      }
    },
    ensureCustomerOptionLoaded() {
      this.syncCustomerOptionFromForm();
      if (!this.customerOptions.length) this.searchReportCustomers('');
    },
    async searchReportCustomers(q) {
      this.customerSearchLoading = true;
      try {
        const res = await listSalesCustomers({
          q: String(q || '').trim() || undefined,
          page: 1,
          pageSize: 30,
          only_active: 1
        });
        const items = (res?.items || []).map((c) => this.mapCustomerOption(c));
        const selectedId = Number(this.form.customerId);
        if (Number.isFinite(selectedId) && selectedId > 0 && !items.some((c) => c.id === selectedId)) {
          this.syncCustomerOptionFromForm();
          const cur = this.customerOptions.find((c) => c.id === selectedId);
          if (cur) items.unshift(cur);
        }
        this.customerOptions = items;
      } catch {
        this.customerOptions = [];
      } finally {
        this.customerSearchLoading = false;
      }
    },
    onReportCustomerChange(id) {
      const num = Number(id);
      if (!Number.isFinite(num) || num <= 0) {
        this.form.customerId = null;
        this.form.customerName = '';
        this.form.customerContact = '';
        return;
      }
      const hit = this.customerOptions.find((c) => c.id === num);
      this.form.customerId = num;
      this.form.customerName = hit?.customer_name || '';
      this.form.customerContact = hit?.contact_name || '';
    },
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
    isPageReloadNavigation() {
      try {
        const nav = performance.getEntriesByType('navigation')?.[0];
        return nav?.type === 'reload';
      } catch {
        return false;
      }
    },
    async initNewReportPage() {
      const fromOrderId = Number(this.$route?.query?.fromOrder);
      if (Number.isFinite(fromOrderId) && fromOrderId > 0) {
        await this.applyOrderPrefillFromRoute({ showMessage: !this.isPageReloadNavigation() });
        return;
      }
      this.lastAppliedFromOrderId = null;
      this.lastReportAutoFillKey = '';
      this.seedDefaultPaper();
      this.loadSuggestedReportNo();
      const queryTemplateId = Number(this.$route?.query?.templateId);
      if (Number.isFinite(queryTemplateId) && queryTemplateId > 0) {
        this.editingExistingTemplate = true;
        this.selectedTemplateId = queryTemplateId;
        await this.applyTemplateById(queryTemplateId, { skipConfirm: true });
      }
    },
    applyOrderPrefill(prefill) {
      if (!prefill || typeof prefill !== 'object') return;
      if (prefill.customerId) this.form.customerId = Number(prefill.customerId);
      if (prefill.customerName) this.form.customerName = String(prefill.customerName).trim();
      if (prefill.customerContact) this.form.customerContact = String(prefill.customerContact).trim();
      const setField = (key, val) => {
        if (!val || typeof val !== 'object') return;
        const f = this.form.fields.find((x) => x.fieldKey === key);
        if (!f) return;
        if (!f.fieldValue || typeof f.fieldValue !== 'object') {
          f.fieldValue = { zh: '', en: '' };
        }
        const zh = String(val.zh ?? '').trim();
        const en = String(val.en ?? '').trim();
        if (zh) f.fieldValue.zh = zh;
        if (en) f.fieldValue.en = en;
      };
      setField('product_name', prefill.product_name);
      const prodField = this.form.fields.find((x) => x.fieldKey === 'product_name');
      if (prodField?.fieldValue) {
        const upper = normalizeProductNameCase(prodField.fieldValue.zh);
        prodField.fieldValue.zh = upper;
        prodField.fieldValue.en = upper;
      }
      setField('packing', prefill.packing);
      setField('batch_no', prefill.batch_no);
      setField('batch_weight', prefill.batch_weight);
    },
    capturePrefillHeaderFields() {
      const keys = ['product_name', 'packing', 'batch_no', 'batch_weight'];
      const out = {};
      for (const key of keys) {
        const f = this.form.fields.find((x) => x.fieldKey === key);
        if (!f?.fieldValue) continue;
        out[key] = {
          zh: String(f.fieldValue.zh ?? '').trim(),
          en: String(f.fieldValue.en ?? '').trim()
        };
      }
      return out;
    },
    restorePrefillHeaderFields(preserved) {
      if (!preserved || typeof preserved !== 'object') return;
      for (const [key, val] of Object.entries(preserved)) {
        const f = this.form.fields.find((x) => x.fieldKey === key);
        if (!f) continue;
        if (!f.fieldValue || typeof f.fieldValue !== 'object') {
          f.fieldValue = { zh: '', en: '' };
        }
        f.fieldValue.zh = String(val?.zh ?? '').trim();
        f.fieldValue.en = String(val?.en ?? '').trim();
      }
    },
    clearReportConclusionAndRemarks() {
      for (const key of ['test_conclusion', 'remarks']) {
        const f = this.form.fields.find((x) => x.fieldKey === key);
        if (!f) continue;
        if (!f.fieldValue || typeof f.fieldValue !== 'object') {
          f.fieldValue = { zh: '', en: '' };
          continue;
        }
        f.fieldValue.zh = '';
        f.fieldValue.en = '';
      }
    },
    async applyInspectionTableByProductName(productName, { silent = false, fromOrderId = null } = {}) {
      const name = String(productName || '').trim();
      if (!name || !this.isNew) return false;
      try {
        const params = {};
        const orderIdNum = Number(fromOrderId);
        if (Number.isFinite(orderIdNum) && orderIdNum > 0) {
          params.fromOrder = orderIdNum;
        }
        const resp = await suggestTemplateByProduct(name, params);
        const hint = resp?.template || resp?.data?.template || null;
        if (!hint?.id) return false;

        const preserved = this.capturePrefillHeaderFields();
        await this.applyTemplateById(hint.id, { skipConfirm: true, silent: silent });
        this.restorePrefillHeaderFields(preserved);
        this.clearReportConclusionAndRemarks();

        if (!silent) {
          this.$message.success(`已按产品「${name}」联想模板「${hint.name}」检验项目`);
        }
        return true;
      } catch {
        return false;
      }
    },
    /** 新建报告：产品名称与批号都填写后再联想模板 + 品质管控台账 */
    scheduleReportAutoFill() {
      if (!this.isNew) return;
      const { productModel, batchNo } = this.getReportPrefillMeta();
      if (!productModel || !batchNo) return;
      if (this._reportAutoFillTimer) clearTimeout(this._reportAutoFillTimer);
      this._reportAutoFillTimer = setTimeout(() => {
        this.tryApplyReportAutoFill({ showMessage: true });
      }, 600);
    },
    getReportPrefillMeta() {
      const prod = this.form.fields.find((f) => f.fieldKey === 'product_name');
      const batch = this.form.fields.find((f) => f.fieldKey === 'batch_no');
      const zhOf = (val) => (typeof val === 'object' ? String(val?.zh ?? '').trim() : String(val ?? '').trim());
      return {
        productModel: zhOf(prod?.fieldValue),
        batchNo: zhOf(batch?.fieldValue)
      };
    },
    showQcYearbookMessage(qc, { qcApplied, appliedInspection, orderLabel = '' } = {}) {
      if (!qc) return;
      if (qc.found && qcApplied) {
        const src = qc.inspectionId
          ? `检验ID ${qc.inspectionId}`
          : qc.calendarYear
            ? `${qc.calendarYear}年度台账`
            : '品质管控台账';
        const inspectionTip = appliedInspection ? '，并已套用检验项目模板' : '';
        this.$message.success(`已从${src} 带入检验数据${inspectionTip}`);
        return;
      }
      if (qc.found) {
        this.$message.success('已在品质管控台账中查到记录，部分字段请核对后手动补充');
        return;
      }
      const inspectionTip = appliedInspection ? '，已套用检验项目模板' : '';
      const prefix = orderLabel ? `已从${orderLabel} 带入基本信息${inspectionTip}。` : '';
      const qcTip = qc.message || '未在品质管控台账中查到该型号/批次的检验数据，请手动填写检测值';
      this.$message.warning(`${prefix}${qcTip}`);
    },
    async tryApplyReportAutoFill({ showMessage = false, orderLabel = '', qcYearbookPrefill = null } = {}) {
      if (!this.isNew) return false;
      const { productModel, batchNo } = this.getReportPrefillMeta();
      if (!productModel || !batchNo) return false;

      const fromOrderId = Number(this.$route?.query?.fromOrder);
      const oid = Number.isFinite(fromOrderId) && fromOrderId > 0 ? fromOrderId : 0;
      const lookupKey = `${productModel}|${batchNo}|${oid}`;
      if (lookupKey === this.lastReportAutoFillKey) return false;

      let appliedInspection = false;
      const ok = await this.applyInspectionTableByProductName(productModel, {
        silent: true,
        fromOrderId: oid > 0 ? oid : null
      });
      if (ok) appliedInspection = true;

      let qcApplied = false;
      let qc = qcYearbookPrefill;
      if (!qc) {
        try {
          const params = { productModel, batchNo };
          if (oid > 0) params.orderId = oid;
          qc = await lookupQcYearbookForReport(params);
        } catch {
          qc = null;
        }
      }
      if (qc?.found && qc.fields) {
        const { inspectionApplied } = applyQcYearbookFieldsToFormFields(this.form.fields, qc.fields);
        qcApplied = inspectionApplied > 0;
      }

      this.lastReportAutoFillKey = lookupKey;

      if (showMessage && qc) {
        this.showQcYearbookMessage(qc, { qcApplied, appliedInspection, orderLabel });
      } else if (showMessage && appliedInspection) {
        this.$message.success(`已按产品「${productModel}」批号「${batchNo}」联想检验项目模板`);
      } else if (showMessage && !appliedInspection && qc && !qc.found) {
        this.$message.warning(qc.message || '未在品质管控台账中查到该型号/批次的检验数据，请手动填写');
      }

      return appliedInspection || qcApplied;
    },
    async resolveOrderPrefill(fromOrderId) {
      let cached = null;
      try {
        const raw = sessionStorage.getItem(REPORT_PREFILL_FROM_ORDER_KEY);
        if (raw) {
          const prefill = JSON.parse(raw);
          if (Number(prefill?.orderId) === fromOrderId) cached = prefill;
        }
      } catch {
        /* ignore */
      }
      try {
        const payload = await getSalesOrderReportPrefill(fromOrderId);
        const fromApi = payload?.prefill || null;
        if (fromApi) return fromApi;
      } catch {
        /* ignore */
      }
      return cached;
    },
    async applyOrderPrefillFromRoute({ showMessage = true } = {}) {
      if (!this.isNew) return;
      const fromOrderId = Number(this.$route?.query?.fromOrder);
      if (!Number.isFinite(fromOrderId) || fromOrderId <= 0) return;
      if (this.lastAppliedFromOrderId === fromOrderId) return;
      if (this._orderPrefillApplying) return;
      this._orderPrefillApplying = true;
      try {
        const prefill = await this.resolveOrderPrefill(fromOrderId);
        if (!prefill) return;
        this.seedDefaultPaper();
        this.loadSuggestedReportNo();
        this.lastReportAutoFillKey = '';
        this.applyOrderPrefill(prefill);
        const label = prefill.orderNo ? `订单 ${prefill.orderNo}` : `订单 #${fromOrderId}`;
        await this.tryApplyReportAutoFill({
          showMessage,
          orderLabel: label,
          qcYearbookPrefill: prefill.qcYearbook
        });

        this.lastAppliedFromOrderId = fromOrderId;
        try {
          sessionStorage.setItem(REPORT_PREFILL_FROM_ORDER_KEY, JSON.stringify(prefill));
        } catch {
          /* ignore */
        }
        if (showMessage && !this.lastReportAutoFillKey) {
          this.$message.info(`已从${label} 带入基本信息，请确认产品名称与批号后系统将自动联想`);
        }
        this.syncCustomerOptionFromForm();
      } catch {
        /* ignore */
      } finally {
        this._orderPrefillApplying = false;
      }
    },
    seedDefaultPaper() {
      this.form.templateId = null;
      this.form.customerId = null;
      this.form.customerName = '';
      this.form.customerContact = '';
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
        const pos = String(settings.footerSealPosition || settings.footer_seal_position || 'below').trim();
        this.footerSealPosition = ['below', 'above', 'right'].includes(pos) ? pos : 'below';
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
        const columnLabels = this.defaultColumnLabels();
        return {
          columnLabels,
          rows: this.rowsFromLegacyArray(parsed, columnLabels)
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
      const rows = (rowsRaw || []).length ? this.rowsFromLegacyArray(rowsRaw, columnLabels) : this.defaultTableRows();
      const forceBasisColumn = parsed?.hasBasisColumn === true;
      if (forceBasisColumn && columnLabels.length < 5) {
        columnLabels.push({ key: 'basis', zh: '单项检验依据', en: 'Inspection basis' });
      }
      if (columnLabels.length >= 5) {
        rows.forEach((r) => {
          if (!r.basis) this.$set(r, 'basis', { zh: '', en: '' });
        });
      }
      const resultFormat = normalizeResultFormat(parsed?.resultFormat);
      return { columnLabels, rows, hasBasisColumn: columnLabels.length >= 5, resultFormat };
    },
    rowsFromLegacyArray(arr, columnLabels) {
      const toBi = (val) => {
        if (val == null) return { zh: '', en: '' };
        if (typeof val === 'object') {
          return { zh: val.zh ?? val.cn ?? val.valueZh ?? '', en: val.en ?? val.valueEn ?? '' };
        }
        return { zh: String(val), en: '' };
      };
      const cols =
        Array.isArray(columnLabels) && columnLabels.length >= 4 ? columnLabels : this.defaultColumnLabels();
      const colKeys = cols.map((c, idx) => {
        if (typeof c === 'object' && c?.key) return String(c.key);
        return LEGACY_TABLE_KEYS[idx] || `col_${idx}`;
      });
      const pickCell = (row, key, idx) => {
        if (Array.isArray(row)) return toBi(row[idx]);
        const fallbacks = [
          row?.item ?? row?.name ?? row?.project,
          row?.unit ?? row?.unitName ?? row?.units,
          row?.standard ?? row?.spec,
          row?.result ?? row?.value ?? row?.test_value ?? row?.testValue ?? row?.['检测值'],
          row?.basis ?? row?.reference
        ];
        if (row && key && row[key] != null) return toBi(row[key]);
        return toBi(fallbacks[idx] ?? '');
      };
      return arr.map((r) => {
        const out = {};
        colKeys.forEach((key, idx) => {
          out[key] = pickCell(r, key, idx);
        });
        return out;
      });
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
          this.$set(prod.fieldValue, 'zh', normalizeProductNameCase(report.productName));
        }
        if (!String(prod.fieldValue?.en || '').trim() && report.productNameEn) {
          this.$set(prod.fieldValue, 'en', normalizeProductNameCase(report.productNameEn));
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
      this.normalizeReportDateFields();
      this.normalizeReportQtyFields();
    },
    isReportDateField(row) {
      return REPORT_DATE_FIELD_KEYS.has(row?.fieldKey);
    },
    isReportQtyField(row) {
      return REPORT_QTY_FIELD_KEYS.has(row?.fieldKey);
    },
    isProductNameField(row) {
      return row?.fieldKey === 'product_name';
    },
    async fetchProductNameSuggestions(queryString, cb) {
      const q = normalizeProductNameCase(queryString);
      if (!q || q.length < 1) {
        cb([]);
        return;
      }
      try {
        const resp = await suggestReportProductNames(q);
        const items = resp?.items || resp?.data?.items || [];
        cb(items.map((name) => ({ value: normalizeProductNameCase(name) })));
      } catch {
        cb([]);
      }
    },
    onProductNameValueChange(row, val) {
      if (!row?.fieldValue) return;
      const upper = normalizeProductNameCase(val);
      row.fieldValue.zh = upper;
      row.fieldValue.en = upper;
      this.afterProductNameFieldChange(row);
    },
    onProductNameSelect(row, item) {
      if (!row?.fieldValue) return;
      const upper = normalizeProductNameCase(item?.value);
      row.fieldValue.zh = upper;
      row.fieldValue.en = upper;
      this.afterProductNameFieldChange(row);
    },
    afterProductNameFieldChange(row) {
      if (
        this.isNew &&
        (row?.fieldKey === 'product_name' || row?.fieldKey === 'batch_no')
      ) {
        this.scheduleReportAutoFill();
      }
    },
    reportQtyNumberDisplay(row) {
      const n = parseReportQtyNumber(row?.fieldValue?.zh);
      return n != null ? String(n) : '';
    },
    onReportQtyNumberInput(row, raw) {
      if (!row?.fieldValue) row.fieldValue = { zh: '', en: '' };
      row.fieldValue = formatReportQtyKg(raw);
    },
    normalizeReportQtyFields() {
      for (const f of this.form.fields || []) {
        if (!REPORT_QTY_FIELD_KEYS.has(f.fieldKey)) continue;
        f.fieldValue = normalizeReportQtyFieldValue(f.fieldKey, f.fieldValue);
      }
    },
    normalizeReportDateFields() {
      for (const f of this.form.fields || []) {
        if (!REPORT_DATE_FIELD_KEYS.has(f.fieldKey)) continue;
        const normalized = normalizeReportDateFieldValue(f.fieldValue);
        f.fieldValue = normalized;
      }
    },
    onReportDateChange(row) {
      if (!row?.fieldValue) return;
      const normalized = normalizeReportDateFieldValue(row.fieldValue);
      row.fieldValue = normalized;
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
      if (REPORT_QTY_FIELD_KEYS.has(row?.fieldKey)) return;
      if (this.isProductNameField(row)) return;
      this.syncFieldValueEn(row);
      if (this.isNew && row?.fieldKey === 'batch_no') {
        this.scheduleReportAutoFill();
      }
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
    tableCell(row, key) {
      if (!row) return { zh: '', en: '' };
      if (!row[key] || typeof row[key] !== 'object') {
        row[key] = { zh: '', en: '' };
      }
      return row[key];
    },
    generateTableColumnKey(existingKeys) {
      let i = 1;
      while (existingKeys.has(`col_${i}`)) i += 1;
      return `col_${i}`;
    },
    syncTableBasisFlag() {
      const t = this.inspectionTable;
      if (!t?.fieldValue) return;
      t.fieldValue.hasBasisColumn = (t.fieldValue.columnLabels || []).some((c) => c.key === 'basis');
    },
    firstTableNavCellKey() {
      const first = this.tableColumnLabels[0];
      if (!first) return 'item_zh';
      return first.key === 'item' ? 'item_zh' : first.key;
    },
    canRemoveTableColumn(columnIndex) {
      const col = this.tableColumnLabels[columnIndex];
      if (!col) return false;
      if (PROTECTED_TABLE_COLUMN_KEYS.has(col.key)) return false;
      return this.tableColumnLabels.length > MIN_INSPECTION_TABLE_COLUMNS;
    },
    insertTableColumn(atIndex, copyFromCol = null) {
      if (!this.fieldEditable('inspection_table')) return;
      const t = this.inspectionTable;
      if (!t?.fieldValue) return;
      const cols = [...(t.fieldValue.columnLabels || this.defaultColumnLabels())];
      const existingKeys = new Set(cols.map((c) => c.key));
      let key;
      if (copyFromCol?.key && !existingKeys.has(copyFromCol.key)) {
        key = copyFromCol.key;
      } else {
        key = this.generateTableColumnKey(existingKeys);
      }
      const newCol = copyFromCol
        ? {
            key,
            zh: String(copyFromCol.zh || '').trim() || '新列',
            en: String(copyFromCol.en || '').trim() || 'New column'
          }
        : {
            key,
            zh: '新列',
            en: 'New column'
          };
      const at = Math.max(0, Math.min(atIndex, cols.length));
      cols.splice(at, 0, newCol);
      t.fieldValue.columnLabels = cols;
      for (const row of t.fieldValue.rows || []) {
        if (copyFromCol?.key && row[copyFromCol.key]) {
          row[newCol.key] = JSON.parse(JSON.stringify(row[copyFromCol.key]));
        } else {
          row[newCol.key] = { zh: '', en: '' };
        }
      }
      this.syncTableBasisFlag();
      this.resizeTableCellsInView();
    },
    duplicateTableColumn(columnIndex) {
      const col = this.tableColumnLabels[columnIndex];
      if (!col) return;
      this.insertTableColumn(columnIndex + 1, col);
      this.$message.success(`已复制列「${col.zh || '未命名'}」`);
    },
    removeTableColumn(columnIndex) {
      if (!this.fieldEditable('inspection_table')) return;
      const col = this.tableColumnLabels[columnIndex];
      if (!col) return;
      if (!this.canRemoveTableColumn(columnIndex)) {
        this.$message.warning(
          PROTECTED_TABLE_COLUMN_KEYS.has(col.key)
            ? '检验项目列不可删除'
            : `至少保留 ${MIN_INSPECTION_TABLE_COLUMNS} 列`
        );
        return;
      }
      this.$confirm(`确定删除列「${col.zh || '未命名'}」？该列所有数据将一并删除。`, '提示', {
        type: 'warning'
      })
        .then(() => {
          const t = this.inspectionTable;
          const cols = [...(t.fieldValue.columnLabels || [])];
          const key = col.key;
          cols.splice(columnIndex, 1);
          t.fieldValue.columnLabels = cols;
          for (const row of t.fieldValue.rows || []) {
            if (row[key]) delete row[key];
          }
          this.syncTableBasisFlag();
          this.resizeTableCellsInView();
          this.$message.success('已删除列');
        })
        .catch(() => {});
    },
    onTableColumnHeaderCommand(command, columnIndex) {
      if (!this.fieldEditable('inspection_table')) return;
      if (command === 'insert-before') this.insertTableColumn(columnIndex);
      else if (command === 'insert-after') this.insertTableColumn(columnIndex + 1);
      else if (command === 'duplicate') this.duplicateTableColumn(columnIndex);
      else if (command === 'delete') this.removeTableColumn(columnIndex);
    },
    newEmptyTableRow() {
      const row = {};
      for (const col of this.tableColumnLabels) {
        row[col.key] = { zh: '', en: '' };
      }
      return row;
    },
    cloneTableRow(src) {
      return JSON.parse(JSON.stringify(src || this.newEmptyTableRow()));
    },
    addTableRow() {
      if (!this.fieldEditable('inspection_table')) return;
      const t = this.inspectionTable;
      if (!t?.fieldValue?.rows) return;
      t.fieldValue.rows.push(this.newEmptyTableRow());
      const newIndex = t.fieldValue.rows.length - 1;
      this.activeTableRowIndex = newIndex;
      this.$nextTick(() => this.focusTableCell(newIndex, this.firstTableNavCellKey()));
    },
    insertTableRowAfter(rowIndex) {
      if (!this.fieldEditable('inspection_table')) return;
      const rows = this.inspectionTable?.fieldValue?.rows;
      if (!Array.isArray(rows)) return;
      const at = Number(rowIndex);
      if (!Number.isFinite(at) || at < 0) return;
      rows.splice(at + 1, 0, this.newEmptyTableRow());
      this.resizeTableCellsInView();
      this.$nextTick(() => this.focusTableCell(at + 1, this.firstTableNavCellKey()));
    },
    duplicateTableRow(rowIndex) {
      if (!this.fieldEditable('inspection_table')) return;
      const rows = this.inspectionTable?.fieldValue?.rows;
      if (!Array.isArray(rows) || !rows[rowIndex]) return;
      rows.splice(rowIndex + 1, 0, this.cloneTableRow(rows[rowIndex]));
      this.resizeTableCellsInView();
      this.$message.success('已复制到下一行');
    },
    onTableColumnCommand(command) {
      if (!this.fieldEditable('inspection_table')) return;
      if (command === 'append-column') {
        this.insertTableColumn(this.tableColumnLabels.length);
        this.$message.success('已在末尾添加列');
      } else if (command === 'add-basis') this.toggleBasisColumn(true);
      else if (command === 'remove-basis') this.toggleBasisColumn(false);
      else if (command === 'reset-labels') this.resetTableColumnLabels();
    },
    onTableRowCommand(command, rowIndex) {
      if (!this.fieldEditable('inspection_table')) return;
      if (command === 'insert') this.insertTableRowAfter(rowIndex);
      else if (command === 'copy') this.duplicateTableRow(rowIndex);
      else if (command === 'delete') this.removeTableRow(rowIndex);
    },
    resetTableColumnLabels() {
      if (!this.fieldEditable('inspection_table')) return;
      const t = this.inspectionTable;
      if (!t?.fieldValue) return;
      const defaultMap = new Map(this.defaultColumnLabels().map((c) => [c.key, c]));
      defaultMap.set('basis', { key: 'basis', zh: '单项检验依据', en: 'Inspection basis' });
      t.fieldValue.columnLabels = (t.fieldValue.columnLabels || []).map((c) => {
        const d = defaultMap.get(c.key);
        return d ? { ...c, zh: d.zh, en: d.en } : c;
      });
      this.$message.success('已重置列标题');
    },
    toggleBasisColumn(enable) {
      if (!this.fieldEditable('inspection_table')) return;
      const idx = this.tableColumnLabels.findIndex((c) => c.key === 'basis');
      if (enable && idx < 0) {
        this.insertTableColumn(this.tableColumnLabels.length, {
          key: 'basis',
          zh: '单项检验依据',
          en: 'Inspection basis'
        });
        this.$message.success('已添加检验依据列');
      } else if (!enable && idx >= 0) {
        const t = this.inspectionTable;
        const cols = [...(t.fieldValue.columnLabels || [])];
        cols.splice(idx, 1);
        t.fieldValue.columnLabels = cols;
        for (const row of t.fieldValue.rows || []) {
          if (row.basis) delete row.basis;
        }
        this.syncTableBasisFlag();
        this.$message.success('已移除检验依据列');
      }
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
    onTableRowDragOver(rowIndex) {
      if (this.draggingTableRowIndex >= 0) this.dragOverTableRowIndex = rowIndex;
    },
    onTableRowDragLeave() {
      this.dragOverTableRowIndex = -1;
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
      this.dragOverTableRowIndex = -1;
      this.reindexSortOrders();
    },
    tableCellNavOrder() {
      const order = [];
      for (const col of this.tableColumnLabels) {
        if (col.key === 'item') {
          order.push('item_zh', 'item_en');
        } else {
          order.push(col.key);
        }
      }
      return order;
    },
    focusTableCell(rowIndex, colKey) {
      this.$nextTick(() => {
        const el = this.$el.querySelector(`[data-cell="${rowIndex}-${colKey}"]`);
        el?.focus();
      });
    },
    autoResizeTableCell(el) {
      if (!el || el.nodeName !== 'TEXTAREA') return;
      el.style.height = 'auto';
      const max = 160;
      el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    },
    resizeTableCellsInView() {
      this.$nextTick(() => {
        const nodes = this.$el?.querySelectorAll?.('.test-table .cell-area') || [];
        nodes.forEach((el) => this.autoResizeTableCell(el));
      });
    },
    onTableDataCellInput(row, col, e) {
      this.syncTableCellEn(this.tableCell(row, col.key));
      this.autoResizeTableCell(e?.target);
    },
    onInspectionResultFormatChange(format) {
      const t = this.inspectionTable;
      if (!t?.fieldValue) return;
      const mode = normalizeResultFormat(format);
      const { tableValue } = applyResultFormatToTable(t.fieldValue, mode);
      t.fieldValue = tableValue;
    },
    syncInspectionResultDisplay() {
      const t = this.inspectionTable;
      if (!t?.fieldValue) return;
      const mode = normalizeResultFormat(t.fieldValue.resultFormat);
      const { tableValue } = applyResultFormatToTable(t.fieldValue, mode);
      t.fieldValue = tableValue;
    },
    onResultCellBlur(row) {
      const cell = this.tableCell(row, 'result');
      if (!cell) return;
      syncResultRawFromDisplay(cell, this.inspectionResultFormat);
      const formatted = formatInspectionResultCell(cell, this.inspectionResultFormat);
      cell.zh = formatted.zh;
      cell.en = formatted.en;
      if (formatted.raw != null) cell.raw = formatted.raw;
      else delete cell.raw;
      if (formatted.rawEn != null) cell.rawEn = formatted.rawEn;
      else delete cell.rawEn;
    },
    onTableCellKeydown(e, rowIndex, colKey) {
      if (!this.fieldEditable('inspection_table')) return;
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      const cols = this.tableCellNavOrder();
      const idx = cols.indexOf(colKey);
      if (idx < 0) return;
      e.preventDefault();
      if (idx < cols.length - 1) {
        this.focusTableCell(rowIndex, cols[idx + 1]);
        return;
      }
      const nextRow = rowIndex + 1;
      if (nextRow < this.tableDataRows.length) {
        this.focusTableCell(nextRow, cols[0]);
        return;
      }
      this.insertTableRowAfter(rowIndex);
    },
    reindexSortOrders() {
      (this.form.fields || []).forEach((f, idx) => {
        f.sortOrder = (idx + 1) * 10;
      });
    },
    /** 保存前统一排序与检验表结构，供报告与模板落库共用 */
    normalizePaperForSave() {
      this.reindexSortOrders();
      this.normalizeReportDateFields();
      const prod = this.form.fields.find((f) => f.fieldKey === 'product_name');
      if (prod?.fieldValue) {
        prod.fieldValue.zh = normalizeProductNameCase(prod.fieldValue.zh);
        prod.fieldValue.en = normalizeProductNameCase(prod.fieldValue.en);
      }
      const tf = this.inspectionTable;
      if (tf) {
        const mode = normalizeResultFormat(tf.fieldValue?.resultFormat);
        const { tableValue } = applyResultFormatToTable(tf.fieldValue, mode);
        tf.fieldValue = tableValue;
        const columnLabels = tf.fieldValue.columnLabels || this.defaultColumnLabels();
        const rows = tf.fieldValue.rows || [];
        for (const row of rows) {
          for (const col of columnLabels) {
            this.tableCell(row, col.key);
          }
        }
        tf.fieldValue = {
          columnLabels,
          rows,
          hasBasisColumn: columnLabels.some((c) => c.key === 'basis'),
          resultFormat: normalizeResultFormat(tf.fieldValue?.resultFormat)
        };
      }
    },
    refreshPreview() {
      if (!this.canShowCustomerPreview) return;
      this.previewLoading = true;
      this.previewRefreshKey = Date.now();
    },
    goBackFromEdit() {
      if (this.isNew && this.editingExistingTemplate && this.form.templateId) {
        this.$router.push('/report-templates');
        return;
      }
      this.$router.push('/reports');
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
    async onFooterSealPositionChange(value) {
      this.footerSealPositionSaving = true;
      try {
        await updateFooterSealPosition(value);
        this.$message.success('底部章位置已保存，客户查看页将同步生效');
        this.refreshPreview();
      } catch (e) {
        await this.loadCompany();
        this.$message.error(this.$apiUserMsg(e, '保存章位置失败'));
      } finally {
        this.footerSealPositionSaving = false;
      }
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
    cancelTableCellEnSync(cell) {
      if (!cell) return;
      const key = cell._enKey;
      if (key && this._transTimers?.[key]) {
        clearTimeout(this._transTimers[key]);
        delete this._transTimers[key];
      }
    },
    updateInspectionItemDropdownPosition() {
      const ri = this.inspectionItemAcOpenIndex;
      if (ri == null || ri < 0) return;
      const input = this.$el?.querySelector(`[data-cell="${ri}-item_zh"]`);
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const width = Math.max(Math.round(rect.width), 280);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      this.inspectionItemDropdownStyle = {
        top: `${rect.bottom + 4}px`,
        left: `${left}px`,
        width: `${width}px`
      };
    },
    openInspectionItemSuggest(rowIndex) {
      this.inspectionItemAcOpenIndex = rowIndex;
      this.activeSuggestTableRow = this.tableDataRows[rowIndex] || null;
      this.inspectionItemSuggestHighlight = -1;
      this.refreshInspectionItemSuggestList(rowIndex);
      this.$nextTick(() => this.updateInspectionItemDropdownPosition());
    },
    closeInspectionItemSuggest(rowIndex) {
      setTimeout(() => {
        if (this.inspectionItemAcOpenIndex === rowIndex) {
          this.inspectionItemAcOpenIndex = null;
          this.activeSuggestTableRow = null;
          this.inspectionItemSuggestList = [];
          this.inspectionItemSuggestHighlight = -1;
        }
      }, 120);
    },
    refreshInspectionItemSuggestList(rowIndex) {
      const row = this.tableDataRows[rowIndex];
      const q = row ? this.tableCell(row, 'item').zh ?? '' : '';
      this.inspectionItemSuggestList = filterInspectionItemSuggestions(q);
      this.inspectionItemSuggestHighlight = -1;
      if (this.inspectionItemAcOpenIndex === rowIndex) {
        this.$nextTick(() => this.updateInspectionItemDropdownPosition());
      }
    },
    pickInspectionItemSuggest(item, row) {
      this.onInspectionItemPick(item, row);
      this.inspectionItemAcOpenIndex = null;
      this.activeSuggestTableRow = null;
      this.inspectionItemSuggestList = [];
      this.inspectionItemSuggestHighlight = -1;
      this.resizeTableCellsInView();
    },
    onInspectionItemKeydown(e, row, rowIndex) {
      const listOpen =
        this.inspectionItemAcOpenIndex === rowIndex && this.inspectionItemSuggestList.length > 0;
      if (listOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const max = this.inspectionItemSuggestList.length - 1;
          const cur = this.inspectionItemSuggestHighlight;
          this.inspectionItemSuggestHighlight = cur < 0 ? 0 : Math.min(cur + 1, max);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const cur = this.inspectionItemSuggestHighlight;
          this.inspectionItemSuggestHighlight = cur <= 0 ? 0 : cur - 1;
          return;
        }
        if (e.key === 'Enter' && this.inspectionItemSuggestHighlight >= 0) {
          e.preventDefault();
          const item = this.inspectionItemSuggestList[this.inspectionItemSuggestHighlight];
          if (item) this.pickInspectionItemSuggest(item, row);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.inspectionItemAcOpenIndex = null;
          this.activeSuggestTableRow = null;
          this.inspectionItemSuggestList = [];
          this.inspectionItemSuggestHighlight = -1;
          return;
        }
      }
      this.onTableCellKeydown(e, rowIndex, 'item_zh');
    },
    onInspectionItemPick(item, row) {
      if (!row || !item) return;
      const cell = this.tableCell(row, 'item');
      cell.zh = item.zh || '';
      cell.en = item.en || '';
      this.cancelTableCellEnSync(cell);
    },
    onInspectionItemZhInput(row, rowIndex, e) {
      if (!row) return;
      this.autoResizeTableCell(e?.target);
      const cell = this.tableCell(row, 'item');
      this.cancelTableCellEnSync(cell);
      const zh = String(cell.zh ?? '');
      const trimmed = zh.trim();
      if (!trimmed) {
        cell.en = '';
        this.refreshInspectionItemSuggestList(rowIndex);
        return;
      }
      const mapped = lookupInspectionItemEn(trimmed);
      if (mapped) {
        cell.en = mapped;
      } else {
        cell.en = '';
        this.syncTableCellEn(cell);
      }
      if (this.inspectionItemAcOpenIndex === rowIndex) {
        this.refreshInspectionItemSuggestList(rowIndex);
      }
    },
    syncTableCellEn(cell) {
      if (!cell) return;
      const zh = cell.zh;
      const key = cell._enKey || Math.random().toString(16).slice(2);
      cell._enKey = key;
      if (this._transTimers && this._transTimers[key]) clearTimeout(this._transTimers[key]);
      this._transTimers = this._transTimers || {};
      this._transTimers[key] = setTimeout(async () => {
        const en = await this.translateZhToEn(zh);
        cell.en = en;
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
        this.refreshPreview();
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
          this.refreshPreview();
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
      this.templateSaving = true;
      try {
        const body = this.buildTemplateUpsertFromForm();
        if (!body) return;
        await updateTemplate(this.form.templateId, body);
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
    async applyTemplateById(templateId, { skipConfirm = false, silent = false } = {}) {
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
      if (!silent) this.$message.success('已套用模板');
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
    buildTemplateUpsertFromForm() {
      const name = String(this.templateForm.name || '').trim();
      if (!name) {
        this.$message.warning('请输入模板名称');
        return null;
      }
      if (!this.form.templateId) return null;
      if (!(this.form.fields || []).length) {
        this.$message.warning('当前没有可保存的模板字段');
        return null;
      }
      this.normalizePaperForSave();
      return {
        name,
        description: String(this.templateForm.description || '').trim() || null,
        fields: this.form.fields.map((f) => {
          const en = String(f.fieldLabelEn || '').trim();
          return {
            fieldKey: f.fieldKey,
            fieldLabel: f.fieldLabel,
            fieldLabelEn: en || undefined,
            fieldType: f.fieldType,
            defaultValue: f.fieldValue,
            sortOrder: f.sortOrder || 0
          };
        })
      };
    },
    buildPayload() {
      this.normalizePaperForSave();
      const prod = this.form.fields.find((f) => f.fieldKey === 'product_name');
      const batch = this.form.fields.find((f) => f.fieldKey === 'batch_no');
      const productName = normalizeProductNameCase(prod?.fieldValue?.zh);
      if (!productName) {
        this.$message.warning('请填写产品名称');
        return null;
      }
      return {
        reportNo: FIXED_REPORT_NO,
        productName,
        productNameEn: prod?.fieldValue?.en || null,
        batchNo: batch?.fieldValue?.zh?.trim() || null,
        batchNoEn: batch?.fieldValue?.en || null,
        customerId: this.form.customerId || null,
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
        this.$message.warning('当前没有字段可另存为新模板');
        return;
      }
      this.tplSaving = true;
      try {
        this.normalizePaperForSave();
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
        this.$message.success('已另存为新模板');
        this.tplDialog = false;
        this.loadTemplates();
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '另存模板失败'));
      } finally {
        this.tplSaving = false;
      }
    },
    async saveCurrentTemplateFromEditor() {
      if (!this.perm('templates', 'use')) return;
      if (!this.perm('reports', 'create')) return;
      const body = this.buildTemplateUpsertFromForm();
      if (!body) return;
      this.saving = true;
      try {
        await updateTemplate(this.form.templateId, body);
        this.$message.success('模板已保存');
        await this.loadTemplates();
      } catch (e) {
        const code = e?.response?.data?.error;
        const msg =
          code === 'DUPLICATE_FIELD_KEY'
            ? '字段标识（field key）重复，请检查并删除或合并重复字段'
            : this.$apiUserMsg(e, '保存模板失败');
        this.$message.error(msg);
      } finally {
        this.saving = false;
      }
    },
    hasReportCustomerAssociated() {
      const cid = Number(this.form.customerId);
      return Number.isFinite(cid) && cid > 0;
    },
    focusReportCustomerSelect() {
      this.$nextTick(() => {
        const row = this.$refs.reportCustomerRow;
        if (row?.scrollIntoView) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const sel = this.$refs.reportCustomerSelect;
        sel?.focus?.();
      });
    },
    /** 新建报告未关联客户时提示；返回 true 表示可继续保存 */
    async confirmSaveWithoutCustomer() {
      if (this.id || this.hasReportCustomerAssociated()) return true;
      try {
        await this.$confirm(
          '当前报告尚未关联客户。关联客户后，报告才能与对应订单自动匹配，且同产品、同批号的不同客户可各自独立维护。是否仍要不关联客户并保存？',
          '未关联客户',
          {
            type: 'warning',
            confirmButtonText: '仍要保存',
            cancelButtonText: '去关联客户'
          }
        );
        return true;
      } catch {
        this.focusReportCustomerSelect();
        return false;
      }
    },
    async save() {
      if (this.primarySaveIsTemplate) {
        await this.saveCurrentTemplateFromEditor();
        return;
      }
      if (this.id && !this.perm('reports', 'edit')) return;
      if (!this.id && !this.perm('reports', 'create')) return;
      const payload = this.buildPayload();
      if (!payload) return;
      if (!this.id) {
        const ok = await this.confirmSaveWithoutCustomer();
        if (!ok) return;
      }
      this.saving = true;
      try {
        if (this.id) {
          await updateReport(this.id, payload);
          this.$message.success('已保存');
          this.refreshPreview();
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
.create-row.customer-row {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #ebeef5;
}
.create-row-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
  min-width: 64px;
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

/* 左右分栏：左侧编辑、右侧客户预览 */
.report-edit-split {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.report-edit-panel {
  flex: 1 1 58%;
  min-width: 0;
}
.report-preview-panel {
  flex: 0 0 42%;
  width: 42%;
  min-width: 380px;
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}
.report-preview-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px 12px;
  font-size: 18px;
  font-weight: 700;
  color: #1a3a5f;
  letter-spacing: 0.08em;
  border-bottom: 2px solid #d0d7e2;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
}
.report-preview-body {
  flex: 1;
  min-height: 0;
  padding: 12px;
  background: linear-gradient(180deg, #e8edf3 0%, #eef1f6 100%);
  overflow: auto;
}
.report-preview-iframe {
  display: block;
  width: 100%;
  height: calc(100vh - 48px);
  min-height: 600px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
}

/* 报告纸张区域 */
.paper-wrap {
  background: #f0f2f5;
  padding: 24px;
  overflow: auto;
  border-radius: 8px;
}

.report-container {
  width: 210mm;
  min-height: 297mm;
  background: #fff;
  margin: 0;
  padding: 30mm 14mm 20mm;
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
  border: none !important;
  box-shadow: none !important;
}
.doc-no-input.is-readonly:focus,
.form-input.is-readonly:focus,
.conclusion-input.is-readonly:focus,
.remark-input.is-readonly:focus {
  border: none;
  box-shadow: none;
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
  font-size: 14px;
  color: #333;
  text-align: right;
  outline: none;
  font-weight: 500;
  padding: 4px 8px;
  box-sizing: border-box;
}
.label-en {
  display: block;
  width: 100%;
  font-size: 11px;
  color: #909399;
  text-align: right;
  outline: none;
  margin-top: 4px;
  padding: 4px 8px;
  box-sizing: border-box;
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
  font-size: 14px;
  padding: 0 10px;
  outline: none;
  min-width: 0;
  box-sizing: border-box;
}
.form-date-input {
  flex: 1;
  min-width: 0;
}
.form-date-input :deep(.el-input__wrapper) {
  border-radius: 6px;
  border: 1px solid #dcdfe6;
  box-shadow: none;
  padding: 0 10px;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.form-date-input :deep(.el-input__wrapper:hover) {
  border-color: #c0c4cc;
}
.form-date-input :deep(.el-input__wrapper.is-focus) {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}
.form-date-input.is-disabled :deep(.el-input__wrapper) {
  background: #f5f7fa;
  border-color: #e4e7ed;
  box-shadow: none;
}
.form-date-input :deep(.el-input__inner) {
  height: 32px;
  line-height: 32px;
}
.product-name-autocomplete-wrap {
  flex: 1;
  min-width: 0;
}
.form-input-autocomplete {
  width: 100%;
}
.form-input-autocomplete :deep(.el-input__wrapper) {
  border-radius: 6px;
  border: 1px solid #dcdfe6;
  box-shadow: none;
  padding: 0 10px;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.form-input-autocomplete :deep(.el-input__wrapper:hover) {
  border-color: #c0c4cc;
}
.form-input-autocomplete :deep(.el-input__wrapper.is-focus) {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}
.form-input-autocomplete.is-disabled :deep(.el-input__wrapper) {
  background: #f5f7fa;
  border-color: #e4e7ed;
  box-shadow: none;
}
.form-input-autocomplete :deep(.el-input__inner) {
  height: 32px;
  line-height: 32px;
  font-size: 14px;
}
.report-field-with-unit {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.report-field-with-unit .report-qty-input {
  flex: 1;
  min-width: 48px;
}
.report-field-unit-fixed {
  flex-shrink: 0;
  font-size: 14px;
  color: #606266;
  line-height: 32px;
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
.inspection-table-block {
  margin-top: 24px;
}
.inspection-table-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  margin-bottom: 12px;
  padding: 10px 14px;
  background: #f9fafc;
  border: 1px solid #ebeef5;
  border-radius: 8px;
}
.inspection-table-tip {
  flex: 1;
  min-width: 160px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
.inspection-result-format {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.inspection-result-format__label {
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
}
.test-table-scroll {
  width: 100%;
  max-width: 100%;
  overflow: visible;
}
.test-table {
  width: 100%;
  max-width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  margin-top: 0;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.test-table .col-item {
  width: 24%;
}
.test-table .col-unit {
  width: 20%;
  min-width: 128px;
  padding-left: 4px;
  padding-right: 4px;
}
.test-table .col-standard {
  width: 20%;
}
.test-table .col-result {
  width: 20%;
}
.test-table:has(.col-basis) .col-item {
  width: 17%;
}
.test-table:has(.col-basis) .col-unit {
  width: 15%;
  min-width: 120px;
  padding-left: 4px;
  padding-right: 4px;
}
.test-table:has(.col-basis) .col-standard,
.test-table:has(.col-basis) .col-result {
  width: 15%;
}
.test-table .col-basis {
  width: 16%;
}
.test-table .col-ops {
  width: 72px;
  min-width: 72px;
  max-width: 72px;
  padding: 8px 4px;
}
.test-table tbody tr.is-row-active td {
  background-color: #f0f7ff !important;
}
.test-table tbody tr.is-drag-over td {
  box-shadow: inset 0 2px 0 #409eff;
}
.test-table-empty-cell {
  padding: 28px 16px !important;
  color: #909399;
  font-size: 13px;
}
.test-table th,
.test-table td {
  border-right: 1px solid #dcdfe6;
  border-bottom: 1px solid #dcdfe6;
  padding: 10px 8px;
  text-align: center;
  font-size: 14px;
  vertical-align: middle;
  transition: background-color 0.2s;
  word-break: break-word;
  overflow-wrap: anywhere;
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
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  outline: none;
  color: #303133;
  padding: 6px 8px;
  box-sizing: border-box;
}
.th-title-cn:not([readonly]):focus {
  color: #409eff;
}
.th-title-en {
  width: 100%;
  text-align: center;
  font-size: 11px;
  color: #909399;
  outline: none;
  margin-top: 6px;
  padding: 4px 8px;
  box-sizing: border-box;
}
.cell-plain {
  width: 100%;
  text-align: center;
  font-size: 14px;
  outline: none;
  padding: 6px 10px;
  box-sizing: border-box;
}
.cell-area {
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  line-height: 1.45;
  min-height: 32px;
  max-height: 140px;
  field-sizing: content;
}
.cell-area[readonly] {
  cursor: default;
}
.cell-en {
  font-size: 11px;
  color: #909399;
  margin-top: 6px;
}
.cell-unit-display {
  display: block;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
  overflow-wrap: anywhere;
  padding: 4px 2px;
  color: #303133;
}
.test-table .col-unit .cell-unit-input {
  font-size: 13px;
  padding: 6px 4px;
  letter-spacing: 0;
}
.test-input {
  width: 100%;
  outline: none;
  text-align: center;
  font-size: 14px;
  padding: 6px 10px;
  box-sizing: border-box;
}
/* 报告内可编辑输入框：统一边框与圆角 */
.report-container .form-input:not(.is-readonly):not([readonly]),
.report-container .report-qty-input:not(.is-readonly):not([readonly]),
.report-container .form-label .label-cn:not([readonly]),
.report-container .form-label .label-en:not([readonly]),
.test-table .th-title-cn:not([readonly]),
.test-table .th-title-en:not([readonly]),
.test-table input:not([readonly]),
.test-table textarea:not([readonly]),
.conclusion-input:not(.is-readonly):not([readonly]),
.remark-input:not(.is-readonly):not([readonly]) {
  border: 1px solid #dcdfe6;
  background: #fff;
  border-radius: 6px;
  transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
}
.report-container .form-input:not(.is-readonly):not([readonly]):hover,
.report-container .report-qty-input:not(.is-readonly):not([readonly]):hover,
.report-container .form-label .label-cn:not([readonly]):hover,
.report-container .form-label .label-en:not([readonly]):hover,
.test-table .th-title-cn:not([readonly]):hover,
.test-table .th-title-en:not([readonly]):hover,
.test-table input:not([readonly]):hover,
.test-table textarea:not([readonly]):hover,
.conclusion-input:not(.is-readonly):not([readonly]):hover,
.remark-input:not(.is-readonly):not([readonly]):hover {
  border-color: #c0c4cc;
}
.report-container .form-input:not(.is-readonly):not([readonly]):focus,
.report-container .report-qty-input:not(.is-readonly):not([readonly]):focus,
.report-container .form-label .label-cn:not([readonly]):focus,
.report-container .form-label .label-en:not([readonly]):focus,
.test-table .th-title-cn:not([readonly]):focus,
.test-table .th-title-en:not([readonly]):focus,
.test-table input:not([readonly]):focus,
.test-table textarea:not([readonly]):focus,
.conclusion-input:not(.is-readonly):not([readonly]):focus,
.remark-input:not(.is-readonly):not([readonly]):focus {
  border-color: #409eff;
  background: #fff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}
.test-table input[readonly],
.test-table textarea[readonly],
.test-table .th-title-cn[readonly],
.test-table .th-title-en[readonly],
.report-container .form-input.is-readonly,
.report-container .form-input[readonly],
.report-container .report-qty-input.is-readonly,
.report-container .report-qty-input[readonly],
.report-container .form-label .label-cn[readonly],
.report-container .form-label .label-en[readonly],
.conclusion-input.is-readonly,
.conclusion-input[readonly],
.remark-input.is-readonly,
.remark-input[readonly] {
  border: none;
  background: transparent;
  box-shadow: none;
}
.test-table .test-input--result:not([readonly]) {
  border-color: #c6e2ff;
}
.test-input--result:not([readonly]):focus {
  border-color: #409eff;
  background: #f5faff;
}
.inspection-item-suggest {
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  max-height: 240px;
  overflow-y: auto;
  text-align: left;
  font-size: 14px;
  box-sizing: border-box;
}
.inspection-item-suggest--portal {
  position: fixed;
  z-index: 4000;
}
.inspection-item-suggest li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 12px;
  cursor: pointer;
  line-height: 1.45;
}
.inspection-item-suggest li:hover,
.inspection-item-suggest li.is-highlight {
  background: #ecf5ff;
}
.inspection-item-suggest li.is-highlight .insp-ac-item__zh {
  color: #409eff;
}
.inspection-item-suggest .insp-ac-item__zh {
  flex: 1;
  min-width: 0;
  color: #303133;
  font-weight: 500;
  word-break: break-word;
}
.inspection-item-suggest .insp-ac-item__en {
  flex-shrink: 0;
  color: #909399;
  font-size: 12px;
  max-width: 45%;
  word-break: break-word;
}
.cell-merged {
  text-align: center;
  font-weight: 600;
  color: #303133;
}
.item-en {
  display: block;
  font-size: 9px;
  color: #909399;
  margin-top: 1px;
  font-weight: normal;
  line-height: 1.25;
}
.conclusion-input,
.remark-input {
  width: 85%;
  min-height: 0;
  font-size: 12px;
  text-align: center;
  outline: none;
  color: #f56c6c;
  font-weight: bold;
  padding: 0 4px;
  box-sizing: border-box;
  line-height: 1.3;
}
.test-table tr.table-summary-row td {
  height: 60px;
  padding: 0;
  vertical-align: middle;
}
.test-table tr.table-summary-row .cell-merged {
  font-size: 12px;
  line-height: 1.35;
}
.stamp-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60px;
  padding: 0;
  box-sizing: border-box;
  overflow: visible;
}
.stamp-cell.has-table-seal {
  padding: 0;
  min-height: 0;
  height: 60px;
}
.cell-stamp-wrap {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 80px;
  height: 80px;
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
.col-ops .table-action {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
}
.col-ops .action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  transition: all 0.2s;
}
.col-ops .action-btn--drag {
  color: #909399;
  background: #f5f7fa;
  cursor: grab;
}
.col-ops .action-btn--drag:hover {
  background: #e6e8eb;
  color: #606266;
}
.col-ops .action-btn--drag:active {
  cursor: grabbing;
}
.col-ops .action-btn--more {
  color: #606266;
  background: #f5f7fa;
  cursor: pointer;
}
.col-ops .action-btn--more:hover {
  color: #409eff;
  background: #ecf5ff;
}
.col-ops :deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  gap: 8px;
}
.col-ops :deep(.el-dropdown-menu__item .el-icon) {
  margin-right: 0;
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
.seal-position-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.seal-position-label {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-width: 120px;
}
.footer-seal-pos--below .footer-item .footer-text-block {
  order: 1;
}
.footer-seal-pos--below .footer-item .stamp-item-wrap {
  order: 2;
  margin-top: 12px;
}
.footer-seal-pos--above.footer-section {
  align-items: flex-end;
}
.footer-seal-pos--above .footer-item .stamp-item-wrap {
  order: 1;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.footer-seal-pos--above .footer-item .footer-text-block {
  order: 2;
  flex-shrink: 0;
}
.footer-seal-pos--right .footer-item {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: left;
}
.footer-seal-pos--right .footer-item .footer-text-block {
  display: flex;
  flex-direction: column;
}
.footer-seal-pos--right .footer-item .footer-label-en {
  margin-bottom: 0;
}
.footer-seal-pos--right .footer-item .stamp-item-wrap {
  margin: 0;
  flex-shrink: 0;
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
  .inspection-table-bar,
  .col-ops,
  .stamp-remove,
  .seal-toolbar,
  .report-preview-panel {
    display: none !important;
  }
  .paper-wrap {
    background: #fff;
    padding: 0;
  }
  .report-container {
    box-shadow: none;
  }
  .test-table tr.table-summary-row td {
    height: 60px !important;
    padding: 0 !important;
    vertical-align: middle !important;
  }
  .stamp-cell {
    position: relative;
    text-align: center !important;
    vertical-align: middle !important;
    height: 60px !important;
    padding: 0 !important;
    overflow: visible !important;
  }
  .stamp-cell.has-table-seal {
    padding: 0 !important;
    min-height: 0 !important;
    height: 60px !important;
  }
  .cell-stamp-wrap {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
  }
  .cell-stamp-img {
    width: 80px;
    height: 80px;
    object-fit: contain;
    opacity: 0.9;
    display: block;
  }
  .cell-stamp-img[src$=".svg"] {
    width: 100%;
    height: 100%;
    object-fit: fill;
  }
}

/* 响应式布局 */
@media (max-width: 1280px) {
  .report-edit-split {
    flex-direction: column;
  }
  .report-edit-panel,
  .report-preview-panel {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    max-width: none;
  }
  .report-preview-panel {
    position: static;
    max-height: none;
  }
  .report-preview-iframe {
    height: 72vh;
    min-height: 480px;
  }
}
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

