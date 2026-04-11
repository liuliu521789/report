import { getPool } from '../db/pool.js';
import {
  loadOrderFieldDefinitions,
  attachCustomerNamesToOrders,
  formatWarehouseWecomOrderDetail
} from './salesOrderFields.js';

function clampInternalBody(text, maxLen = 2000) {
  const s = text == null ? '' : String(text);
  if (s.length <= maxLen) return s || null;
  return `${s.slice(0, maxLen - 24)}\n…（正文过长已截断）`;
}

async function notifyShipStakeholders(pool, row) {
  const defs = await loadOrderFieldDefinitions(pool, { activeOnly: true });
  const [en] = await attachCustomerNamesToOrders(pool, [row]);
  const line = formatWarehouseWecomOrderDetail(en, defs);
  const body = clampInternalBody(`订单已发货。\n\n${line}`);
  const targets = new Set();
  if (row.created_by) targets.add(row.created_by);
  const [fin] = await pool.query(
    `SELECT u.id FROM users u INNER JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.is_active = 1 AND u.account_type IN ('employee', 'manager') AND c.code = 'finance'`
  );
  for (const f of fin) targets.add(f.id);
  for (const uid of targets) {
    await pool.query(
      `INSERT INTO sales_internal_messages (to_user_id, from_user_id, category, title, body_text, ref_type, ref_id)
       VALUES (?, NULL, 'notice', ?, ?, 'order', ?)`,
      [uid, '订单已发货', body, row.id]
    );
  }
}

/**
 * 企业微信一键发货：仅允许 已审核 → 已发货；shipped_by/updated_by 置空（非登录操作）。
 * @returns {Promise<{ ok: true, orderId: number } | { ok: false, code: string, message: string }>}
 */
export async function performWecomQuickShip(poolConn, orderId) {
  const pool = poolConn || getPool();
  const id = Number(orderId);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, code: 'BAD_ID', message: '无效的订单' };
  }
  const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
  const row = rows?.[0];
  if (!row) return { ok: false, code: 'NOT_FOUND', message: '订单不存在' };
  if (row.status === 'shipped') {
    return { ok: false, code: 'ALREADY_SHIPPED', message: '该订单已发货，无需重复操作' };
  }
  if (row.status !== 'approved') {
    return { ok: false, code: 'INVALID_STATUS', message: '当前订单状态不允许发货' };
  }

  await pool.query(
    `UPDATE sales_orders SET status = 'shipped', shipped_at = NOW(3), shipped_by = NULL, shipping_instruction = NULL, updated_by = NULL WHERE id = ?`,
    [id]
  );
  await pool.query(
    `INSERT INTO sales_order_status_logs (order_id, from_status, to_status, actor_id, remark)
     VALUES (?, 'approved', 'shipped', NULL, ?)`,
    [id, '企业微信「完成发货」']
  );
  try {
    await notifyShipStakeholders(pool, row);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[wecom quick ship] notify stakeholders:', e?.message || e);
  }
  return { ok: true, orderId: id };
}
