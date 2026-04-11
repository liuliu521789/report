import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { logOperationFromReq } from '../lib/audit.js';
import { requireAnyPermissionPairs, requireAuth, requirePermission } from '../middleware/auth.js';

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const router = Router();

const canReadStyles = requireAnyPermissionPairs([
  ['reports', 'create'],
  ['reports', 'edit'],
  ['reports', 'view']
]);

router.use(requireAuth);

const styleSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(255).optional().nullable(),
  elements: z.array(z.any()).min(0).max(2000)
});

router.get(
  '/',
  canReadStyles,
  wrapAsync(async (_req, res) => {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, name, description, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
       FROM report_styles
       ORDER BY updated_at DESC, id DESC`
    );
    res.json({ items: rows });
  })
);

router.get(
  '/:id',
  canReadStyles,
  wrapAsync(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, name, description, elements_json AS elements, created_by AS createdBy, created_at AS createdAt, updated_at AS updatedAt
       FROM report_styles
       WHERE id=? LIMIT 1`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ style: row });
  })
);

router.post(
  '/',
  requirePermission('reports', 'create'),
  wrapAsync(async (req, res) => {
    const parsed = styleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const { name, description, elements } = parsed.data;
    const pool = getPool();
    const [result] = await pool.query(
      'INSERT INTO report_styles (name, description, elements_json, created_by) VALUES (?, ?, ?, ?)',
      [name, description ?? null, JSON.stringify(elements), req.user.userId]
    );
    await logOperationFromReq(req, {
      module: '报告样式',
      action: '新增报告样式',
      detail: { styleId: result.insertId, name },
      success: true
    });
    res.status(201).json({ id: result.insertId });
  })
);

router.put(
  '/:id',
  requirePermission('reports', 'edit'),
  wrapAsync(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'BAD_REQUEST' });
    const parsed = styleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const { name, description, elements } = parsed.data;
    const pool = getPool();
    const [result] = await pool.query(
      'UPDATE report_styles SET name=?, description=?, elements_json=? WHERE id=?',
      [name, description ?? null, JSON.stringify(elements), id]
    );
    if (!result?.affectedRows) return res.status(404).json({ error: 'NOT_FOUND' });
    await logOperationFromReq(req, {
      module: '报告样式',
      action: '修改报告样式',
      detail: { styleId: id, name },
      success: true
    });
    res.json({ ok: true });
  })
);

router.delete(
  '/:id',
  requirePermission('reports', 'edit'),
  wrapAsync(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const [result] = await pool.query('DELETE FROM report_styles WHERE id=?', [id]);
    if (!result?.affectedRows) return res.status(404).json({ error: 'NOT_FOUND' });
    await logOperationFromReq(req, {
      module: '报告样式',
      action: '删除报告样式',
      detail: { styleId: id },
      success: true
    });
    res.json({ ok: true });
  })
);
