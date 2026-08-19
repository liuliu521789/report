<template>
  <div class="order-calc-rules-page">
    <div class="page-title-row">
      <div>
        <h2>订单计算规则设置</h2>
        <p class="text-muted page-desc">
          用几条简单公式告诉系统：订单明细里哪些金额怎么算。保存并启用后，生成/刷新合同时会按此规则自动计算。
        </p>
      </div>
      <el-button @click="goBack">返回</el-button>
    </div>

    <!-- 当前启用状态 -->
    <div class="status-banner" :class="currentRuleName ? 'is-active' : 'is-empty'">
      <div class="status-banner__main">
        <div class="status-banner__label">{{ currentRuleName ? '当前启用' : '尚未启用规则' }}</div>
        <div class="status-banner__title">
          {{ currentRuleName || '请选择下方模板或自行配置后保存并启用' }}
        </div>
        <div v-if="currentRulePlainLines.length" class="status-banner__lines">
          <div v-for="(line, i) in currentRulePlainLines" :key="i">{{ line }}</div>
        </div>
      </div>
      <div class="status-banner__hint">
        启用后立即影响<strong>新生成/刷新</strong>的合同金额；已生成的合同不会自动改写。
      </div>
    </div>

    <!-- 常用模板 -->
    <el-card class="section-card" shadow="never">
      <div class="section-header">
        <span>① 先选一种常用算法（可再改）</span>
        <span class="section-sub">点击即可填入编辑区</span>
      </div>
      <div class="template-grid">
        <button
          v-for="tpl in ruleTemplates"
          :key="tpl.key"
          type="button"
          class="template-card"
          @click="applyTemplate(tpl)"
        >
          <div class="template-card__name">{{ tpl.name }}</div>
          <div class="template-card__desc">{{ tpl.desc }}</div>
        </button>
      </div>
    </el-card>

    <!-- 规则编辑 -->
    <el-card class="section-card" shadow="never">
      <div class="section-header">
        <span>② 配置计算步骤</span>
        <span class="section-sub">每一步 =「算什么」写入「哪一列」</span>
      </div>

      <el-form label-position="top" class="rule-form">
        <el-form-item label="规则名称">
          <el-input v-model="ruleName" maxlength="64" show-word-limit placeholder="例如：含税单价转不含税单价" />
        </el-form-item>

        <div class="steps-block">
          <div v-for="(f, idx) in formulas" :key="idx" class="step-card" :class="{ 'is-focused': activeFormulaIdx === idx }">
            <div class="step-card__head">
              <span class="step-badge">步骤 {{ idx + 1 }}</span>
              <span class="step-plain">{{ stepPlainTitle(f, idx) }}</span>
              <div class="step-actions">
                <el-button text size="small" :disabled="idx === 0" @click="moveFormulaUp(idx)">上移</el-button>
                <el-button text size="small" :disabled="idx === formulas.length - 1" @click="moveFormulaDown(idx)">下移</el-button>
                <el-button text size="small" type="danger" :disabled="formulas.length <= 1" @click="removeFormula(idx)">删除</el-button>
              </div>
            </div>

            <div class="step-card__body">
              <div class="step-field">
                <label>计算结果写入</label>
                <el-select
                  v-model="f.targetColIndex"
                  placeholder="选择列"
                  @change="onFormulaChange"
                  @focus="activeFormulaIdx = idx"
                >
                  <el-option
                    v-for="({ header, letter }, ci) in orderLineHeadersWithLetters"
                    :key="`t-${idx}-${ci}`"
                    :label="header"
                    :value="ci"
                  >
                    <span>{{ header }}</span>
                    <span class="opt-letter">{{ letter }}</span>
                  </el-option>
                </el-select>
              </div>

              <div class="step-field step-field--grow">
                <label>计算公式</label>
                <el-input
                  :ref="(el) => setFormulaInputRef(idx, el)"
                  v-model="f.formulaText"
                  clearable
                  placeholder="点击下方字段拼公式，或直接输入如 D*E"
                  @focus="activeFormulaIdx = idx"
                  @input="onFormulaChange"
                />
                <div class="chip-bar">
                  <span class="chip-bar__label">插入字段</span>
                  <button
                    v-for="col in orderLineHeadersWithLetters"
                    :key="`chip-${idx}-${col.letter}`"
                    type="button"
                    class="chip"
                    :title="col.header"
                    @mousedown.prevent
                    @click="insertToken(idx, col.letter)"
                  >
                    {{ shortHeader(col.header) }}
                  </button>
                  <span class="chip-bar__label">运算</span>
                  <button
                    v-for="op in operatorChips"
                    :key="`op-${idx}-${op.label}`"
                    type="button"
                    class="chip chip--op"
                    @mousedown.prevent
                    @click="insertToken(idx, op.token)"
                  >
                    {{ op.label }}
                  </button>
                </div>
                <div v-if="f.formulaText" class="formula-human">
                  公式释义：{{ humanizeFormula(f) }}
                </div>
              </div>
            </div>
          </div>

          <div class="steps-toolbar">
            <el-button @click="addFormula">+ 添加一步</el-button>
            <el-button text type="primary" @click="sortFormulasByDep">自动整理计算顺序</el-button>
          </div>
        </div>

        <div class="format-row">
          <div class="format-item">
            <label>合同底部「总金额」汇总哪一列</label>
            <el-select v-model="totalAmountTargetColIndex" placeholder="请选择">
              <el-option
                v-for="({ header }, ci) in orderLineHeadersWithLetters"
                :key="`total-${ci}`"
                :label="header"
                :value="ci"
              />
            </el-select>
          </div>
          <div class="format-item format-item--narrow">
            <label>小数位数</label>
            <el-input-number v-model="decimalPlaces" :min="0" :max="6" controls-position="right" @change="onFormulaChange" />
          </div>
          <div class="format-item format-item--narrow">
            <label>取整方式</label>
            <el-select v-model="roundingMode" @change="onFormulaChange">
              <el-option label="四舍五入" value="round" />
              <el-option label="向上取整" value="ceil" />
              <el-option label="向下取整" value="floor" />
            </el-select>
          </div>
        </div>

        <el-collapse class="help-collapse">
          <el-collapse-item title="不会写公式？看这里" name="help">
            <ul class="help-list">
              <li>先选「计算结果写入」哪一列，再点「插入字段」拼出算法。</li>
              <li>常见写法：不含税金额 = 不含税单价 × 数量；价税合计 = 单价 × 数量。</li>
              <li>含税转不含税：不含税单价 = 单价 ÷ (1 + 税率)，可用「四舍五入」按钮。</li>
              <li>多步时若后一步要用前一步结果，点「自动整理计算顺序」。</li>
            </ul>
          </el-collapse-item>
        </el-collapse>

        <div class="primary-actions">
          <el-button type="primary" size="large" :loading="saving" @click="saveAndApply">
            保存并启用
          </el-button>
          <el-button size="large" @click="resetForm">清空重填</el-button>
          <span class="primary-actions__hint">保存后立即成为当前计算规则</span>
        </div>
      </el-form>
    </el-card>

    <!-- 预览：改前 / 改后 -->
    <el-card class="section-card" shadow="never">
      <div class="section-header">
        <span>③ 用示例数据看效果</span>
        <span class="section-sub">蓝色高亮 = 本规则会改写的列</span>
      </div>

      <div class="preview-compare">
        <div class="preview-pane">
          <div class="preview-pane__title">计算前（样例）</div>
          <div class="table-preview-wrap">
            <table class="table-preview">
              <thead>
                <tr>
                  <th v-for="({ header }, idx) in orderLineHeadersWithLetters" :key="`bh-${idx}`">
                    {{ shortHeader(header) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td v-for="(cell, idx) in sampleBeforeRow" :key="`bc-${idx}`">{{ cell || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="preview-pane">
          <div class="preview-pane__title">计算后</div>
          <div class="table-preview-wrap">
            <table class="table-preview">
              <thead>
                <tr>
                  <th v-for="({ header }, idx) in orderLineHeadersWithLetters" :key="`ah-${idx}`">
                    {{ shortHeader(header) }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    v-for="(cell, idx) in previewRow"
                    :key="`ac-${idx}`"
                    :class="{ 'is-changed': changedColSet.has(idx) }"
                  >
                    {{ cell || '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="preview-footer">
        <div v-if="formulaPreviewError" class="preview-error">{{ formulaPreviewError }}</div>
        <div v-else-if="changedSummary.length">
          <strong>本规则会改写：</strong>
          <el-tag v-for="s in changedSummary" :key="s" size="small" type="info" class="change-tag">{{ s }}</el-tag>
        </div>
        <div v-else class="text-muted">填写公式后，这里会显示改了哪些金额</div>
        <div class="text-muted">
          总金额来源：{{ totalAmountLabel }}（样例合计 {{ previewTotalText }}）
        </div>
      </div>
    </el-card>

    <!-- 历史规则 -->
    <el-card class="section-card" shadow="never">
      <div class="section-header">
        <span>已保存的规则</span>
        <span class="section-sub">可随时切换启用</span>
      </div>
      <el-table :data="rules" stripe style="width: 100%" :row-class-name="ruleRowClassName" empty-text="还没有保存过规则">
        <el-table-column label="规则" min-width="200">
          <template #default="{ row }">
            <div class="rule-name-cell">
              <span>{{ row.name }}</span>
              <el-tag v-if="row.id === currentRuleId" type="success" size="small">使用中</el-tag>
            </div>
            <div class="rule-plain-mini">{{ rulePlainOneLine(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.id !== currentRuleId"
              type="primary"
              link
              size="small"
              @click="applyRule(row)"
            >
              启用
            </el-button>
            <el-button type="primary" link size="small" @click="editRule(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="deleteRule(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script>
import { CONTRACT_ORDER_LINE_HEADERS } from '../utils/contractVisualDefaults';
import { evaluateFormulaInWorker } from '../utils/formulaWorker';
import {
  listOrderCalcRules,
  saveOrderCalcRule,
  deleteOrderCalcRule,
  setCurrentOrderCalcRuleId,
  getCurrentOrderCalcRule,
  sortFormulasByDependency,
  ensureDefaultRule,
  loadRulesFromServer,
  BUILT_IN_DEFAULT_RULE
} from '../utils/orderCalcRuleStore';

const SAMPLE_ROW = ['', 'NL385', '1130.00', '1000.00', '10.00', '15', '10000.00', '13%', '1300.00', '11300.00'];

const RULE_TEMPLATES = [
  {
    key: 'tax-inclusive',
    name: '含税转不含税（推荐）',
    desc: '由含税单价算出不含税单价、金额、税额与价税合计',
    formulas: BUILT_IN_DEFAULT_RULE.formulas,
    totalAmountTargetColIndex: BUILT_IN_DEFAULT_RULE.totalAmountTargetColIndex,
    decimalPlaces: BUILT_IN_DEFAULT_RULE.decimalPlaces,
    roundingMode: BUILT_IN_DEFAULT_RULE.roundingMode
  },
  {
    key: 'simple-amount',
    name: '简单金额计算',
    desc: '不含税金额 = 不含税单价×数量；价税合计 = 单价×数量；税额 = 价税合计−不含税金额',
    formulas: [
      { formulaText: 'D*E', targetColIndex: 6 },
      { formulaText: 'C*E', targetColIndex: 9 },
      { formulaText: 'J-G', targetColIndex: 8 }
    ],
    totalAmountTargetColIndex: 9,
    decimalPlaces: 2,
    roundingMode: 'round'
  },
  {
    key: 'recalc-total-only',
    name: '只重算价税合计',
    desc: '价税合计 = 单价 × 数量，其它列保持手工填写',
    formulas: [{ formulaText: 'C*E', targetColIndex: 9 }],
    totalAmountTargetColIndex: 9,
    decimalPlaces: 2,
    roundingMode: 'round'
  }
];

export default {
  name: 'OrderCalcRules',
  data() {
    return {
      ruleId: null,
      ruleName: '',
      formulas: [{ formulaText: '', targetColIndex: 3 }],
      totalAmountTargetColIndex: 9,
      decimalPlaces: 2,
      roundingMode: 'round',
      rules: [],
      currentRuleId: null,
      previewRow: [...SAMPLE_ROW],
      sampleBeforeRow: [...SAMPLE_ROW],
      changedColIndexes: [],
      formulaPreviewError: '',
      activeFormulaIdx: 0,
      saving: false,
      ruleTemplates: RULE_TEMPLATES,
      operatorChips: [
        { label: '+', token: '+' },
        { label: '−', token: '-' },
        { label: '×', token: '*' },
        { label: '÷', token: '/' },
        { label: '( )', token: '()' },
        { label: '四舍五入', token: 'ROUND(,2)' }
      ],
      formulaInputRefs: {}
    };
  },
  computed: {
    orderLineHeadersWithLetters() {
      return CONTRACT_ORDER_LINE_HEADERS.map((header, index) => ({
        header,
        letter: String.fromCharCode(65 + index)
      }));
    },
    currentRule() {
      return this.rules.find((rule) => rule.id === this.currentRuleId) || null;
    },
    currentRuleName() {
      return this.currentRule ? this.currentRule.name : '';
    },
    currentRulePlainLines() {
      if (!this.currentRule?.formulas?.length) return [];
      return this.currentRule.formulas.map((f) => this.plainFormulaLine(f));
    },
    changedColSet() {
      return new Set(this.changedColIndexes);
    },
    changedSummary() {
      return this.changedColIndexes
        .map((i) => this.orderLineHeadersWithLetters[i]?.header)
        .filter(Boolean);
    },
    totalAmountLabel() {
      return this.orderLineHeadersWithLetters[this.totalAmountTargetColIndex]?.header || '—';
    },
    previewTotalText() {
      const v = this.previewRow[this.totalAmountTargetColIndex];
      return v != null && v !== '' ? String(v) : '—';
    }
  },
  async mounted() {
    ensureDefaultRule();
    await loadRulesFromServer();
    this.loadRules();
    const ruleId = this.$route.query.ruleId;
    if (ruleId) {
      const found = this.rules.find((r) => String(r.id) === String(ruleId));
      if (found) {
        this.editRule(found);
        try {
          setCurrentOrderCalcRuleId(found.id);
          this.currentRuleId = found.id;
        } catch {
          /* ignore */
        }
      }
    } else if (this.currentRule) {
      this.editRule(this.currentRule);
    }
    this.refreshFormulaPreview();
  },
  methods: {
    loadRules() {
      this.rules = listOrderCalcRules();
      const current = getCurrentOrderCalcRule();
      this.currentRuleId = current ? current.id : null;
    },
    formatDate(value) {
      if (!value) return '';
      const date = new Date(Number(value));
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleString();
    },
    ruleRowClassName({ row }) {
      return row && row.id === this.currentRuleId ? 'current-rule-row' : '';
    },
    shortHeader(header) {
      return String(header || '')
        .replace(/（[^）]*）/g, '')
        .replace(/\([^)]*\)/g, '')
        .trim();
    },
    humanizeFormulaText(text) {
      if (!text) return '';
      let s = String(text);
      s = s.replace(/ROUND\s*\(/gi, '四舍五入(');
      // 从 J 到 A 替换，避免字母冲突
      for (let i = this.orderLineHeadersWithLetters.length - 1; i >= 0; i--) {
        const { letter, header } = this.orderLineHeadersWithLetters[i];
        const name = this.shortHeader(header);
        s = s.replace(new RegExp(`\\b${letter}\\b`, 'gi'), `「${name}」`);
      }
      s = s
        .replace(/\*/g, ' × ')
        .replace(/\//g, ' ÷ ')
        .replace(/\+/g, ' + ')
        .replace(/-/g, ' − ');
      return s.replace(/\s+/g, ' ').trim();
    },
    humanizeFormula(f) {
      const target = this.orderLineHeadersWithLetters[f.targetColIndex];
      const left = target ? this.shortHeader(target.header) : '目标列';
      return `${left} = ${this.humanizeFormulaText(f.formulaText) || '（请填写公式）'}`;
    },
    plainFormulaLine(f) {
      return this.humanizeFormula(f);
    },
    stepPlainTitle(f) {
      const target = this.orderLineHeadersWithLetters[f.targetColIndex];
      const name = target ? this.shortHeader(target.header) : '目标列';
      if (!f.formulaText?.trim()) return `填写公式，结果写入「${name}」`;
      return `把结果写入「${name}」`;
    },
    rulePlainOneLine(rule) {
      if (!rule?.formulas?.length) return '无公式';
      return rule.formulas
        .slice(0, 2)
        .map((f) => this.plainFormulaLine(f))
        .join('；') + (rule.formulas.length > 2 ? '…' : '');
    },
    setFormulaInputRef(idx, el) {
      if (el) this.formulaInputRefs[idx] = el;
    },
    insertToken(idx, token) {
      this.activeFormulaIdx = idx;
      const f = this.formulas[idx];
      if (!f) return;
      let insert = token;
      let cursorBack = 0;
      if (token === '()') {
        insert = '()';
        cursorBack = 1;
      } else if (token === 'ROUND(,2)') {
        insert = 'ROUND(,2)';
        cursorBack = 3;
      }
      const inputComp = this.formulaInputRefs[idx];
      const native = inputComp?.input || inputComp?.$el?.querySelector?.('input');
      const cur = String(f.formulaText || '');
      if (native && typeof native.selectionStart === 'number') {
        const start = native.selectionStart;
        const end = native.selectionEnd;
        f.formulaText = cur.slice(0, start) + insert + cur.slice(end);
        this.$nextTick(() => {
          const pos = start + insert.length - cursorBack;
          native.focus();
          native.setSelectionRange(pos, pos);
        });
      } else {
        f.formulaText = cur + insert;
      }
      this.onFormulaChange();
    },
    applyTemplate(tpl) {
      this.ruleId = null;
      this.ruleName = tpl.name;
      this.formulas = (tpl.formulas || []).map((f) => ({
        formulaText: f.formulaText,
        targetColIndex: f.targetColIndex
      }));
      this.totalAmountTargetColIndex =
        tpl.totalAmountTargetColIndex != null ? tpl.totalAmountTargetColIndex : 9;
      this.decimalPlaces = Number.isInteger(tpl.decimalPlaces) ? tpl.decimalPlaces : 2;
      this.roundingMode = ['round', 'ceil', 'floor'].includes(tpl.roundingMode)
        ? tpl.roundingMode
        : 'round';
      this.activeFormulaIdx = 0;
      this.refreshFormulaPreview();
      this.$message.success(`已填入「${tpl.name}」，可继续微调后保存并启用`);
    },
    onFormulaChange() {
      this.refreshFormulaPreview();
    },
    addFormula() {
      this.formulas.push({ formulaText: '', targetColIndex: 6 });
      this.activeFormulaIdx = this.formulas.length - 1;
    },
    removeFormula(idx) {
      if (this.formulas.length <= 1) return;
      this.formulas.splice(idx, 1);
      if (this.activeFormulaIdx >= this.formulas.length) {
        this.activeFormulaIdx = this.formulas.length - 1;
      }
      this.refreshFormulaPreview();
    },
    moveFormulaUp(idx) {
      if (idx <= 0) return;
      const arr = this.formulas;
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      this.activeFormulaIdx = idx - 1;
      this.refreshFormulaPreview();
    },
    moveFormulaDown(idx) {
      if (idx >= this.formulas.length - 1) return;
      const arr = this.formulas;
      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
      this.activeFormulaIdx = idx + 1;
      this.refreshFormulaPreview();
    },
    sortFormulasByDep() {
      this.formulas = sortFormulasByDependency(this.formulas);
      this.refreshFormulaPreview();
      this.$message.success('已按依赖关系整理计算顺序');
    },
    resetForm() {
      this.ruleId = null;
      this.ruleName = '';
      this.formulas = [{ formulaText: '', targetColIndex: 3 }];
      this.totalAmountTargetColIndex = 9;
      this.decimalPlaces = 2;
      this.roundingMode = 'round';
      this.previewRow = [...SAMPLE_ROW];
      this.changedColIndexes = [];
      this.formulaPreviewError = '';
      this.activeFormulaIdx = 0;
    },
    async saveAndApply() {
      if (!this.ruleName.trim()) {
        this.$message.warning('请先填写规则名称');
        return;
      }
      const validFormulas = this.formulas.filter((f) => f.formulaText.trim());
      if (validFormulas.length === 0) {
        this.$message.warning('请至少填写一条计算公式');
        return;
      }
      this.saving = true;
      try {
        const saved = saveOrderCalcRule({
          id: this.ruleId,
          name: this.ruleName.trim(),
          formulas: validFormulas.map((f) => ({
            formulaText: f.formulaText.trim(),
            targetColIndex: f.targetColIndex
          })),
          totalAmountTargetColIndex: this.totalAmountTargetColIndex,
          decimalPlaces: this.decimalPlaces,
          roundingMode: this.roundingMode
        });
        this.ruleId = saved.id;
        setCurrentOrderCalcRuleId(saved.id);
        this.currentRuleId = saved.id;
        this.loadRules();
        this.$message.success(`「${saved.name}」已保存并启用`);
      } finally {
        this.saving = false;
      }
    },
    editRule(rule) {
      this.ruleId = rule.id;
      this.ruleName = rule.name;
      this.totalAmountTargetColIndex =
        rule.totalAmountTargetColIndex != null ? rule.totalAmountTargetColIndex : 9;
      this.decimalPlaces =
        Number.isInteger(rule.decimalPlaces) && rule.decimalPlaces >= 0 ? rule.decimalPlaces : 2;
      this.roundingMode = ['round', 'ceil', 'floor'].includes(rule.roundingMode)
        ? rule.roundingMode
        : 'round';
      this.formulas =
        rule.formulas && rule.formulas.length > 0
          ? rule.formulas.map((f) => ({
              formulaText: f.formulaText,
              targetColIndex: f.targetColIndex
            }))
          : [
              {
                formulaText: rule.formulaText || '',
                targetColIndex:
                  rule.formulaTargetColIndex != null ? rule.formulaTargetColIndex : 3
              }
            ];
      this.activeFormulaIdx = 0;
      this.refreshFormulaPreview();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    applyRule(rule) {
      setCurrentOrderCalcRuleId(rule.id);
      this.currentRuleId = rule.id;
      this.$message.success(`已启用「${rule.name}」`);
    },
    deleteRule(rule) {
      this.$confirm('确定删除该规则？删除后无法恢复。', '删除确认', {
        type: 'warning'
      })
        .then(() => {
          deleteOrderCalcRule(rule.id);
          if (this.ruleId === rule.id) this.resetForm();
          this.loadRules();
          this.$message.success('规则已删除');
        })
        .catch(() => {});
    },
    async refreshFormulaPreview() {
      const valid = this.formulas.filter((f) => f.formulaText.trim());
      this.sampleBeforeRow = [...SAMPLE_ROW];
      if (valid.length === 0) {
        this.previewRow = [...SAMPLE_ROW];
        this.changedColIndexes = [];
        this.formulaPreviewError = '';
        return;
      }
      const row = [...SAMPLE_ROW];
      const dp = this.decimalPlaces;
      const rm = this.roundingMode;
      const changed = [];
      try {
        for (const f of sortFormulasByDependency(valid)) {
          const result = await evaluateFormulaInWorker(f.formulaText.trim(), row, dp, rm);
          if (result != null && result !== '') {
            const next = String(result);
            if (String(row[f.targetColIndex] ?? '') !== next) {
              if (!changed.includes(f.targetColIndex)) changed.push(f.targetColIndex);
            }
            row[f.targetColIndex] = next;
          }
        }
        // 与样例对比，标出实际变化列
        const reallyChanged = [];
        for (let i = 0; i < row.length; i++) {
          if (String(row[i] ?? '') !== String(SAMPLE_ROW[i] ?? '')) reallyChanged.push(i);
        }
        this.previewRow = row;
        this.changedColIndexes = reallyChanged.length ? reallyChanged : changed;
        this.formulaPreviewError = '';
      } catch (e) {
        this.formulaPreviewError = e?.message || '公式计算失败，请检查写法';
        this.changedColIndexes = [];
      }
    },
    goBack() {
      this.$router.back();
    }
  }
};
</script>

<style scoped>
.order-calc-rules-page {
  max-width: 1120px;
  margin: 0 auto;
  padding-bottom: 40px;
}

.page-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.page-title-row h2 {
  margin: 0 0 6px;
  font-size: 22px;
  color: #1e3a5f;
}

.page-desc {
  margin: 0;
  max-width: 640px;
  line-height: 1.55;
  font-size: 13px;
}

.text-muted {
  color: #64748b;
}

.status-banner {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 20px;
  border-radius: 12px;
  margin-bottom: 16px;
  border: 1px solid #dbeafe;
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
}

.status-banner.is-empty {
  border-color: #e2e8f0;
  background: #f8fafc;
}

.status-banner__label {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}

.status-banner__title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}

.status-banner__lines {
  font-size: 13px;
  color: #334155;
  line-height: 1.55;
}

.status-banner__hint {
  flex: 0 0 220px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.55;
  align-self: center;
}

.section-card {
  margin-bottom: 16px;
  border-radius: 12px;
}

.section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}

.section-sub {
  font-size: 12px;
  font-weight: 400;
  color: #94a3b8;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.template-card {
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.15s;
}

.template-card:hover {
  border-color: #93c5fd;
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.12);
  transform: translateY(-1px);
}

.template-card__name {
  font-weight: 700;
  font-size: 14px;
  color: #1e3a5f;
  margin-bottom: 6px;
}

.template-card__desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.rule-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #475569;
}

.steps-block {
  margin-bottom: 8px;
}

.step-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: #fafbfc;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.step-card.is-focused {
  border-color: #93c5fd;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  background: #fff;
}

.step-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.step-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
}

.step-plain {
  flex: 1;
  min-width: 160px;
  font-size: 13px;
  color: #334155;
  font-weight: 500;
}

.step-actions {
  margin-left: auto;
}

.step-card__body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.step-field {
  width: 220px;
  flex-shrink: 0;
}

.step-field--grow {
  flex: 1;
  min-width: 0;
}

.step-field label {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.opt-letter {
  float: right;
  color: #94a3b8;
  font-size: 12px;
}

.chip-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 8px;
}

.chip-bar__label {
  font-size: 11px;
  color: #94a3b8;
  margin-right: 2px;
}

.chip {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
  line-height: 1.4;
}

.chip:hover {
  border-color: #93c5fd;
  color: #1d4ed8;
  background: #eff6ff;
}

.chip--op {
  font-weight: 600;
  min-width: 28px;
}

.formula-human {
  margin-top: 8px;
  font-size: 12px;
  color: #1d4ed8;
  background: #eff6ff;
  border-radius: 6px;
  padding: 6px 10px;
  line-height: 1.45;
}

.steps-toolbar {
  display: flex;
  gap: 8px;
  margin: 4px 0 16px;
}

.format-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 12px;
}

.format-item {
  flex: 1;
  min-width: 200px;
}

.format-item--narrow {
  flex: 0 0 160px;
  min-width: 140px;
}

.format-item label {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.help-collapse {
  margin-bottom: 16px;
  border: none;
}

.help-collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: #64748b;
  height: 40px;
  border: none;
  background: transparent;
}

.help-collapse :deep(.el-collapse-item__wrap) {
  border: none;
  background: transparent;
}

.help-list {
  margin: 0;
  padding-left: 18px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.7;
}

.primary-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 4px;
}

.primary-actions__hint {
  font-size: 12px;
  color: #94a3b8;
}

.preview-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.preview-pane__title {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 8px;
}

.table-preview-wrap {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.table-preview {
  width: 100%;
  border-collapse: collapse;
  min-width: 520px;
  font-size: 12px;
}

.table-preview th,
.table-preview td {
  border-bottom: 1px solid #eef2f7;
  border-right: 1px solid #eef2f7;
  padding: 8px 6px;
  text-align: center;
  white-space: nowrap;
}

.table-preview th {
  background: #f8fafc;
  font-weight: 600;
  color: #475569;
}

.table-preview td.is-changed {
  background: #dbeafe;
  color: #1d4ed8;
  font-weight: 700;
}

.preview-footer {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

.preview-error {
  color: #dc2626;
}

.change-tag {
  margin-left: 6px;
  margin-top: 2px;
}

.current-rule-row {
  background: #f0fdf4 !important;
}

.rule-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #0f172a;
}

.rule-plain-mini {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

@media (max-width: 960px) {
  .template-grid,
  .preview-compare {
    grid-template-columns: 1fr;
  }

  .step-card__body {
    flex-direction: column;
  }

  .step-field {
    width: 100%;
  }

  .status-banner {
    flex-direction: column;
  }

  .status-banner__hint {
    flex: none;
  }
}
</style>
