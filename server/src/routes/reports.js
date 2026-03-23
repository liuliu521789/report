import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { getReportCustomerPayload } from '../lib/reportCustomerPayload.js';
import { sanitizeReportPutBody } from '../lib/reportWriteSanitize.js';
import { logOperationFromReq } from '../lib/audit.js';
import { requireAuth, requireAnyPermission, requirePermission } from '../middleware/auth.js';

export const router = Router();

router.use(requireAuth);

const fieldSchema = z.object({
  fieldKey: z.string().min(1).max(64),
  fieldLabel: z.string().min(1).max(128),
  fieldLabelEn: z.string().min(1).max(128).optional(),
  fieldType: z.string().min(1).max(16),
  fieldValue: z.any().optional(),
  sortOrder: z.number().int().optional()
});

const upsertReportSchema = z.object({
  reportNo: z.string().min(1).max(64),
  batchNo: z.string().max(64).optional().nullable(),
  batchNoEn: z.string().max(128).optional().nullable(),
  productName: z.string().min(1).max(128),
  productNameEn: z.string().max(128).optional().nullable(),
  templateId: z.number().int().positive().optional().nullable(),
  conclusion: z.enum(['pass', 'fail', 'unknown']).optional(),
  fields: z.array(fieldSchema).optional()
});

// list + search
router.get('/', requirePermission('reports', 'list'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const batchNo = String(req.query.batchNo || '').trim();
  const status = String(req.query.status || '').trim(); // active|void
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const where = [];
  const params = [];
  if (q) {
    where.push('(report_no LIKE ? OR product_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (batchNo) {
    where.push('batch_no = ?');
    params.push(batchNo);
  }
  if (status === 'active' || status === 'void') {
    where.push('status = ?');
    params.push(status);
  }

  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, report_no AS reportNo, batch_no AS batchNo, product_name AS productName, conclusion, status, created_at AS createdAt, updated_at AS updatedAt
     FROM reports
     ${sqlWhere}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ items: rows });
});

/** 与公开页同结构的报告 JSON，供管理端 iframe 加载 /miniprogram/report.html?adminPreview=1 等（需登录） */
router.get(
  '/:id/customer-preview',
  requireAnyPermission('reports', ['view', 'edit', 'previewPrint']),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const payload = await getReportCustomerPayload(pool, id);
    if (!payload) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(payload);
  }
);

router.get(
  '/:id',
  requireAnyPermission('reports', ['view', 'edit', 'previewPrint']),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

    const pool = getPool();
    const [rRows] = await pool.query(
      `SELECT id, report_no AS reportNo, batch_no AS batchNo, batch_no_en AS batchNoEn, product_name AS productName, product_name_en AS productNameEn, conclusion, status, created_at AS createdAt, updated_at AS updatedAt
       FROM reports WHERE id = ? LIMIT 1`,
      [id]
    );
    const report = rRows?.[0];
    if (!report) return res.status(404).json({ error: 'NOT_FOUND' });

    const [fRows] = await pool.query(
      `SELECT field_key AS fieldKey, field_label AS fieldLabel, field_label_en AS fieldLabelEn, field_type AS fieldType, field_value_json AS fieldValue, sort_order AS sortOrder
       FROM report_fields WHERE report_id = ? ORDER BY sort_order ASC, id ASC`,
      [id]
    );

    res.json({ report: { ...report, fields: fRows } });
  }
);

// create
router.post('/', requirePermission('reports', 'create'), async (req, res) => {
  const parsed = upsertReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const {
    reportNo,
    batchNo,
    batchNoEn,
    productName,
    productNameEn,
    templateId = null,
    conclusion = 'unknown',
    fields = []
  } = parsed.data;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO reports (report_no, batch_no, batch_no_en, product_name, product_name_en, conclusion, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        reportNo,
        batchNo ?? null,
        batchNoEn ?? null,
        productName,
        productNameEn ?? null,
        conclusion,
        req.user.userId,
        req.user.userId
      ]
    );
    const reportId = result.insertId;

    // if templateId provided and fields empty, copy template defaults
    let finalFields = fields;
    if (templateId && (!fields || fields.length === 0)) {
      const [tplFields] = await conn.query(
        `SELECT field_key AS fieldKey, field_label AS fieldLabel, field_label_en AS fieldLabelEn, field_type AS fieldType,
                default_value_json AS fieldValue, sort_order AS sortOrder
         FROM report_template_fields WHERE template_id=? ORDER BY sort_order ASC, id ASC`,
        [templateId]
      );
      finalFields = tplFields || [];
    }

    for (const f of finalFields) {
      await conn.query(
        `INSERT INTO report_fields (report_id, field_key, field_label, field_label_en, field_type, field_value_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          reportId,
          f.fieldKey,
          f.fieldLabel,
          f.fieldLabelEn ?? null,
          f.fieldType,
          f.fieldValue === undefined ? null : JSON.stringify(f.fieldValue),
          f.sortOrder ?? 0
        ]
      );
    }

    await conn.commit();
    await logOperationFromReq(req, {
      module: '报告管理',
      action: '新增报告',
      detail: { reportId, reportNo },
      success: true
    });
    res.status(201).json({ id: reportId });
  } catch (e) {
    await conn.rollback();
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'REPORT_NO_EXISTS' });
    throw e;
  } finally {
    conn.release();
  }
});

// update (report fields replace)
router.put('/:id', requirePermission('reports', 'edit'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const parsed = upsertReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rRows] = await conn.query(
      `SELECT id, report_no AS reportNo, batch_no AS batchNo, batch_no_en AS batchNoEn,
              product_name AS productName, product_name_en AS productNameEn, conclusion, template_id AS templateId
       FROM reports WHERE id = ? LIMIT 1`,
      [id]
    );
    const existingReport = rRows?.[0];
    if (!existingReport) {
      await conn.rollback();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    const [existingFieldRows] = await conn.query(
      `SELECT field_key AS fieldKey, field_label AS fieldLabel, field_label_en AS fieldLabelEn,
              field_type AS fieldType, field_value_json AS fieldValue, sort_order AS sortOrder
       FROM report_fields WHERE report_id = ? ORDER BY sort_order ASC, id ASC`,
      [id]
    );
    const existingFields = (existingFieldRows || []).map((row) => ({
      ...row,
      fieldValue:
        row.fieldValue == null
          ? null
          : typeof row.fieldValue === 'string'
            ? JSON.parse(row.fieldValue)
            : row.fieldValue
    }));

    const sanitized = sanitizeReportPutBody(req.user, existingReport, existingFields, parsed.data);
    const {
      reportNo: sReportNo,
      batchNo: sBatchNo,
      batchNoEn: sBatchNoEn,
      productName: sProductName,
      productNameEn: sProductNameEn,
      templateId: sTemplateId,
      conclusion: sConclusion,
      fields: sFields
    } = sanitized;

    await conn.query(
      `UPDATE reports
       SET report_no=?, batch_no=?, batch_no_en=?, product_name=?, product_name_en=?, template_id=?, conclusion=?, updated_by=?
       WHERE id=?`,
      [sReportNo, sBatchNo ?? null, sBatchNoEn ?? null, sProductName, sProductNameEn ?? null, sTemplateId, sConclusion, req.user.userId, id]
    );

    await conn.query('DELETE FROM report_fields WHERE report_id = ?', [id]);
    for (const f of sFields) {
      await conn.query(
        `INSERT INTO report_fields (report_id, field_key, field_label, field_label_en, field_type, field_value_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          f.fieldKey,
          f.fieldLabel,
          f.fieldLabelEn ?? null,
          f.fieldType,
          f.fieldValue === undefined ? null : JSON.stringify(f.fieldValue),
          f.sortOrder ?? 0
        ]
      );
    }

    await conn.commit();
    await logOperationFromReq(req, {
      module: '报告管理',
      action: '保存报告',
      detail: { reportId: id },
      success: true
    });
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'REPORT_NO_EXISTS' });
    throw e;
  } finally {
    conn.release();
  }
});

// Save an existing report's field design as a template
router.post('/:id/save-as-template', requirePermission('templates', 'use'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const schema = z.object({
    name: z.string().min(1).max(128),
    description: z.string().max(255).optional().nullable(),
    includeValues: z.boolean().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { name, description, includeValues = false } = parsed.data;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rRows] = await conn.query('SELECT id FROM reports WHERE id=? LIMIT 1', [id]);
    if (!rRows?.[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    const [fields] = await conn.query(
      `SELECT field_key AS fieldKey, field_label AS fieldLabel, field_label_en AS fieldLabelEn, field_type AS fieldType,
              field_value_json AS fieldValue, sort_order AS sortOrder
       FROM report_fields WHERE report_id=? ORDER BY sort_order ASC, id ASC`,
      [id]
    );
    const [tRes] = await conn.query(
      'INSERT INTO report_templates (name, description, created_by) VALUES (?, ?, ?)',
      [name, description ?? null, req.user.userId]
    );
    const templateId = tRes.insertId;
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
          includeValues ? (f.fieldValue == null ? null : JSON.stringify(f.fieldValue)) : null,
          f.sortOrder ?? 0
        ]
      );
    }
    await conn.commit();
    res.status(201).json({ id: templateId });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

// void (no delete)
router.post('/:id/void', requirePermission('reports', 'void'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const [rRows] = await pool.query('SELECT id FROM reports WHERE id=? LIMIT 1', [id]);
  if (!rRows?.[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  await pool.query('UPDATE reports SET status=\'void\', updated_by=? WHERE id=?', [req.user.userId, id]);
  await logOperationFromReq(req, {
    module: '报告管理',
    action: '作废报告',
    detail: { reportId: id },
    success: true
  });
  res.json({ ok: true });
});

router.post('/:id/activate', requirePermission('reports', 'activate'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const [rRows] = await pool.query('SELECT id FROM reports WHERE id=? LIMIT 1', [id]);
  if (!rRows?.[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  await pool.query('UPDATE reports SET status=\'active\', updated_by=? WHERE id=?', [req.user.userId, id]);
  await logOperationFromReq(req, {
    module: '报告管理',
    action: '恢复报告有效',
    detail: { reportId: id },
    success: true
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Report seal apply (persisted snapshot)
// Only affects customer view via `report_seals`.
// ---------------------------------------------------------------------------
const SealType = {
  DEPARTMENT_QC: 'department_qc',
  INSPECTOR: 'inspector',
  SUPERVISOR: 'supervisor',
  PASS: 'pass',
  RECHECK: 'recheck'
};
const sealTypeValues = Object.values(SealType);

const applySealsSchema = z.object({
  sealTypes: z.array(z.enum(sealTypeValues)).min(1).max(5)
});
const sealTypeParamSchema = z.object({
  sealType: z.enum(sealTypeValues)
});

router.get('/:id/seals', requirePermission('reports', 'seals'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT seal_type AS sealType, seal_name AS sealName, seal_image_url AS sealImageUrl
     FROM report_seals WHERE report_id = ?`,
    [id]
  );

  const appliedSeals = {
    department_qc: null,
    inspector: null,
    supervisor: null,
    pass: null,
    recheck: null
  };
  for (const r of rows || []) {
    appliedSeals[r.sealType] = { name: r.sealName, imageUrl: r.sealImageUrl };
  }

  res.json({ appliedSeals });
});

router.post('/:id/seals', requirePermission('reports', 'seals'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const parsed = applySealsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });

  const { sealTypes } = parsed.data;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ensure report exists
    const [rRows] = await conn.query('SELECT id FROM reports WHERE id=? LIMIT 1', [id]);
    if (!rRows?.[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    for (const sealType of sealTypes) {
      const [sRows] = await conn.query(
        `SELECT name, image_url AS imageUrl
         FROM company_stamps
         WHERE seal_type=? AND is_active=1
         ORDER BY id DESC
         LIMIT 1`,
        [sealType]
      );
      const stamp = sRows?.[0];
      if (!stamp) {
        await conn.rollback();
        return res.status(400).json({ error: 'SEAL_NOT_ACTIVE', sealType });
      }

      await conn.query(
        `INSERT INTO report_seals (report_id, seal_type, seal_name, seal_image_url, created_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           seal_name = VALUES(seal_name),
           seal_image_url = VALUES(seal_image_url),
           created_by = VALUES(created_by),
           created_at = CURRENT_TIMESTAMP(3)`,
        [id, sealType, stamp.name, stamp.imageUrl, req.user.userId]
      );
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.delete('/:id/seals/:sealType', requirePermission('reports', 'seals'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const parsed = sealTypeParamSchema.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { sealType } = parsed.data;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rRows] = await conn.query('SELECT id FROM reports WHERE id=? LIMIT 1', [id]);
    if (!rRows?.[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    await conn.query('DELETE FROM report_seals WHERE report_id=? AND seal_type=?', [id, sealType]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

