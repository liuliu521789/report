/**
 * 订单/合同站内信与企业微信正文拼装（原 sales.js 内联函数抽出，供路由与公开审批复用）
 */
import {
  loadOrderFieldDefinitions,
  attachCustomerNamesToOrders,
  mergeRowDataJson
} from './salesOrderFields.js';

/** 单条订单摘要：发货日期、上传日期、厂家、型号、数量等 */
export function formatOrderSummaryLine(row, definitions) {
  const { display_data } = mergeRowDataJson(row, definitions);
  const nameKey = definitions.find((d) => d.maps_to === 'customer_name')?.field_key;
  const modelKey = definitions.find((d) => d.maps_to === 'product_model')?.field_key;
  const whKey = definitions.find((d) => d.maps_to === 'warehouse_model')?.field_key;
  const qtyKey = definitions.find((d) => d.maps_to === 'quantity')?.field_key;
  const pick = (key, fallback) => {
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
  const vendor = pick(nameKey, row.customer_name);
  const model = pick(modelKey, row.product_model);
  const wh = pick(whKey, row.warehouse_model);
  const qty =
    qtyKey != null && display_data[qtyKey] !== undefined && display_data[qtyKey] != null && String(display_data[qtyKey]).trim() !== ''
      ? String(display_data[qtyKey]).trim()
      : row.quantity != null && String(row.quantity) !== ''
        ? String(row.quantity)
        : '—';
  const orderDateKey = definitions.find((d) => d.field_key === 'order_date')?.field_key;
  const shipDate =
    orderDateKey != null && display_data[orderDateKey] !== undefined && display_data[orderDateKey] != null
      ? String(display_data[orderDateKey]).trim() || '—'
      : '—';
  const uploadAt = formatOrderUploadTime(row.created_at);
  return `订单号：${orderNo}\n厂家：${vendor}\n发货日期：${shipDate}\n上传日期：${uploadAt}\n标签型号：${model}\n仓库型号：${wh}\n数量：${qty}`;
}

export function formatOrderUploadTime(createdAt) {
  if (createdAt == null) return '—';
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(d.getTime())) return String(createdAt);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 多条订单站内信正文（intro + 逐条基础信息） */
export function buildOrderMessageBody(definitions, rows, { intro = '', maxOrders = 15 } = {}) {
  const list = rows.slice(0, maxOrders);
  const blocks = list.map((r) => formatOrderSummaryLine(r, definitions));
  let body = '';
  if (intro) body += `${intro.trim()}\n\n`;
  body += blocks.join('\n\n');
  if (rows.length > maxOrders) {
    body += `\n\n… 另有 ${rows.length - maxOrders} 笔订单未逐条列出，请到订单管理查看。`;
  }
  return body;
}

export async function buildOrderNotifyBody(pool, orderRows, options) {
  const definitions = await loadOrderFieldDefinitions(pool, { activeOnly: true });
  const enriched = await attachCustomerNamesToOrders(pool, orderRows);
  return buildOrderMessageBody(definitions, enriched, options);
}

/** 合同关联订单的站内信正文 */
export async function buildContractOrdersNotifyBody(pool, contractId, { intro = '', customerName = '' } = {}) {
  const [ords] = await pool.query(
    `SELECT o.* FROM sales_orders o
     INNER JOIN sales_contract_orders sco ON sco.order_id = o.id
     WHERE sco.contract_id = ?
     ORDER BY o.id ASC`,
    [contractId]
  );
  let head = intro.trim();
  if (customerName) head += `${head ? '\n' : ''}客户/厂家：${customerName}`;
  return buildOrderNotifyBody(pool, ords || [], { intro: head, maxOrders: 15 });
}
