/** 检测值数值格式：取整数 / 保留两位小数（编辑端、预览、打印、公开 API 共用） */
export const INSPECTION_RESULT_FORMAT = {
  INTEGER: 'integer',
  DECIMAL2: 'decimal2'
};

export const INSPECTION_RESULT_FORMAT_OPTIONS = [
  { value: INSPECTION_RESULT_FORMAT.DECIMAL2, label: '保留两位小数' },
  { value: INSPECTION_RESULT_FORMAT.INTEGER, label: '取整数' }
];

const NUMERIC_PATTERN = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

export function normalizeResultFormat(format) {
  return format === INSPECTION_RESULT_FORMAT.INTEGER
    ? INSPECTION_RESULT_FORMAT.INTEGER
    : INSPECTION_RESULT_FORMAT.DECIMAL2;
}

/** 是否为纯数值（不含单位、范围、文字描述） */
export function isNumericInspectionValue(text) {
  const s = String(text ?? '').trim();
  if (!s) return false;
  return NUMERIC_PATTERN.test(s);
}

/** 按格式格式化单个检测值；非数值原样返回 */
export function formatInspectionResultValue(text, format = INSPECTION_RESULT_FORMAT.DECIMAL2) {
  const s = String(text ?? '').trim();
  if (!s || !isNumericInspectionValue(s)) return s;
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (normalizeResultFormat(format) === INSPECTION_RESULT_FORMAT.INTEGER) {
    return String(Math.round(n));
  }
  return n.toFixed(2);
}

/** 从已有展示值补全 raw（加载旧数据、首次格式化前） */
export function ensureResultRaw(cell) {
  if (!cell || typeof cell !== 'object') return cell;
  const zh = String(cell.zh ?? '').trim();
  if (!isNumericInspectionValue(zh)) {
    delete cell.raw;
    delete cell.rawEn;
    return cell;
  }
  if (!cell.raw) cell.raw = zh;
  const en = String(cell.en ?? '').trim();
  if (en && isNumericInspectionValue(en) && !cell.rawEn) cell.rawEn = en;
  return cell;
}

/**
 * 用户编辑后同步 raw：若展示值与按 raw 格式化的结果一致，保留原 raw
 */
export function syncResultRawFromDisplay(cell, format) {
  if (!cell || typeof cell !== 'object') return cell;
  const mode = normalizeResultFormat(format);
  const zh = String(cell.zh ?? '').trim();
  if (!isNumericInspectionValue(zh)) {
    delete cell.raw;
    delete cell.rawEn;
    return cell;
  }
  ensureResultRaw(cell);
  const fromRawZh = cell.raw ? formatInspectionResultValue(cell.raw, mode) : null;
  if (!cell.raw || zh !== fromRawZh) {
    cell.raw = zh;
  }
  const en = String(cell.en ?? '').trim();
  if (en && isNumericInspectionValue(en)) {
    const fromRawEn = cell.rawEn ? formatInspectionResultValue(cell.rawEn, mode) : null;
    if (!cell.rawEn || en !== fromRawEn) {
      cell.rawEn = en;
    }
  }
  return cell;
}

export function formatInspectionResultCell(cell, format) {
  if (!cell || typeof cell !== 'object') return cell;
  const mode = normalizeResultFormat(format);
  ensureResultRaw(cell);
  const rawZh = String(cell.raw ?? cell.zh ?? '').trim();
  if (!isNumericInspectionValue(rawZh)) {
    return { ...cell, zh: String(cell.zh ?? ''), en: String(cell.en ?? '') };
  }
  const zh = formatInspectionResultValue(rawZh, mode);
  const rawEn = String(cell.rawEn ?? cell.en ?? '').trim();
  const en =
    rawEn && isNumericInspectionValue(rawEn)
      ? formatInspectionResultValue(rawEn, mode)
      : rawEn || zh;
  return { ...cell, zh, en, raw: cell.raw, rawEn: cell.rawEn };
}

/** 预览/打印输出：按 resultFormat 格式化检测值列展示 */
export function normalizeInspectionTableForDisplay(tableValue) {
  if (!tableValue || typeof tableValue !== 'object') return tableValue;
  const mode = normalizeResultFormat(tableValue.resultFormat);
  const rows = (tableValue.rows || []).map((row) => {
    if (!row?.result) return row;
    const display = formatInspectionResultCell({ ...row.result }, mode);
    return {
      ...row,
      result: { zh: display.zh, en: display.en }
    };
  });
  return { ...tableValue, rows };
}

/** 将格式应用于检测项目表所有「检测值」列 */
export function applyResultFormatToTable(tableValue, format) {
  if (!tableValue || typeof tableValue !== 'object') {
    return { applied: 0, tableValue };
  }
  const mode = normalizeResultFormat(format);
  const rows = (tableValue.rows || []).map((row) => {
    const next = { ...row };
    if (next.result) {
      next.result = formatInspectionResultCell({ ...next.result }, mode);
    }
    return next;
  });
  let applied = 0;
  for (let i = 0; i < (tableValue.rows || []).length; i += 1) {
    const oldZh = String(tableValue.rows[i]?.result?.zh ?? '').trim();
    const newZh = String(rows[i]?.result?.zh ?? '').trim();
    if (oldZh && oldZh !== newZh) applied += 1;
  }
  return {
    applied,
    tableValue: { ...tableValue, resultFormat: mode, rows }
  };
}

/** 台账/外部带入数值：写入 raw 后再按格式展示 */
export function setInspectionResultFromSource(cell, sourceText, format) {
  const text = String(sourceText ?? '').trim();
  if (!text) return cell;
  const next = cell && typeof cell === 'object' ? { ...cell } : { zh: '', en: '' };
  if (!isNumericInspectionValue(text)) {
    next.zh = text;
    next.en = text;
    delete next.raw;
    delete next.rawEn;
    return next;
  }
  next.raw = text;
  next.rawEn = text;
  const formatted = formatInspectionResultValue(text, format);
  next.zh = formatted;
  next.en = formatted;
  return next;
}
