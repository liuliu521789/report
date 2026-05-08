import { getPool } from '../db/pool.js';

/** 与数据库 maps_to 一致，用于同步旧列、合同、质检匹配 */
export const MAPS_TO_KEYS = new Set([
  'customer_code',
  'customer_name',
  'product_code',
  'product_name',
  'product_model',
  'warehouse_model',
  'quantity',
  'unit_price',
  'amount',
  'remark'
]);

/** 默认表头与业务表一致；客户编号由系统在仅填厂家名称时自动生成，不做表单项 */
export const DEFAULT_FIELD_SEED = [
  ['order_date', '发货日期', 'date', 1, 1, null],
  ['customer_name', '厂家', 'text', 1, 2, 'customer_name'],
  ['product_model', '标签型号', 'text', 1, 3, 'product_model'],
  ['warehouse_model', '仓库型号', 'text', 0, 4, 'warehouse_model'],
  ['product_name', '规格', 'text', 1, 5, 'product_name'],
  ['product_code', '批号', 'text', 0, 6, 'product_code'],
  ['quantity', '数量', 'text', 1, 7, 'quantity'],
  ['remark', '备注', 'textarea', 0, 8, 'remark'],
  ['material_source', '物源', 'text', 1, 9, null],
  ['kangming', '康铭', 'text', 1, 10, null],
  ['remaining', '剩余', 'text', 0, 11, null]
];

function parseJsonMaybe(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 发货日期合理范围：过小 Excel 序列（如 2）会变成 1900-01-02，多为错列或非日期数字 */
const MIN_SHIP_DATE_YEAR = 1980;
const MAX_SHIP_DATE_YEAR = 2100;

function isValidYmd(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function isReasonableShipYmd(y, m, d) {
  return isValidYmd(y, m, d) && y >= MIN_SHIP_DATE_YEAR && y <= MAX_SHIP_DATE_YEAR;
}

/** Excel 序列日 → YYYY-MM-DD（与 Date.UTC 一致，避免本地时区偏一天） */
function excelSerialToYmd(n) {
  const serial = Math.floor(Number(n));
  if (!Number.isFinite(serial) || serial < 1 || serial > 1000000) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if (!isReasonableShipYmd(y, mo, day)) return null;
  return `${y}-${pad2(mo)}-${pad2(day)}`;
}

/**
 * 归一化发货日期等业务日期：兼容 Excel 数值/日期单元格、文本与常见表格写法，统一为 YYYY-MM-DD
 * @returns {{ ok: true, value: string } | { ok: false, error: 'empty' | 'parse' }}
 */
export function normalizeOrderDateInput(v) {
  if (v === undefined || v === null) return { ok: false, error: 'empty' };
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const mo = v.getMonth() + 1;
    const day = v.getDate();
    if (!isReasonableShipYmd(y, mo, day)) return { ok: false, error: 'parse' };
    return {
      ok: true,
      value: `${y}-${pad2(mo)}-${pad2(day)}`
    };
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const intpart = Math.trunc(v);
    if (v === intpart) {
      const ymd = excelSerialToYmd(v);
      if (ymd) return { ok: true, value: ymd };
    } else if (intpart >= 1 && intpart <= 12 && v > 0) {
      /** 单元格为数值 3.31 等非整数：按「月 + 小数日为日」并补今年（避免被当成 Excel 序列号） */
      const yNow = new Date().getFullYear();
      const sub = Math.abs(v - intpart);
      let day = Math.round(sub * 100);
      if (day < 1 || day > 31) day = Math.round(sub * 10);
      if (isReasonableShipYmd(yNow, intpart, day)) {
        return { ok: true, value: `${yNow}-${pad2(intpart)}-${pad2(day)}` };
      }
    }
    return { ok: false, error: 'parse' };
  }
  let s = String(v)
    .replace(/^\uFEFF/, '')
    .replace(/^[\s\u3000]+|[\s\u3000]+$/g, '')
    .trim();
  if (s === '') return { ok: false, error: 'empty' };
  if (/^\d{5,7}(\.\d+)?$/.test(s)) {
    const ymd = excelSerialToYmd(Math.floor(Number(s)));
    if (ymd) return { ok: true, value: ymd };
  }
  const tIdx = s.search(/[Tt]/);
  if (tIdx !== -1) s = s.slice(0, tIdx).trim();
  else s = s.replace(/\s+\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(\s*[APMapm]{2})?.*$/, '').trim();

  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    if (isReasonableShipYmd(y, mo, d)) return { ok: true, value: `${y}-${pad2(mo)}-${pad2(d)}` };
  }
  m = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
  if (m) {
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    if (isReasonableShipYmd(y, mo, d)) return { ok: true, value: `${y}-${pad2(mo)}-${pad2(d)}` };
  }
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    if (isReasonableShipYmd(y, mo, d)) return { ok: true, value: `${y}-${pad2(mo)}-${pad2(d)}` };
  }
  m = s.match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    if (isReasonableShipYmd(y, a, b)) return { ok: true, value: `${y}-${pad2(a)}-${pad2(b)}` };
    if (isReasonableShipYmd(y, b, a)) return { ok: true, value: `${y}-${pad2(b)}-${pad2(a)}` };
  }

  const yNow = new Date().getFullYear();
  /** 无年份：如 3.31、3/31、03-31 → 默认今年（与业务表常见写法一致） */
  m = s.match(/^(\d{1,2})\s*[-./／]\s*(\d{1,2})$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    if (isReasonableShipYmd(yNow, a, b)) return { ok: true, value: `${yNow}-${pad2(a)}-${pad2(b)}` };
    if (isReasonableShipYmd(yNow, b, a)) return { ok: true, value: `${yNow}-${pad2(b)}-${pad2(a)}` };
  }
  m = s.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  if (m) {
    const mo = +m[1];
    const d = +m[2];
    if (isReasonableShipYmd(yNow, mo, d)) return { ok: true, value: `${yNow}-${pad2(mo)}-${pad2(d)}` };
  }

  return { ok: false, error: 'parse' };
}

/**
 * Excel 导入表头别名（优先级：后台配置的 label_zh → 常见旧名/同义名）
 * 「日期」等业务表常见列名与「发货日期」视为同一列
 */
/** 用户表格常见：标签型号与仓库型号在同一列，表头含「/」或单元格内用 /／ 分隔 */
const COMBINED_LABEL_WAREHOUSE_HEADERS = ['标签型号/仓库型号', '标签/仓库型号', '标签型号／仓库型号'];

export function splitLabelWarehouseCell(raw) {
  if (raw == null || raw === '') return { label: '', warehouse: '' };
  let s = String(raw).replace(/^[\s\u3000]+|[\s\u3000]+$/g, '').trim();
  if (!s) return { label: '', warehouse: '' };
  let cut = -1;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '/' || c === '／') {
      cut = i;
      break;
    }
  }
  if (cut < 0) return { label: s, warehouse: '' };
  return {
    label: s.slice(0, cut).trim(),
    warehouse: s.slice(cut + 1).trim()
  };
}

export function importHeaderSynonymsForField(fieldDef) {
  if (!fieldDef) return [];
  const out = [];
  const seen = new Set();
  const push = (s) => {
    const t = s == null ? '' : String(s).trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  push(fieldDef.label_zh);
  if (fieldDef.field_key === 'order_date') {
    for (const s of ['发货日期', '日期', '送货日期', '订单日期', '单据日期']) {
      push(s);
    }
  }
  if (fieldDef.field_key === 'product_model') {
    for (const s of ['标签型号', ...COMBINED_LABEL_WAREHOUSE_HEADERS]) {
      push(s);
    }
  }
  if (fieldDef.field_key === 'warehouse_model') {
    for (const s of ['仓库型号', ...COMBINED_LABEL_WAREHOUSE_HEADERS]) {
      push(s);
    }
  }
  return out;
}

export async function loadOrderFieldDefinitions(pool, { activeOnly = false } = {}) {
  const p = pool || getPool();
  let sql =
    'SELECT id, field_key, label_zh, field_type, required, sort_order, maps_to, is_active FROM sales_order_field_definitions WHERE 1=1';
  const args = [];
  if (activeOnly) sql += ' AND is_active = 1';
  sql += ' ORDER BY sort_order ASC, id ASC';
  const [rows] = await p.query(sql, args);
  return rows.map((r) => ({
    ...r,
    required: !!r.required,
    is_active: !!r.is_active
  }));
}

export async function seedDefaultOrderFieldsIfEmpty(pool) {
  const p = pool || getPool();
  const [c] = await p.query('SELECT COUNT(*) AS n FROM sales_order_field_definitions');
  if (Number(c[0]?.n || 0) > 0) return;
  for (const row of DEFAULT_FIELD_SEED) {
    await p.query(
      `INSERT INTO sales_order_field_definitions (field_key, label_zh, field_type, required, sort_order, maps_to, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      row
    );
  }
}

/** 将启用字段对齐为默认表头布局，并下线「客户编号」「单价」表单项（单价仍可通过 JSON 或旧数据映射，见 dataJsonToLegacyColumns） */
export async function ensureCanonicalOrderFieldDefinitions(pool) {
  const p = pool || getPool();
  for (const row of DEFAULT_FIELD_SEED) {
    const [field_key, label_zh, field_type, required, sort_order, maps_to] = row;
    const [existing] = await p.query(
      'SELECT id FROM sales_order_field_definitions WHERE field_key = ? LIMIT 1',
      [field_key]
    );
    const req = required ? 1 : 0;
    if (existing.length) {
      await p.query(
        `UPDATE sales_order_field_definitions
         SET label_zh = ?, field_type = ?, required = ?, sort_order = ?, maps_to = ?, is_active = 1
         WHERE field_key = ?`,
        [label_zh, field_type, req, sort_order, maps_to, field_key]
      );
    } else {
      await p.query(
        `INSERT INTO sales_order_field_definitions (field_key, label_zh, field_type, required, sort_order, maps_to, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [field_key, label_zh, field_type, req, sort_order, maps_to]
      );
    }
  }
  await p.query(
    `UPDATE sales_order_field_definitions SET is_active = 0 WHERE field_key IN ('customer_code', 'unit_price')`
  );
}

/** 旧行无 data_json 时，从列补全 */
export function legacyRowToDataJson(row) {
  const o = {};
  if (!row) return o;
  const map = {
    customer_code: row.customer_code,
    customer_name: row.customer_name,
    product_code: row.product_code,
    product_name: row.product_name,
    product_model: row.product_model,
    warehouse_model: row.warehouse_model,
    quantity: row.quantity,
    unit_price: row.unit_price,
    amount: row.amount,
    remark: row.remark
  };
  for (const [k, v] of Object.entries(map)) {
    if (v !== undefined && v !== null && v !== '') o[k] = v;
  }
  return o;
}

/** 订单数量/单价/金额：与 DECIMAL(18,4) 对齐，全链路统一四位小数 */
export function roundOrderDecimal4(n) {
  if (n == null || n === '') return 0;
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10000) / 10000;
}

/** 数量支持「数字+单位」（如 10桶、2.5吨桶）；提取首个正数用于 DB 数值列与金额试算 */
export function parseQuantityToLegacyNumber(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 0 ? raw : 0;
  }
  const m = String(raw).match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function dataJsonToLegacyColumns(definitions, dataJson) {
  const dj = { ...(dataJson || {}) };
  const byMap = {};
  for (const d of definitions) {
    if (d.maps_to && MAPS_TO_KEYS.has(d.maps_to)) {
      byMap[d.maps_to] = dj[d.field_key];
    }
  }
  let quantity = roundOrderDecimal4(parseQuantityToLegacyNumber(byMap.quantity));
  let unitPrice = roundOrderDecimal4(Number(byMap.unit_price));
  if (!Number.isFinite(unitPrice)) unitPrice = 0;
  let amount = Number(byMap.amount);
  const amountExplicit =
    byMap.amount !== undefined &&
    byMap.amount !== '' &&
    Number.isFinite(amount);
  if (!amountExplicit) {
    amount = roundOrderDecimal4(quantity * unitPrice);
  } else {
    amount = roundOrderDecimal4(amount);
  }
  return {
    product_code: String(byMap.product_code ?? '').slice(0, 128),
    product_name: String(byMap.product_name ?? '').slice(0, 256),
    product_model: String(byMap.product_model ?? '').slice(0, 256),
    warehouse_model: String(byMap.warehouse_model ?? '').slice(0, 256),
    quantity,
    unit_price: unitPrice,
    amount,
    remark: byMap.remark != null && byMap.remark !== '' ? String(byMap.remark).slice(0, 1024) : null
  };
}

/** 校验并归一化 dataJson；customer 从 customer_code + customer_name 解析 */
export function validateOrderDataInput(definitions, rawInput) {
  const active = definitions.filter((d) => d.is_active);
  const errors = [];
  const data = {};
  const input = rawInput && typeof rawInput === 'object' ? { ...rawInput } : {};

  for (const d of active) {
    const key = d.field_key;
    let v = input[key];
    if (v === undefined || v === null) v = '';
    if (typeof v === 'string') v = v.trim();

    const label = d.label_zh || key;

    if (d.required && (v === '' || v === null)) {
      errors.push({ field_key: key, label_zh: label, message: `${label}为必填项` });
      continue;
    }

    if (v === '' || v === null) {
      data[key] = d.field_type === 'number' || d.field_type === 'positive_number' ? null : '';
      continue;
    }

    // 只校验必填项，非必填项直接存储
    if (d.field_type === 'text' || d.field_type === 'textarea') {
      data[key] = String(v);
    } else if (d.field_type === 'number' || d.field_type === 'positive_number') {
      const n = Number(v);
      if (Number.isFinite(n) && ['quantity', 'unit_price', 'amount'].includes(d.maps_to)) {
        data[key] = roundOrderDecimal4(n);
      } else {
        data[key] = Number.isFinite(n) ? n : v;
      }
    } else if (d.field_type === 'date') {
      const normalized = normalizeOrderDateInput(v);
      data[key] = normalized.ok ? normalized.value : String(v);
    } else if (d.maps_to === 'quantity') {
      data[key] = typeof v === 'number' && Number.isFinite(v) ? String(v) : String(v).trim().replace(/\s+/g, ' ');
    } else {
      data[key] = v;
    }
  }

  return { errors, data };
}

export function mergeRowDataJson(row, definitions) {
  const dj = parseJsonMaybe(row.data_json);
  const legacy = legacyRowToDataJson(row);
  const base =
    dj && typeof dj === 'object' && !Array.isArray(dj) ? { ...legacy, ...dj } : { ...legacy };
  const display = {};
  for (const d of definitions.filter((x) => x.is_active)) {
    display[d.field_key] = base[d.field_key] ?? '';
  }
  return { dataJson: base, display_data: display };
}

/** 为订单行补充 customer_name（表行可能仅有 customer_id） */
export async function attachCustomerNamesToOrders(pool, rows) {
  if (!rows?.length) return [];
  const ids = [...new Set(rows.map((r) => r.customer_id).filter((id) => id != null))];
  const map = new Map();
  if (ids.length) {
    const [cust] = await pool.query(
      `SELECT id, customer_name FROM sales_customers WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    for (const c of cust) map.set(Number(c.id), c.customer_name || '');
  }
  return rows.map((r) => ({
    ...r,
    customer_name: map.get(Number(r.customer_id)) ?? r.customer_name ?? ''
  }));
}

/**
 * 仓库企业微信单条正文：厂家、标签型号、仓库型号、规格、批号、数量、备注（与字段 maps_to 一致）
 */
export function formatWarehouseWecomOrderDetail(row, definitions) {
  const { display_data } = mergeRowDataJson(row, definitions);
  const keyFor = (mapsTo) => definitions.find((d) => d.maps_to === mapsTo)?.field_key;
  const pick = (mapsTo, fallback) => {
    const key = keyFor(mapsTo);
    if (key != null && display_data[key] !== undefined && display_data[key] !== null) {
      const s = String(display_data[key]).trim();
      if (s !== '') return s;
    }
    if (fallback != null && fallback !== '') {
      const s = String(fallback).trim();
      if (s !== '') return s;
    }
    return '—';
  };
  const orderNo = row.order_no ? String(row.order_no) : '—';
  const vendor = pick('customer_name', row.customer_name);
  const model = pick('product_model', row.product_model);
  const wh = pick('warehouse_model', row.warehouse_model);
  const spec = pick('product_name', row.product_name);
  const batchNo = pick('product_code', row.product_code);
  const qtyKey = keyFor('quantity');
  let qty = '—';
  if (
    qtyKey != null &&
    display_data[qtyKey] !== undefined &&
    display_data[qtyKey] !== null &&
    String(display_data[qtyKey]).trim() !== ''
  ) {
    qty = String(display_data[qtyKey]).trim();
  } else if (row.quantity != null && String(row.quantity) !== '') {
    qty = String(row.quantity);
  }
  const remark = pick('remark', row.remark);
  return `订单号：${orderNo}\n厂家：${vendor}\n标签型号：${model}\n仓库型号：${wh}\n规格：${spec}\n批号：${batchNo}\n数量：${qty}\n备注：${remark}`;
}
