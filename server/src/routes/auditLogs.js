import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { requireAuth, requirePermission, requireSuperAdmin } from '../middleware/auth.js';
import { logOperationFromReq, purgeExpiredErrorLogs } from '../lib/audit.js';

export const router = Router();
const bulkIdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000)
});

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

/** 登录日志：超管或 audit.viewLogin */
router.get(
  '/login',
  (req, res, next) => {
    if (req.user.accountType === 'super_admin') return next();
    return requirePermission('audit', 'viewLogin')(req, res, next);
  },
  async (req, res) => {
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
    if (req.user.accountType !== 'super_admin') {
      await logOperationFromReq(req, {
        module: '审计日志',
        action: '查询登录日志',
        detail: { username: username || null, from: from || null, to: to || null },
        success: true
      });
    }
    res.json({ items: rows, total: Number(cRows?.[0]?.c || 0) });
  }
);

router.delete('/login/bulk', requireSuperAdmin, async (req, res) => {
  const parsed = bulkIdsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { ids } = parsed.data;
  const pool = getPool();
  const [result] = await pool.query(`DELETE FROM login_logs WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  await logOperationFromReq(req, {
    module: '审计日志',
    action: '批量删除登录日志',
    detail: { count: ids.length },
    success: true
  });
  res.json({ ok: true, deletedCount: Number(result?.affectedRows || 0) });
});

router.post(
  '/login/export',
  (req, res, next) => {
    if (req.user.accountType === 'super_admin') return next();
    return requirePermission('audit', 'exportAudit')(req, res, next);
  },
  async (req, res) => {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const { ids } = parsed.data;
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, user_id AS userId, username, ip, user_agent AS userAgent, device_summary AS deviceSummary,
            success, fail_reason AS failReason, created_at AS createdAt
     FROM login_logs
     WHERE id IN (${ids.map(() => '?').join(',')})
     ORDER BY id DESC`,
      ids
    );
    await logOperationFromReq(req, {
      module: '审计日志',
      action: '批量导出登录日志',
      detail: { count: ids.length },
      success: true
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="login-logs.json"');
    res.send(JSON.stringify(rows, null, 2));
  }
);

router.get(
  '/operations',
  (req, res, next) => {
    if (req.user.accountType === 'super_admin') return next();
    return requirePermission('audit', 'viewOperations')(req, res, next);
  },
  async (req, res) => {
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
    if (req.user.accountType !== 'super_admin') {
      await logOperationFromReq(req, {
        module: '审计日志',
        action: '查询操作日志',
        detail: { username: username || null, module: module || null, from: from || null, to: to || null },
        success: true
      });
    }
    res.json({ items: rows, total: Number(cRows?.[0]?.c || 0) });
  }
);

router.delete('/operations/bulk', requireSuperAdmin, async (req, res) => {
  const parsed = bulkIdsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { ids } = parsed.data;
  const pool = getPool();
  const [result] = await pool.query(
    `DELETE FROM operation_logs WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  await logOperationFromReq(req, {
    module: '审计日志',
    action: '批量删除操作日志',
    detail: { count: ids.length },
    success: true
  });
  res.json({ ok: true, deletedCount: Number(result?.affectedRows || 0) });
});

router.post(
  '/operations/export',
  (req, res, next) => {
    if (req.user.accountType === 'super_admin') return next();
    return requirePermission('audit', 'exportAudit')(req, res, next);
  },
  async (req, res) => {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const { ids } = parsed.data;
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, user_id AS userId, username, module, action, detail_json AS detailJson, success,
            ip, user_agent AS userAgent, created_at AS createdAt
     FROM operation_logs
     WHERE id IN (${ids.map(() => '?').join(',')})
     ORDER BY id DESC`,
      ids
    );
    await logOperationFromReq(req, {
      module: '审计日志',
      action: '批量导出操作日志',
      detail: { count: ids.length },
      success: true
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="operation-logs.json"');
    res.send(JSON.stringify(rows, null, 2));
  }
);

router.get(
  '/errors',
  (req, res, next) => {
    if (req.user.accountType === 'super_admin') return next();
    return requirePermission('audit', 'viewErrors')(req, res, next);
  },
  async (req, res) => {
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
    if (req.user.accountType !== 'super_admin') {
      await logOperationFromReq(req, {
        module: '审计日志',
        action: '查询错误日志',
        detail: { module: module || null, from: from || null, to: to || null },
        success: true
      });
    }
    res.json({ items: rows, total: Number(cRows?.[0]?.c || 0) });
  }
);

router.delete('/errors/bulk', requireSuperAdmin, async (req, res) => {
  const parsed = bulkIdsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { ids } = parsed.data;
  const pool = getPool();
  const [result] = await pool.query(`DELETE FROM error_logs WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  await logOperationFromReq(req, {
    module: '审计日志',
    action: '批量删除错误日志',
    detail: { count: ids.length },
    success: true
  });
  res.json({ ok: true, deletedCount: Number(result?.affectedRows || 0) });
});

router.post(
  '/errors/export',
  (req, res, next) => {
    if (req.user.accountType === 'super_admin') return next();
    return requirePermission('audit', 'exportAudit')(req, res, next);
  },
  async (req, res) => {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const { ids } = parsed.data;
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, module, message, stack, code, meta_json AS metaJson, created_at AS createdAt
     FROM error_logs
     WHERE id IN (${ids.map(() => '?').join(',')})
     ORDER BY id DESC`,
      ids
    );
    await logOperationFromReq(req, {
      module: '审计日志',
      action: '批量导出错误日志',
      detail: { count: ids.length },
      success: true
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="error-logs.json"');
    res.send(JSON.stringify(rows, null, 2));
  }
);

router.get(
  '/errors/export',
  requireSuperAdmin,
  async (req, res) => {
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
  }
);
