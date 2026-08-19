/** 报告单本批数量、包装规格：仅填数值，单位固定 kg */

export const REPORT_QTY_FIELD_KEYS = new Set(['packing', 'batch_weight']);

/** 从已保存文本中提取数值部分 */
export function parseReportQtyNumber(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function specTextToPackingKg(specText) {
  const raw = String(specText ?? '').trim();
  if (!raw) return null;
  const n = parseReportQtyNumber(raw);
  if (n == null) return null;
  if (/吨/.test(raw) && !/千克|公斤|kg/i.test(raw)) {
    return Math.round(n * 1000 * 100) / 100;
  }
  return n;
}

export function formatReportQtyKg(num) {
  if (num == null || num === '') return { zh: '', en: '' };
  const n = typeof num === 'number' ? num : parseReportQtyNumber(num);
  if (n == null) return { zh: '', en: '' };
  const s = String(n);
  return { zh: `${s}kg`, en: `${s} kg` };
}

/** @deprecated 与 formatReportQtyKg 相同，保留供预填等调用 */
export function formatBatchWeight(num) {
  return formatReportQtyKg(num);
}

/** @deprecated 与 formatReportQtyKg 相同 */
export function formatPackingValue(num) {
  return formatReportQtyKg(num);
}

export function normalizeReportQtyFieldValue(fieldKey, fieldValue) {
  if (!REPORT_QTY_FIELD_KEYS.has(fieldKey)) return fieldValue;
  if (fieldValue == null) return { zh: '', en: '' };
  const zh = typeof fieldValue === 'object' ? fieldValue.zh : fieldValue;
  return formatReportQtyKg(zh);
}
