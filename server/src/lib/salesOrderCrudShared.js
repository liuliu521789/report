import { nanoid } from 'nanoid';
import { validateOrderDataInput, dataJsonToLegacyColumns } from './salesOrderFields.js';

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

export async function insertOrderWithData(conn, { userId, data, definitions, statusRemark = '新建订单', fieldSchemaVersion } = {}) {
  const { errors, data: normalized } = validateOrderDataInput(definitions, data);
  if (errors.length) {
    const e = new Error('VALIDATION_FAILED');
    e.code = 'VALIDATION_FAILED';
    e.details = errors;
    throw e;
  }
  const leg = dataJsonToLegacyColumns(definitions, normalized);
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
  // 无编号时，按名称找；没有则自动生成编号
  const [byName] = await conn.query(
    'SELECT id, is_active FROM sales_customers WHERE customer_name = ? LIMIT 1',
    [name]
  );
  if (byName.length) {
    if (byName[0].is_active === 0) {
      const e = new Error('停用客户不能用于新建订单');
      e.code = 'CUSTOMER_DISABLED';
      throw e;
    }
    return byName[0].id;
  }
  const autoCode = await generateCustomerCode(conn);
  const [ins] = await conn.query(
    `INSERT INTO sales_customers (customer_code, customer_name, is_active, created_by, updated_by)
     VALUES (?, ?, 1, ?, ?)`,
    [autoCode, name || autoCode, userId || null, userId || null]
  );
  return ins.insertId;
}
