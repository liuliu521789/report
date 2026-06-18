/** 报告检验日期 / 出厂日期：统一 YYYY-MM-DD */

export const REPORT_DATE_FIELD_KEYS = new Set(['analysis_date', 'ex_mill_date']);

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @returns {string} 无法解析时返回 trim 后的原字符串 */
export function normalizeReportDateInput(v) {
  if (v == null) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  }
  const s = String(v)
    .replace(/^\uFEFF/, '')
    .trim();
  if (!s) return '';

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(+iso[2])}-${pad2(+iso[3])}`;

  const sep = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
  if (sep) return `${sep[1]}-${pad2(+sep[2])}-${pad2(+sep[3])}`;

  const cn = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?/);
  if (cn) return `${cn[1]}-${pad2(+cn[2])}-${pad2(+cn[3])}`;

  return s;
}

export function normalizeReportDateFieldValue(fieldValue) {
  if (fieldValue == null) return { zh: '', en: '' };
  if (typeof fieldValue === 'string') {
    const d = normalizeReportDateInput(fieldValue);
    return { zh: d, en: d };
  }
  if (typeof fieldValue !== 'object') return { zh: '', en: '' };
  const zh = normalizeReportDateInput(fieldValue.zh);
  const enRaw = normalizeReportDateInput(fieldValue.en);
  return { zh, en: enRaw || zh };
}
