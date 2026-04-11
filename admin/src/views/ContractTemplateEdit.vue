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
        <div class="field-header">
          <div>{{ isContractMode ? (isUploadContract ? '文档合同' : '合同内容') : '模板内容' }}</div>
        </div>
      </template>
      <div v-if="isContractMode && isUploadContract" class="upload-contract-panel">
        <div class="toolbar in-editor-toolbar">
          <div>
            <el-button @click="goBack">返回</el-button>
          </div>
          <div class="toolbar-right">
            <el-button
              v-if="perm('company', 'manage') || perm('company', 'view')"
              @click="$router.push('/company')"
            >企业信息</el-button>
            <el-button type="primary" :loading="saving" @click="save">保存</el-button>
          </div>
        </div>
        <el-form label-width="100px" class="editor-form">
          <el-form-item label="合同标题" required>
            <el-input v-model="form.name" clearable placeholder="合同标题" style="max-width: 520px" />
          </el-form-item>
          <el-form-item label="正文文件">
            <div class="upload-doc-row">
              <span class="upload-doc-name">{{ uploadContractDocName || '—' }}</span>
              <el-button @click="downloadUploadContractFile">下载</el-button>
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
              <el-button @click="goBack">返回</el-button>
            </div>
            <div class="toolbar-right">
              <el-button
                v-if="perm('company', 'manage') || perm('company', 'view')"
                @click="$router.push('/company')"
              >企业信息</el-button>
              <el-button v-if="isContractMode" type="primary" :loading="saving" @click="save">保存合同</el-button>
              <el-button v-else type="primary" :loading="saving" @click="save">保存模板</el-button>
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
              <el-button type="warning" plain @click="unlockContractVisualReplaceBody">
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
                        <el-button v-if="!isContractMode" size="small" @click="editMode = 'raw'">
                          去源码编辑插入占位符
                        </el-button>
                      </div>
                      <div class="table-form-wrap mt12">
                        <table class="table-form-editor">
                          <thead>
                            <tr>
                              <th v-for="(h, hi) in orderLineHeaders" :key="'h-' + hi">
                                {{ h }}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(row, ri) in visual.tableRows" :key="'r-' + ri">
                              <td v-for="(_cell, cj) in orderLineHeaders" :key="'c-' + ri + '-' + cj">
                                <el-input v-model="visual.tableRows[ri][cj]" size="small" />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div class="form-label mt8">表格内总金额（大写）</div>
                      <el-input
                        v-model="visual.tableTotalText"
                        placeholder="留空则用占位符 {{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）"
                        class="mt4"
                      />
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
                <div v-if="visual.showPartyBlock" class="form-row mt12">
                  <div class="form-group">
                    <div class="form-label">卖方信息</div>
                    <el-input v-model="visual.sellerUnit" placeholder="单位（例如：开封物源化工有限公司）" class="mt6" />
                    <el-input v-model="visual.sellerAddress" placeholder="地址" class="mt6" />
                    <el-input v-model="visual.sellerContact" placeholder="联系人" class="mt6" />
                    <el-input v-model="visual.sellerPhone" placeholder="电话" class="mt6" />
                    <el-input v-model="visual.sellerFax" placeholder="传真" class="mt6" />
                    <el-input v-model="visual.sellerBank" placeholder="开户银行" class="mt6" />
                    <el-input v-model="visual.sellerAccount" placeholder="账号" class="mt6" />
                    <el-input v-model="visual.sellerBankNo" placeholder="行号" class="mt6" />
                  </div>
                  <div class="form-group">
                    <div class="form-label">买方信息</div>
                    <el-input v-model="visual.buyerUnit" placeholder="单位（例如：昆明华信金属材料制造有限公司）" class="mt6" />
                    <el-input v-model="visual.buyerAddress" placeholder="地址" class="mt6" />
                    <el-input v-model="visual.buyerContact" placeholder="联系人" class="mt6" />
                    <el-input v-model="visual.buyerPhone" placeholder="电话" class="mt6" />
                    <el-input v-model="visual.buyerFax" placeholder="传真" class="mt6" />
                    <el-input v-model="visual.buyerBank" placeholder="开户银行" class="mt6" />
                    <el-input v-model="visual.buyerAccount" placeholder="账号" class="mt6" />
                    <el-input v-model="visual.buyerTaxNo" placeholder="税号" class="mt6" />
                  </div>
                </div>
              </div>

              <el-collapse class="tpl-advanced-collapse">
                <el-collapse-item name="adv">
                  <template #title>
                    <span class="tpl-advanced-title">技术说明（一般不用打开）</span>
                  </template>
                  <p class="tpl-advanced-p" v-pre>
                    占位符均为「双大括号 + 英文代号」。必须与按钮插入的拼写完全一致；卖方公司名称来自「企业信息」；买方信息来自客户档案；编号与签订日期在生成合同草稿时写入。
                    订单明细表当前列：品名、型号、不含税单价（元）、单位（吨）、数量（桶）、不含税金额（元）、税率、税额（元）、价税合计（元）。生成时税额按 13% 推算；单位（吨）暂无订单字段时为「—」。
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
    </el-card>
  </div>
</template>

<script>
import { perm } from '../utils/permissions';
import {
  listContractTemplates,
  getContractTemplate,
  createContractTemplate,
  updateContractTemplate,
  getSalesContract,
  patchSalesContract,
  replaceSalesContractDocument,
  downloadSalesContractDocument
} from '../api';
import {
  BLANK_TPL_BODY,
  previewFillContractTemplate
} from '../utils/contractTemplateDefaults';
import { createDefaultVisual, CONTRACT_ORDER_LINE_HEADERS } from '../utils/contractVisualDefaults';
import { parseContractHtmlToVisual } from '../utils/contractBodyToVisual';
import { finalizeContractBodyForPreview } from '../utils/contractPreviewHtml';

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
      uploadContractDocName: ''
    };
  },
  computed: {
    orderLineHeaders() {
      return CONTRACT_ORDER_LINE_HEADERS;
    },
    numericContractId() {
      if (this.contractId == null || this.contractId === '') return null;
      const n = Number(this.contractId);
      return Number.isInteger(n) && n > 0 ? n : null;
    },
    isContractMode() {
      return this.numericContractId != null;
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
      if (!useVisual) return previewFillContractTemplate(html);
      const totalDisplay = String(this.visual?.tableTotalText || '').trim() || '{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）';
      const withVisualLines = String(html || '')
        .replaceAll('{{ORDER_LINES}}', this.buildVisualTableHtml())
        .replaceAll('{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）', totalDisplay);
      if (this.isContractMode) {
        return finalizeContractBodyForPreview(withVisualLines, this.contractOrders, vars);
      }
      return previewFillContractTemplate(withVisualLines);
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
        if (this.editMode === 'visual' || this.isContractMode) {
          this.form.body_html = this.visualToBodyHtml();
        }
      }
    }
  },
  methods: {
    perm,
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
        if (parsed) {
          this.contractParseFailed = false;
          this.visual = parsed;
          this.editMode = 'visual';
          this.form = { name: title, body_html: this.visualToBodyHtml() };
        } else {
          this.contractParseFailed = true;
          this.visual = createDefaultVisual();
          this.editMode = 'visual';
          this.form = { name: title, body_html: html };
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
    async loadOne() {
      if (!this.numericId) {
        this.$message.error('无效模板');
        this.goBack();
        return;
      }
      try {
        const d = await getContractTemplate(this.numericId);
        const t = d.template;
        this.form = { name: t.name || '', body_html: t.body_html || '' };
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
        const apply = () => {
          this.form.body_html = t.body_html || '';
          if (!this.form.name?.trim() && t.name) {
            this.form.name = `${t.name}（副本）`;
          }
        };
        if ((this.form.body_html || '').trim()) {
          await this.$confirm('套用模板将覆盖当前正文，确定吗？', '提示', { type: 'warning' });
        }
        apply();
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
    addVisualTableRow() {
      const cols = this.orderLineHeaders.length || 1;
      this.visual.tableRows.push(Array.from({ length: cols }, () => ''));
    },
    removeVisualTableRow() {
      if (this.visual.tableRows.length <= 1) return;
      this.visual.tableRows.pop();
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
    buildVisualTableHtml() {
      const v = this.visual || {};
      const esc = (s) => String(s ?? '');
      const headers = this.orderLineHeaders.map((h) => esc(h).trim());
      if (!headers.length) return '';
      const head = headers
        .map(
          (h, i) =>
            `<th style="border:1px solid #000;padding:4px 6px;text-align:center${i < 2 ? ';white-space:nowrap' : ''}">${
              h || '未命名列'
            }</th>`
        )
        .join('');
      const body = (v.tableRows || [])
        .map((row) => {
          const cells = headers
            .map(
              (_, ci) =>
                `<td style="border:1px solid #000;padding:4px 6px;text-align:center${
                  ci < 2 ? ';white-space:nowrap' : ''
                }">${esc(row?.[ci])}</td>`
            )
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      const totalDisp =
        String(v.tableTotalText || '').trim() || '{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）';
      const cell = 'border:1px solid #000;padding:4px 6px;font-family:SimSun,宋体;font-size:12px;line-height:1.35';
      const totalRow = `<tr><td style="${cell};text-align:center">总金额</td><td colspan="8" style="${cell};text-align:left">${esc(
        totalDisp
      )}</td></tr>`;
      return `<table style="width:100%;border-collapse:collapse;border:1px solid #000;font-family:SimSun,宋体;font-size:12px;line-height:1.35"><thead><tr>${head}</tr></thead><tbody>${body}${totalRow}</tbody></table>`;
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
      const sellerUnit = esc(v.sellerUnit).trim() || '{{COMPANY_NAME_ZH}}';
      const buyerUnit = esc(v.buyerUnit).trim() || '{{CUSTOMER_NAME}}';
      const sellerAddress = esc(v.sellerAddress).trim();
      const sellerContact = esc(v.sellerContact).trim();
      const sellerPhone = esc(v.sellerPhone).trim();
      const sellerFax = esc(v.sellerFax).trim();
      const sellerBank = esc(v.sellerBank).trim();
      const sellerAccount = esc(v.sellerAccount).trim();
      const sellerBankNo = esc(v.sellerBankNo).trim();
      const buyerAddress = esc(v.buyerAddress).trim();
      const buyerContact = esc(v.buyerContact).trim();
      const buyerPhone = esc(v.buyerPhone).trim();
      const buyerFax = esc(v.buyerFax).trim();
      const buyerBank = esc(v.buyerBank).trim();
      const buyerAccount = esc(v.buyerAccount).trim();
      const buyerTaxNo = esc(v.buyerTaxNo).trim();

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
      <td style="border:none;padding:2px 8px 2px 0;width:58%;vertical-align:top">${leftHtml}</td>
      <td style="border:none;padding:2px 0 2px 8px;vertical-align:top">${rightHtml}</td>
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
<table border="1" cellpadding="8" style="width:100%;border-collapse:collapse;margin-top:10px">
  <tr>
    <td style="width:50%;vertical-align:top">
      <div><strong>卖方</strong></div>
      <div style="line-height:1.8">
        单位：${sellerUnit}<br>
        地址：${sellerAddress}<br>
        联系人：${sellerContact}<br>
        电话：${sellerPhone}<br>
        传真：${sellerFax}<br>
        开户银行：${sellerBank}<br>
        账号：${sellerAccount}<br>
        行号：${sellerBankNo}
      </div>
    </td>
    <td style="width:50%;vertical-align:top">
      <div><strong>买方</strong></div>
      <div style="line-height:1.8">
        单位：${buyerUnit}<br>
        地址：${buyerAddress}<br>
        联系人：${buyerContact}<br>
        电话：${buyerPhone}<br>
        传真：${buyerFax}<br>
        开户银行：${buyerBank}<br>
        账号：${buyerAccount}<br>
        税号：${buyerTaxNo}
      </div>
    </td>
  </tr>
</table>`
        : '';

      return `
<div style="font-family:SimSun,宋体;line-height:1.8;font-size:14px;color:#000">
  <p style="text-align:center"><strong>${headerCompany} ${headerTitle}</strong></p>
  <table style="width:100%;border-collapse:collapse;border:none;margin:8px 0 10px 0;font-size:14px;line-height:1.5">
    ${headerRowsHtml}
  </table>
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
      if (!this.form.name?.trim() || !this.form.body_html?.trim()) {
        this.$message.warning(this.isContractMode ? '请填写合同标题与正文' : '请填写模板名称与正文');
        return;
      }
      this.saving = true;
      try {
        if (this.isContractMode) {
          if (this.contractParseFailed) {
            /* 保持数据库原文，仅更新标题；勿用空可视化模板覆盖 */
          } else if (this.editMode === 'visual') {
            // 合同场景保存时需要落库“当前填写的明细表”，不能只保存 {{ORDER_LINES}} 占位符
            const bodyWithPlaceholder = this.visualToBodyHtml();
            const totalDisplay = String(this.visual?.tableTotalText || '').trim() || '{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）';
            this.form.body_html = String(bodyWithPlaceholder || '')
              .replaceAll('{{ORDER_LINES}}', this.buildVisualTableHtml())
              .replaceAll('{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）', totalDisplay);
          }
          await patchSalesContract(this.numericContractId, {
            title: this.form.name.trim(),
            body_html: this.form.body_html
          });
          this.$message.success('已保存');
        } else if (this.isNew) {
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
        await downloadSalesContractDocument(
          this.numericContractId,
          this.uploadContractDocName || '合同文件'
        );
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
  padding: 18mm 16mm;
  transform-origin: top left;
  transform: scale(var(--a4-scale, 0.55));
}
.preview-a4 :deep(table) {
  width: 100%;
  border-collapse: collapse;
}
.preview-a4 :deep(th),
.preview-a4 :deep(td) {
  word-break: break-word;
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
.header-editor-col {
  min-width: 0;
}
.header-item-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.header-item-label {
  width: 180px;
  flex: 0 0 180px;
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
.table-form-editor :deep(.el-input__wrapper) {
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
  .header-editor-box {
    grid-template-columns: 1fr;
  }
}
</style>
