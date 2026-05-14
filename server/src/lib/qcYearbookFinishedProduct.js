/**
 * 「成品」工作表：表头识别与行映射（与物源年度品质管控 Excel 列一致）
 */

function normalizeWorksheetLabel(s) {
  return String(s || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .normalize('NFKC');
}

/** 表头归一化：全角括号、空白，便于模糊匹配 */
export function normalizeFpHeaderKey(raw) {
  return normalizeWorksheetLabel(raw)
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .toLowerCase();
}

/** 与 Excel 列标题匹配（顺序：先匹配更具体的表头） */
const FP_HEADER_RULES = [
  { field: 'product_model', test: (h) => h.includes('产品型号') },
  { field: 'product_batch_no', test: (h) => h.includes('产品批号') },
  { field: 'initial_batch_kg', test: (h) => h.includes('初检批量') },
  { field: 'inspection_batch_kg', test: (h) => (h.includes('检验批量') || h.includes('终检批量')) && !h.includes('初检') },
  { field: 'barrel_count', test: (h) => h.includes('桶数') },
  { field: 'appearance', test: (h) => /^外观/.test(h) || h === '外观' },
  { field: 'color_fe_co', test: (h) => h.includes('色度') },
  { field: 'solid_content_pct', test: (h) => h.includes('固体份') },
  { field: 'viscosity_s_25c', test: (h) => h.includes('粘度') },
  { field: 'acid_value_mgkoh_g', test: (h) => h.includes('酸值') },
  { field: 'tolerance_g_ml', test: (h) => h.includes('容忍度') },
  { field: 'nco_content_pct', test: (h) => h.includes('nco') },
  { field: 'inspection_conclusion', test: (h) => h.includes('检验结论') }
];

/**
 * 在前若干行中定位「成品」表头行（兼容表头不在第 1 行、合并单元格导致 __EMPTY 列名）
 * @param {unknown[][]} matrix - sheet_to_json(..., { header: 1 })
 */
export function findFinishedProductHeaderRowIndex(matrix, maxScan = 50) {
  if (!Array.isArray(matrix)) return -1;
  for (let i = 0; i < Math.min(matrix.length, maxScan); i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    let hasModel = false;
    let hasBatch = false;
    for (const cell of row) {
      const t = String(cell ?? '');
      if (t.includes('产品型号')) hasModel = true;
      if (t.includes('产品批号')) hasBatch = true;
    }
    if (hasModel && hasBatch) return i;
  }
  return -1;
}

/** 第二行是否为「指标」表头（与物源模板双行表头配套） */
export function isLikelyFpMetricHeaderRow(row) {
  if (!Array.isArray(row)) return false;
  const t = row.map((c) => String(c ?? '')).join('\0');
  return (
    t.includes('桶数') ||
    t.includes('初检批量') ||
    t.includes('终检批量') ||
    t.includes('检验批量') ||
    t.includes('包装规格')
  );
}

/** 合并双行表头：上行为主，上空下非空则取下格（如第 1 行型号、第 2 行桶数） */
export function mergeFinishedProductHeaderRows(row0, row1) {
  const a0 = (row0 || []).map((c) => String(c ?? '').trim());
  const a1 = (row1 || []).map((c) => String(c ?? '').trim());
  const n = Math.max(a0.length, a1.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = a0[i] || '';
    const b = a1[i] || '';
    if (b && !a) out.push(b);
    else out.push(a || b);
  }
  return out;
}

/**
 * @param {string[]} headerCells - 表头行各列文本
 */
export function buildFinishedProductColumnIndexes(headerCells) {
  const labels = (headerCells || []).map((h) => String(h ?? '').trim());
  const cols = labels.map((raw, idx) => ({
    idx,
    raw,
    norm: normalizeFpHeaderKey(raw)
  }));
  const used = new Set();
  /** @type {Record<string, number>} */
  const indexes = {};

  for (const { field, test } of FP_HEADER_RULES) {
    for (const { idx, norm, raw } of cols) {
      if (used.has(idx)) continue;
      const h = norm || normalizeFpHeaderKey(raw);
      if (!h && !String(raw || '').trim()) continue;
      if (test(h)) {
        indexes[field] = idx;
        used.add(idx);
        break;
      }
    }
  }

  const missingRequired = [];
  if (indexes.product_model == null) missingRequired.push('产品型号');
  if (indexes.product_batch_no == null) missingRequired.push('产品批号');
  if (missingRequired.length) {
    return { ok: false, indexes: {}, missingRequired, headerCells: labels };
  }
  return { ok: true, indexes, missingRequired: [], headerCells: labels };
}

/**
 * @param {string[]} excelKeys - sheet_to_json 首行键名
 * @returns {{ map: Record<string, string>, missingRequired: string[] } | null}
 *   map: dbField -> excel column key；无法识别必填列时返回 null
 */
export function buildFinishedProductColumnMap(excelKeys) {
  const keys = (excelKeys || []).filter(
    (k) => String(k || '').trim() !== '' && !/^__EMPTY/i.test(String(k))
  );
  if (!keys.length) return { ok: false, map: null, missingRequired: ['产品型号', '产品批号'], excelKeys: [] };

  const used = new Set();
  const map = {};

  for (const { field, test } of FP_HEADER_RULES) {
    for (const k of keys) {
      if (used.has(k)) continue;
      const h = normalizeFpHeaderKey(k);
      if (test(h)) {
        map[field] = k;
        used.add(k);
        break;
      }
    }
  }

  const missingRequired = [];
  if (!map.product_model) missingRequired.push('产品型号');
  if (!map.product_batch_no) missingRequired.push('产品批号');
  if (missingRequired.length) {
    return { ok: false, map: null, missingRequired, excelKeys: keys };
  }
  return { ok: true, map, missingRequired: [], excelKeys: keys };
}

function cellStr(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).trim();
}

export function parseOptionalDecimal(raw) {
  const s = cellStr(raw).replace(/,/g, '').replace(/，/g, '');
  if (s === '' || s === '-' || s === '—' || s === '--') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseOptionalString(raw) {
  const s = cellStr(raw);
  return s === '' ? null : s.slice(0, 512);
}

export function parseBatchNo(raw) {
  const s = cellStr(raw);
  if (!s) return '';
  return s.slice(0, 64);
}

export function parseProductModel(raw) {
  const s = cellStr(raw);
  return s.slice(0, 128);
}

/**
 * @param {unknown[]} rowArr - 数据行（与表头列下标对齐）
 * @param {Record<string, number>} indexes - 字段 -> 列下标
 */
export function matrixRowToFinishedProduct(rowArr, indexes) {
  const cell = (field) => {
    const i = indexes[field];
    if (i == null || !Array.isArray(rowArr) || i < 0 || i >= rowArr.length) return undefined;
    return rowArr[i];
  };
  return {
    product_model: parseProductModel(cell('product_model')),
    product_batch_no: parseBatchNo(cell('product_batch_no')),
    barrel_count: parseOptionalDecimal(cell('barrel_count')),
    initial_batch_kg: parseOptionalDecimal(cell('initial_batch_kg')),
    inspection_batch_kg: parseOptionalDecimal(cell('inspection_batch_kg')),
    appearance: parseOptionalString(cell('appearance'))?.slice(0, 64) ?? null,
    color_fe_co: parseOptionalString(cell('color_fe_co'))?.slice(0, 32) ?? null,
    solid_content_pct: parseOptionalDecimal(cell('solid_content_pct')),
    viscosity_s_25c: parseOptionalDecimal(cell('viscosity_s_25c')),
    acid_value_mgkoh_g: parseOptionalDecimal(cell('acid_value_mgkoh_g')),
    tolerance_g_ml: parseOptionalDecimal(cell('tolerance_g_ml')),
    nco_content_pct: parseOptionalDecimal(cell('nco_content_pct')),
    inspection_conclusion: parseOptionalString(cell('inspection_conclusion'))?.slice(0, 64) ?? null
  };
}

/**
 * @param {Record<string, unknown>} rowObj - sheet_to_json 一行
 * @param {Record<string, string>} colMap - db 字段 -> Excel 列名
 */
export function excelRowToFinishedProduct(rowObj, colMap) {
  const get = (field) => rowObj[colMap[field]];

  return {
    product_model: parseProductModel(get('product_model')),
    product_batch_no: parseBatchNo(get('product_batch_no')),
    barrel_count: parseOptionalDecimal(get('barrel_count')),
    initial_batch_kg: parseOptionalDecimal(get('initial_batch_kg')),
    inspection_batch_kg: parseOptionalDecimal(get('inspection_batch_kg')),
    appearance: parseOptionalString(get('appearance'))?.slice(0, 64) ?? null,
    color_fe_co: parseOptionalString(get('color_fe_co'))?.slice(0, 32) ?? null,
    solid_content_pct: parseOptionalDecimal(get('solid_content_pct')),
    viscosity_s_25c: parseOptionalDecimal(get('viscosity_s_25c')),
    acid_value_mgkoh_g: parseOptionalDecimal(get('acid_value_mgkoh_g')),
    tolerance_g_ml: parseOptionalDecimal(get('tolerance_g_ml')),
    nco_content_pct: parseOptionalDecimal(get('nco_content_pct')),
    inspection_conclusion: parseOptionalString(get('inspection_conclusion'))?.slice(0, 64) ?? null
  };
}

export function isFinishedProductSheetName(sheetName) {
  return normalizeWorksheetLabel(sheetName) === '成品';
}

/** 是否整行无有效数据（跳过） */
export function isFpRowEmpty(parsed) {
  if (parsed.product_model || parsed.product_batch_no) return false;
  return (
    parsed.barrel_count == null &&
    parsed.initial_batch_kg == null &&
    parsed.inspection_batch_kg == null &&
    !parsed.appearance &&
    !parsed.color_fe_co &&
    parsed.solid_content_pct == null &&
    parsed.viscosity_s_25c == null &&
    parsed.acid_value_mgkoh_g == null &&
    parsed.tolerance_g_ml == null &&
    parsed.nco_content_pct == null &&
    !parsed.inspection_conclusion
  );
}
