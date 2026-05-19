import fs from 'fs/promises';
import path from 'path';

import { getPool } from '../db/pool.js';
import { listQuerySchema } from './salesOrderListQuerySchema.js';
import { buildSalesOrdersExportXlsxBuffer } from './salesOrderExportBuild.js';
import { logOperation } from './audit.js';

function exportDir() {
  return path.join(process.cwd(), 'data', 'order-exports');
}

async function ensureExportDir() {
  const dir = exportDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * 认领一条 pending 任务并置为 running；无任务返回 null。
 * @param {import('mysql2/promise').Pool} pool
 */
async function claimNextExportJob(pool) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT j.id
       FROM sales_order_export_jobs j
       WHERE j.status = 'pending'
       ORDER BY j.id ASC
       LIMIT 1
       FOR UPDATE`
    );
    const id = rows?.[0]?.id;
    if (id == null) {
      await conn.commit();
      return null;
    }
    await conn.query(`UPDATE sales_order_export_jobs SET status = 'running' WHERE id = ? AND status = 'pending'`, [id]);
    await conn.commit();
    const [full] = await pool.query('SELECT * FROM sales_order_export_jobs WHERE id = ? LIMIT 1', [id]);
    const row = full?.[0];
    if (!row || row.status !== 'running') return null;
    return row;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

function buildReqStub(requesterJson) {
  let u = requesterJson;
  if (typeof u === 'string') {
    try {
      u = JSON.parse(u);
    } catch {
      u = {};
    }
  }
  if (!u || typeof u !== 'object') u = {};
  return { user: u };
}

export async function runSalesOrderExportWorkerTick() {
  const pool = getPool();
  const row = await claimNextExportJob(pool);
  if (!row) return;

  const jobId = Number(row.id);
  const reqStub = buildReqStub(row.requester_json);
  let q;
  try {
    const raw = typeof row.filter_json === 'string' ? JSON.parse(row.filter_json) : row.filter_json;
    q = listQuerySchema.parse(raw || {});
  } catch (e) {
    await pool.query(
      `UPDATE sales_order_export_jobs SET status = 'failed', last_error = ?, finished_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [String(e?.message || 'BAD_FILTER').slice(0, 500), jobId]
    );
    return;
  }

  try {
    const { buffer, rowCount, totalHit } = await buildSalesOrdersExportXlsxBuffer(pool, reqStub, q);
    const dir = await ensureExportDir();
    const rel = path.join('data', 'order-exports', `sales-orders-export-${jobId}.xlsx`);
    const abs = path.join(process.cwd(), rel);
    await fs.writeFile(abs, buffer);
    await pool.query(
      `UPDATE sales_order_export_jobs
       SET status = 'done', total_hit = ?, row_count_exported = ?, file_path = ?, finished_at = CURRENT_TIMESTAMP(3), last_error = NULL
       WHERE id = ?`,
      [totalHit, rowCount, rel.replace(/\\/g, '/'), jobId]
    );
    await logOperation(getPool(), {
      userId: Number(row.created_by) || null,
      username: String(reqStub.user?.username || '').slice(0, 64),
      module: '销售订单',
      action: '导出订单(异步)',
      detail: {
        job_id: jobId,
        total_hit: totalHit,
        row_count_exported: rowCount,
        filters: q
      },
      success: true,
      ip: '',
      userAgent: 'sales-order-export-worker'
    });
  } catch (e) {
    const msg = String(e?.message || e || 'EXPORT_FAILED').slice(0, 500);
    await pool.query(
      `UPDATE sales_order_export_jobs SET status = 'failed', last_error = ?, finished_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [msg, jobId]
    );
    // eslint-disable-next-line no-console
    console.error('[sales-order-export-worker] job', jobId, e?.message || e);
  }
}

/** @param {number} intervalMs */
export function startSalesOrderExportWorker(intervalMs = 4000) {
  const ms = Math.max(2000, Number(intervalMs) || 4000);
  const timer = setInterval(() => {
    runSalesOrderExportWorkerTick().catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[sales-order-export-worker] tick', e?.message || e);
    });
  }, ms);
  if (typeof timer.unref === 'function') timer.unref();
  // eslint-disable-next-line no-console
  console.log('[server] sales order export worker interval', ms, 'ms');
  return timer;
}
