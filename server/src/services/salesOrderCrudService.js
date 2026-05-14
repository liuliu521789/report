/**
 * 销售订单创建与编辑：事务、字段校验、客户解析与编辑日志。
 */

import {
  loadOrderFieldDefinitions,
  validateOrderDataInput,
  dataJsonToLegacyColumns,
  mergeRowDataJson
} from '../lib/salesOrderFields.js';
import { insertOrderWithData, getOrCreateCustomer } from '../lib/salesOrderCrudShared.js';

export class SalesOrderCrudError extends Error {
  /**
   * @param {string} code 响应体 error 字段（部分场景为可读文案，与历史接口一致）
   * @param {number} [httpStatus=400]
   * @param {Record<string, unknown>} [payload] 如 details、message
   */
  constructor(code, httpStatus = 400, payload = {}) {
    super(code);
    this.name = 'SalesOrderCrudError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.payload = payload;
  }
}

export async function createSalesOrderWithData(pool, { userId, data }) {
  const definitions = await loadOrderFieldDefinitions(pool, { activeOnly: true });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await insertOrderWithData(conn, {
      userId,
      data: data || {},
      definitions
    });
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback();
    if (e.code === 'VALIDATION_FAILED') {
      throw new SalesOrderCrudError('VALIDATION_FAILED', 400, { details: e.details });
    }
    if (e.code === 'MISSING_CUSTOMER_FIELD') {
      throw new SalesOrderCrudError('MISSING_CUSTOMER_FIELD', 400, { message: e.message });
    }
    if (e.code === 'VALIDATION') {
      throw new SalesOrderCrudError(e.message, 400);
    }
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ orderId: number, userId: number, row: Record<string, unknown>, data: Record<string, unknown>, rowVersion: number }} args
 */
export async function patchSalesOrderWithData(pool, { orderId, userId, row, data, rowVersion }) {
  const id = Number(orderId);
  if (!Number.isFinite(id) || id < 1) {
    throw new SalesOrderCrudError('BAD_REQUEST', 400);
  }

  const allDefs = await loadOrderFieldDefinitions(pool, { activeOnly: false });
  const activeDefs = allDefs.filter((d) => d.is_active);
  const prev = mergeRowDataJson(row, allDefs).dataJson;
  const merged = { ...prev, ...(data || {}) };
  const { errors, data: normalized } = validateOrderDataInput(activeDefs, merged);
  if (errors.length) {
    throw new SalesOrderCrudError('VALIDATION_FAILED', 400, { details: errors });
  }
  const codeKey = activeDefs.find((d) => d.maps_to === 'customer_code')?.field_key;
  const nameKey = activeDefs.find((d) => d.maps_to === 'customer_name')?.field_key;
  if (!codeKey && !nameKey) {
    throw new SalesOrderCrudError('MISSING_CUSTOMER_FIELD', 400, {
      message: '请配置「客户编号」或「客户名称」映射字段'
    });
  }

  const before = { ...row };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const customerId = await getOrCreateCustomer(conn, {
      customer_code: codeKey ? normalized[codeKey] : '',
      customer_name: nameKey ? normalized[nameKey] : '',
      userId
    });
    const leg = dataJsonToLegacyColumns(activeDefs, normalized);
    const expectedVer = Number(rowVersion);
    const [upd] = await conn.query(
      `UPDATE sales_orders SET customer_id = ?, product_code = ?, product_name = ?, product_model = ?, warehouse_model = ?, quantity = ?, unit_price = ?, amount = ?, remark = ?, data_json = CAST(? AS JSON), updated_by = ?, row_version = row_version + 1
       WHERE id = ? AND row_version = ?`,
      [
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
        userId,
        id,
        expectedVer
      ]
    );
    if (Number(upd.affectedRows || 0) !== 1) {
      await conn.rollback();
      throw new SalesOrderCrudError('CONCURRENT_UPDATE', 409, {
        message: '订单已被他人修改或您打开的页面已过期，请关闭后重新打开再编辑'
      });
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    if (e instanceof SalesOrderCrudError) throw e;
    throw e;
  } finally {
    conn.release();
  }

  const [afterRows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
  await pool.query(
    `INSERT INTO sales_order_edit_logs (order_id, actor_id, before_json, after_json) VALUES (?, ?, ?, ?)`,
    [id, userId, JSON.stringify(before), JSON.stringify(afterRows[0])]
  );
}
