import { getPool } from '../db/pool.js';
import { sendWecomTemplateMessage, sendWecomPlainTextMessage } from './wecomNotify.js';

const BATCH_LIMIT = 20;

/** 第 n 次失败后的退避（毫秒）：1m / 5m / 30m / 2h / 6h */
const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000];

function nextBackoffMs(retryCountAfterFailure) {
  const idx = Math.min(Math.max(0, retryCountAfterFailure - 1), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[idx];
}

function shouldTextFallback(err) {
  if (!err) return false;
  if (err.code === 'TEXTCARD_URL_EMPTY') return true;
  return Number(err?.wecom?.errcode) === 41010;
}

function plainTextFromVariables(variables) {
  const d = variables?.detail;
  return d == null ? '' : String(d);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {Record<string, unknown>} row
 */
async function processJobRow(pool, row) {
  const id = Number(row.id);
  const templateCode = String(row.template_code || '');
  const toUser = String(row.to_user || '');
  let variables = row.variables_json;
  if (typeof variables === 'string') {
    try {
      variables = JSON.parse(variables);
    } catch {
      variables = {};
    }
  }
  if (!variables || typeof variables !== 'object') variables = {};

  let result;
  try {
    result = await sendWecomTemplateMessage(pool, { templateCode, variables, toUser });
  } catch (e) {
    if (shouldTextFallback(e) && plainTextFromVariables(variables)) {
      try {
        result = await sendWecomPlainTextMessage(pool, {
          toUser,
          content: plainTextFromVariables(variables)
        });
      } catch (e2) {
        await failJob(pool, row, e2);
        return;
      }
    } else {
      await failJob(pool, row, e);
      return;
    }
  }

  await pool.query(
    `UPDATE wecom_notify_jobs
     SET status = 'sent', sent_at = CURRENT_TIMESTAMP(3), wecom_response_json = CAST(? AS JSON),
         last_error = NULL, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ? AND status = 'sending'`,
    [JSON.stringify(result ?? {}), id]
  );
}

async function failJob(pool, row, err) {
  const id = Number(row.id);
  const maxRetries = Number(row.max_retries) || 5;
  const nextRetry = Number(row.retry_count) + 1;
  const msg = String(err?.message || err || 'unknown').slice(0, 65000);
  if (nextRetry > maxRetries) {
    await pool.query(
      `UPDATE wecom_notify_jobs
       SET status = 'dead', retry_count = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND status = 'sending'`,
      [nextRetry, msg, id]
    );
    return;
  }
  const delayMs = nextBackoffMs(nextRetry);
  const delaySec = Math.max(1, Math.ceil(delayMs / 1000));
  await pool.query(
    `UPDATE wecom_notify_jobs
     SET status = 'failed', retry_count = ?, last_error = ?,
         next_retry_at = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND),
         updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ? AND status = 'sending'`,
    [nextRetry, msg, delaySec, id]
  );
}

export async function runWecomNotifyWorkerTick() {
  const pool = getPool();
  await pool.query(
    `UPDATE wecom_notify_jobs SET status = 'pending', updated_at = CURRENT_TIMESTAMP(3)
     WHERE status = 'sending' AND updated_at < DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 15 MINUTE)
     LIMIT 100`
  );
  const [candidates] = await pool.query(
    `SELECT * FROM wecom_notify_jobs
     WHERE status IN ('pending','failed')
       AND next_retry_at <= CURRENT_TIMESTAMP(3)
     ORDER BY id ASC
     LIMIT ?`,
    [BATCH_LIMIT]
  );
  for (const row of candidates || []) {
    const [u] = await pool.query(
      `UPDATE wecom_notify_jobs SET status = 'sending', updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND status IN ('pending','failed') AND next_retry_at <= CURRENT_TIMESTAMP(3)`,
      [row.id]
    );
    if (!u.affectedRows) continue;
    try {
      const [again] = await pool.query('SELECT * FROM wecom_notify_jobs WHERE id = ? LIMIT 1', [row.id]);
      const r = again?.[0];
      if (!r) continue;
      await processJobRow(pool, r);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[wecom-notify-worker] processJob', row?.id, e?.message || e);
      try {
        const [again] = await pool.query('SELECT * FROM wecom_notify_jobs WHERE id = ? LIMIT 1', [row.id]);
        const r = again?.[0];
        if (r) await failJob(pool, r, e);
      } catch (e2) {
        // eslint-disable-next-line no-console
        console.error('[wecom-notify-worker] failJob', row?.id, e2?.message || e2);
      }
    }
  }
}

/** @param {number} intervalMs */
export function startWecomNotifyWorker(intervalMs = 5000) {
  const ms = Math.max(2000, Number(intervalMs) || 5000);
  const timer = setInterval(() => {
    runWecomNotifyWorkerTick().catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[wecom-notify-worker] tick', e?.message || e);
    });
  }, ms);
  if (typeof timer.unref === 'function') timer.unref();
  // eslint-disable-next-line no-console
  console.log('[server] wecom notify worker interval', ms, 'ms');
  return timer;
}
