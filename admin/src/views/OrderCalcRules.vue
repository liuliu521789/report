<template>
  <div class="order-calc-rules-page">
    <div class="page-title-row">
      <div>
        <h2>订单计算规则设置</h2>
        <p class="text-muted">设置订单信息表的计算规则，并可管理历史规则、应用当前规则。</p>
      </div>
      <div>
        <el-button type="primary" @click="goBack">返回</el-button>
      </div>
    </div>

    <el-card class="rule-editor-card">
      <div class="section-header">规则配置</div>
      <el-form label-width="110px">
        <el-form-item label="规则名称">
          <el-input v-model="ruleName" placeholder="例如：含税单价转不含税单价" />
        </el-form-item>
        <el-form-item label="公式列表">
          <div class="formula-list-wrap">
            <div
              v-for="(f, idx) in formulas"
              :key="idx"
              class="formula-row"
            >
              <div class="formula-row-header">
                <span class="formula-index">#{{ idx + 1 }}</span>
                <el-button text size="small" @click="moveFormulaUp(idx)" :disabled="idx === 0">▲</el-button>
                <el-button text size="small" @click="moveFormulaDown(idx)" :disabled="idx === formulas.length - 1">▼</el-button>
                <el-button text size="small" type="danger" @click="removeFormula(idx)" :disabled="formulas.length <= 1">×</el-button>
              </div>
              <div class="formula-row-body">
                <div class="formula-input-wrap">
                  <label class="formula-field-label">公式</label>
                  <el-input
                    v-model="f.formulaText"
                    clearable
                    placeholder="例如 ROUND(C/(1+H),2) 或 D*E"
                    @input="refreshFormulaPreview"
                  />
                </div>
                <div class="formula-target-wrap">
                  <label class="formula-field-label">目标列</label>
                  <el-select
                    v-model="f.targetColIndex"
                    placeholder="请选择"
                    @change="refreshFormulaPreview"
                  >
                    <el-option
                      v-for="({ header, letter }, ci) in orderLineHeadersWithLetters"
                      :key="`target-${idx}-${ci}`"
                      :label="`${letter} ${header}`"
                      :value="ci"
                    />
                  </el-select>
                </div>
              </div>
              <div class="formula-row-preview">
                <span class="text-muted small">
                  {{ formatResult(f) }}
                </span>
              </div>
            </div>
            <div class="formula-actions">
              <el-button size="small" @click="addFormula">+ 添加公式</el-button>
              <el-button size="small" @click="sortFormulasByDep">按依赖排序</el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="总金额">
          <div class="total-amount-setting">
            <div class="text-muted small" style="margin-bottom: 6px;">
              总金额为目标列的汇总合计，将显示在表格底部的"总金额"行。
            </div>
            <el-select v-model="totalAmountTargetColIndex" placeholder="请选择总金额来源列">
              <el-option
                v-for="({ header, letter }, ci) in orderLineHeadersWithLetters"
                :key="`total-${ci}`"
                :label="`${letter} ${header}`"
                :value="ci"
              />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="金额格式">
          <div class="format-setting-row">
            <div class="format-setting-item format-setting-item--decimal">
              <label class="format-field-label">小数位数</label>
              <el-input-number v-model="decimalPlaces" :min="0" :max="6" controls-position="right" class="format-decimal-input" />
            </div>
            <div class="format-setting-item format-setting-item--rounding">
              <label class="format-field-label">取整方式</label>
              <el-select v-model="roundingMode" placeholder="请选择取整方式" class="format-rounding-select">
                <el-option label="四舍五入" value="round" />
                <el-option label="向上取整" value="ceil" />
                <el-option label="向下取整" value="floor" />
              </el-select>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="表格预览" class="preview-table-item">
          <div class="table-preview-wrap">
            <table class="table-preview">
              <thead>
                <tr>
                  <th v-for="({ letter }, idx) in orderLineHeadersWithLetters" :key="`head-${idx}`">{{ letter }}</th>
                </tr>
                <tr>
                  <th v-for="({ header }, idx) in orderLineHeadersWithLetters" :key="`name-${idx}`">{{ header }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td v-for="(cell, idx) in previewRow" :key="`cell-${idx}`" :class="{ 'preview-cell-changed': idx === changedColIndex }">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="preview-footer">
            <div><strong>公式预览结果（首行）：</strong> {{ formulaPreview || '公式填写后实时计算' }}</div>
            <div class="text-muted">
              当前应用规则：{{ currentRuleName || '尚未应用任何历史规则' }}
            </div>
          </div>
          <div v-if="currentRuleName" class="current-rule-display">
            <div
              v-for="(line, li) in currentRuleDisplayLines"
              :key="li"
              class="current-rule-line"
            >
              <small>{{ line }}</small>
            </div>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveRule">保存规则</el-button>
          <el-button @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="rule-history-card">
      <div class="section-header">历史规则列表</div>
      <div class="current-rule-summary">
        <div class="summary-title">当前正在使用的计算规则</div>
        <div v-if="currentRuleName">
          <div class="summary-line"><strong>规则名称：</strong>{{ currentRuleName }}</div>
          <div
            v-for="(line, li) in currentRuleDisplayLines"
            :key="`sum-${li}`"
            class="summary-line"
          >{{ line }}</div>
        </div>
        <div v-else class="text-muted">当前暂无应用规则，保存并应用后这里会显示正在使用的计算方式。</div>
      </div>
      <el-table :data="rules" stripe style="width: 100%" :row-class-name="ruleRowClassName">
        <el-table-column label="规则名称" width="220">
          <template #default="{ row }">
            <span>{{ row.name }}</span>
            <el-tag v-if="row.id === currentRuleId" type="success" size="small" style="margin-left: 8px">正在使用</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="公式" min-width="280">
          <template #default="{ row }">
            <div v-for="(f, fi) in row.formulas" :key="fi" class="history-formula-line">
              <small class="text-muted">{{ ruleFormulaLine(row, fi) }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240">
          <template #default="{ row }">
            <el-button type="text" size="small" @click="editRule(row)">编辑</el-button>
            <el-button type="text" size="small" @click="applyRule(row)">应用</el-button>
            <el-button type="text" size="small" style="color:#f56c6c" @click="deleteRule(row)">删除</el-button>
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
  loadRulesFromServer
} from '../utils/orderCalcRuleStore';

const SAMPLE_ROW = ['', 'NL385', '1130.00', '1000.00', '10.00', '15', '10000.00', '13%', '1300.00', '11300.00'];

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
      formulaPreview: '',
      currentRuleId: null,
      previewRow: [...SAMPLE_ROW],
      changedColIndex: -1
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
    currentRuleDisplayLines() {
      if (!this.currentRule || !this.currentRule.formulas || !this.currentRule.formulas.length) return [];
      const lines = this.currentRule.formulas.map((f, fi) => {
        return this.ruleFormulaLine(this.currentRule, fi);
      });
      lines.push(this.ruleTotalAmountLine(this.currentRule));
      lines.push(this.ruleFormatLine(this.currentRule));
      return lines;
    }
  },
  async mounted() {
    ensureDefaultRule();
    await loadRulesFromServer();
    const ruleId = this.$route.query.ruleId;
    this.loadRules();
    if (ruleId) {
      const found = this.rules.find(r => String(r.id) === String(ruleId));
      if (found) {
        this.currentRuleId = found.id;
        this.$nextTick(() => {
          this.$set(this, 'currentRuleId', found.id);
        });
        try {
          setCurrentOrderCalcRuleId(found.id);
        } catch (e) {
          if (this.applyRule) this.applyRule(found);
        }
      }
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
    ruleFormulaLine(rule, fi) {
      const f = rule.formulas && rule.formulas[fi];
      if (!f) return '';
      const target = this.orderLineHeadersWithLetters[f.targetColIndex];
      const letter = target ? target.letter : `列${f.targetColIndex}`;
      const headers = this.orderLineHeadersWithLetters.reduce((acc, item) => {
        const regex = new RegExp(`\\b${item.letter}\\b`, 'g');
        return acc.replace(regex, item.header);
      }, f.formulaText);
      const headerName = target ? target.header : `列${f.targetColIndex}`;
      return `${letter}（${headerName}） = ${f.formulaText}  →  ${headers}`;
    },
    ruleTotalAmountLine(rule) {
      const idx = rule.totalAmountTargetColIndex != null ? rule.totalAmountTargetColIndex : 9;
      const target = this.orderLineHeadersWithLetters[idx];
      const label = target ? `${target.letter}（${target.header}）` : `列${idx}`;
      return `总金额 = 汇总合计 ${label}`;
    },
    ruleFormatLine(rule) {
      const dp = Number.isInteger(rule.decimalPlaces) && rule.decimalPlaces >= 0 ? rule.decimalPlaces : 2;
      const modeMap = { round: '四舍五入', ceil: '向上取整', floor: '向下取整' };
      const mode = modeMap[rule.roundingMode] || '四舍五入';
      return `金额格式 = 保留 ${dp} 位小数，${mode}`;
    },
    formatResult(f) {
      if (!f.formulaText || !this.formulaPreview) return '';
      const target = this.orderLineHeadersWithLetters[f.targetColIndex];
      return target ? `→ ${target.letter} ${target.header}` : '';
    },
    addFormula() {
      this.formulas.push({ formulaText: '', targetColIndex: 3 });
    },
    removeFormula(idx) {
      if (this.formulas.length <= 1) return;
      this.formulas.splice(idx, 1);
      this.refreshFormulaPreview();
    },
    moveFormulaUp(idx) {
      if (idx <= 0) return;
      const tmp = this.formulas[idx - 1];
      this.$set(this.formulas, idx - 1, this.formulas[idx]);
      this.$set(this.formulas, idx, tmp);
      this.refreshFormulaPreview();
    },
    moveFormulaDown(idx) {
      if (idx >= this.formulas.length - 1) return;
      const tmp = this.formulas[idx + 1];
      this.$set(this.formulas, idx + 1, this.formulas[idx]);
      this.$set(this.formulas, idx, tmp);
      this.refreshFormulaPreview();
    },
    sortFormulasByDep() {
      this.formulas = sortFormulasByDependency(this.formulas);
      this.refreshFormulaPreview();
    },
    resetForm() {
      this.ruleId = null;
      this.ruleName = '';
      this.formulas = [{ formulaText: '', targetColIndex: 3 }];
      this.totalAmountTargetColIndex = 9;
      this.decimalPlaces = 2;
      this.roundingMode = 'round';
      this.formulaPreview = '';
      this.previewRow = [...SAMPLE_ROW];
      this.changedColIndex = -1;
    },
    async saveRule() {
      if (!this.ruleName.trim()) {
        this.$message.warning('请先填写规则名称');
        return;
      }
      const validFormulas = this.formulas.filter(f => f.formulaText.trim());
      if (validFormulas.length === 0) {
        this.$message.warning('请至少填写一条公式');
        return;
      }
      const saved = saveOrderCalcRule({
        id: this.ruleId,
        name: this.ruleName,
        formulas: validFormulas.map(f => ({
          formulaText: f.formulaText.trim(),
          targetColIndex: f.targetColIndex
        })),
        totalAmountTargetColIndex: this.totalAmountTargetColIndex,
        decimalPlaces: this.decimalPlaces,
        roundingMode: this.roundingMode
      });
      this.ruleId = saved.id;
      this.$message.success('规则已保存');
      this.loadRules();
    },
    editRule(rule) {
      this.ruleId = rule.id;
      this.ruleName = rule.name;
      this.totalAmountTargetColIndex = rule.totalAmountTargetColIndex != null ? rule.totalAmountTargetColIndex : 9;
      this.decimalPlaces = Number.isInteger(rule.decimalPlaces) && rule.decimalPlaces >= 0 ? rule.decimalPlaces : 2;
      this.roundingMode = ['round', 'ceil', 'floor'].includes(rule.roundingMode) ? rule.roundingMode : 'round';
      this.formulas = (rule.formulas && rule.formulas.length > 0)
        ? rule.formulas.map(f => ({ formulaText: f.formulaText, targetColIndex: f.targetColIndex }))
        : [{ formulaText: rule.formulaText || '', targetColIndex: rule.formulaTargetColIndex != null ? rule.formulaTargetColIndex : 3 }];
      this.refreshFormulaPreview();
    },
    applyRule(rule) {
      setCurrentOrderCalcRuleId(rule.id);
      this.currentRuleId = rule.id;
      this.$message.success(`已应用规则「${rule.name}」`);
    },
    deleteRule(rule) {
      this.$confirm('确定要删除该规则吗？删除后无法恢复。', '删除确认', {
        type: 'warning'
      })
        .then(() => {
          deleteOrderCalcRule(rule.id);
          if (this.ruleId === rule.id) {
            this.resetForm();
          }
          this.loadRules();
          this.$message.success('规则已删除');
        })
        .catch(() => {});
    },
    async refreshFormulaPreview() {
      const valid = this.formulas.filter(f => f.formulaText.trim());
      if (valid.length === 0) {
        this.formulaPreview = '';
        this.previewRow = [...SAMPLE_ROW];
        this.changedColIndex = -1;
        return;
      }
      const row = [...SAMPLE_ROW];
      const dp = this.currentRule?.decimalPlaces ?? 2;
      const rm = this.currentRule?.roundingMode ?? 'round';
      try {
        for (const f of valid) {
          const result = await evaluateFormulaInWorker(f.formulaText.trim(), row, dp, rm);
          if (result != null && result !== '') {
            row[f.targetColIndex] = String(result);
          }
        }
        this.previewRow = row;
        const lastFormula = valid[valid.length - 1];
        this.changedColIndex = lastFormula.targetColIndex;
        const lastResult = row[lastFormula.targetColIndex];
        this.formulaPreview = lastResult != null ? String(lastResult) : '';
      } catch {
        this.formulaPreview = '公式计算失败';
        this.changedColIndex = -1;
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
  min-width: 920px;
}
.page-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.section-header {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 16px;
}
.rule-editor-card,
.rule-history-card {
  margin-bottom: 20px;
}
.preview-table-item {
  padding-bottom: 0;
}
.table-preview-wrap {
  overflow-x: auto;
  margin-bottom: 10px;
}
.table-preview {
  width: 100%;
  border-collapse: collapse;
  min-width: 860px;
}
.table-preview th,
.table-preview td {
  border: 1px solid #e9eef2;
  padding: 8px 10px;
  text-align: center;
  white-space: nowrap;
}
.table-preview th {
  background: #fafbfc;
  font-weight: 700;
}
.preview-cell-changed {
  background: #e6f7ff;
  font-weight: 700;
  color: #1890ff;
}
.preview-footer {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  color: #606266;
}
.current-rule-row {
  background: #f0f9eb;
}
.current-rule-display {
  margin-top: 8px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
}
.current-rule-line small {
  display: block;
  line-height: 1.6;
}
.current-rule-summary {
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #f5f7fa;
  color: #606266;
}
.current-rule-summary .summary-title {
  font-weight: 700;
  margin-bottom: 8px;
}
.current-rule-summary .summary-line {
  margin-bottom: 4px;
}
.formula-list-wrap {
  width: 100%;
}
.formula-row {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #fafbfc;
}
.formula-row-header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}
.formula-index {
  font-weight: 700;
  font-size: 13px;
  min-width: 28px;
}
.formula-row-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.formula-input-wrap {
  flex: 1;
}
.formula-target-wrap {
  width: 220px;
  flex-shrink: 0;
}
.formula-field-label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}
.formula-row-preview {
  margin-top: 6px;
}
.formula-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.small {
  font-size: 12px;
}
.format-setting-row {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}
.format-setting-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
.format-setting-item--decimal :deep(.format-decimal-input) {
  width: 140px;
}
.format-setting-item--rounding :deep(.format-rounding-select) {
  width: 160px;
}
.format-setting-item--rounding :deep(.el-select__wrapper) {
  min-height: 32px;
}
.format-setting-item--rounding :deep(.el-select__selected-item),
.format-setting-item--rounding :deep(.el-select__placeholder) {
  line-height: 1.5;
}
.format-field-label {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
.history-formula-line {
  line-height: 1.6;
}
</style>
