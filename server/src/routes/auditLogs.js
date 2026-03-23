import { Router } from 'express';

import { getPool } from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { purgeExpiredErrorLogs } from '../lib/audit.js';

export const router = Router();

router.use(requireAuth);

/** 员工：仅本人操作日志 */
router.get('/my-operations', async (req, res) => {
  if (req.user.accountType === 'super_admin') {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const uid = Number(req.user.userId);
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  const module = String(req.query.module || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();

  const pool = getPool();
  const where = ['user_id = ?'];
  const params = [uid];
  if (module) {
    where.push('module = ?');
    params.push(module);
  }
  if (from) {
    where.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('created_at <= ?');
    params.push(to);
  }
  const sqlWhere = `WHERE ${where.join(' AND ')}`;
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, username, module, action, detail_json AS detailJson, success,
            ip, user_agent AS userAgent, created_at AS createdAt
     FROM operation_logs ${sqlWhere}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [cRows] = await pool.query(`SELECT COUNT(*) AS c FROM operation_logs ${sqlWhere}`, params);
  res.json({ items: rows, total: Number(cRows?.[0]?.c || 0) });
});

router.use(requireSuperAdmin);

router.get('/login', async (req, res) => {
  const username = String(req.query.username || '').trim();
  const success = req.query.success;
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const pool = getPool();
  const where = ['1=1'];
  const params = [];
  if (username) {
    where.push('username = ?');
    params.push(username);
  }
  if (success === '1' || success === '0') {
    where.push('success = ?');
    params.push(success === '1' ? 1 : 0);
  }
  if (from) {
    where.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('created_at <= ?');
    params.push(to);
  }
  const sqlWhere = `WHERE ${where.join(' AND ')}`;
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, username, ip, user_agent AS userAgent, device_summary AS deviceSummary,
            success, fail_reason AS failReason, created_at AS createdAt
     FROM login_logs ${sqlWhere}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [cRows] = await pool.query(`SELECT COUNT(*) AS c FROM login_logs ${sqlWhere}`, params);
  res.json({ items: rows, total: Number(cRows?.[0]?.c || 0) });
});

router.get('/operations', async (req, res) => {
  const username = String(req.query.username || '').trim();
  const userId = req.query.userId != null && req.query.userId !== '' ? Number(req.query.userId) : null;
  const module = String(req.query.module || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const pool = getPool();
  const where = ['1=1'];
  const params = [];
  if (username) {
    where.push('username = ?');
    params.push(username);
  }
  if (userId != null && Number.isFinite(userId)) {
    where.push('user_id = ?');
    params.push(userId);
  }
  if (module) {
    where.push('module = ?');
    params.push(module);
  }
  if (from) {
    where.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('created_at <= ?');
    params.push(to);
  }
  const sqlWhere = `WHERE ${where.join(' AND ')}`;
  const [rows] = await pool.query(
    `SELECT id, user_id AS userId, username, module, action, detail_json AS detailJson, success,
            ip, user_agent AS userAgent, created_at AS createdAt
     FROM operation_logs ${sqlWhere}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [cRows] = await pool.query(`SELECT COUNT(*) AS c FROM operation_logs ${sqlWhere}`, params);
  res.json({ items: rows, total: Number(cRows?.[0]?.c || 0) });
});

router.get('/errors', async (req, res) => {
  await purgeExpiredErrorLogs();
  const module = String(req.query.module || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const pool = getPool();
  const where = ['1=1'];
  const params = [];
  if (module) {
    where.push('module = ?');
    params.push(module);
  }
  if (from) {
    where.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('created_at <= ?');
    params.push(to);
  }
  const sqlWhere = `WHERE ${where.join(' AND ')}`;
  const [rows] = await pool.query(
    `SELECT id, module, message, stack, code, meta_json AS metaJson, created_at AS createdAt
     FROM error_logs ${sqlWhere}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const [cRows] = await pool.query(`SELECT COUNT(*) AS c FROM error_logs ${sqlWhere}`, params);
  res.json({ items: rows, total: Number(cRows?.[0]?.c || 0) });
});

router.get('/errors/export', async (req, res) => {
  await purgeExpiredErrorLogs();
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, module, message, stack, code, meta_json AS metaJson, created_at AS createdAt
     FROM error_logs
     ORDER BY id DESC
     LIMIT 5000`
  );
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="error-logs.json"');
  res.send(JSON.stringify(rows, null, 2));
});
