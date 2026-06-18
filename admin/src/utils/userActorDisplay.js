/**
 * 日志/列表中的操作人展示：优先真实姓名，无姓名时回退账号。
 * @param {Record<string, unknown>|null|undefined} row
 * @param {{ realKey?: string, userKey?: string, empty?: string }} [opts]
 */
export function actorDisplay(row, opts = {}) {
  const realKey = opts.realKey || 'actor_real_name';
  const userKey = opts.userKey || 'actor_username';
  const empty = opts.empty ?? '—';
  if (!row) return empty;
  const rn = String(row[realKey] ?? row.realName ?? '').trim();
  if (rn) return rn;
  const un = String(row[userKey] ?? row.username ?? '').trim();
  return un || empty;
}
