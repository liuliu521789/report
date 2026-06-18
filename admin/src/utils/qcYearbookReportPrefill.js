import { normalizeInspectionItemZh } from './inspectionItemSuggestions.js';

function itemMatchKey(zh) {
  return normalizeInspectionItemZh(String(zh || ''))
    .toLowerCase()
    .replace(/[(%（）)]/g, '');
}

function rowItemKey(row) {
  const raw = row?.item;
  const zh = typeof raw === 'object' ? raw?.zh ?? raw?.cn ?? '' : raw;
  return itemMatchKey(zh);
}

function keysMatchRow(rowKey, matchKeys) {
  if (!rowKey) return false;
  for (const k of matchKeys || []) {
    const mk = itemMatchKey(k);
    if (!mk) continue;
    if (rowKey === mk) return true;
    if (rowKey.length >= 2 && mk.length >= 2 && (rowKey.includes(mk) || mk.includes(rowKey))) return true;
  }
  return false;
}

/**
 * 将品质管控台账检验值填入检测项目表「检测值」列
 * @returns {{ applied: number, tableValue: object }}
 */
export function applyQcResultsToInspectionTable(tableValue, qcInspection) {
  if (!tableValue || typeof tableValue !== 'object') {
    return { applied: 0, tableValue };
  }
  const rowResults = qcInspection?.rowResults;
  if (!Array.isArray(rowResults) || !rowResults.length) {
    return { applied: 0, tableValue };
  }

  const rows = (tableValue.rows || []).map((row) => {
    const next = { ...row };
    if (next.result && typeof next.result === 'object') {
      next.result = { ...next.result };
    }
    return next;
  });

  let applied = 0;
  for (const row of rows) {
    const rk = rowItemKey(row);
    if (!rk) continue;
    for (const spec of rowResults) {
      if (!keysMatchRow(rk, spec.matchKeys)) continue;
      const val = spec.result?.zh ?? spec.result;
      const text = String(val ?? '').trim();
      if (!text) break;
      if (!row.result || typeof row.result !== 'object') {
        row.result = { zh: '', en: '' };
      }
      row.result.zh = text;
      if (!String(row.result.en || '').trim()) row.result.en = text;
      applied += 1;
      break;
    }
  }

  return {
    applied,
    tableValue: { ...tableValue, rows }
  };
}

/** 将 qcYearbook.fields 应用到报告表单字段列表 */
export function applyQcYearbookFieldsToFormFields(formFields, qcFields) {
  if (!Array.isArray(formFields) || !qcFields || typeof qcFields !== 'object') {
    return { inspectionApplied: 0 };
  }

  let inspectionApplied = 0;
  const setTextField = (key, val) => {
    if (!val || typeof val !== 'object') return;
    const f = formFields.find((x) => x.fieldKey === key);
    if (!f) return;
    if (!f.fieldValue || typeof f.fieldValue !== 'object') {
      f.fieldValue = { zh: '', en: '' };
    }
    const zh = String(val.zh ?? '').trim();
    const en = String(val.en ?? '').trim();
    if (zh) f.fieldValue.zh = zh;
    if (en) f.fieldValue.en = en;
  };

  if (qcFields.batch_weight?.zh) {
    setTextField('batch_weight', qcFields.batch_weight);
  }
  if (qcFields.test_conclusion?.zh) {
    setTextField('test_conclusion', qcFields.test_conclusion);
  }

  const tableField = formFields.find((x) => x.fieldKey === 'inspection_table' && x.fieldType === 'table');
  if (tableField && qcFields.inspectionTable) {
    const { applied, tableValue } = applyQcResultsToInspectionTable(
      tableField.fieldValue,
      qcFields.inspectionTable
    );
    tableField.fieldValue = tableValue;
    inspectionApplied = applied;
  }

  return { inspectionApplied };
}
