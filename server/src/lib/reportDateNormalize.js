/** 报告检验日期 / 出厂日期：统一 YYYY-MM-DD */

export const REPORT_DATE_FIELD_KEYS = new Set(['analysis_date', 'ex_mill_date']);

function pad2(n) {
  return String(n).padStart(2, '0');
}

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

function normalizeReportDateFieldValue(fieldValue) {
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

export { normalizeReportDateFieldValue };

/** 解析 report_fields.field_value_json（兼容字符串、纯文本日期） */
export function parseReportFieldValueJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') {
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
      try {
        return JSON.parse(raw.toString('utf8'));
      } catch {
        return null;
      }
    }
    return raw;
  }
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (t[0] === '{' || t[0] === '[') {
    try {
      return JSON.parse(t);
    } catch {
      return { zh: t, en: t };
    }
  }
  return { zh: t, en: t };
}

export function normalizeReportFieldValueForDisplay(fieldKey, raw) {
  const parsed = parseReportFieldValueJson(raw);
  if (REPORT_DATE_FIELD_KEYS.has(fieldKey)) {
    return normalizeReportDateFieldValue(parsed);
  }
  // 检验项目表等复杂结构保持原样，勿按 { zh, en } 文本字段处理
  if (parsed != null) return parsed;
  return raw ?? null;
}

/** 落库前归一化报告字段中的日期 */
export function normalizeReportDateFieldsInPayload(body) {
  if (!body || !Array.isArray(body.fields)) return body;
  return {
    ...body,
    fields: body.fields.map((f) => {
      if (!REPORT_DATE_FIELD_KEYS.has(f.fieldKey)) return f;
      return { ...f, fieldValue: normalizeReportDateFieldValue(f.fieldValue) };
    })
  };
}
