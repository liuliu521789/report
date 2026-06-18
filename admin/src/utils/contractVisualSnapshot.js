import { createDefaultVisual } from './contractVisualDefaults';

export function parseContractDataJson(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/** 从合同 data_json 取出可视化表单快照（保存时写入） */
export function contractVisualFromDataJson(dataJson) {
  const snap = parseContractDataJson(dataJson).contract_visual;
  if (!snap || typeof snap !== 'object') return null;
  return snap;
}

function cloneJson(val) {
  try {
    return JSON.parse(JSON.stringify(val));
  } catch {
    return null;
  }
}

function mergePartyItems(parsed, snap) {
  // 快照若存有空值的条项（因先前解析失败导致），不应覆盖解析出的真实值
  if (!snap || !Array.isArray(snap)) return parsed;
  const snapItems = snap.map((s) => (s ? { ...s } : {}));
  if (!Array.isArray(parsed) || !parsed.length) return snapItems;
  const maxLen = Math.max(snapItems.length, parsed.length);
  return Array.from({ length: maxLen }, (_, i) => {
    const p = parsed[i];
    const s = snapItems[i];
    if (!s) return p ? { ...p } : { label: '', value: '' };
    if (!p) return s;
    return { ...s, value: s.value || p.value };
  });
}

/** 将快照合并进 parse 结果或默认 visual，优先保留快照中的订单表等用户填写项 */
export function applyContractVisualSnapshot(visual, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return visual;
  const base = visual || createDefaultVisual();
  const out = { ...base, ...snapshot };
  if (Array.isArray(snapshot.tableRows)) {
    out.tableRows = snapshot.tableRows.map((row) => (Array.isArray(row) ? [...row] : []));
  }
  if (Array.isArray(snapshot.tableRowSpecs)) {
    out.tableRowSpecs = snapshot.tableRowSpecs.map((s) => String(s ?? ''));
  }
  if (Array.isArray(snapshot.clauses)) {
    out.clauses = cloneJson(snapshot.clauses) || base.clauses;
  }
  if (Array.isArray(snapshot.headerItemsLeft)) {
    out.headerItemsLeft = mergePartyItems(base.headerItemsLeft, snapshot.headerItemsLeft);
  }
  if (Array.isArray(snapshot.headerItemsRight)) {
    out.headerItemsRight = mergePartyItems(base.headerItemsRight, snapshot.headerItemsRight);
  }
  if (Array.isArray(snapshot.partySellerItems)) {
    out.partySellerItems = mergePartyItems(base.partySellerItems, snapshot.partySellerItems);
  }
  if (Array.isArray(snapshot.partyBuyerItems)) {
    out.partyBuyerItems = mergePartyItems(base.partyBuyerItems, snapshot.partyBuyerItems);
  }
  if (snapshot.tableTotalText != null) {
    out.tableTotalText = String(snapshot.tableTotalText);
  }
  // 恢复公式设置
  if (snapshot.formulaText != null) out.formulaText = String(snapshot.formulaText);
  if (snapshot.formulaTargetColIndex != null) out.formulaTargetColIndex = Number(snapshot.formulaTargetColIndex);
  if (Array.isArray(snapshot.formulas)) {
    out.formulas = snapshot.formulas.map((f) => ({
      formulaText: String(f.formulaText || '').trim(),
      targetColIndex: Number.isFinite(Number(f.targetColIndex)) ? Number(f.targetColIndex) : 0
    }));
  }
  if (snapshot.totalAmountTargetColIndex != null) out.totalAmountTargetColIndex = Number(snapshot.totalAmountTargetColIndex);
  if (snapshot.decimalPlaces != null) out.decimalPlaces = Number(snapshot.decimalPlaces);
  if (snapshot.roundingMode != null) out.roundingMode = String(snapshot.roundingMode);
  return out;
}

/** 保存合同时写入 data_json.contract_visual */
export function buildContractVisualSnapshot(visual) {
  const v = visual || {};
  return {
    headerCompanyZh: v.headerCompanyZh ?? '',
    headerTitleZh: v.headerTitleZh ?? '',
    headerItemsLeft: cloneJson(v.headerItemsLeft) || [],
    headerItemsRight: cloneJson(v.headerItemsRight) || [],
    clauses: cloneJson(v.clauses) || [],
    tableRows: Array.isArray(v.tableRows) ? v.tableRows.map((row) => (Array.isArray(row) ? [...row] : [])) : [],
    tableRowSpecs: Array.isArray(v.tableRowSpecs)
      ? v.tableRowSpecs.map((s) => String(s ?? ''))
      : (v.tableRows || []).map(() => ''),
    tableTotalText: v.tableTotalText ?? '',
    showPartyBlock: !!v.showPartyBlock,
    partySellerItems: cloneJson(v.partySellerItems) || [],
    partyBuyerItems: cloneJson(v.partyBuyerItems) || []
    ,
    // 保存公式设置
    formulaText: v.formulaText ?? '',
    formulaTargetColIndex: Number.isFinite(Number(v.formulaTargetColIndex)) ? Number(v.formulaTargetColIndex) : 3,
    formulas: Array.isArray(v.formulas) ? v.formulas.map((f) => ({
      formulaText: String(f.formulaText || '').trim(),
      targetColIndex: Number.isFinite(Number(f.targetColIndex)) ? Number(f.targetColIndex) : 0
    })) : [],
    totalAmountTargetColIndex: Number.isFinite(Number(v.totalAmountTargetColIndex)) ? Number(v.totalAmountTargetColIndex) : 9,
    decimalPlaces: Number.isFinite(Number(v.decimalPlaces)) ? Number(v.decimalPlaces) : 2,
    roundingMode: v.roundingMode || 'round'
  };
}
