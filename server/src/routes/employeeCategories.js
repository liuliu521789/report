import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { emptyPermissions, mergePermissions, parsePermissionsJson } from '../lib/permissions.js';

export const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

const createSchema = z.object({
  nameZh: z.string().min(1).max(64),
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z][a-z0-9_]*$/i, 'code 仅字母数字下划线'),
  sortOrder: z.number().int().optional(),
  defaultPermissions: z.any().optional(),
  requireTwoFactor: z.boolean().optional()
});

const updateSchema = z.object({
  nameZh: z.string().min(1).max(64).optional(),
  sortOrder: z.number().int().optional(),
  defaultPermissions: z.any().optional(),
  requireTwoFactor: z.boolean().optional()
});

router.get('/', async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, name_zh AS nameZh, code, sort_order AS sortOrder,
            default_permissions_json AS defaultPermissions,
            IFNULL(require_two_factor, 0) AS requireTwoFactor,
            IFNULL(is_builtin, 0) AS isBuiltin,
            created_at AS createdAt
     FROM employee_categories ORDER BY sort_order ASC, id ASC`
  );
  const items = (rows || []).map((r) => ({
    ...r,
    defaultPermissions: parsePermissionsJson(r.defaultPermissions),
    requireTwoFactor: !!(Number(r.requireTwoFactor) === 1 || r.requireTwoFactor === true),
    isBuiltin: !!(Number(r.isBuiltin) === 1 || r.isBuiltin === true)
  }));
  res.json({ items });
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { nameZh, code, sortOrder = 0, defaultPermissions, requireTwoFactor = false } = parsed.data;
  const merged = mergePermissions(emptyPermissions(), defaultPermissions || {});
  const pool = getPool();
  try {
    const [result] = await pool.query(
      'INSERT INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor) VALUES (?, ?, ?, ?, ?)',
      [nameZh, code.toLowerCase(), sortOrder, JSON.stringify(merged), requireTwoFactor ? 1 : 0]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'CODE_EXISTS' });
    throw e;
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { nameZh, sortOrder, defaultPermissions, requireTwoFactor } = parsed.data;

  const pool = getPool();
  const [exist] = await pool.query('SELECT id FROM employee_categories WHERE id=? LIMIT 1', [id]);
  if (!exist?.[0]) return res.status(404).json({ error: 'NOT_FOUND' });

  const sets = [];
  const params = [];
  if (nameZh !== undefined) {
    sets.push('name_zh = ?');
    params.push(nameZh);
  }
  if (sortOrder !== undefined) {
    sets.push('sort_order = ?');
    params.push(sortOrder);
  }
  if (requireTwoFactor !== undefined) {
    sets.push('require_two_factor = ?');
    params.push(requireTwoFactor ? 1 : 0);
  }
  if (defaultPermissions !== undefined) {
    const [curRows] = await pool.query('SELECT default_permissions_json FROM employee_categories WHERE id=?', [id]);
    const cur = parsePermissionsJson(curRows?.[0]?.default_permissions_json);
    const merged = mergePermissions(cur || emptyPermissions(), defaultPermissions);
    sets.push('default_permissions_json = ?');
    params.push(JSON.stringify(merged));
  }
  if (sets.length === 0) return res.status(400).json({ error: 'BAD_REQUEST' });
  params.push(id);
  await pool.query(`UPDATE employee_categories SET ${sets.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const [qc] = await pool.query(
    'SELECT code, IFNULL(is_builtin, 0) AS is_builtin FROM employee_categories WHERE id=?',
    [id]
  );
  if (!qc?.[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  if (Number(qc[0].is_builtin) === 1) {
    return res.status(400).json({ error: 'CANNOT_DELETE_BUILTIN' });
  }

  const [useRows] = await pool.query(
    'SELECT COUNT(*) AS c FROM users WHERE employee_category_id = ? AND deleted_at IS NULL',
    [id]
  );
  if (Number(useRows?.[0]?.c) > 0) return res.status(400).json({ error: 'CATEGORY_IN_USE' });

  await pool.query('DELETE FROM employee_categories WHERE id = ?', [id]);
  res.json({ ok: true });
});
