<template>
  <div class="contract-template-edit-root">
    <el-alert
      v-if="isContractMode && !isUploadContract"
      type="info"
      show-icon
      :closable="false"
      class="top-alert"
      title="编辑合同：请用左侧可视化表单修改；保存后写入该份合同草稿。合同列表进入编辑时不会显示 HTML 源码，避免误改。"
    />

    <el-alert
      v-if="contractBodyPreserveLocked"
      type="warning"
      show-icon
      :closable="false"
      class="top-alert"
      title="当前正文无法拆成标准表单（例如由特殊模板生成）。右侧预览为实际内容，可先改「合同标题」后保存；若要改正文，请点下方「改用推荐版式」或回到模板用标准版式重新生成合同。"
    />

    <el-alert
      v-else-if="isNew"
      type="info"
      show-icon
      :closable="false"
      class="top-alert"
      title="新建合同模板：可选模板套用，或推荐版式 / 空白正文；编辑完成后点「保存模板」入库，随后在「合同管理 · 合同模板」中选用，生成合同时与报告类似按占位符填入真实数据。"
    />

    <el-alert
      v-else
      type="info"
      show-icon
      :closable="false"
      class="top-alert"
      title="编辑模板：修改名称或正文后点「保存模板」；下方示例仅为预览（虚构数据），不会写入数据库。"
    />

    <el-card v-if="isNew && !isContractMode" class="tpl-card">
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
          :loading="templatesLoading"
        >
          <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
        </el-select>
        <el-button type="primary" :disabled="!selectedTemplateId" @click="applySelectedTemplate">套用模板</el-button>
        <el-button @click="goTemplateList">模板列表</el-button>
        <el-button @click="startRecommended">推荐版式</el-button>
        <el-button @click="startBlank">空白正文</el-button>
        <span class="text-muted">套用模板会覆盖当前正文与名称（名称可再改）</span>
      </div>
    </el-card>

    <el-card class="editor-card">
      <template #header>
        <el-tabs v-model="activeTab" type="card" @tab-click="handleTabClick">
          <el-tab-pane label="合同内容" name="content" />
          <el-tab-pane label="版本历史" name="versions" v-if="isContractMode && hasVersionPerm" />
          <el-tab-pane label="审批流程" name="approval" v-if="isContractMode && hasMultiApprovePerm" />
        </el-tabs>
      </template>

      <!-- 内容 Tab -->
      <div v-if="activeTab === 'content'">
        <div v-if="isContractMode && isUploadContract" class="upload-contract-panel">
          <div class="toolbar in-editor-toolbar">
            <div>
              <el-button @click="goBack" icon=Back>返回</el-button>
            </div>
            <div class="toolbar-right">
              <el-button
                v-if="perm('company', 'manage') || perm('company', 'view')"
                @click="$router.push('/company')"
              >企业信息</el-button>
              <el-button type="primary" :loading="saving" @click="save" icon=Check>保存</el-button>
            </div>
          </div>
          <el-form label-width="100px" class="editor-form">
            <el-form-item label="合同标题" required>
              <el-input v-model="form.name" clearable placeholder="合同标题" style="max-width: 520px" />
            </el-form-item>
            <el-form-item label="正文文件">
              <div class="upload-doc-row">
                <span class="upload-doc-name">{{ uploadContractDocName || '—' }}</span>
                <el-button @click="downloadUploadContractFile" icon=Download>下载</el-button>
                <el-upload
                  :show-file-list="false"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif"
                  :http-request="onReplaceUploadContractFile"
                >
                  <el-button>更换文件</el-button>
                </el-upload>
              </div>
              <div class="tpl-insert-hint mt6">支持 PDF、Word、图片；单文件最大 20MB；仅草稿或已驳回时可更换。</div>
            </el-form-item>
          </el-form>
        </div>
        <div v-else class="editor-layout-modern">
        <div class="edit-panel">
          <div class="toolbar in-editor-toolbar">
            <div>
              <el-button @click="goBack" icon=Back>返回</el-button>
            </div>
            <div class="toolbar-right">
              <el-button
                v-if="perm('company', 'manage') || perm('company', 'view')"
                @click="$router.push('/company')"
              >企业信息</el-button>
              <el-button v-if="isContractMode" type="primary" :loading="saving" @click="save" icon=Check>保存合同</el-button>
              <el-button v-else type="primary" :loading="saving" @click="save" icon=Check>保存模板</el-button>
            </div>
          </div>
          <el-form label-width="96px" class="editor-form">
            <el-form-item :label="isContractMode ? '合同标题' : '模板名称'" required>
              <el-input
                v-model="form.name"
                :placeholder="isContractMode ? '合同标题' : '例如：标准销售合同'"
                clearable
                style="max-width: 520px"
              />
            </el-form-item>

            <el-form-item v-if="!isContractMode" label="编辑方式">
              <el-radio-group v-model="editMode">
                <el-radio-button label="visual">可视化编辑</el-radio-button>
                <el-radio-button label="raw">源码编辑</el-radio-button>
              </el-radio-group>
              <div class="tpl-insert-hint mt6">
                可视化编辑会根据左侧表单自动生成合同 HTML；源码编辑可直接修改 HTML（用于微调排版）。
              </div>
            </el-form-item>
            <div v-if="contractBodyPreserveLocked" class="preserve-unlock-row">
              <el-button type="warning" plain @click="unlockContractVisualReplaceBody" icon=Edit>
                改用推荐版式编辑正文（将清空当前正文为空白表单结构，请谨慎）
              </el-button>
            </div>

            <template v-if="isContractMode || editMode === 'visual'">
              <fieldset
              class="visual-editor-fieldset"
              :disabled="contractBodyPreserveLocked"
              :class="{ 'is-locked': contractBodyPreserveLocked }"
            >
              <div class="section">
                <div class="section-title">合同头部</div>
                <div class="form-row">
                  <div class="form-group">
                    <div class="form-label">公司抬头</div>
                    <el-input v-model="visual.headerCompanyZh" placeholder="例如：开封物源化工有限公司" />
                  </div>
                  <div class="form-group">
                    <div class="form-label">合同标题</div>
                    <el-input v-model="visual.headerTitleZh" placeholder="例如：销售合同" />
                  </div>
                </div>
                <div class="header-editor-box mt12">
                  <div class="header-editor-col">
                    <div class="form-label header-col-caption">左侧（买方、卖方）</div>
                    <div
                      v-for="(item, hi) in visual.headerItemsLeft"
                      :key="'header-left-' + hi"
                      class="header-item-row"
                    >
                      <el-input
                        v-model="item.label"
                        class="header-item-label"
                        placeholder="标题，例如：买方"
                      />
                      <span class="header-item-sep">：</span>
                      <el-input
                        v-model="item.value"
                        class="header-item-value"
                        :placeholder="item.placeholder || '留空则按默认值处理'"
                      />
                      <el-button
                        type="danger"
                        plain
                        size="small"
                        class="header-item-remove"
                        @click="removeHeaderItem('left', hi)"
                      >－</el-button>
                    </div>
                  </div>
                  <div class="header-editor-col">
                    <div class="form-label header-col-caption">右侧（合同编号、履约地点、签订时间）</div>
                    <div
                      v-for="(item, hi) in visual.headerItemsRight"
                      :key="'header-right-' + hi"
                      class="header-item-row"
                    >
                      <el-input
                        v-model="item.label"
                        class="header-item-label"
                        placeholder="标题，例如：合同编号"
                      />
                      <span class="header-item-sep">：</span>
                      <el-input
                        v-model="item.value"
                        class="header-item-value"
                        :placeholder="item.placeholder || '留空则按默认值处理'"
                      />
                      <el-button
                        type="danger"
                        plain
                        size="small"
                        class="header-item-remove"
                        @click="removeHeaderItem('right', hi)"
                      >－</el-button>
                    </div>
                  </div>
                </div>
                <div class="tpl-insert-row mt6">
                  <el-button size="small" @click="appendToVisual('headerCompanyZh', '开封物源化工有限公司')">＋ 常用公司名</el-button>
                  <el-button size="small" @click="appendToVisual('headerTitleZh', '销售合同')">＋ 常用标题</el-button>
                </div>
              </div>

              <div class="section">
                <div class="section-title">条款（示例排版）</div>
                <div
                  v-for="(clauseItem, ci) in visual.clauses"
                  :key="'clause-' + ci"
                  class="form-row clause-item-row"
                >
                  <div class="form-group">
                    <div class="clause-item-header">
                      <div class="form-label">条款标题</div>
                      <div class="clause-item-ops">
                        <el-button size="small" @click="insertClause(ci)">＋</el-button>
                        <el-button size="small" :disabled="visual.clauses.length <= 1" @click="removeClause(ci)">－</el-button>
                      </div>
                    </div>
                    <el-input v-model="clauseItem.title" />
                    <template v-if="clauseItem.useTable">
                      <div class="tpl-insert-row mt6 table-ops">
                        <el-button size="small" @click="addVisualTableRow">＋ 增加行</el-button>
                        <el-button size="small" @click="removeVisualTableRow" :disabled="visual.tableRows.length <= 1">－ 减少行</el-button>
                        <el-button size="small" type="primary" plain @click="recalcAllOrderLines">
                          按单价重算整表
                        </el-button>
                        <el-button
                          v-if="isContractMode && contractOrders.length"
                          size="small"
                          @click="fillOrderLinesFromContractOrders"
                        >
                          从关联订单带入
                        </el-button>
                        <el-button
                          v-if="isContractMode && contractOrders.length"
                          size="small"
                          type="info"
                          plain
                          @click="goToRuleSettings"
                        >
                          管理计算规则
                        </el-button>
                        <el-button v-if="!isContractMode" size="small" @click="editMode = 'raw'" icon=Edit>
                          去源码编辑插入占位符
                        </el-button>
                      </div>
                      <div class="table-form-wrap mt12">
                        <table class="table-form-editor">
                          <thead>
                            <tr class="table-letter-row">
                              <th v-for="({ letter }, hi) in orderLineHeadersWithLetters" :key="'letter-' + hi">
                                {{ letter }}
                              </th>
                            </tr>
                            <tr class="table-header-row">
                              <th v-for="({ header }, hi) in orderLineHeadersWithLetters" :key="'h-' + hi">
                                {{ header }}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(row, ri) in visual.tableRows" :key="'r-' + ri">
                              <td
                                v-for="(_cell, cj) in orderLineHeaders"
                                :key="'c-' + ri + '-' + cj"
                              >
                                <el-input
                                  v-model="visual.tableRows[ri][cj]"
                                  size="small"
                                  :placeholder="orderLineCellPlaceholder(cj)"
                                  @input="onOrderLineCellInput(ri, cj)"
                                  @change="onOrderLineCellChange(ri, cj)"
                                />
                              </td>
                            </tr>
                            <tr class="order-line-total-row">
                              <td class="order-line-total-label">总金额</td>
                              <td :colspan="orderLineHeaders.length - 1" class="order-line-total-value">
                                <el-input
                                  v-model="visual.tableTotalText"
                                  placeholder="{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）"
                                />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </template>
                    <template v-else>
                      <div class="form-label mt6">条款内容</div>
                      <el-input v-model="clauseItem.body" type="textarea" :rows="2" />
                    </template>
                  </div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">签章区（可选）</div>
                <div class="form-row">
                  <div class="form-group">
                    <div class="form-label">显示买卖双方信息区块</div>
                    <el-switch v-model="visual.showPartyBlock" />
                    <div class="tpl-insert-hint mt6">
                      这里通常填写固定公司信息，按实际合同内容直接录入即可。
                    </div>
                  </div>
                </div>
                <div v-if="visual.showPartyBlock" class="party-editor-box mt12">
                  <div class="header-editor-col">
                    <div class="form-label header-col-caption">卖方</div>
                    <div v-for="(item, pi) in visual.partySellerItems" :key="'party-seller-' + pi" class="header-item-row">
                      <el-input v-model="item.label" class="header-item-label" placeholder="字段名称" clearable />
                      <span class="header-item-sep">：</span>
                      <el-input v-model="item.value" class="header-item-value" :placeholder="partyValuePlaceholder(item)" clearable />
                      <el-button type="danger" plain size="small" class="header-item-remove" @click="removePartyItem('seller', pi)">－</el-button>
                    </div>
                    <el-button size="small" class="mt6" @click="addPartyItem('seller')">＋ 添加卖方字段</el-button>
                  </div>
                  <div class="header-editor-col">
                    <div class="form-label header-col-caption">买方</div>
                    <div v-for="(item, pi) in visual.partyBuyerItems" :key="'party-buyer-' + pi" class="header-item-row">
                      <el-input v-model="item.label" class="header-item-label" placeholder="字段名称" clearable />
                      <span class="header-item-sep">：</span>
                      <el-input v-model="item.value" class="header-item-value" :placeholder="partyValuePlaceholder(item)" clearable />
                      <el-button type="danger" plain size="small" class="header-item-remove" @click="removePartyItem('buyer', pi)">－</el-button>
                    </div>
                    <el-button size="small" class="mt6" @click="addPartyItem('buyer')">＋ 添加买方字段</el-button>
                  </div>
                </div>
                <p v-if="visual.showPartyBlock" class="tpl-insert-hint mt6">
                  可修改字段名称与内容；点「－」删除该行后，保存的合同正文中不再显示该项。留空的「单位」仍可按公司抬头/客户名称占位。
                </p>
              </div>

              <el-collapse class="tpl-advanced-collapse">
                <el-collapse-item name="adv">
                  <template #title>
                    <span class="tpl-advanced-title">技术说明（一般不用打开）</span>
                  </template>
                  <p class="tpl-advanced-p" v-pre>
                    占位符均为「双大括号 + 英文代号」。必须与按钮插入的拼写完全一致；卖方公司名称来自「企业信息」；买方信息来自客户档案；编号与签订日期在生成合同草稿时写入。
                    订单明细表（编辑时）：品名、型号、单价（元）、不含税单价（元）、单位（吨）、数量（桶）、不含税金额（元）、税率、税额（元）、价税合计（元）。保存/落库的合同正文会自动去掉「单价」列。生成草稿时：订单 unit_price 视为含税单价（元/吨，订单列表以元/kg 展示），税率默认 13%（可用订单 tax_rate / vat_rate，支持 0.13 或 13 或 13%）；不含税单价=单价÷(1+税率)，不含税金额=不含税单价×吨，价税合计=单价×吨，税额=价税合计−不含税金额；单位（吨）=数量×规格（千克列加 kg 等后缀时换算为吨），均为两位小数四舍五入。
                  </p>
                </el-collapse-item>
              </el-collapse>
            </fieldset>
            </template>

            <template v-else-if="!isContractMode && editMode === 'raw'">
              <el-form-item label="插入字段">
                <div class="tpl-insert-row">
                  <el-button size="small" @click="insertTplToken('COMPANY_NAME_ZH')">＋ 卖方公司</el-button>
                  <el-button size="small" @click="insertTplToken('CUSTOMER_NAME')">＋ 买方名称</el-button>
                  <el-button size="small" @click="insertTplToken('CUSTOMER_ADDRESS')">＋ 买方地址</el-button>
                  <el-button size="small" @click="insertTplToken('CUSTOMER_CONTACT')">＋ 买方联系人</el-button>
                  <el-button size="small" @click="insertTplToken('CUSTOMER_PHONE')">＋ 买方电话</el-button>
                </div>
                <div class="tpl-insert-row mt6">
                  <el-button size="small" @click="insertTplToken('CONTRACT_NO')">＋ 合同编号</el-button>
                  <el-button size="small" @click="insertTplToken('SIGN_DATE_ZH')">＋ 签订日期</el-button>
                  <el-button size="small" @click="insertTplToken('ORDER_LINES')">＋ 订单明细表</el-button>
                  <el-button size="small" @click="insertTplToken('AMOUNT_TOTAL')">＋ 合计（数字）</el-button>
                  <el-button size="small" @click="insertTplToken('AMOUNT_TOTAL_CN')">＋ 合计（大写）</el-button>
                </div>
                <div class="tpl-insert-hint">在正文中点击后再插入，可定位到光标处；勿手改双大括号内的英文代号。</div>
              </el-form-item>
              <el-form-item label="合同正文" required>
                <el-input
                  ref="bodyInputRef"
                  v-model="form.body_html"
                  type="textarea"
                  :rows="22"
                  placeholder="新建时可先选上方「推荐版式」或「套用模板」"
                  class="body-textarea"
                  spellcheck="false"
                />
              </el-form-item>
            </template>
          </el-form>
        </div>

        <div class="preview-panel-modern">
          <div class="preview-title">{{ isContractMode ? '合同预览' : '生成效果示例' }}</div>
          <div class="preview-note">
            {{ isContractMode ? '未替换的占位符仍会套示例数据；已填入的订单与客户信息为真实内容' : '虚构数据，仅用于核对版式' }}
          </div>
          <div class="preview-container">
            <div class="preview-a4-scaler">
              <div class="preview-a4" v-html="previewHtml" />
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- 版本历史 Tab -->
      <div v-if="activeTab === 'versions' && isContractMode">
        <div class="versions-panel">
          <el-table :data="versions" style="width: 100%" v-if="versions.length">
            <el-table-column label="版本" prop="version_num" width="80" />
            <el-table-column label="变更摘要" prop="change_summary" />
            <el-table-column label="创建时间" prop="created_at" width="160" />
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button size="small" @click="showVersionDiff(row.version_num - 1, row.version_num)">对比上一版</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无版本记录" />
        </div>

        <!-- Diff 弹窗 -->
        <el-dialog v-model="showDiffDialog" title="版本对比" width="70%" :destroy-on-close="true">
          <ContractVersionDiff v-if="currentDiff" :diff="currentDiff" @close="showDiffDialog = false" />
        </el-dialog>
      </div>

      <!-- 审批流程 Tab - 美化后的可视化 Timeline + 电子签章画板 -->
      <div v-if="activeTab === 'approval' && isContractMode && hasMultiApprovePerm">
        <div class="approval-panel">
          <el-alert type="info" show-icon :closable="false" style="margin-bottom: 16px;">
            多级审批可视化流程 + 电子签章。支持顺序、并行、会签。签章画板支持鼠标/触屏绘制，保存后可盖章到PDF。
          </el-alert>

          <!-- 可视化审批 Timeline -->
          <div class="timeline-section">
            <h4 class="section-title">审批流程 Timeline</h4>
            <el-timeline>
              <el-timeline-item v-for="(step, i) in approvalSteps" :key="i" 
                               :timestamp="`步骤 ${step.step_order} - ${step.step_type === 'countersign' ? '会签' : step.step_type === 'parallel' ? '并行' : '顺序'}`"
                               :color="step.status === 'approved' ? '#67C23A' : step.status === 'rejected' ? '#F56C6C' : '#409EFF'">
                <div>
                  <strong>审批人：</strong> {{ Array.isArray(step.approvers_json) ? step.approvers_json.join(', ') : step.approvers_json }}
                  <br>
                  <strong>要求：</strong> {{ step.required_approvals }} 人通过
                  <br>
                  <el-tag v-if="step.status" :type="step.status === 'approved' ? 'success' : 'danger'">{{ step.status === 'approved' ? '已通过' : '待审批' }}</el-tag>
                </div>
              </el-timeline-item>
            </el-timeline>
          </div>

          <!-- 电子签章画板 -->
          <div class="signature-section mt24">
            <h4 class="section-title">电子签章画板</h4>
            <SignaturePad :contractId="numericContractId" @signature-saved="onSignatureSaved" />
          </div>

          <div class="actions-bar mt24">
            <el-button type="primary" @click="setupDefaultApprovalFlow">初始化多级审批流</el-button>
            <el-button @click="refreshApprovalSteps" icon=Refresh>刷新流程</el-button>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script>
import { perm } from '../utils/permissions';
import { http } from '../api/http';
import {
  listContractTemplates,
  getContractTemplate,
  createContractTemplate,
  updateContractTemplate,
  getSalesContract,
  patchSalesContract,
  replaceSalesContractDocument,
  downloadSalesContractDocument,
  lookupInternalModelProductName
} from '../api';
import { startDownload } from '../composables/useDownloadProgress.js';
import ContractVersionDiff from '../components/ContractVersionDiff.vue';
import SignaturePad from '../components/SignaturePad.vue';
import { BLANK_TPL_BODY } from '../utils/contractTemplateDefaults';
import { createDefaultVisual, CONTRACT_ORDER_LINE_HEADERS, CONTRACT_ORDER_LINE_HEADERS_FINAL } from '../utils/contractVisualDefaults';
import { parseContractHtmlToVisual } from '../utils/contractBodyToVisual';
import {
  applyContractVisualSnapshot,
  buildContractVisualSnapshot,
  contractVisualFromDataJson
} from '../utils/contractVisualSnapshot';
import {
  buildTableTotalTextFromEditorRows,
  editorRowsFromContractOrders,
  enrichVisualOrderLinesFromContractOrders,
  patchEditorOrderLineCalcColumns,
  isOrderLineTriggerColumn,
  ORDER_LINE_COL
} from '../utils/contractOrderLineCalc';
import { evaluateFormulaInWorker } from '../utils/formulaWorker';
import { getCurrentOrderCalcRule, getCurrentTotalAmountTargetColIndex, getCurrentDecimalPlaces, getCurrentRoundingMode, sortFormulasByDependency } from '../utils/orderCalcRuleStore';
import { setRoundingConfig } from '../utils/contractOrderLineCalc';
import {
  finalizeContractBodyForPreview,
  CONTRACT_PREVIEW_TITLE_FONT
} from '../utils/contractPreviewHtml';
import {
  createEmptyPartyItem,
  ensurePartyItemsOnVisual,
  PARTY_FALLBACK_COMPANY,
  PARTY_FALLBACK_CUSTOMER,
  renderPartyItemsInnerHtml
} from '../utils/contractPartyItems';
import {
  ORDER_LINES_CELL_NOWRAP,
  ORDER_LINES_CELL_STYLE,
  orderLinesTableOpenTag
} from '../utils/contractOrderLinesTableStyle';

export default {
  name: 'ContractTemplateEdit',
  props: {
    id: {
      type: [String, Number],
      default: null
    },
    /** 有值时表示编辑已生成的销售合同（走合同保存接口） */
    contractId: {
      type: [String, Number],
      default: null
    }
  },
  data() {
    return {
      form: { name: '', body_html: '' },
      saving: false,
      templates: [],
      templatesLoading: false,
      selectedTemplateId: null,
      /** visual | raw（合同编辑仅可视化） */
      editMode: 'visual',
      visual: createDefaultVisual(),
      /** 合同关联订单（预览明细表、占位符替换） */
      contractOrders: [],
      /** 占位符预览用：客户/编号/卖方公司名等 */
      contractPreviewVars: null,
      /** 正文无法还原为可视化表单时锁定左侧表单，避免用空模板覆盖数据库正文 */
      contractParseFailed: false,
      /** 上传的 PDF/Word 正文合同（非模板 HTML） */
      isUploadContract: false,
      uploadContractDocName: '',
      // 新增：版本 Diff + 多级审批
      activeTab: 'content',
      versions: [],
      currentDiff: null,
      approvalSteps: [],
      hasMultiApprovePerm: false,
      showDiffDialog: false
      ,
      // 公式
      formulaText: '',
      formulaTargetColIndex: 3,
      formulas: [],
      formulaPreview: '',
      savedCurrentRule: null,
      needsFormulaSave: false
    };
  },
  computed: {
    orderLineHeaders() {
      return CONTRACT_ORDER_LINE_HEADERS;
    },
    orderLineHeadersWithLetters() {
      return this.orderLineHeaders.map((name, index) => ({
        header: name,
        letter: String.fromCharCode(65 + index)
      }));
    },
    formulaRuleLetters() {
      return this.formulas.length > 0
        ? this.formulas.map((f) => {
            const target = this.orderLineHeadersWithLetters[f.targetColIndex];
            if (!target) return f.formulaText;
            return `${target.letter} = ${f.formulaText}`;
          }).join('； ')
        : '';
    },
    formulaRuleHeaders() {
      return this.formulas.length > 0
        ? this.formulas.map((f) => {
            const hdrs = this.orderLineHeadersWithLetters.reduce((acc, item) => {
              const letterReg = new RegExp(`\\b${item.letter}\\b`, 'g');
              return acc.replace(letterReg, item.header);
            }, f.formulaText);
            const target = this.orderLineHeadersWithLetters[f.targetColIndex];
            if (!target) return hdrs;
            return `${target.header} = ${hdrs}`;
          }).join('； ')
        : '';
    },
    builtInCalcRuleLetters() {
      return this.formulaRuleLetters || [
        'D = ROUND(C / (1 + H), 2)',
        'G = D * E',
        'J = C * E',
        'I = J - G'
      ].join('； ');
    },
    builtInCalcRuleHeaders() {
      return this.formulaRuleHeaders || [
        '不含税单价 = ROUND(含税单价 / (1 + 税率), 2)',
        '不含税金额 = 不含税单价 × 吨',
        '价税合计 = 含税单价 × 吨',
        '税额 = 价税合计 - 不含税金额'
      ].join('； ');
    },
    orderLineTotalDisplay() {
      return (this.visual?.tableTotalText || '').trim() || '{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）';
    },
    numericContractId() {
      if (this.contractId == null || this.contractId === '') return null;
      const n = Number(this.contractId);
      return Number.isInteger(n) && n > 0 ? n : null;
    },
    isContractMode() {
      return this.numericContractId != null;
    },
    hasVersionPerm() {
      return this.perm('contract_management', 'contract_version_view');
    },
    hasMultiApprovePerm() {
      return this.perm('contract_management', 'contract_multi_approve');
    },
    isNew() {
      if (this.isContractMode) return false;
      return this.id == null || this.id === '' || Number.isNaN(Number(this.id));
    },
    numericId() {
      if (this.isContractMode) return null;
      const n = Number(this.id);
      return Number.isInteger(n) && n > 0 ? n : null;
    },
    routeEditKey() {
      return `${this.contractId ?? ''}|${this.id ?? ''}`;
    },
    effectiveTotalAmountTargetColIndex() {
      const fromVisual = this.visual?.totalAmountTargetColIndex;
      if (Number.isFinite(Number(fromVisual))) return Number(fromVisual);
      return getCurrentTotalAmountTargetColIndex();
    },
    roundingCfg() {
      return {
        decimalPlaces: getCurrentDecimalPlaces(),
        roundingMode: getCurrentRoundingMode()
      };
    },
    /** 合同且正文未能拆成表单：锁定可视化字段，避免误操作覆盖原文 */
    contractBodyPreserveLocked() {
      return this.isContractMode && this.contractParseFailed;
    },
    previewHtml() {
      const vars = this.contractPreviewVars;
      if (this.isContractMode && this.contractParseFailed) {
        return finalizeContractBodyForPreview(this.form.body_html, this.contractOrders, vars);
      }
      const useVisual = this.editMode === 'visual' || this.isContractMode;
      const html = useVisual ? this.visualToBodyHtml() : this.form.body_html;
      if (!useVisual) return html.replace(/{{[^}]+}}/g, '');
      const totalDisplay = String(this.visual?.tableTotalText || '').trim() || '{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）';
      const withVisualLines = String(html || '')
        .replaceAll(
          '{{ORDER_LINES}}',
          this.buildVisualTableHtml(this.isContractMode ? { forContractPersist: true } : {})
        )
        .replaceAll('{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）', totalDisplay);
      if (this.isContractMode) {
        return finalizeContractBodyForPreview(withVisualLines, [], vars, {
          skipOrderLinesFromOrders: true
        });
      }
      return withVisualLines.replace(/{{[^}]+}}/g, '');
    }
  },
  watch: {
    routeEditKey: {
      immediate: true,
      handler() {
        this.initFromRoute();
      }
    },
    editMode() {
      if (this.editMode === 'visual') {
        if (!(this.isContractMode && this.contractParseFailed)) {
          this.form.body_html = this.visualToBodyHtml();
        }
      }
    },
    visual: {
      deep: true,
      handler() {
        if (this.editMode !== 'visual' && !this.isContractMode) return;
        if (this.isContractMode && this.contractParseFailed) return;
        if (this.isContractMode) {
          this.syncContractBodyHtmlFromVisual();
        } else if (this.editMode === 'visual') {
          this.form.body_html = this.visualToBodyHtml();
        }
      }
    }
  },
  beforeUnmount() {
    if (!this._orderLineRecalcTimers) return;
    for (const t of Object.values(this._orderLineRecalcTimers)) {
      clearTimeout(t);
    }
    this._orderLineRecalcTimers = null;
  },
  methods: {
    perm,
    async loadVersions() {
      if (!this.isContractMode) return;
      try {
        const res = await http.get(`/api/sales/contracts/${this.numericContractId}/versions`);
        this.versions = res.data.items || [];
      } catch (e) {
        console.warn('加载版本历史失败', e);
        this.versions = [];
      }
    },

    showVersionDiff(v1, v2) {
      const minV = Math.min(v1, v2);
      const maxV = Math.max(v1, v2);
      http.get(`/api/sales/contracts/${this.numericContractId}/versions/${minV}/${maxV}/diff`)
        .then(res => {
          this.currentDiff = res.data;
          this.showDiffDialog = true;
          this.$message.success(`已加载 v${minV} → v${maxV} 对比`);
        })
        .catch(err => {
          this.$message.error('获取 Diff 失败');
          console.error(err);
        });
    },

    handleTabClick(tab) {
      if (tab.paneName === 'versions') {
        this.loadVersions();
      } else if (tab.paneName === 'approval') {
        this.loadApprovalSteps();
      }
    },

    async loadApprovalSteps() {
      if (!this.isContractMode) return;
      try {
        const res = await http.get(`/api/sales/contracts/${this.numericContractId}/approval-flow`);
        this.approvalSteps = res.data?.steps || res.data || [];
      } catch (e) {
        console.warn('加载审批步骤失败', e);
        this.approvalSteps = [];
      }
    },
    async refreshApprovalSteps() {
      await this.loadApprovalSteps();
      this.$message.success('审批流程已刷新');
    },

    setupDefaultApprovalFlow() {
      const defaultSteps = [
        { type: 'sequential', approvers: [1, 2], required: 1 }, // 销售主管
        { type: 'countersign', approvers: [3, 4], required: 2 }  // 财务会签
      ];
      http.post(`/api/sales/contracts/${this.numericContractId}/approval-flow`, { steps: defaultSteps })
        .then(() => {
          this.$message.success('默认审批流已设置');
          this.loadApprovalSteps();
        })
        .catch(err => this.$message.error('设置失败'));
    },

    onSignatureSaved(signatureUrl) {
      if (signatureUrl) {
        this.$message.success('签章已保存');
      }
    },

    unlockContractVisualReplaceBody() {
      this.$confirm(
        '将用「推荐版式」的空表单替换当前合同正文，当前排版与文字会丢失。确定继续吗？',
        '改用推荐版式',
        { type: 'warning' }
      )
        .then(() => {
          this.contractParseFailed = false;
          this.editMode = 'visual';
          this.visual = createDefaultVisual();
          this.form.body_html = this.visualToBodyHtml();
          this.$message.success('已切换为推荐版式，可编辑正文后保存');
        })
        .catch(() => {});
    },
    goBack() {
      if (this.isContractMode) {
        this.$router.push({ path: '/sales/contracts', query: { tab: 'list' } });
      } else {
        this.$router.push({ path: '/sales/contracts', query: { tab: 'tpl' } });
      }
    },
    goTemplateList() {
      this.goBack();
    },
    async initFromRoute() {
      this.contractOrders = [];
      this.contractPreviewVars = null;
      this.contractParseFailed = false;
      this.isUploadContract = false;
      this.uploadContractDocName = '';
      if (this.numericContractId) {
        await this.loadContractOne();
        return;
      }
      if (this.isNew) {
        this.editMode = 'visual';
        this.visual = createDefaultVisual();
        this.form = { name: '', body_html: this.visualToBodyHtml() };
        this.selectedTemplateId = null;
        await this.loadTemplateList();
        return;
      }
      await this.loadOne();
    },
    async loadContractOne() {
      if (!this.numericContractId) {
        this.$message.error('无效合同');
        this.goBack();
        return;
      }
      try {
        const d = await getSalesContract(this.numericContractId);
        const c = d?.contract;
        if (!c?.id) {
          this.$message.error('合同不存在');
          this.goBack();
          return;
        }
        if (c.contract_source === 'upload') {
          this.isUploadContract = true;
          this.uploadContractDocName = c.document_original_filename != null ? String(c.document_original_filename) : '';
          this.form = {
            name: c.title != null ? String(c.title) : '',
            body_html: ''
          };
          return;
        }
        this.isUploadContract = false;
        this.uploadContractDocName = '';
        const title = c.title != null ? String(c.title) : '';
        const html = c.body_html != null ? String(c.body_html) : '';
        this.contractOrders = d.orders || [];
        this.contractPreviewVars = {
          CUSTOMER_NAME: c.customer_name != null ? String(c.customer_name) : '',
          CUSTOMER_ADDRESS: c.customer_address != null ? String(c.customer_address) : '',
          CUSTOMER_CONTACT: c.customer_contact != null ? String(c.customer_contact) : '',
          CUSTOMER_PHONE: c.customer_phone != null ? String(c.customer_phone) : '',
          CUSTOMER_FAX: c.customer_fax != null ? String(c.customer_fax) : '',
          CUSTOMER_BANK: c.customer_bank != null ? String(c.customer_bank) : '',
          CUSTOMER_ACCOUNT: c.customer_account != null ? String(c.customer_account) : '',
          CUSTOMER_TAX_ID: c.customer_tax_id != null ? String(c.customer_tax_id) : '',
          CONTRACT_NO: c.contract_no != null ? String(c.contract_no) : '',
          COMPANY_NAME_ZH: c.company_name_zh != null ? String(c.company_name_zh) : ''
        };
        const base = createDefaultVisual();
        const TPL_OUTER_WRAP =
          '<div style="font-family:SimSun,宋体;line-height:1.8;font-size:14px;color:#000">';
        let parsed = parseContractHtmlToVisual(html, base);
        if (!parsed) {
          parsed = parseContractHtmlToVisual(`${TPL_OUTER_WRAP}${html}</div>`, base);
        }
        const visualSnap = contractVisualFromDataJson(c.data_json);
        if (parsed && visualSnap) {
          parsed = applyContractVisualSnapshot(parsed, visualSnap);
        } else if (!parsed && visualSnap) {
          parsed = applyContractVisualSnapshot(createDefaultVisual(), visualSnap);
        }
        if (parsed) {
          this.contractParseFailed = false;
            this.visual = parsed;
            // 将已保存的公式同步到 UI
            this.formulaText = String(this.visual.formulaText || '');
            this.formulaTargetColIndex = Number.isFinite(Number(this.visual.formulaTargetColIndex)) ? Number(this.visual.formulaTargetColIndex) : this.formulaTargetColIndex;
            this.formulas = Array.isArray(this.visual.formulas) ? this.visual.formulas.map(f => ({ ...f })) : [];
          this.normalizePartyVisual();
          this.autoFillBuyerFromCustomer();
          this.ensureTableRowSpecsLength();
          const modelProductMap = await this.buildModelProductNameMap(this.contractOrders);
          enrichVisualOrderLinesFromContractOrders(this.visual, this.contractOrders, getCurrentTotalAmountTargetColIndex(), modelProductMap);
          await this.loadCurrentSavedOrderCalcRule();
          // 应用已保存的公式规则（若有）
          const hadFormulasBefore = Array.isArray(this.visual?.formulas) && this.visual.formulas.length > 0;
          await this.applySavedFormulaRules();
          const hasFormulasNow = Array.isArray(this.visual?.formulas) && this.visual.formulas.length > 0;
          if (hasFormulasNow && !hadFormulasBefore) {
            this.needsFormulaSave = true;
          }
          this.editMode = 'visual';
          this.form.name = title;
          this.syncContractBodyHtmlFromVisual();
          if (this.needsFormulaSave) {
            this.needsFormulaSave = false;
            try {
              const payload = {
                body_html: this.form.body_html,
                contract_visual: (await import('../utils/contractVisualSnapshot')).buildContractVisualSnapshot(this.visual)
              };
              const { patchSalesContract } = await import('../api');
              await patchSalesContract(this.numericContractId, payload);
            } catch (_e) {
              // 静默：公式保存失败不影响编辑器使用，用户可手动保存
            }
          }
        } else {
          this.contractParseFailed = true;
          this.visual = createDefaultVisual();
          this.normalizePartyVisual();
          this.autoFillBuyerFromCustomer();
          this.editMode = 'visual';
          this.form = { name: title, body_html: this.patchBuyerInBodyHtml(html) };
          this.$message.warning(
            '当前正文无法拆成标准表单，已锁定左侧表单项；右侧为真实合同预览。可改标题后保存，或点「改用推荐版式」再编辑正文。'
          );
        }
      } catch {
        this.$message.error('加载合同失败');
        this.goBack();
      }
    },
    async loadTemplateList() {
      this.templatesLoading = true;
      try {
        const d = await listContractTemplates();
        this.templates = d.items || [];
      } catch {
        this.templates = [];
      } finally {
        this.templatesLoading = false;
      }
    },
    /**
     * 将已保存的 HTML 同步到左侧可视化模型；失败则切到源码编辑，避免「可视化仍是空表单却保存了库里旧 HTML」。
     * @returns {boolean} 是否成功解析为可视化
     */
    async syncTemplateBodyToVisualState(html) {
      const h = String(html || '');
      const base = createDefaultVisual();
      const TPL_OUTER_WRAP =
        '<div style="font-family:SimSun,宋体;line-height:1.8;font-size:14px;color:#000">';
      let parsed = parseContractHtmlToVisual(h, base);
      if (!parsed) {
        parsed = parseContractHtmlToVisual(`${TPL_OUTER_WRAP}${h}</div>`, base);
      }
      if (parsed) {
        this.visual = parsed;
        // 将已保存的公式同步到 UI
        this.formulaText = String(this.visual.formulaText || '');
        this.formulaTargetColIndex = Number.isFinite(Number(this.visual.formulaTargetColIndex)) ? Number(this.visual.formulaTargetColIndex) : this.formulaTargetColIndex;
        this.formulas = Array.isArray(this.visual.formulas) ? this.visual.formulas.map(f => ({ ...f })) : [];
        this.normalizePartyVisual();
        this.editMode = 'visual';
        await this.applySavedFormulaRules();
        this.form.body_html = this.visualToBodyHtml();
        return true;
      }
      this.visual = createDefaultVisual();
      this.normalizePartyVisual();
      this.editMode = 'raw';
      this.form.body_html = h;
      return false;
    },
    async loadOne() {
      if (!this.numericId) {
        this.$message.error('无效模板');
        this.goBack();
        return;
      }
      try {
        const d = await getContractTemplate(this.numericId);
        const t = d.template;
        this.form = { name: t.name || '', body_html: '' };
        const ok = await this.syncTemplateBodyToVisualState(t.body_html || '');
        if (!ok) {
          this.$message.warning(
            '当前模板正文无法拆成可视化表单，已切换到源码编辑；请直接修改 HTML 后保存。'
          );
        }
      } catch {
        this.$message.error('加载失败');
        this.goBack();
      }
    },
    async applySelectedTemplate() {
      if (!this.selectedTemplateId) return;
      try {
        const d = await getContractTemplate(this.selectedTemplateId);
        const t = d.template;
        const apply = async () => {
          this.form.body_html = t.body_html || '';
          if (!this.form.name?.trim() && t.name) {
            this.form.name = `${t.name}（副本）`;
          }
          if (this.editMode === 'visual') {
            const ok = await this.syncTemplateBodyToVisualState(this.form.body_html);
            if (!ok) {
              this.$message.warning('套用后的正文无法拆成可视化表单，已切换到源码编辑。');
            }
          }
        };
        if ((this.form.body_html || '').trim()) {
          await this.$confirm('套用模板将覆盖当前正文，确定吗？', '提示', { type: 'warning' });
        }
        await apply();
        this.$message.success('已套用');
      } catch {
        this.$message.error('加载模板失败');
      }
    },
    startRecommended() {
      const cur = (this.form.body_html || '').trim();
      const recommendedBody = this.visualToBodyHtml();
      const apply = () => {
        this.editMode = 'visual';
        this.visual = createDefaultVisual();
        this.form.body_html = this.visualToBodyHtml();
      };
      if (cur && cur !== recommendedBody.trim()) {
        this.$confirm('将用推荐版式覆盖当前正文，确定吗？', '提示', { type: 'warning' })
          .then(apply)
          .catch(() => {});
        return;
      }
      apply();
    },
    startBlank() {
      const cur = (this.form.body_html || '').trim();
      const apply = () => {
        this.editMode = 'raw';
        this.form.body_html = BLANK_TPL_BODY;
      };
      if (cur) {
        this.$confirm('将清空为空白正文，确定吗？', '提示', { type: 'warning' })
          .then(apply)
          .catch(() => {});
        return;
      }
      apply();
    },
    appendToVisual(key, token) {
      const k = String(key || '');
      if (!k) return;
      const cur = this.visual?.[k];
      const next = (cur == null ? '' : String(cur)) + String(token || '');
      this.visual = { ...this.visual, [k]: next };
    },
    _bodyTextareaEl() {
      const comp = this.$refs.bodyInputRef;
      if (!comp) return null;
      const ta = comp.textarea;
      const el = ta && typeof ta === 'object' && 'value' in ta ? ta.value : ta;
      return el instanceof HTMLTextAreaElement ? el : comp.$el?.querySelector?.('textarea') || null;
    },
    insertTplToken(key) {
      const token = `{{${key}}}`;
      if (this.editMode === 'visual') {
        const msg = this.isContractMode
          ? '合同由表单与订单数据自动生成版式，一般无需手写占位符。'
          : '可视化模式下已可用占位符；如需精确位置，请切到「源码编辑」插入。';
        this.$message?.info?.(msg);
        return;
      }
      const el = this._bodyTextareaEl();
      const cur = this.form.body_html ?? '';
      if (!el || el.selectionStart == null) {
        this.form.body_html = cur + token;
        return;
      }
      const start = el.selectionStart;
      const end = el.selectionEnd;
      this.form.body_html = cur.slice(0, start) + token + cur.slice(end);
      this.$nextTick(() => {
        try {
          el.focus();
          const pos = start + token.length;
          el.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
      });
    },
    addVisualTableColumn() {
      // 订单明细表列与后端生成合同保持一致，列数固定
    },
    removeVisualTableColumn() {
      // 订单明细表列与后端生成合同保持一致，列数固定
    },
    isOrderLineTriggerColumn,
    orderLineCellPlaceholder(cj) {
      if (cj === ORDER_LINE_COL.GROSS_UNIT) return '含税单价/吨';
      if (cj === ORDER_LINE_COL.QTY) return '桶数';
      if (cj === ORDER_LINE_COL.PRODUCT_NAME) return '品名';
      if (cj === ORDER_LINE_COL.MODEL) return '型号';
      if (cj === ORDER_LINE_COL.NET_UNIT) return '不含税单价';
      if (cj === ORDER_LINE_COL.TONS) return '吨';
      if (cj === ORDER_LINE_COL.NET_AMOUNT) return '不含税金额';
      if (cj === ORDER_LINE_COL.TAX_RATE) return '如 13%';
      if (cj === ORDER_LINE_COL.TAX_AMOUNT) return '税额';
      if (cj === ORDER_LINE_COL.TOTAL) return '价税合计';
      return '';
    },
    onOrderLineCellInput(ri, cj) {
      if (this.contractParseFailed) return;
      if (cj === ORDER_LINE_COL.MODEL) {
        this.scheduleModelToProductNameLookup(ri, cj);
      }
      if (!isOrderLineTriggerColumn(cj)) return;
      this.scheduleOrderLineRowRecalc(ri, cj);
    },
    onOrderLineCellChange(ri, cj) {
      if (this.contractParseFailed) return;
      if (cj === ORDER_LINE_COL.MODEL) {
        this.flushModelToProductNameLookup(ri);
        this.lookupModelToProductName(ri);
      }
      if (!isOrderLineTriggerColumn(cj)) return;
      this.flushOrderLineRowRecalc(ri);
      this.recalcOrderLineRow(ri, cj);
    },
    scheduleModelToProductNameLookup(ri) {
      if (!this._modelLookupTimers) this._modelLookupTimers = {};
      clearTimeout(this._modelLookupTimers[ri]);
      this._modelLookupTimers[ri] = setTimeout(() => {
        delete this._modelLookupTimers[ri];
        this.lookupModelToProductName(ri);
      }, 400);
    },
    flushModelToProductNameLookup(ri) {
      if (!this._modelLookupTimers) return;
      clearTimeout(this._modelLookupTimers[ri]);
      delete this._modelLookupTimers[ri];
    },
    async lookupModelToProductName(ri) {
      if (this.contractParseFailed) return;
      const row = this.visual.tableRows?.[ri];
      if (!row) return;
      const model = String(row[ORDER_LINE_COL.MODEL] ?? '').trim().toUpperCase();
      if (!model) return;
      try {
        const result = await lookupInternalModelProductName(model);
        if (result && result.product_name) {
          row[ORDER_LINE_COL.PRODUCT_NAME] = result.product_name;
          this.visual.tableRows.splice(ri, 1, [...row]);
        }
      } catch { /* 静默 */ }
    },
    scheduleOrderLineRowRecalc(ri, editedCol) {
      if (!this._orderLineRecalcTimers) this._orderLineRecalcTimers = {};
      const key = `${ri}:${editedCol}`;
      clearTimeout(this._orderLineRecalcTimers[key]);
      this._orderLineRecalcTimers[key] = setTimeout(() => {
        delete this._orderLineRecalcTimers[key];
        this.recalcOrderLineRow(ri, editedCol);
      }, 200);
    },
    flushOrderLineRowRecalc(ri) {
      if (!this._orderLineRecalcTimers) return;
      for (const k of Object.keys(this._orderLineRecalcTimers)) {
        if (k.startsWith(`${ri}:`)) {
          clearTimeout(this._orderLineRecalcTimers[k]);
          delete this._orderLineRecalcTimers[k];
        }
      }
    },
    recalcOrderLineRow(ri, editedCol = null) {
      if (this.contractParseFailed) return;
      const specs = this.visual.tableRowSpecs || [];
      const row = this.visual.tableRows?.[ri];
      if (!row) return;
      const patched = patchEditorOrderLineCalcColumns(row, {
        orderSpecText: specs[ri],
        editedCol
      });
      this.visual.tableRows.splice(ri, 1, patched);
      const totalText = buildTableTotalTextFromEditorRows(this.visual.tableRows, getCurrentTotalAmountTargetColIndex());
      if (totalText) {
        this.visual.tableTotalText = totalText;
      }
    },
    recalcAllOrderLines() {
      if (this.contractParseFailed) return;
      const specs = this.visual.tableRowSpecs || [];
      this.visual.tableRows = (this.visual.tableRows || []).map((row, ri) =>
        patchEditorOrderLineCalcColumns(row, {
          orderSpecText: specs[ri],
          editedCol: ORDER_LINE_COL.GROSS_UNIT
        })
      );
      this.visual.tableTotalText = buildTableTotalTextFromEditorRows(this.visual.tableRows, getCurrentTotalAmountTargetColIndex());
      this.$message.success('已按单价重算');
    },
    async applyFormulasToRow(row, formulas) {
      let next = Array.isArray(row) ? [...row] : Array.from({ length: this.orderLineHeaders.length }, () => '');
      const sorted = sortFormulasByDependency(formulas);
      for (const f of sorted) {
        if (!f.formulaText) continue;
        const val = await evaluateFormulaInWorker(f.formulaText, next, this.roundingCfg.decimalPlaces, this.roundingCfg.roundingMode);
        next[f.targetColIndex] = val;
      }
      return next;
    },
    async previewFormula() {
      const formulas = this.formulas.filter(f => f.formulaText.trim());
      if (!formulas.length || !this.visual.tableRows || !this.visual.tableRows.length) {
        this.formulaPreview = '';
        this.$message.warning('请先输入公式并确保表中有行');
        return;
      }
      const sample = this.visual.tableRows[0] || [];
      try {
        const updated = await this.applyFormulasToRow(sample, formulas);
        const lastFormula = formulas[formulas.length - 1];
        this.formulaPreview = updated[lastFormula.targetColIndex];
        if (!this.visual) this.visual = {};
        this.visual.formulas = formulas.map(f => ({ formulaText: f.formulaText, targetColIndex: f.targetColIndex }));
        this.visual.formulaText = formulas[0].formulaText;
        this.visual.formulaTargetColIndex = formulas[0].targetColIndex;
        this.$message.info('已生成首行预览');
      } catch (e) {
        this.formulaPreview = '';
        this.$message.error('公式预览失败');
      }
    },
    async applyFormulaToAll() {
      const formulas = this.formulas.filter(f => f.formulaText.trim());
      if (!formulas.length) {
        this.$message.warning('请先输入公式');
        return;
      }
      if (!Array.isArray(this.visual.tableRows) || !this.visual.tableRows.length) {
        this.$message.warning('表中无数据');
        return;
      }
      if (!this.visual) this.visual = {};
      this.visual.formulas = formulas.map(f => ({ formulaText: f.formulaText, targetColIndex: f.targetColIndex }));
      this.visual.formulaText = formulas[0].formulaText;
      this.visual.formulaTargetColIndex = formulas[0].targetColIndex;

      const sorted = sortFormulasByDependency(formulas);
      let currentRows = this.visual.tableRows.map(row => Array.isArray(row) ? [...row] : []);
      for (const f of sorted) {
        if (!f.formulaText) continue;
        const results = await Promise.all(
          currentRows.map((row) => evaluateFormulaInWorker(f.formulaText, row, this.roundingCfg.decimalPlaces, this.roundingCfg.roundingMode))
        );
        currentRows = currentRows.map((row, ri) => {
          const next = [...row];
          next[f.targetColIndex] = results[ri];
          return next;
        });
      }
      this.visual.tableRows = currentRows;
      this.visual.tableTotalText = buildTableTotalTextFromEditorRows(currentRows, getCurrentTotalAmountTargetColIndex());
      this.$message.success('公式已应用到全部行');
    },
    async loadCurrentSavedOrderCalcRule() {
      const rule = getCurrentOrderCalcRule();
      if (!rule) {
        const fallbackDp = this.visual?.decimalPlaces ?? 2;
        const fallbackRm = this.visual?.roundingMode ?? 'round';
        setRoundingConfig(fallbackDp, fallbackRm);
        return;
      }
      this.savedCurrentRule = rule;
      const ruleFormulas = rule.formulas && rule.formulas.length > 0
        ? rule.formulas.map(f => ({ formulaText: f.formulaText, targetColIndex: f.targetColIndex }))
        : [{ formulaText: rule.formulaText || '', targetColIndex: rule.formulaTargetColIndex != null ? rule.formulaTargetColIndex : 3 }];
      if (!this.formulaText && ruleFormulas.length > 0) {
        this.formulas = ruleFormulas;
        this.formulaText = ruleFormulas[0].formulaText;
        this.formulaTargetColIndex = ruleFormulas[0].targetColIndex;
        if (!this.visual) this.visual = {};
        this.visual.formulas = ruleFormulas;
        this.visual.formulaText = this.formulaText;
        this.visual.formulaTargetColIndex = this.formulaTargetColIndex;
        this.visual.formulaRuleId = rule.id;
      }
      this.visual.totalAmountTargetColIndex = rule.totalAmountTargetColIndex;
      setRoundingConfig(rule.decimalPlaces, rule.roundingMode);
    },
    async fillOrderLinesFromContractOrders() {
      const modelProductMap = await this.buildModelProductNameMap(this.contractOrders);
      const { rows, orderSpecs } = editorRowsFromContractOrders(this.contractOrders, modelProductMap);
      if (!rows.length) {
        this.$message.warning('关联订单缺少单价或数量，无法带入');
        return;
      }
      this.visual.tableRows = rows;
      this.visual.tableRowSpecs = orderSpecs;
      this.visual.tableTotalText = buildTableTotalTextFromEditorRows(rows, getCurrentTotalAmountTargetColIndex());
      this.$message.success('已从关联订单填入并重算');
    },
    async buildModelProductNameMap(orders) {
      const models = [...new Set((orders || []).map((o) => String(o?.product_model ?? '').trim().toUpperCase()).filter(Boolean))];
      if (!models.length) return {};
      const customerId = orders[0]?.customer_id;
      const map = {};
      for (const model of models) {
        try {
          const result = await lookupInternalModelProductName(model, customerId);
          if (result && result.product_name) map[model.toUpperCase()] = result.product_name;
        } catch { /* 静默，不影响加载 */ }
      }
      return map;
    },
    ensureTableRowSpecsLength() {
      const n = (this.visual.tableRows || []).length;
      const specs = Array.isArray(this.visual.tableRowSpecs) ? [...this.visual.tableRowSpecs] : [];
      while (specs.length < n) specs.push('');
      if (specs.length > n) specs.length = n;
      this.visual.tableRowSpecs = specs;
    },
    addVisualTableRow() {
      const cols = this.orderLineHeaders.length || 1;
      this.ensureTableRowSpecsLength();
      const row = patchEditorOrderLineCalcColumns(Array.from({ length: cols }, () => ''), {
        editedCol: ORDER_LINE_COL.GROSS_UNIT
      });
      this.visual.tableRows.push(row);
      this.visual.tableRowSpecs.push('');
    },
    removeVisualTableRow() {
      if (this.visual.tableRows.length <= 1) return;
      this.visual.tableRows.pop();
      if (Array.isArray(this.visual.tableRowSpecs) && this.visual.tableRowSpecs.length) {
        this.visual.tableRowSpecs.pop();
      }
    },
    insertClause(index) {
      const i = Number(index);
      const at = Number.isInteger(i) && i >= 0 ? i : this.visual.clauses.length - 1;
      this.visual.clauses.splice(at + 1, 0, {
        title: '新增条款：',
        body: '',
        useTable: false
      });
    },
    removeClause(index) {
      if ((this.visual.clauses || []).length <= 1) return;
      this.visual.clauses.splice(index, 1);
    },
    removeHeaderItem(side, index) {
      const key = side === 'right' ? 'headerItemsRight' : 'headerItemsLeft';
      const arr = this.visual[key] || [];
      if (arr.length <= 1) return;
      arr.splice(index, 1);
    },
    normalizePartyVisual() {
      this.visual = ensurePartyItemsOnVisual(this.visual);
    },
    partyValuePlaceholder(item) {
      if (item?.fallback === PARTY_FALLBACK_COMPANY) return '留空则使用公司抬头';
      if (item?.fallback === PARTY_FALLBACK_CUSTOMER) return '留空则使用客户名称';
      return '留空则不在合同中显示';
    },
    addPartyItem(side) {
      this.normalizePartyVisual();
      const key = side === 'buyer' ? 'partyBuyerItems' : 'partySellerItems';
      if (!Array.isArray(this.visual[key])) this.visual[key] = [];
      this.visual[key].push(createEmptyPartyItem());
    },
    /**
     * 将 visual 中保存的公式规则应用于表格（在加载合同或模板后调用）
     */
    async applySavedFormulaRules() {
      try {
        const formulas = Array.isArray(this.visual?.formulas) && this.visual.formulas.length > 0
          ? this.visual.formulas
          : (this.visual?.formulaText
              ? [{ formulaText: String(this.visual.formulaText).trim(), targetColIndex: Number.isFinite(Number(this.visual.formulaTargetColIndex)) ? Number(this.visual.formulaTargetColIndex) : 3 }]
              : []);
        if (!formulas.length || !Array.isArray(this.visual.tableRows)) return;
        const sorted = sortFormulasByDependency(formulas);
        let currentRows = this.visual.tableRows.map(row => Array.isArray(row) ? [...row] : []);
        for (const f of sorted) {
          if (!f.formulaText) continue;
          const results = await Promise.all(
            currentRows.map((row) => evaluateFormulaInWorker(f.formulaText, row, this.roundingCfg.decimalPlaces, this.roundingCfg.roundingMode))
          );
          currentRows = currentRows.map((row, ri) => {
            const next = [...row];
            next[f.targetColIndex] = results[ri];
            return next;
          });
        }
        this.visual.tableRows = currentRows;
        this.visual.tableTotalText = buildTableTotalTextFromEditorRows(currentRows, getCurrentTotalAmountTargetColIndex());
      } catch (e) {
        console.warn('应用公式规则失败', e);
      }
    },
    removePartyItem(side, index) {
      this.normalizePartyVisual();
      const key = side === 'buyer' ? 'partyBuyerItems' : 'partySellerItems';
      const arr = this.visual[key] || [];
      arr.splice(index, 1);
    },
    autoFillBuyerFromCustomer() {
      if (!this.contractPreviewVars || !this.visual) return;
      const vars = this.contractPreviewVars;
      const BUYER_LABEL_TO_KEY = {
        '单位': 'CUSTOMER_NAME',
        '地址': 'CUSTOMER_ADDRESS',
        '联系人': 'CUSTOMER_CONTACT',
        '电话': 'CUSTOMER_PHONE',
        '传真': 'CUSTOMER_FAX',
        '开户银行': 'CUSTOMER_BANK',
        '账号': 'CUSTOMER_ACCOUNT',
        '税号': 'CUSTOMER_TAX_ID'
      };
      const HEADER_LABEL_TO_KEY = { '买方': 'CUSTOMER_NAME' };
      const resolveKey = (item, labelMap) => {
        if (item.fallback) {
          const m = String(item.fallback).match(/^\{\{(\w+)\}\}$/);
          if (m) return m[1];
        }
        return labelMap[String(item.label || '').trim()] || '';
      };
      const fillItems = (items, labelMap) => {
        if (!Array.isArray(items)) return items;
        return items.map(item => {
          const key = resolveKey(item, labelMap);
          if (!key) return { ...item };
          const val = vars[key];
          if (val != null && String(val).trim()) {
            return { ...item, value: String(val) };
          }
          return { ...item };
        });
      };
      this.visual.partyBuyerItems = fillItems(this.visual.partyBuyerItems, BUYER_LABEL_TO_KEY);
      this.visual.headerItemsLeft = fillItems(this.visual.headerItemsLeft, HEADER_LABEL_TO_KEY);
    },
    patchBuyerInBodyHtml(html) {
      if (!this.contractPreviewVars) return html;
      const vars = this.contractPreviewVars;
      const mapping = [
        ['单位', vars.CUSTOMER_NAME],
        ['地址', vars.CUSTOMER_ADDRESS],
        ['联系人', vars.CUSTOMER_CONTACT],
        ['电话', vars.CUSTOMER_PHONE],
        ['传真', vars.CUSTOMER_FAX],
        ['开户银行', vars.CUSTOMER_BANK],
        ['账号', vars.CUSTOMER_ACCOUNT],
        ['税号', vars.CUSTOMER_TAX_ID]
      ];
      let s = String(html || '');
      const buyerMatch = s.match(/<td[^>]*>\s*<div[^>]*>\s*买方\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<\/td>/i);
      if (!buyerMatch) return s;
      let inner = buyerMatch[1];
      for (const [label, val] of mapping) {
        if (val == null) continue;
        const re = new RegExp(`(${label}[：:])([^<]*)`, 'g');
        inner = inner.replace(re, `$1${String(val)}`);
      }
      return s.replace(buyerMatch[1], inner);
    },
    goToRuleSettings() {
      // 优先使用 visual 中保存的规则 id，其次使用已加载的 savedCurrentRule，再回退到 store 中的当前规则
      const visualId = this.visual && this.visual.formulaRuleId;
      const savedId = this.savedCurrentRule && this.savedCurrentRule.id;
      const current = getCurrentOrderCalcRule();
      const storeId = current && current.id;
      const ruleId = visualId || savedId || storeId;
      if (ruleId) {
        this.$router.push({ path: '/sales/contracts/rule-settings', query: { ruleId } });
      } else {
        this.$router.push('/sales/contracts/rule-settings');
      }
    },
    /** 合同编辑：将可视化订单表写入 body_html（落库/预览与左侧表单一致） */
    syncContractBodyHtmlFromVisual() {
      if (!this.isContractMode || this.contractParseFailed) return;
      if (!this.visual) this.visual = {};
      if (this.visual.totalAmountTargetColIndex == null) {
        this.visual.totalAmountTargetColIndex = getCurrentTotalAmountTargetColIndex();
      }
      const bodyWithPlaceholder = this.visualToBodyHtml();
      const totalDisplay =
        String(this.visual?.tableTotalText || '').trim() || '{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）';
      this.form.body_html = String(bodyWithPlaceholder || '')
        .replaceAll('{{ORDER_LINES}}', this.buildVisualTableHtml({ forContractPersist: true }))
        .replaceAll('{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）', totalDisplay);
    },
    buildVisualTableHtml(opts = {}) {
      const persist = !!opts.forContractPersist;
      const v = this.visual || {};
      const esc = (s) => String(s ?? '');
      const headers = (persist ? CONTRACT_ORDER_LINE_HEADERS_FINAL : this.orderLineHeaders).map((h) => esc(h).trim());
      if (!headers.length) return '';
      const head = headers
        .map((h, i) => {
          const st = i < 2 ? ORDER_LINES_CELL_NOWRAP : ORDER_LINES_CELL_STYLE;
          return `<th style="${st}">${h || '未命名列'}</th>`;
        })
        .join('');
      const body = (v.tableRows || [])
        .map((row) => {
          let r = row || [];
          if (persist && r.length === CONTRACT_ORDER_LINE_HEADERS.length) {
            r = r.filter((_, i) => i !== 2);
          }
          const cells = headers
            .map((_, ci) => {
              const st = ci < 2 ? ORDER_LINES_CELL_NOWRAP : ORDER_LINES_CELL_STYLE;
              return `<td style="${st}">${esc(r?.[ci])}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      const totalDisp =
        String(v.tableTotalText || '').trim() || '{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）';
      const colspan = Math.max(1, headers.length - 1);
      const totalRow = `<tr><td style="${ORDER_LINES_CELL_STYLE}">总金额</td><td colspan="${colspan}" style="${ORDER_LINES_CELL_STYLE};text-align:left">${esc(
        totalDisp
      )}</td></tr>`;
      return `${orderLinesTableOpenTag()}<thead><tr>${head}</tr></thead><tbody>${body}${totalRow}</tbody></table>`;
    },
    visualToBodyHtml() {
      const v = this.visual || {};
      const esc = (s) => String(s ?? '');
      const p = (html) => `<p>${html}</p>`;
      const clause = (title, body) => {
        const t = esc(title).trim();
        const b = esc(body).trim();
        if (!t && !b) return '';
        if (t && !b) return `<p><strong>${t}</strong></p>`;
        return `<p><strong>${t}</strong> ${b}</p>`;
      };

      const headerCompany = esc(v.headerCompanyZh).trim() || '{{COMPANY_NAME_ZH}}';
      const headerTitle = esc(v.headerTitleZh).trim() || '销售合同';
      const linesTable = '{{ORDER_LINES}}';
      ensurePartyItemsOnVisual(v);
      const sellerInner = renderPartyItemsInnerHtml(v.partySellerItems, esc);
      const buyerInner = renderPartyItemsInnerHtml(v.partyBuyerItems, esc);

      const mapHeaderSide = (items) =>
        (items || []).map((item, idx) => {
          const rawLabel = esc(item?.label).trim() || `信息${idx + 1}`;
          const fallback = esc(item?.fallback);
          const fallbackValue = fallback === '__HEADER_COMPANY__' ? headerCompany : fallback;
          const displayValue = esc(item?.value).trim() || fallbackValue || '';
          return { label: rawLabel, value: displayValue };
        });
      const leftHeaderItems = mapHeaderSide(v.headerItemsLeft);
      const rightHeaderItems = mapHeaderSide(v.headerItemsRight);
      const headerRowCount = Math.max(leftHeaderItems.length, rightHeaderItems.length, 1);
      const headerRowsHtml = Array.from({ length: headerRowCount }, (_, rowIdx) => {
        const left = leftHeaderItems[rowIdx];
        const right = rightHeaderItems[rowIdx];
        const leftHtml = left ? `<div>${left.label}：${left.value}</div>` : '<div>&nbsp;</div>';
        const rightHtml = right ? `<div>${right.label}：${right.value}</div>` : '<div>&nbsp;</div>';
        return `<tr>
      <td style="border:none;padding:2px 8px 2px 0;width:58%;vertical-align:top;text-align:left">${leftHtml}</td>
      <td style="border:none;padding:2px 0 2px 8px;vertical-align:top;text-align:left">${rightHtml}</td>
    </tr>`;
      }).join('');
      const clausesHtml = (v.clauses || [])
        .map((item) => {
          if (item?.useTable) {
            return `${clause(item?.title, '')}\n  ${linesTable}`;
          }
          return clause(item?.title, item?.body);
        })
        .filter(Boolean)
        .join('\n  ');

      const partyBlock = v.showPartyBlock
        ? `
<table class="party-table" border="1" cellpadding="6" style="width:100%;border-collapse:collapse;border:1px solid #000;margin-top:10px;font-size:14px;line-height:1.35">
  <tr>
    <td style="width:50%;vertical-align:top;border:1px solid #000;padding:5px 8px">
      <div class="party-col-title">卖方</div>
      <div style="line-height:1.35">
        ${sellerInner}
      </div>
    </td>
    <td style="width:50%;vertical-align:top;border:1px solid #000;padding:5px 8px">
      <div class="party-col-title">买方</div>
      <div style="line-height:1.35">
        ${buyerInner}
      </div>
    </td>
  </tr>
</table>`
        : '';

      return `
<div style="width:100%;margin:0 auto;color:#000;font-family:FangSong_GB2312,仿宋_GB2312,仿宋,FangSong;font-size:16px;line-height:1.5">
  <div style="text-align:center;margin-bottom:16px">
    <div style="font-size:22px;letter-spacing:4px;line-height:1.2;font-family:${CONTRACT_PREVIEW_TITLE_FONT}">${headerCompany}</div>
    <div style="font-size:22px;letter-spacing:6px;line-height:1.2;margin-top:4px;font-family:${CONTRACT_PREVIEW_TITLE_FONT}">${headerTitle}</div>
  </div>
  <div style="text-align:center;margin:8px 0 10px 0">
  <table class="contract-header-meta" style="width:auto;max-width:100%;margin:0 auto;border-collapse:collapse;border:none;font-size:16px;line-height:1.5">
    ${headerRowsHtml}
  </table>
  </div>
  ${clausesHtml}
  ${partyBlock}
</div>
      `.trim();
    },
    async save() {
      if (this.isContractMode && this.isUploadContract) {
        if (!this.form.name?.trim()) {
          this.$message.warning('请填写合同标题');
          return;
        }
        this.saving = true;
        try {
          await patchSalesContract(this.numericContractId, { title: this.form.name.trim() });
          this.$message.success('已保存');
        } catch (e) {
          this.$message.error(this.$apiUserMsg(e, '保存失败'));
        } finally {
          this.saving = false;
        }
        return;
      }
      if (this.isContractMode) {
        this.saving = true;
        try {
          if (!this.contractParseFailed) {
            this.syncContractBodyHtmlFromVisual();
          }
          if (!this.form.name?.trim()) {
            this.$message.warning('请填写合同标题');
            return;
          }
          if (!this.contractParseFailed && !this.form.body_html?.trim()) {
            this.$message.warning('请填写合同正文');
            return;
          }
          const payload = { title: this.form.name.trim() };
          if (!this.contractParseFailed) {
            payload.body_html = this.form.body_html;
            payload.contract_visual = buildContractVisualSnapshot(this.visual);
          }
          await patchSalesContract(this.numericContractId, payload);
          if (!this.contractParseFailed) {
            await this.loadContractOne();
          }
          this.$message.success('已保存');
        } catch (e) {
          this.$message.error(this.$apiUserMsg(e, '保存失败'));
        } finally {
          this.saving = false;
        }
        return;
      }
      if (!this.form.name?.trim() || !this.form.body_html?.trim()) {
        this.$message.warning('请填写模板名称与正文');
        return;
      }
      this.saving = true;
      try {
        if (this.isNew) {
          const r = await createContractTemplate({
            name: this.form.name.trim(),
            body_html: this.form.body_html
          });
          this.$message.success('已保存');
          if (r?.id) {
            await this.$router.replace({ path: `/sales/contracts/templates/${r.id}` });
          } else {
            this.goBack();
          }
        } else {
          if (this.editMode === 'visual') {
            this.form.body_html = this.visualToBodyHtml();
          }
          await updateContractTemplate(this.numericId, {
            name: this.form.name.trim(),
            body_html: this.form.body_html
          });
          this.$message.success('已保存');
        }
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '保存失败'));
      } finally {
        this.saving = false;
      }
    },
    async onReplaceUploadContractFile({ file }) {
      if (!this.numericContractId) return;
      try {
        await replaceSalesContractDocument(this.numericContractId, file);
        this.$message.success('已更换文件');
        const d = await getSalesContract(this.numericContractId);
        const c = d?.contract;
        this.uploadContractDocName =
          c?.document_original_filename != null ? String(c.document_original_filename) : '';
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '更换失败'));
      }
    },
    async downloadUploadContractFile() {
      if (!this.numericContractId) return;
      try {
        const blob = await downloadSalesContractDocument(this.numericContractId);
        startDownload({ request: blob, filename: this.uploadContractDocName || '合同文件' });
      } catch {
        this.$message.error('下载失败');
      }
    }
  }
};
</script>

<style scoped>
.contract-template-edit-root {
  padding-bottom: 24px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.in-editor-toolbar {
  border-bottom: 1px solid #eef2f7;
  padding-bottom: 10px;
  margin-bottom: 14px;
}
.toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.top-alert {
  margin-bottom: 12px;
}
.tpl-card {
  margin-bottom: 12px;
}
.field-header {
  font-weight: 600;
  font-size: 14px;
}
.create-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.text-muted {
  font-size: 12px;
  color: #909399;
}
.preserve-unlock-row {
  margin: 8px 0 14px;
}
.visual-editor-fieldset {
  border: none;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.visual-editor-fieldset.is-locked {
  opacity: 0.72;
}
.editor-card {
  margin-bottom: 12px;
}
.upload-contract-panel {
  padding: 0 4px 16px;
}
.upload-doc-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.upload-doc-name {
  font-size: 14px;
  color: #334155;
}
.editor-layout-modern {
  --layout-header-offset: 72px;
  --preview-panel-width: 520px;
  --preview-panel-gap: 16px;
  display: flex;
  gap: 16px;
  align-items: stretch;
  min-height: 64vh;
  padding-right: calc(var(--preview-panel-width) + var(--preview-panel-gap));
}
.edit-panel {
  flex: 1 1 auto;
  min-width: 640px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  padding: 14px 14px 10px;
  overflow: auto;
}
.preview-panel-modern {
  width: var(--preview-panel-width);
  min-width: var(--preview-panel-width);
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 12px;
  padding: 12px;
  overflow: auto;
  position: fixed;
  right: 12px;
  top: var(--layout-header-offset);
  height: calc(100vh - var(--layout-header-offset) - 12px);
  z-index: 20;
}
.editor-form {
  min-width: 0;
}
.tpl-insert-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.tpl-insert-row.mt6 {
  margin-top: 6px;
}
.tpl-insert-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}
.body-textarea :deep(textarea) {
  font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
}
.preview-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
}
.preview-note {
  font-size: 11px;
  color: #909399;
  margin-bottom: 10px;
}
.preview-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
  padding: 10px 0;
}
/* 占位尺寸 = A4 × scale，避免 scale 不占流宽导致无法水平居中 */
.preview-a4-scaler {
  --a4-scale: 0.55;
  position: relative;
  width: calc(210mm * var(--a4-scale));
  height: calc(297mm * var(--a4-scale));
  flex-shrink: 0;
}
.preview-a4 {
  position: absolute;
  top: 0;
  left: 0;
  width: 210mm;
  min-height: 297mm;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #000;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  padding: 15mm 20mm;
  transform-origin: top left;
  transform: scale(var(--a4-scale, 0.55));
  font-family: FangSong_GB2312, 仿宋_GB2312, 仿宋, FangSong;
  font-size: 16px;
  line-height: 1.5;
  color: #000;
  text-align: left;
}
.preview-a4 :deep(h1),
.preview-a4 :deep(h2),
.preview-a4 :deep(h3),
.preview-a4 :deep(.contract-title) {
  font-family: FZXiaoBiaoSong-S05, FZXiaoBiaoSong, 方正小标宋简体, 方正小标宋, 方正小标宋_GBK, FZShuSong_GB2312, SimSun;
  font-size: 22px;
  font-weight: normal;
  text-align: center;
  letter-spacing: 2px;
}
.preview-a4 :deep(p) {
  text-indent: 2em;
  margin: 0.5em 0;
  text-align: justify;
}
.preview-a4 :deep(table) {
  width: 100%;
  border-collapse: collapse;
}
.preview-a4 :deep(table.contract-order-lines) {
  width: 100%;
}
.preview-a4 :deep(.contract-header-meta) {
  width: auto;
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
  border: none;
}
.preview-a4 :deep(.contract-header-meta th),
.preview-a4 :deep(.contract-header-meta td) {
  border: none;
  text-align: left;
  vertical-align: top;
}
.preview-a4 :deep(th),
.preview-a4 :deep(td) {
  border: 1px solid #000;
  padding: 6px 8px;
  text-align: center;
  font-size: 16px;
  word-break: break-word;
}
.preview-a4 :deep(table.contract-order-lines th),
.preview-a4 :deep(table.contract-order-lines td) {
  padding: 5px 10px;
}
.preview-a4 :deep(.party-table) {
  page-break-inside: avoid;
  break-inside: avoid;
  font-size: 14px;
  line-height: 1.35;
}
.preview-a4 :deep(.party-table tr) {
  page-break-inside: avoid;
  break-inside: avoid;
}
.preview-a4 :deep(.party-table td) {
  text-align: left;
  font-size: 14px;
  line-height: 1.35;
  padding: 5px 8px;
}
.preview-a4 :deep(.party-table .party-col-title) {
  text-align: center;
  font-weight: 700;
  margin-bottom: 4px;
  display: block;
}
.section {
  margin: 12px 0 18px;
  background: #fafbfc;
  border: 1px solid #f0f2f5;
  border-radius: 12px;
  padding: 12px;
}
.section-title {
  font-weight: 600;
  font-size: 13px;
  color: #0f172a;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 2px solid #e8f0fe;
}
.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}
.form-group {
  flex: 1;
  min-width: 240px;
}
.form-label {
  font-size: 12px;
  color: #475569;
  margin-bottom: 6px;
}
.mt4 {
  margin-top: 4px;
}
.mt6 {
  margin-top: 6px;
}
.mt12 {
  margin-top: 12px;
}
.mt8 {
  margin-top: 8px;
}
.header-editor-box {
  display: grid;
  grid-template-columns: 58% 42%;
  gap: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}
.party-editor-box {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  padding: 10px;
}
.header-editor-col {
  min-width: 0;
}
.header-item-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.header-editor-box .header-item-label {
  width: 180px;
  flex: 0 0 180px;
}
.party-editor-box .header-item-label {
  width: 112px;
  flex: 0 0 112px;
}
.header-item-sep {
  color: #64748b;
  line-height: 1;
}
.header-item-value {
  flex: 1;
}
.header-item-remove {
  flex: 0 0 auto;
}
.table-ops {
  gap: 6px;
}
.clause-item-row + .clause-item-row {
  margin-top: 12px;
}
.clause-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.clause-item-ops {
  display: flex;
  gap: 6px;
}
.table-form-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 8px;
  background: #fff;
}
.table-form-editor {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}
.table-form-editor th,
.table-form-editor td {
  border: 1px solid #e2e8f0;
  padding: 6px;
}
.table-form-editor th:nth-child(1),
.table-form-editor th:nth-child(2),
.table-form-editor td:nth-child(1),
.table-form-editor td:nth-child(2) {
  white-space: nowrap;
}
.table-form-editor .table-letter-row th {
  background: #f5f7fa;
  color: #606266;
  font-weight: 700;
  text-align: center;
  height: 32px;
  line-height: 32px;
  font-size: 12px;
  padding: 4px 6px;
}
.table-form-editor .table-header-row th {
  background: #fafbfc;
  color: #606266;
}
.formula-rule-display {
  margin-top: 10px;
  padding: 10px 12px;
  background: #f9fafb;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  font-size: 13px;
}
.formula-rule-display .rule-line {
  margin-top: 4px;
}
.formula-rule-display .rule-line:first-child {
  margin-top: 0;
}
.formula-rule-display .rule-multiline {
  white-space: pre-wrap;
  line-height: 1.5;
  margin-left: 12px;
}
.table-form-editor :deep(.el-input__wrapper) {
  box-shadow: none;
  border: 1px solid #dbe1ea;
}
.table-form-editor .order-line-total-row td {
  font-weight: 700;
  background: #f0f9ff;
  border-top: 2px solid #94a3b8;
}
.table-form-editor .order-line-total-label {
  text-align: center;
  white-space: nowrap;
}
.table-form-editor .order-line-total-value {
  padding: 4px 6px;
}
.table-form-editor .order-line-total-value :deep(.el-input__wrapper) {
  box-shadow: none;
  border: 1px solid #dbe1ea;
}
.tpl-advanced-collapse {
  margin-top: 8px;
  border: none;
}
.tpl-advanced-collapse :deep(.el-collapse-item__header) {
  font-size: 12px;
  color: #909399;
  border: none;
  height: 36px;
  line-height: 36px;
}
.tpl-advanced-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}
.tpl-advanced-title {
  font-weight: normal;
}
.tpl-advanced-p {
  margin: 0;
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
}
@media (max-width: 992px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .toolbar-right {
    width: 100%;
  }
  .toolbar-right .el-button {
    flex: 1 1 calc(50% - 8px);
  }
  .editor-layout-modern {
    flex-direction: column;
    padding-right: 0;
  }
  .edit-panel {
    min-width: 0;
  }
  .preview-panel-modern {
    width: 100%;
    min-width: 0;
    position: static;
    max-height: 420px;
    height: auto;
  }
  .preview-a4-scaler {
    --a4-scale: 0.46;
  }
  .header-editor-box,
  .party-editor-box {
    grid-template-columns: 1fr;
  }
}
</style>
