/**
 * 销售订单导出：与列表/旧同步导出相同的筛选逻辑，生成 xlsx buffer。
 */

import XLSX from 'xlsx';
import {
  perm,
  canViewAllSalesOrders,
  appendSalesOrderListFilters,
  loadQcMap,
  enrichOrdersQc,
  canSeeOrderListQcQrcode,
  filterOrderFieldDefsForList
} from '../routes/sales/salesShared.js';
import { loadOrderFieldDefinitions, mergeRowDataJson } from './salesOrderFields.js';
import { formatOrderUploadTime } from './salesOrderNotifyBody.js';

const EXPORT_LIMIT = 5000;

/** @param {import('mysql2/promise').Pool} pool */
export async function countSalesOrdersForExport(pool, req, q) {
  const uid = req.user.userId;
  const seeAll =
    perm(req, 'data_management', 'data_export_all') || canViewAllSalesOrders(req);

  let sql = `SELECT COUNT(*) AS c
               FROM sales_orders o
               INNER JOIN sales_customers c ON c.id = o.customer_id
               WHERE 1=1`;
  const args = [];
  const scoped = appendSalesOrderListFilters(sql, args, req, q, { uid, seeAll });
  sql = scoped.sql;

  const [countRows] = await pool.query(sql, args);
  return Number(countRows[0]?.c || 0);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<{ buffer: Buffer, rowCount: number, totalHit: number }>}
 */
export async function buildSalesOrdersExportXlsxBuffer(pool, req, q) {
  const uid = req.user.userId;
  const seeAll =
    perm(req, 'data_management', 'data_export_all') || canViewAllSalesOrders(req);

  const totalHit = await countSalesOrdersForExport(pool, req, q);

  let sql = `SELECT o.order_no, o.data_json, o.qc_qrcode_id, c.customer_code, c.customer_name, o.product_code, o.product_name, o.product_model, o.warehouse_model,
                      o.quantity, o.unit_price, o.amount, o.remark, o.status, o.created_at, u.username AS sales_username,
                      COALESCE(NULLIF(TRIM(u_ship.real_name), ''), NULLIF(TRIM(u_ship.username), ''), '') AS shipped_by_name
               FROM sales_orders o
               INNER JOIN sales_customers c ON c.id = o.customer_id
               LEFT JOIN users u ON u.id = o.created_by
               LEFT JOIN users u_ship ON u_ship.id = o.shipped_by
               WHERE 1=1`;
  const args = [];
  const scoped = appendSalesOrderListFilters(sql, args, req, q, { uid, seeAll });
  sql = scoped.sql;
  sql += ` ORDER BY o.created_at DESC LIMIT ${EXPORT_LIMIT}`;

  const [rows] = await pool.query(sql, args);
  const fieldDefsAll = await loadOrderFieldDefinitions(pool, { activeOnly: true });
  const fieldDefs = filterOrderFieldDefsForList(req, fieldDefsAll);
  const showQcCol = canSeeOrderListQcQrcode(req);
  const labelRow = [
    '订单号',
    ...fieldDefs.map((d) => d.label_zh),
    '状态',
    '销售人员',
    '发货人',
    '上传日期',
    ...(showQcCol ? ['质检报告二维码'] : [])
  ];
  let rowsWithQc = rows;
  if (showQcCol) {
    const models = rows.map((r) => r.product_model);
    const qcMap = await loadQcMap(pool, models);
    rowsWithQc = await enrichOrdersQc(pool, rows, qcMap);
  }
  const wsData = [
    labelRow,
    ...rowsWithQc.map((o) => {
      const { dataJson } = mergeRowDataJson(o, fieldDefsAll);
      const cells = fieldDefs.map((d) => dataJson[d.field_key] ?? '');
      const tail = [
        o.status,
        o.sales_username,
        o.shipped_by_name || '',
        formatOrderUploadTime(o.created_at)
      ];
      if (showQcCol) tail.push(o.qc_public_url || '无可用报告');
      return [o.order_no, ...cells, ...tail];
    })
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'orders');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { buffer, rowCount: rows.length, totalHit };
}

export { EXPORT_LIMIT };
