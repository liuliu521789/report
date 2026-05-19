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
    out.headerItemsLeft = cloneJson(snapshot.headerItemsLeft) || base.headerItemsLeft;
  }
  if (Array.isArray(snapshot.headerItemsRight)) {
    out.headerItemsRight = cloneJson(snapshot.headerItemsRight) || base.headerItemsRight;
  }
  if (Array.isArray(snapshot.partySellerItems)) {
    out.partySellerItems = cloneJson(snapshot.partySellerItems) || base.partySellerItems;
  }
  if (Array.isArray(snapshot.partyBuyerItems)) {
    out.partyBuyerItems = cloneJson(snapshot.partyBuyerItems) || base.partyBuyerItems;
  }
  if (snapshot.tableTotalText != null) {
    out.tableTotalText = String(snapshot.tableTotalText);
  }
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
  };
}
