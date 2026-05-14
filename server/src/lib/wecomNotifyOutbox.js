/**
 * 企业微信通知 outbox：业务只入队，由 worker 异步调用企业微信 API。
 */

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{
 *   eventType: string,
 *   templateCode: string,
 *   toUser: string,
 *   variables?: Record<string, unknown>,
 *   bizType?: string | null,
 *   bizId?: number | null
 * }} opts
 * @returns {Promise<number>} job id
 */
export async function enqueueWecomNotify(pool, {
  eventType,
  templateCode,
  toUser,
  variables = {},
  bizType = null,
  bizId = null
}) {
  const tc = String(templateCode ?? '').trim();
  const etRaw = String(eventType ?? '').trim();
  const etFinal = etRaw || tc;
  const tu = String(toUser ?? '').trim();
  if (!tc) {
    const e = new Error('WECOM_ENQUEUE_BAD_TEMPLATE');
    e.code = 'WECOM_ENQUEUE_BAD_TEMPLATE';
    throw e;
  }
  if (!tu) {
    const e = new Error('WECOM_ENQUEUE_BAD_TOUSER');
    e.code = 'WECOM_ENQUEUE_BAD_TOUSER';
    throw e;
  }
  const vars = variables && typeof variables === 'object' ? variables : {};
  const bizTypeNorm = bizType != null && String(bizType).trim() !== '' ? String(bizType).trim().slice(0, 64) : null;
  let bizIdNorm = null;
  if (bizId != null && Number.isFinite(Number(bizId)) && Number(bizId) > 0) {
    bizIdNorm = Math.floor(Number(bizId));
  }

  const [r] = await pool.query(
    `INSERT INTO wecom_notify_jobs
      (event_type, template_code, to_user, variables_json, biz_type, biz_id, status, next_retry_at)
     VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, 'pending', CURRENT_TIMESTAMP(3))`,
    [etFinal.slice(0, 64), tc.slice(0, 64), tu, JSON.stringify(vars), bizTypeNorm, bizIdNorm]
  );
  return Number(r.insertId);
}
