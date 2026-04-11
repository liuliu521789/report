import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { hasPermission } from '../lib/permissions.js';

export const router = Router();

function canReadDepartmentTree(req) {
  if (req.user.accountType === 'super_admin') return true;
  return hasPermission(req.user.permissions, 'contract_management', 'contract_submit');
}

function buildDepartmentTree(rows) {
  const byId = new Map();
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      parentId: r.parentId,
      nameZh: r.nameZh,
      sortOrder: r.sortOrder,
      children: []
    });
  }
  const roots = [];
  for (const node of byId.values()) {
    if (node.parentId == null) {
      roots.push(node);
    } else {
      const p = byId.get(node.parentId);
      if (p) p.children.push(node);
      else roots.push(node);
    }
  }
  function sortRecursive(n) {
    n.children.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
    for (const c of n.children) sortRecursive(c);
  }
  roots.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
  for (const r of roots) sortRecursive(r);
  return roots;
}

async function collectDescendantIds(pool, rootId) {
  const out = new Set();
  let frontier = [rootId];
  for (let depth = 0; depth < 64 && frontier.length; depth += 1) {
    const [rows] = await pool.query(
      `SELECT id FROM departments WHERE parent_id IN (${frontier.map(() => '?').join(',')})`,
      frontier
    );
    frontier = [];
    for (const r of rows) {
      if (!out.has(r.id)) {
        out.add(r.id);
        frontier.push(r.id);
      }
    }
  }
  return out;
}

router.get('/tree', requireAuth, async (req, res, next) => {
  try {
    if (!canReadDepartmentTree(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, parent_id AS parentId, name_zh AS nameZh, sort_order AS sortOrder
       FROM departments ORDER BY sort_order ASC, id ASC`
    );
    res.json({ tree: buildDepartmentTree(rows || []) });
  } catch (e) {
    next(e);
  }
});

router.get('/flat', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT d.id, d.parent_id AS parentId, d.name_zh AS nameZh, d.sort_order AS sortOrder,
              (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) AS memberCount
       FROM departments d
       ORDER BY d.parent_id IS NULL DESC, d.sort_order ASC, d.id ASC`
    );
    res.json({ items: rows || [] });
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  nameZh: z.string().min(1).max(128),
  parentId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().min(0).max(99999).optional()
});

router.post('/', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const { nameZh, parentId = null, sortOrder = 0 } = parsed.data;
    const pool = getPool();
    if (parentId != null) {
      const [p] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [parentId]);
      if (!p?.[0]) return res.status(400).json({ error: 'BAD_PARENT' });
    }
    const [result] = await pool.query(
      'INSERT INTO departments (parent_id, name_zh, sort_order) VALUES (?, ?, ?)',
      [parentId, nameZh.trim(), sortOrder]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    next(e);
  }
});

const updateSchema = z.object({
  nameZh: z.string().min(1).max(128).optional(),
  parentId: z.union([z.number().int().positive(), z.null()]).optional(),
  sortOrder: z.number().int().min(0).max(99999).optional()
});

router.put('/:id', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const [exist] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [id]);
    if (!exist?.[0]) return res.status(404).json({ error: 'NOT_FOUND' });

    const { nameZh, parentId, sortOrder } = parsed.data;
    if (parentId !== undefined) {
      if (parentId === id) return res.status(400).json({ error: 'INVALID_PARENT' });
      if (parentId != null) {
        const [p] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [parentId]);
        if (!p?.[0]) return res.status(400).json({ error: 'BAD_PARENT' });
        const desc = await collectDescendantIds(pool, id);
        if (desc.has(parentId)) return res.status(400).json({ error: 'INVALID_PARENT' });
      }
    }

    const sets = [];
    const params = [];
    if (nameZh !== undefined) {
      sets.push('name_zh = ?');
      params.push(nameZh.trim());
    }
    if (parentId !== undefined) {
      sets.push('parent_id = ?');
      params.push(parentId);
    }
    if (sortOrder !== undefined) {
      sets.push('sort_order = ?');
      params.push(sortOrder);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'BAD_REQUEST' });
    params.push(id);
    await pool.query(`UPDATE departments SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const [exist] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [id]);
    if (!exist?.[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    const [kids] = await pool.query('SELECT id FROM departments WHERE parent_id = ? LIMIT 1', [id]);
    if (kids?.[0]) return res.status(400).json({ error: 'HAS_CHILD_DEPARTMENTS' });
    const [members] = await pool.query('SELECT id FROM users WHERE department_id = ? LIMIT 1', [id]);
    if (members?.[0]) return res.status(400).json({ error: 'HAS_MEMBERS' });
    await pool.query('DELETE FROM departments WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
