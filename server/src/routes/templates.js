import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { requireAnyPermissionPairs, requireAuth, requirePermission } from '../middleware/auth.js';

export const router = Router();

/** 列表/详情供报告页「套用模板」；增删改仍要 templates.use */
const canReadTemplatesForReports = requireAnyPermissionPairs([
  ['templates', 'use'],
  ['reports', 'view'],
  ['reports', 'edit'],
  ['reports', 'create']
]);

router.use(requireAuth);

const fieldSchema = z.object({
  fieldKey: z.string().min(1).max(64),
  fieldLabel: z.string().min(1).max(128),
  fieldLabelEn: z.string().min(1).max(128).optional(),
  fieldType: z.string().min(1).max(16),
  defaultValue: z.any().optional(),
  sortOrder: z.number().int().optional()
});

const upsertTemplateSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(255).optional().nullable(),
  fields: z.array(fieldSchema).min(1).max(500)
});

router.get('/', canReadTemplatesForReports, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit || 100), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const where = [];
  const params = [];
  if (q) {
    where.push('(name LIKE ? OR description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt
     FROM report_templates
     ${sqlWhere}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ items: rows });
});

router.get('/:id', canReadTemplatesForReports, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  const [tRows] = await pool.query(
    'SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt FROM report_templates WHERE id=? LIMIT 1',
    [id]
  );
  const tpl = tRows?.[0];
  if (!tpl) return res.status(404).json({ error: 'NOT_FOUND' });

  const [fRows] = await pool.query(
    `SELECT field_key AS fieldKey, field_label AS fieldLabel, field_label_en AS fieldLabelEn, field_type AS fieldType,
            default_value_json AS defaultValue, sort_order AS sortOrder
     FROM report_template_fields WHERE template_id=? ORDER BY sort_order ASC, id ASC`,
    [id]
  );
  res.json({ template: { ...tpl, fields: fRows } });
});

router.post('/', requirePermission('templates', 'use'), async (req, res) => {
  const parsed = upsertTemplateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { name, description, fields } = parsed.data;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO report_templates (name, description, created_by) VALUES (?, ?, ?)',
      [name, description ?? null, req.user.userId]
    );
    const templateId = result.insertId;
    for (const f of fields) {
      await conn.query(
        `INSERT INTO report_template_fields (template_id, field_key, field_label, field_label_en, field_type, default_value_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          templateId,
          f.fieldKey,
          f.fieldLabel,
          f.fieldLabelEn ?? null,
          f.fieldType,
          f.defaultValue === undefined ? null : JSON.stringify(f.defaultValue),
          f.sortOrder ?? 0
        ]
      );
    }
    await conn.commit();
    res.status(201).json({ id: templateId });
  } catch (e) {
    await conn.rollback();
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE_FIELD_KEY' });
    throw e;
  } finally {
    conn.release();
  }
});

router.put('/:id', requirePermission('templates', 'use'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const parsed = upsertTemplateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { name, description, fields } = parsed.data;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [tRows] = await conn.query('SELECT id FROM report_templates WHERE id=? LIMIT 1', [id]);
    if (!tRows?.[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    await conn.query('UPDATE report_templates SET name=?, description=? WHERE id=?', [name, description ?? null, id]);
    await conn.query('DELETE FROM report_template_fields WHERE template_id=?', [id]);
    for (const f of fields) {
      await conn.query(
        `INSERT INTO report_template_fields (template_id, field_key, field_label, field_label_en, field_type, default_value_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          f.fieldKey,
          f.fieldLabel,
          f.fieldLabelEn ?? null,
          f.fieldType,
          f.defaultValue === undefined ? null : JSON.stringify(f.defaultValue),
          f.sortOrder ?? 0
        ]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE_FIELD_KEY' });
    throw e;
  } finally {
    conn.release();
  }
});

router.delete('/:id', requirePermission('templates', 'use'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  await pool.query('DELETE FROM report_templates WHERE id=?', [id]);
  res.json({ ok: true });
});

