import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { getReportCustomerPayload } from '../lib/reportCustomerPayload.js';
import { sanitizeReportPutBody } from '../lib/reportWriteSanitize.js';
import { logOperationFromReq } from '../lib/audit.js';
import { requireAuth, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { hasPermission } from '../lib/permissions.js';
import { isPermissionedStaffType } from '../lib/accountTypes.js';
import { normalizePublicAssetUrl } from '../lib/publicBaseUrl.js';

export const router = Router();

router.use(requireAuth);

/** MySQL ER_DUP_ENTRY：按索引区分 */
function duplicateKeyErrorCode(e) {
  const msg = String(e?.sqlMessage || e?.message || '');
  if (msg.includes('uk_report_fields_report_key')) return 'REPORT_FIELD_KEY_DUPLICATE';
  if (msg.includes('uk_reports_report_uid')) return 'REPORT_UID_EXISTS';
  return 'REPORT_NO_EXISTS';
}

const fieldSchema = z.object({
  fieldKey: z.string().min(1).max(64),
  fieldLabel: z.string().min(1).max(128),
  fieldLabelEn: z.string().min(1).max(128).optional(),
  fieldType: z.string().min(1).max(16),
  fieldValue: z.any().optional(),
  sortOrder: z.number().int().optional()
});

const upsertReportSchema = z.object({
  reportNo: z.string().max(64).optional(),
  batchNo: z.string().max(64).optional().nullable(),
  batchNoEn: z.string().max(128).optional().nullable(),
  productName: z.string().min(1).max(128),
  productNameEn: z.string().max(128).optional().nullable(),
  templateId: z.number().int().positive().optional().nullable(),
  conclusion: z.enum(['pass', 'fail', 'unknown']).optional(),
  fields: z.array(fieldSchema).optional()
});
const bulkIdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500)
});

const bulkGenerateTestSchema = z.object({
  count: z.number().int().min(1).max(500).optional(),
  templateId: z.number().int().positive().nullable().optional()
});

function pad4(n) {
  return String(n).padStart(4, '0');
}

/** 页眉「报告编号」固定文案；唯一性由 report_uid 承担 */
const FIXED_REPORT_NO = 'JL-8.8-05';

function formatReportUid(reportId) {
  return `ZJ-${String(reportId).padStart(10, '0')}`;
}

async function finalizeReportUid(conn, reportId) {
  const uid = formatReportUid(reportId);
  await conn.query('UPDATE reports SET report_uid = ? WHERE id = ?', [uid, reportId]);
  return uid;
}

function yyyymmdd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function normalizeTemplateDefaultValue(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

function defaultPaperFields() {
  const textField = (fieldKey, fieldLabel, fieldLabelEn, zh, en, sortOrder) => ({
    fieldKey,
    fieldLabel,
    fieldLabelEn,
    fieldType: 'text',
    fieldValue: { zh: zh || '', en: en || '' },
    sortOrder
  });

  const defaultColumnLabels = [
    { key: 'item', zh: '检验项目', en: 'Test item' },
    { key: 'unit', zh: '单位', en: 'Unit' },
    { key: 'standard', zh: '标准值', en: 'Normal value' },
    { key: 'result', zh: '检测值', en: 'Test value' }
  ];

  const rows = [
    {
      item: { zh: '外观', en: 'Appearance' },
      unit: { zh: '-', en: '-' },
      standard: { zh: '透明', en: 'Transparent' },
      result: { zh: '透明', en: 'Transparent' }
    },
    {
      item: { zh: '色度', en: 'Color(Fe-Co)' },
      unit: { zh: '#', en: '#' },
      standard: { zh: '≤3', en: '≤3' },
      result: { zh: '2', en: '2' }
    },
    {
      item: { zh: '固体份', en: 'Solidity' },
      unit: { zh: '%', en: '%' },
      standard: { zh: '68-72', en: '68-72' },
      result: { zh: '70', en: '70' }
    },
    {
      item: { zh: '粘度', en: 'Viscosity' },
      unit: { zh: 's', en: 's' },
      standard: { zh: '450-650', en: '450-650' },
      result: { zh: '520', en: '520' }
    },
    {
      item: { zh: '酸值', en: 'Acid value' },
      unit: { zh: 'mgKOH/g', en: 'mgKOH/g' },
      standard: { zh: '≤10', en: '≤10' },
      result: { zh: '7', en: '7' }
    }
  ];

  return [
    textField('product_name', '产品名称', 'Product Name', '', '', 10),
    textField('packing', '包装规格', 'Packing', '25kg/袋', '25kg/bag', 20),
    textField('batch_weight', '本批数量', 'Batch Weight', '10吨', '10 tons', 30),
    textField('batch_no', '生产批号', 'Batch No.', '', '', 40),
    textField('analysis_date', '检验日期', 'Analysis Date', '', '', 50),
    textField('ex_mill_date', '出厂日期', 'EX-mill Date', '', '', 60),
    {
      fieldKey: 'inspection_table',
      fieldLabel: '检测项目表',
      fieldLabelEn: 'Inspection items',
      fieldType: 'table',
      fieldValue: { columnLabels: defaultColumnLabels, rows },
      sortOrder: 70
    },
    textField('test_conclusion', '检验结论', 'Test conclusion', '合格', 'Pass', 80),
    textField('remarks', '备注', 'Remarks', '用于测试数据生成', 'For test generation', 90)
  ];
}

function filledValueForField(field, { reportUid, batchNo, productName, index, dateStr }) {
  if (field.fieldType === 'table') {
    const defaultTable = defaultPaperFields().find((f) => f.fieldType === 'table');
    const base = normalizeTemplateDefaultValue(field.fieldValue) || defaultTable.fieldValue;
    const columnLabels = Array.isArray(base?.columnLabels) ? base.columnLabels : defaultTable.fieldValue.columnLabels;
    const rowsIn = Array.isArray(base?.rows) ? base.rows : defaultTable.fieldValue.rows;
    const rows = rowsIn.map((r, ri) => {
      const std = r?.standard?.zh ?? r?.standard ?? '';
      const stdStr = std == null ? '' : String(std);
      const num = 50 + ((index + 1) * 7 + ri * 3) % 50;
      const result = stdStr.includes('≤') ? String(Math.max(1, (num % 9) + 1)) : String(num);
      const toBi = (val) =>
        val && typeof val === 'object'
          ? { zh: String(val.zh ?? val.cn ?? val.valueZh ?? ''), en: String(val.en ?? val.valueEn ?? '') }
          : { zh: val == null ? '' : String(val), en: '' };
      return {
        item: toBi(r?.item ?? ''),
        unit: toBi(r?.unit ?? ''),
        standard: toBi(r?.standard ?? ''),
        result: { zh: result, en: result },
        basis: toBi(r?.basis ?? r?.reference ?? '')
      };
    });
    return { columnLabels, rows };
  }

  const v = normalizeTemplateDefaultValue(field.fieldValue);
  if (v && typeof v === 'object' && ('zh' in v || 'en' in v || 'cn' in v)) {
    return { zh: v.zh ?? v.cn ?? v.valueZh ?? '', en: v.en ?? v.valueEn ?? '' };
  }

  // sensible defaults for common keys used by the report editor
  switch (field.fieldKey) {
    case 'product_name':
      return { zh: productName, en: `Test Product ${index + 1}` };
    case 'batch_no':
      return { zh: batchNo, en: batchNo };
    case 'analysis_date':
    case 'ex_mill_date':
      return { zh: dateStr, en: dateStr };
    case 'test_conclusion':
      return { zh: '合格', en: 'Pass' };
    case 'remarks':
      return { zh: `自动生成测试报告：${reportUid}`, en: `Auto generated test report: ${reportUid}` };
    default:
      return { zh: `${field.fieldLabel || field.fieldKey}（测试${index + 1}）`, en: `${field.fieldLabelEn || field.fieldKey} (Test ${index + 1})` };
  }
}

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
    where.push('(report_no LIKE ? OR product_name LIKE ? OR report_uid LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
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
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM reports
     ${sqlWhere}`,
    params
  );
  const [rows] = await pool.query(
    `SELECT id, report_uid AS reportUid, report_no AS reportNo, batch_no AS batchNo, product_name AS productName, conclusion, status, created_at AS createdAt, updated_at AS updatedAt
     FROM reports
     ${sqlWhere}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ items: rows, total: Number(countRows?.[0]?.total || 0), limit, offset });
});

router.get('/suggest-report-no', requirePermission('reports', 'create'), async (req, res) => {
  res.json({ reportNo: FIXED_REPORT_NO });
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
      `SELECT id, report_uid AS reportUid, report_no AS reportNo, batch_no AS batchNo, batch_no_en AS batchNoEn, product_name AS productName, product_name_en AS productNameEn, conclusion, status, created_at AS createdAt, updated_at AS updatedAt
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

    if (
      isPermissionedStaffType(req.user.accountType) &&
      hasPermission(req.user.permissions, 'reports', 'view') &&
      !hasPermission(req.user.permissions, 'reports', 'edit')
    ) {
      await logOperationFromReq(req, {
        module: '报告管理',
        action: '查看报告详情',
        detail: { reportId: id },
        success: true
      });
    }

    res.json({ report: { ...report, fields: fRows } });
  }
);

// create
router.post('/', requirePermission('reports', 'create'), async (req, res) => {
  const parsed = upsertReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const {
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
        FIXED_REPORT_NO,
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
    const reportUid = await finalizeReportUid(conn, reportId);

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
      detail: { reportId, reportUid, reportNo: FIXED_REPORT_NO },
      success: true
    });
    res.status(201).json({ id: reportId, reportUid });
  } catch (e) {
    await conn.rollback();
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: duplicateKeyErrorCode(e) });
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
      `SELECT id, report_no AS reportNo, report_uid AS reportUid, batch_no AS batchNo, batch_no_en AS batchNoEn,
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
      [FIXED_REPORT_NO, sBatchNo ?? null, sBatchNoEn ?? null, sProductName, sProductNameEn ?? null, sTemplateId, sConclusion, req.user.userId, id]
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
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: duplicateKeyErrorCode(e) });
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
router.post('/:id(\\d+)/void', requirePermission('reports', 'void'), async (req, res) => {
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

router.post('/:id(\\d+)/activate', requirePermission('reports', 'activate'), async (req, res) => {
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

router.post(
  '/bulk/conclusion-pass',
  requireAnyPermission('reports', ['bulkPass', 'edit', 'chairmanApprove']),
  async (req, res) => {
    const parsed = bulkIdsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const { ids } = parsed.data;
    const pool = getPool();
    const [result] = await pool.query(
      `UPDATE reports SET conclusion='pass', updated_by=? WHERE id IN (${ids.map(() => '?').join(',')})`,
      [req.user.userId, ...ids]
    );
    const onlyChairman =
      isPermissionedStaffType(req.user.accountType) &&
      hasPermission(req.user.permissions, 'reports', 'chairmanApprove') &&
      !hasPermission(req.user.permissions, 'reports', 'bulkPass') &&
      !hasPermission(req.user.permissions, 'reports', 'edit');
    await logOperationFromReq(req, {
      module: '报告管理',
      action: onlyChairman ? '最高级审批：批量判定合格（备案）' : '批量判定合格',
      detail: { count: ids.length },
      success: true
    });
    res.json({ ok: true, affectedCount: Number(result?.affectedRows || 0) });
  }
);

router.post('/export/json', requirePermission('reports', 'export'), async (req, res) => {
  const parsed = bulkIdsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { ids } = parsed.data;
  const pool = getPool();
  const [rRows] = await pool.query(
    `SELECT id, report_uid AS reportUid, report_no AS reportNo, batch_no AS batchNo, batch_no_en AS batchNoEn, product_name AS productName, product_name_en AS productNameEn, conclusion, status, created_at AS createdAt, updated_at AS updatedAt
     FROM reports WHERE id IN (${ids.map(() => '?').join(',')})
     ORDER BY id DESC`,
    ids
  );
  const [fRows] = await pool.query(
    `SELECT report_id AS reportId, field_key AS fieldKey, field_label AS fieldLabel, field_label_en AS fieldLabelEn, field_type AS fieldType, field_value_json AS fieldValue, sort_order AS sortOrder
     FROM report_fields WHERE report_id IN (${ids.map(() => '?').join(',')})
     ORDER BY report_id ASC, sort_order ASC, id ASC`,
    ids
  );
  const fieldMap = new Map();
  for (const f of fRows || []) {
    const rid = Number(f.reportId);
    if (!fieldMap.has(rid)) fieldMap.set(rid, []);
    fieldMap.get(rid).push(f);
  }
  const items = (rRows || []).map((r) => ({
    report: { ...r, fields: fieldMap.get(Number(r.id)) || [] }
  }));
  await logOperationFromReq(req, {
    module: '报告管理',
    action: '导出报告数据（备案）',
    detail: { count: ids.length },
    success: true
  });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="reports-export.json"');
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), items }, null, 2));
});

router.post('/bulk/void', requireAnyPermission('reports', ['bulkVoid', 'void']), async (req, res) => {
  const parsed = bulkIdsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { ids } = parsed.data;
  const pool = getPool();
  const [result] = await pool.query(
    `UPDATE reports SET status='void', updated_by=? WHERE id IN (${ids.map(() => '?').join(',')})`,
    [req.user.userId, ...ids]
  );
  await logOperationFromReq(req, {
    module: '报告管理',
    action: '批量作废报告',
    detail: { count: ids.length },
    success: true
  });
  res.json({ ok: true, affectedCount: Number(result?.affectedRows || 0) });
});

router.post('/bulk/activate', requireAnyPermission('reports', ['bulkActivate', 'activate']), async (req, res) => {
  const parsed = bulkIdsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { ids } = parsed.data;
  const pool = getPool();
  const [result] = await pool.query(
    `UPDATE reports SET status='active', updated_by=? WHERE id IN (${ids.map(() => '?').join(',')})`,
    [req.user.userId, ...ids]
  );
  await logOperationFromReq(req, {
    module: '报告管理',
    action: '批量恢复报告有效',
    detail: { count: ids.length },
    success: true
  });
  res.json({ ok: true, affectedCount: Number(result?.affectedRows || 0) });
});

router.delete('/bulk', requireAnyPermission('reports', ['bulkDelete', 'void']), async (req, res) => {
  const parsed = bulkIdsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { ids } = parsed.data;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM qrcode_reports WHERE report_id IN (${ids.map(() => '?').join(',')})`, ids);
    const [result] = await conn.query(`DELETE FROM reports WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    await conn.commit();
    await logOperationFromReq(req, {
      module: '报告管理',
      action: '批量删除报告',
      detail: { count: ids.length },
      success: true
    });
    res.json({ ok: true, deletedCount: Number(result?.affectedRows || 0) });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.post('/bulk/generate-test', requirePermission('reports', 'create'), async (req, res) => {
  const parsed = bulkGenerateTestSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const count = parsed.data.count ?? 100;
  const templateIdIn = parsed.data.templateId ?? null;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let templateId = templateIdIn;
    if (!templateId) {
      const [tplPick] = await conn.query(
        `SELECT t.id
         FROM report_templates t
         LEFT JOIN report_template_fields f ON f.template_id = t.id
         GROUP BY t.id
         ORDER BY COUNT(f.id) DESC, t.id DESC
         LIMIT 1`
      );
      templateId = tplPick?.[0]?.id ?? null;
    }

    let tplFields = null;
    if (templateId) {
      const [rows] = await conn.query(
        `SELECT field_key AS fieldKey, field_label AS fieldLabel, field_label_en AS fieldLabelEn, field_type AS fieldType,
                default_value_json AS fieldValue, sort_order AS sortOrder
         FROM report_template_fields
         WHERE template_id=?
         ORDER BY sort_order ASC, id ASC`,
        [templateId]
      );
      tplFields = rows || [];
    }

    const baseFields = tplFields && tplFields.length ? tplFields : defaultPaperFields();

    const today = new Date();
    const dayStr = yyyymmdd(today);
    const [cntRows] = await conn.query('SELECT COUNT(*) AS c FROM reports');
    const reportCount = Number(cntRows?.[0]?.c || 0);

    const createdIds = [];
    for (let i = 0; i < count; i += 1) {
      const seq = reportCount + i + 1;
      const productName = `测试产品${seq}`;
      const batchNo = `B${dayStr}-${pad4(seq)}`;
      const conclusion = 'pass';

      const [rRes] = await conn.query(
        `INSERT INTO reports (report_no, batch_no, batch_no_en, product_name, product_name_en, template_id, conclusion, status, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [
          FIXED_REPORT_NO,
          batchNo,
          batchNo,
          productName,
          `Test Product ${seq}`,
          templateId,
          conclusion,
          req.user.userId,
          req.user.userId
        ]
      );
      const reportId = rRes.insertId;
      const reportUid = await finalizeReportUid(conn, reportId);
      createdIds.push(reportId);

      for (const f of baseFields) {
        const value = filledValueForField(
          {
            fieldKey: f.fieldKey,
            fieldLabel: f.fieldLabel,
            fieldLabelEn: f.fieldLabelEn,
            fieldType: f.fieldType,
            fieldValue: f.fieldValue
          },
          { reportUid, batchNo, productName, index: i, dateStr: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` }
        );

        await conn.query(
          `INSERT INTO report_fields (report_id, field_key, field_label, field_label_en, field_type, field_value_json, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            reportId,
            f.fieldKey,
            f.fieldLabel,
            f.fieldLabelEn ?? null,
            f.fieldType,
            JSON.stringify(value),
            f.sortOrder ?? 0
          ]
        );
      }
    }

    await conn.commit();
    await logOperationFromReq(req, {
      module: '报告管理',
      action: '批量生成测试报告',
      detail: { count, templateId: templateId || null },
      success: true
    });

    res.status(201).json({
      ok: true,
      createdCount: createdIds.length,
      firstId: createdIds[0] ?? null,
      lastId: createdIds[createdIds.length - 1] ?? null
    });
  } catch (e) {
    await conn.rollback();
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: duplicateKeyErrorCode(e) });
    throw e;
  } finally {
    conn.release();
  }
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
    appliedSeals[r.sealType] = { name: r.sealName, imageUrl: normalizePublicAssetUrl(r.sealImageUrl) };
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
      // 检查是否有svg_image_url字段
      let hasSvgFields = false;
      try {
        const [columns] = await conn.query(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_stamps' AND COLUMN_NAME = 'svg_image_url'"
        );
        hasSvgFields = columns.length > 0;
      } catch (e) {
        // ignore
      }
      
      const selectFields = hasSvgFields
        ? `name, image_url AS imageUrl, svg_image_url AS svgImageUrl, active_image_type AS activeImageType`
        : `name, image_url AS imageUrl, NULL AS svgImageUrl, 'original' AS activeImageType`;
      
      const [sRows] = await conn.query(
        `SELECT ${selectFields}
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

      // 根据activeImageType决定使用哪个图片
      const sealImageUrl = (stamp.activeImageType === 'svg' && stamp.svgImageUrl) 
        ? stamp.svgImageUrl 
        : stamp.imageUrl;

      await conn.query(
        `INSERT INTO report_seals (report_id, seal_type, seal_name, seal_image_url, created_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           seal_name = VALUES(seal_name),
           seal_image_url = VALUES(seal_image_url),
           created_by = VALUES(created_by),
           created_at = CURRENT_TIMESTAMP(3)`,
        [id, sealType, stamp.name, sealImageUrl, req.user.userId]
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

