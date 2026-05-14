/**
 * 与用户列表/提交审批链展示一致：优先真实姓名，可附带账号区分。
 * @param {import('mysql2/promise').Pool} pool
 * @param {number|string|null|undefined} userId
 * @returns {Promise<string>}
 */
export async function userDisplayLabel(pool, userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id < 1) return '未知用户';
  const [rows] = await pool.query(
    'SELECT id, username, real_name FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  const r = rows?.[0];
  if (!r) return `用户#${id}`;
  const realName = r.real_name != null ? String(r.real_name).trim() : '';
  const username = r.username != null ? String(r.username).trim() : '';
  const display = realName || username || `用户#${id}`;
  if (username && username !== display) return `${display}(${username})`;
  return display;
}
