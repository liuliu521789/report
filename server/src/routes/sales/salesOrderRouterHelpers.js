import multer from 'multer';
import { SalesOrderFlowError } from '../../services/salesOrderFlowService.js';
import { SalesOrderCrudError } from '../../services/salesOrderCrudService.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

export function mapImportRowPersistError(err) {
  if (!err) return '导入处理失败，请稍后重试';
  const code = err.code;
  if (code === 'ER_DUP_ENTRY') return '订单号冲突或数据重复，请重试';
  if (code === 'CUSTOMER_DISABLED') return '客户已停用，无法创建订单';
  if (code === 'MISSING_CUSTOMER_FIELD') return err.message || '缺少客户字段配置';
  if (code === 'ORDER_NO') return '生成订单号失败，请稍后重试';
  const msg = String(err.message || err || '');
  if (/foreign key/i.test(msg) || code === 'ER_NO_REFERENCED_ROW_2' || code === 'ER_ROW_IS_REFERENCED_2') {
    return '关联数据无效，请检查客户信息等';
  }
  if (/duplicate/i.test(msg)) return '与已有数据冲突';
  return '保存失败，请检查该行数据';
}

export function orderDuplicateFingerprintKey(customerId, leg) {
  return [
    Number(customerId) || 0,
    String(leg.product_code ?? ''),
    String(leg.product_name ?? ''),
    String(leg.product_model ?? ''),
    String(leg.warehouse_model ?? ''),
    Number(leg.quantity) || 0,
    Number(leg.unit_price) || 0,
    Number(leg.amount) || 0
  ].join('\x1e');
}

/**
 * 批量查询「同客户 + 关键业务列」已存在且未取消的订单，用于导入去重。
 * @param {import('mysql2/promise').Pool} pool
 * @param {number[][]} tuples 每项为 [customerId, code, name, model, wh, qty, price, amount]
 */
export async function loadExistingDuplicateOrderBatch(pool, tuples, { createdByUid, seeAllOrders }) {
  const out = new Map();
  if (!tuples.length) return out;
  const CHUNK = 80;
  for (let i = 0; i < tuples.length; i += CHUNK) {
    const chunk = tuples.slice(i, i + CHUNK);
    const ph = chunk.map(() => '(?,?,?,?,?,?,?,?)').join(',');
    const flat = chunk.flat();
    let sql = `SELECT o.customer_id, o.product_code, o.product_name, o.product_model, o.warehouse_model,
                      o.quantity, o.unit_price, o.amount, o.order_no, c.customer_name
               FROM sales_orders o
               INNER JOIN sales_customers c ON c.id = o.customer_id
               WHERE o.status <> 'cancelled'`;
    const args = [];
    if (!seeAllOrders) {
      sql += ' AND o.created_by = ?';
      args.push(createdByUid);
    }
    sql += ` AND (o.customer_id, o.product_code, o.product_name, o.product_model, o.warehouse_model, o.quantity, o.unit_price, o.amount) IN (${ph})`;
    args.push(...flat);
    const [rows] = await pool.query(sql, args);
    for (const dup of rows) {
      const leg = {
        product_code: dup.product_code,
        product_name: dup.product_name,
        product_model: dup.product_model,
        warehouse_model: dup.warehouse_model,
        quantity: dup.quantity,
        unit_price: dup.unit_price,
        amount: dup.amount
      };
      const k = orderDuplicateFingerprintKey(Number(dup.customer_id), leg);
      if (!out.has(k)) out.set(k, dup);
    }
  }
  return out;
}

export function sendSalesOrderFlowError(res, err) {
  if (!(err instanceof SalesOrderFlowError)) return false;
  sendUnifiedError(res, err.httpStatus, err.code, err.payload);
  return true;
}

export function sendUnifiedError(res, httpStatus, errorCode, payload = {}) {
  const message = payload?.message || errorCode;
  const data = { error: errorCode };
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'details')) data.details = payload.details;
  return res.status(httpStatus).json({ code: httpStatus, message, data, error: errorCode, ...payload });
}

export function sendUnifiedSuccess(res, data = null, message = 'OK') {
  const legacy = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return res.json({ code: 0, message, data, ...legacy });
}

export function sendSalesOrderCrudError(res, err) {
  if (!(err instanceof SalesOrderCrudError)) return false;
  sendUnifiedError(res, err.httpStatus, err.code, err.payload);
  return true;
}

/** 从表头行识别「名称/客户型号」「品名」「英文代码」列索引 */
export function detectInternalModelImportLayout(rows) {
  const maxScan = Math.min(rows.length, 8);
  let productNameIdx = -1;
  for (let sr = 0; sr < maxScan; sr++) {
    const line = rows[sr] || [];
    let nameIdx = -1;
    let codeIdx = -1;
    productNameIdx = -1;
    const colMax = Math.min(line.length, 40);
    for (let j = 0; j < colMax; j++) {
      const h = String(line[j] ?? '')
        .trim()
        .replace(/^﻿/, '');
      if (!h) continue;
      if (h === '名称' || h === '客户型号') nameIdx = j;
      if (h === '品名' || h === '产品' || h === '产品名称') productNameIdx = j;
      if (h === '英文代码' || h === '内部编码') codeIdx = j;
      if (codeIdx < 0 && (h === '代码' || h === '编码') && !/产品/.test(h)) codeIdx = j;
    }
    if ((nameIdx >= 0 || productNameIdx >= 0) && codeIdx >= 0) {
      if (nameIdx < 0 && productNameIdx >= 0) nameIdx = productNameIdx;
      return { startRow: sr + 1, nameIdx, codeIdx, productNameIdx: productNameIdx >= 0 ? productNameIdx : -1 };
    }
  }
  const h0 = String(rows[0]?.[0] ?? '').trim().replace(/^﻿/, '');
  const h1 = String(rows[0]?.[1] ?? '').trim();
  if (/产品|品名|名称/.test(h0) && /代码|英文|编码/.test(h1)) {
    return { startRow: 1, nameIdx: 0, codeIdx: 1, productNameIdx: -1 };
  }
  return { startRow: 0, nameIdx: 0, codeIdx: 1, productNameIdx: -1 };
}

export function snapshotRequesterForExportJob(req) {
  const u = req.user || {};
  return {
    userId: u.userId,
    accountType: u.accountType,
    permissions: u.permissions,
    username: u.username || ''
  };
}

/** 导入模板内 1 行测试数据（黄色标注，列随 fieldDefs 顺序与类型生成） */
export function buildSalesImportSampleRow(fieldDefs) {
  return fieldDefs.map((d) => {
    if (d.field_type === 'date') return '2026-01-04';
    if (d.field_key === 'customer_code') return 'TC001';
    if (d.field_key === 'customer_name') return '测试厂家A';
    if (d.field_key === 'product_code') return '123456';
    if (d.field_key === 'product_name') return '200kg';
    if (d.field_key === 'product_model') return 'KM-2200/2200-WH';
    if (d.field_key === 'warehouse_model') return '';
    if (d.field_key === 'quantity') return '18桶';
    if (d.field_key === 'unit_price' || d.maps_to === 'unit_price') return 10.00;
    if (d.field_key === 'remark') return '';
    if (d.field_key === 'material_source') return '是';
    if (d.field_key === 'kangming') return '否';
    if (d.field_key === 'remaining') return '10桶';
    if (d.field_key === 'order_date') return '2026-01-04';
    if (d.field_type === 'number' || d.field_type === 'positive_number') return 1;
    return '测试1';
  });
}
