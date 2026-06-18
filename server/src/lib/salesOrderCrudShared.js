import { nanoid } from 'nanoid';
import {
  validateOrderDataInput,
  dataJsonToLegacyColumns,
  roundOrderDecimal4,
  tonsFromQtyAndSpec
} from './salesOrderFields.js';
import { findSalesCustomerByAlias } from './salesCustomerMatch.js';

/** customer_prices 为元/kg；订单物理列 unit_price 为元/吨（×1000） */
export async function lookupCustomerUnitPriceTon(conn, customerId, productModel) {
  const modelRaw = String(productModel ?? '').trim();
  if (!customerId || !modelRaw) return null;
  const normalizeModel = (v) =>
    String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s\u3000]/g, '')
      .replace(/[()（）\[\]【】]/g, '')
      .replace(/[-－—_/／\\]/g, '');
  const target = normalizeModel(modelRaw);
  if (!target) return null;

  const [rows] = await conn.query(
    'SELECT product_model, unit_price FROM customer_prices WHERE customer_id = ?',
    [customerId]
  );
  if (!rows.length) return null;

  const normalizedRows = rows
    .map((r) => ({
      unit_price: Number(r.unit_price),
      norm: normalizeModel(r.product_model)
    }))
    .filter((r) => Number.isFinite(r.unit_price) && r.unit_price > 0 && r.norm);
  if (!normalizedRows.length) return null;

  // 1) 规范化全等命中
  const exact = normalizedRows.find((r) => r.norm === target);
  if (exact) return roundOrderDecimal4(exact.unit_price * 1000);

  // 2) 兜底：一方包含另一方（适配“型号+后缀备注”）
  const fuzzy = normalizedRows.find((r) => r.norm.includes(target) || target.includes(r.norm));
  if (!fuzzy) return null;
  return roundOrderDecimal4(fuzzy.unit_price * 1000);
}

/**
 * 兜底：按客户名称（全称/简称）匹配客户后，再按型号查单价。
 * 用于导入时客户被错误新建导致 customer_id 不一致而补价失败的场景。
 */
export async function lookupCustomerUnitPriceTonByCustomerName(conn, customerName, productModel) {
  const name = String(customerName ?? '').trim();
  if (!name) return null;
  const compactName = name.replace(/\s+/g, '');
  let [custRows] = await conn.query(
    `SELECT id
     FROM sales_customers
     WHERE customer_name = ? OR contact_name = ?
     LIMIT 1`,
    [name, name]
  );
  if (!custRows.length && compactName && compactName !== name) {
    [custRows] = await conn.query(
      `SELECT id
       FROM sales_customers
       WHERE REPLACE(TRIM(customer_name), ' ', '') = ?
          OR REPLACE(TRIM(contact_name), ' ', '') = ?
       LIMIT 1`,
      [compactName, compactName]
    );
  }
  const cid = Number(custRows?.[0]?.id || 0);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  return lookupCustomerUnitPriceTon(conn, cid, productModel);
}

export function applyLegUnitPriceAndAmount(leg) {
  if (!leg || !(Number(leg.unit_price) > 0)) return leg;
  const tons = tonsFromQtyAndSpec(leg.quantity, leg.product_name);
  if (tons != null && tons > 0) {
    leg.amount = roundOrderDecimal4(leg.unit_price * tons);
  } else if (Number(leg.quantity) > 0) {
    leg.amount = roundOrderDecimal4(leg.quantity * leg.unit_price);
  }
  return leg;
}

/**
 * 用户上传/填写的单价（元/kg → 元/吨），优先于系统 customer_prices 补价。
 * @returns {number | null}
 */
export function extractUserImportUnitPriceTon(data, importUnitPriceTon, unitPriceKey) {
  if (unitPriceKey && data && typeof data === 'object') {
    const raw = data[unitPriceKey];
    if (raw != null && raw !== '') {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (Number.isFinite(n) && n > 0) return roundOrderDecimal4(n * 1000);
    }
  }
  if (importUnitPriceTon != null && Number(importUnitPriceTon) > 0) {
    return roundOrderDecimal4(Number(importUnitPriceTon));
  }
  return null;
}

export async function generateUniqueOrderNo(conn) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const orderNo = `O${nanoid(16)}`;
    const [hit] = await conn.query('SELECT id FROM sales_orders WHERE order_no = ? LIMIT 1', [orderNo]);
    if (!hit.length) return orderNo;
  }
  const e = new Error('无法生成唯一订单号');
  e.code = 'ORDER_NO';
  throw e;
}

export async function insertOrderWithData(
  conn,
  { userId, data, definitions, statusRemark = '新建订单', fieldSchemaVersion, legacyOverride } = {}
) {
  const { errors, data: normalized } = validateOrderDataInput(definitions, data);
  if (errors.length) {
    const e = new Error('VALIDATION_FAILED');
    e.code = 'VALIDATION_FAILED';
    e.details = errors;
    throw e;
  }
  const leg = dataJsonToLegacyColumns(definitions, normalized);
  if (legacyOverride && typeof legacyOverride === 'object') {
    if (legacyOverride.unit_price != null && Number(legacyOverride.unit_price) > 0) {
      leg.unit_price = roundOrderDecimal4(Number(legacyOverride.unit_price));
    }
    if (legacyOverride.amount != null && Number.isFinite(Number(legacyOverride.amount))) {
      leg.amount = roundOrderDecimal4(Number(legacyOverride.amount));
    } else if (Number(leg.unit_price) > 0) {
      applyLegUnitPriceAndAmount(leg);
    }
  }
  const codeKey = definitions.find((d) => d.maps_to === 'customer_code')?.field_key;
  const nameKey = definitions.find((d) => d.maps_to === 'customer_name')?.field_key;
  if (!codeKey && !nameKey) {
    const e = new Error('请至少配置「客户名称」映射字段');
    e.code = 'MISSING_CUSTOMER_FIELD';
    throw e;
  }
  const customerId = await getOrCreateCustomer(conn, {
    customer_code: codeKey ? normalized[codeKey] : '',
    customer_name: nameKey ? normalized[nameKey] : '',
    userId
  });
  const orderNo = await generateUniqueOrderNo(conn);
  let schemaVer = fieldSchemaVersion;
  if (schemaVer == null || !Number.isFinite(Number(schemaVer))) {
    const [vs] = await conn.query(
      'SELECT COALESCE(order_field_schema_version, 1) AS v FROM sales_settings WHERE id = 1 LIMIT 1'
    );
    schemaVer = Number(vs[0]?.v || 1);
  }
  const [ins] = await conn.query(
    `INSERT INTO sales_orders (order_no, customer_id, product_code, product_name, product_model, warehouse_model, quantity, unit_price, amount, remark, data_json, field_schema_version, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, 'pending_review', ?)`,
    [
      orderNo,
      customerId,
      leg.product_code,
      leg.product_name,
      leg.product_model,
      leg.warehouse_model,
      leg.quantity,
      leg.unit_price,
      leg.amount,
      leg.remark,
      JSON.stringify(normalized),
      schemaVer,
      userId
    ]
  );
  await conn.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, NULL, 'pending_review', ?, ?)`,
    [ins.insertId, userId, statusRemark]
  );
  return { id: ins.insertId, order_no: orderNo };
}

export function randomWyCustomerCode() {
  return `WY${nanoid(8).replace(/[^A-Za-z0-9]/g, '0').toUpperCase()}`;
}

/** 全局唯一：WY + 8 位随机大写字母数字 */
export async function allocateUniqueCustomerCode(conn) {
  for (let i = 0; i < 100; i++) {
    const code = randomWyCustomerCode();
    const [hit] = await conn.query('SELECT id FROM sales_customers WHERE customer_code = ? LIMIT 1', [code]);
    if (!hit.length) return code;
  }
  const e = new Error('生成客户编码失败');
  e.code = 'GENERATE_CODE_FAILED';
  throw e;
}

export async function generateCustomerCode(conn) {
  return allocateUniqueCustomerCode(conn);
}

export async function getOrCreateCustomer(conn, { customer_code, customer_name, userId }) {
  const code = String(customer_code || '').trim();
  const name = String(customer_name || '').trim();
  if (!code && !name) {
    const e = new Error('客户名称必填');
    e.code = 'VALIDATION';
    throw e;
  }
  if (code) {
    const [exist] = await conn.query(
      'SELECT id, is_active FROM sales_customers WHERE customer_code = ? LIMIT 1',
      [code]
    );
    if (exist.length) {
      if (exist[0].is_active === 0) {
        const e = new Error('停用客户不能用于新建订单');
        e.code = 'CUSTOMER_DISABLED';
        throw e;
      }
      return exist[0].id;
    }
    const [ins] = await conn.query(
      `INSERT INTO sales_customers (customer_code, customer_name, contact_name, phone, address, is_active, created_by, updated_by)
       VALUES (?, ?, NULL, NULL, NULL, 1, ?, ?)`,
      [code, name || code, userId || null, userId || null]
    );
    return ins.insertId;
  }
  const hit = await findSalesCustomerByAlias(conn, name);
  if (hit) {
    if (hit.is_active === 0) {
      const e = new Error('停用客户不能用于新建订单');
      e.code = 'CUSTOMER_DISABLED';
      throw e;
    }
    return hit.id;
  }
  const autoCode = await generateCustomerCode(conn);
  const [ins] = await conn.query(
    `INSERT INTO sales_customers (customer_code, customer_name, is_active, created_by, updated_by)
     VALUES (?, ?, 1, ?, ?)`,
    [autoCode, name || autoCode, userId || null, userId || null]
  );
  return ins.insertId;
}
