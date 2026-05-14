/**
 * 销售模块站内信写入（sales_internal_messages）
 * 供 routes / services / lib 共用，避免 services 依赖 routes。
 */

/** DB 字段 body_text VARCHAR(2048)，统一截断避免写入失败 */
export function clampInternalMessageBody(text, maxLen = 2000) {
  const s = text == null ? '' : String(text);
  if (s.length <= maxLen) return s || null;
  return `${s.slice(0, maxLen - 24)}\n…（正文过长已截断，请到订单管理查看）`;
}

/** 站内信类型：notice 普通通知、todo 待办、system 系统类（预留） */
export function normalizeInternalMessageCategory(raw) {
  const s = raw == null ? '' : String(raw);
  if (s === 'todo' || s === 'system') return s;
  return 'notice';
}

export async function notifyUsersByCategory(pool, categoryCode, { title, bodyText, fromUserId, refType, refId, msgCategory }) {
  const body = clampInternalMessageBody(bodyText);
  const kind = normalizeInternalMessageCategory(msgCategory);
  const [users] = await pool.query(
    `SELECT u.id FROM users u
     INNER JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code = ?`,
    [categoryCode]
  );
  for (const u of users) {
    await pool.query(
      `INSERT INTO sales_internal_messages (to_user_id, from_user_id, category, title, body_text, ref_type, ref_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [u.id, fromUserId || null, kind, title, body, refType || null, refId || null]
    );
  }
}

export async function notifyUser(pool, toUserId, { title, bodyText, fromUserId, refType, refId, msgCategory }) {
  const body = clampInternalMessageBody(bodyText);
  const kind = normalizeInternalMessageCategory(msgCategory);
  await pool.query(
    `INSERT INTO sales_internal_messages (to_user_id, from_user_id, category, title, body_text, ref_type, ref_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [toUserId, fromUserId || null, kind, title, body, refType || null, refId || null]
  );
}
