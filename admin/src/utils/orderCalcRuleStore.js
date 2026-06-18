import { http } from '../api/http';

const STORAGE_KEY = 'orderCalcRules';

function loadStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { rules: [], currentRuleId: null };
  try {
    const data = JSON.parse(raw);
    return {
      rules: Array.isArray(data.rules) ? data.rules : [],
      currentRuleId: data.currentRuleId || null
    };
  } catch {
    return { rules: [], currentRuleId: null };
  }
}

function saveStore(store) {
  const payload = {
    rules: Array.isArray(store.rules) ? store.rules : [],
    currentRuleId: store.currentRuleId || null
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function normalizeFormulas(rule) {
  let formulas = Array.isArray(rule.formulas) ? rule.formulas : [];
  if (formulas.length === 0 && rule.formulaText) {
    formulas = [{
      formulaText: String(rule.formulaText || '').trim(),
      targetColIndex: Number.isFinite(Number(rule.formulaTargetColIndex)) ? Number(rule.formulaTargetColIndex) : 0
    }];
  }
  return formulas.map((f) => ({
    formulaText: String(f.formulaText || '').trim(),
    targetColIndex: Number.isFinite(Number(f.targetColIndex)) ? Number(f.targetColIndex) : 0
  }));
}

export const DEFAULT_TOTAL_AMOUNT_TARGET_COL_INDEX = 9;
export const DEFAULT_DECIMAL_PLACES = 2;
export const DEFAULT_ROUNDING_MODE = 'round';

function normalizeRule(rule) {
  const formulas = normalizeFormulas(rule);
  return {
    id: rule.id ? String(rule.id) : `rule-${Date.now()}`,
    name: String(rule.name || '').trim(),
    formulas,
    formulaText: formulas.length > 0 ? formulas[0].formulaText : '',
    formulaTargetColIndex: formulas.length > 0 ? formulas[0].targetColIndex : 0,
    totalAmountTargetColIndex: Number.isFinite(Number(rule.totalAmountTargetColIndex)) ? Number(rule.totalAmountTargetColIndex) : DEFAULT_TOTAL_AMOUNT_TARGET_COL_INDEX,
    decimalPlaces: Number.isInteger(Number(rule.decimalPlaces)) && Number(rule.decimalPlaces) >= 0 ? Number(rule.decimalPlaces) : DEFAULT_DECIMAL_PLACES,
    roundingMode: ['round', 'ceil', 'floor'].includes(rule.roundingMode) ? rule.roundingMode : DEFAULT_ROUNDING_MODE,
    createdAt: rule.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

export function listOrderCalcRules() {
  const store = loadStore();
  return store.rules.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getOrderCalcRule(id) {
  if (!id) return null;
  const store = loadStore();
  return store.rules.find((rule) => String(rule.id) === String(id)) || null;
}

export function saveOrderCalcRule(rule) {
  const store = loadStore();
  const next = normalizeRule(rule);
  const index = store.rules.findIndex((item) => String(item.id) === String(next.id));
  if (index >= 0) {
    next.createdAt = store.rules[index].createdAt || next.createdAt;
    store.rules[index] = next;
  } else {
    store.rules.unshift(next);
  }
  store.currentRuleId = next.id;
  saveStore(store);
  syncToServer(rule).catch(() => {});
  return next;
}

export function deleteOrderCalcRule(id) {
  const store = loadStore();
  store.rules = store.rules.filter((rule) => String(rule.id) !== String(id));
  if (String(store.currentRuleId) === String(id)) {
    store.currentRuleId = store.rules.length ? store.rules[0].id : null;
  }
  saveStore(store);
  http.delete(`/api/sales/order-calc-rules/${id}`).catch(() => {});
  return store;
}

export function setCurrentOrderCalcRuleId(id) {
  const store = loadStore();
  if (!store.rules.some((rule) => String(rule.id) === String(id))) {
    return null;
  }
  store.currentRuleId = id;
  saveStore(store);
  http.post(`/api/sales/order-calc-rules/${id}/set-current`).catch(() => {});
  return getOrderCalcRule(id);
}

export function getCurrentOrderCalcRule() {
  const store = loadStore();
  return getOrderCalcRule(store.currentRuleId);
}

export function getCurrentTotalAmountTargetColIndex() {
  const rule = getCurrentOrderCalcRule();
  return rule && Number.isFinite(Number(rule.totalAmountTargetColIndex))
    ? Number(rule.totalAmountTargetColIndex)
    : DEFAULT_TOTAL_AMOUNT_TARGET_COL_INDEX;
}

export function getCurrentDecimalPlaces() {
  const rule = getCurrentOrderCalcRule();
  return rule && Number.isInteger(Number(rule.decimalPlaces)) && Number(rule.decimalPlaces) >= 0
    ? Number(rule.decimalPlaces)
    : DEFAULT_DECIMAL_PLACES;
}

export function getCurrentRoundingMode() {
  const rule = getCurrentOrderCalcRule();
  return rule && ['round', 'ceil', 'floor'].includes(rule.roundingMode)
    ? rule.roundingMode
    : DEFAULT_ROUNDING_MODE;
}

const COL_LETTERS = 'ABCDEFGHIJ';

function extractColReferences(formulaText) {
  const refs = new Set();
  const upper = formulaText.toUpperCase();
  for (const ch of upper) {
    const idx = COL_LETTERS.indexOf(ch);
    if (idx >= 0) refs.add(idx);
  }
  return refs;
}

export function sortFormulasByDependency(formulas) {
  const list = formulas.map((f, i) => ({
    ...f,
    reads: extractColReferences(f.formulaText),
    writes: f.targetColIndex,
    origIndex: i
  }));

  const n = list.length;
  const inDegree = new Array(n).fill(0);
  const graph = new Array(n).fill(null).map(() => []);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (list[i].reads.has(list[j].writes)) {
        graph[j].push(i);
        inDegree[i]++;
      }
    }
  }

  const queue = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const sorted = [];
  while (queue.length > 0) {
    const idx = queue.shift();
    sorted.push(list[idx]);
    for (const next of graph[idx]) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  if (sorted.length !== n) {
    return formulas;
  }

  return sorted.map((item) => ({
    formulaText: item.formulaText,
    targetColIndex: item.targetColIndex
  }));
}

export const BUILT_IN_DEFAULT_RULE = {
  name: '默认含税转不含税计算',
  formulas: [
    { formulaText: 'ROUND(C/(1+H),2)', targetColIndex: 3 },
    { formulaText: 'D*E', targetColIndex: 6 },
    { formulaText: 'C*E', targetColIndex: 9 },
    { formulaText: 'J-G', targetColIndex: 8 }
  ],
  totalAmountTargetColIndex: DEFAULT_TOTAL_AMOUNT_TARGET_COL_INDEX,
  decimalPlaces: DEFAULT_DECIMAL_PLACES,
  roundingMode: DEFAULT_ROUNDING_MODE
};

export function ensureDefaultRule() {
  const store = loadStore();
  if (store.rules.length > 0) return;
  const rule = normalizeRule(BUILT_IN_DEFAULT_RULE);
  store.rules.unshift(rule);
  store.currentRuleId = rule.id;
  saveStore(store);
}

async function syncToServer(rule) {
  try {
    const store = loadStore();
    const isNew = !rule.id || !rule.id.startsWith('rule-');
    const payload = {
      name: rule.name,
      formulas: rule.formulas || [],
      totalAmountTargetColIndex: rule.totalAmountTargetColIndex != null ? rule.totalAmountTargetColIndex : DEFAULT_TOTAL_AMOUNT_TARGET_COL_INDEX,
      decimalPlaces: Number.isInteger(Number(rule.decimalPlaces)) && Number(rule.decimalPlaces) >= 0 ? Number(rule.decimalPlaces) : DEFAULT_DECIMAL_PLACES,
      roundingMode: ['round', 'ceil', 'floor'].includes(rule.roundingMode) ? rule.roundingMode : DEFAULT_ROUNDING_MODE
    };
    if (isNew) {
      payload.setCurrent = String(store.currentRuleId) === String(rule.id);
      await http.post('/api/sales/order-calc-rules', payload);
    } else {
      const serverId = rule.id.replace('rule-', '');
      await http.put(`/api/sales/order-calc-rules/${serverId}`, payload);
    }
  } catch {
    // 无后端或网络异常时静默降级为 localStorage-only
  }
}

export async function loadRulesFromServer() {
  try {
    const { items } = await http.get('/api/sales/order-calc-rules');
    if (!Array.isArray(items) || !items.length) return;
    const store = loadStore();
    for (const item of items) {
      const existing = store.rules.find((r) => r.id === item.id);
      if (existing) {
        existing.name = item.name;
        existing.formulas = item.formulas;
        existing.formulaText = item.formulas.length > 0 ? item.formulas[0].formulaText : '';
        existing.formulaTargetColIndex = item.formulas.length > 0 ? item.formulas[0].targetColIndex : 0;
        existing.totalAmountTargetColIndex = item.totalAmountTargetColIndex != null ? item.totalAmountTargetColIndex : DEFAULT_TOTAL_AMOUNT_TARGET_COL_INDEX;
        existing.decimalPlaces = Number.isInteger(Number(item.decimalPlaces)) && Number(item.decimalPlaces) >= 0 ? Number(item.decimalPlaces) : DEFAULT_DECIMAL_PLACES;
        existing.roundingMode = ['round', 'ceil', 'floor'].includes(item.roundingMode) ? item.roundingMode : DEFAULT_ROUNDING_MODE;
        existing.updatedAt = item.updatedAt;
      } else {
        store.rules.push({
          id: item.id,
          name: item.name,
          formulas: item.formulas,
          formulaText: item.formulas.length > 0 ? item.formulas[0].formulaText : '',
          formulaTargetColIndex: item.formulas.length > 0 ? item.formulas[0].targetColIndex : 0,
          totalAmountTargetColIndex: item.totalAmountTargetColIndex != null ? item.totalAmountTargetColIndex : DEFAULT_TOTAL_AMOUNT_TARGET_COL_INDEX,
          decimalPlaces: Number.isInteger(Number(item.decimalPlaces)) && Number(item.decimalPlaces) >= 0 ? Number(item.decimalPlaces) : DEFAULT_DECIMAL_PLACES,
          roundingMode: ['round', 'ceil', 'floor'].includes(item.roundingMode) ? item.roundingMode : DEFAULT_ROUNDING_MODE,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        });
      }
      if (item.isCurrent) {
        store.currentRuleId = item.id;
      }
    }
    saveStore(store);
  } catch {
    // 静默降级
  }
}
