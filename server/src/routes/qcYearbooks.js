import { Router } from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';

import { getPool } from '../db/pool.js';
import { logOperationFromReq } from '../lib/audit.js';
import { isYearbookXlsxBasename, resolveQcYearbookPublicDir } from '../lib/qcYearbookPublic.js';
import { importYearbookXlsxIntoDb } from '../lib/qcYearbookXlsxImport.js';
import { requireAuth, requireAnyPermission, requirePermission } from '../middleware/auth.js';

export const router = Router();

router.use(requireAuth);

const canRead = requireAnyPermission('qc_yearbooks', ['view', 'upload']);
const canMutate = requirePermission('qc_yearbooks', 'upload');

const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 }
});

const postYearSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  remark: z.string().max(255).optional().nullable()
});

async function loadYearById(pool, yearId) {
  const [rows] = await pool.query(
    'SELECT id, year, remark, created_at FROM qc_yearbook_years WHERE id = ? LIMIT 1',
    [yearId]
  );
  return rows?.[0] || null;
}

function mapYearRow(r) {
  return {
    id: Number(r.id),
    year: Number(r.year),
    remark: r.remark ?? null,
    created_at: r.created_at,
    fp_row_count: Number(r.fp_row_count ?? 0)
  };
}

function mapFpRow(r) {
  const num = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: Number(r.id),
    year_id: Number(r.year_id),
    sort_order: Number(r.sort_order ?? 0),
    inspection_num: r.inspection_num != null ? Number(r.inspection_num) : null,
    inspection_id: r.inspection_id != null ? String(r.inspection_id) : null,
    product_model: r.product_model ?? '',
    product_batch_no: r.product_batch_no ?? '',
    barrel_count: num(r.barrel_count),
    initial_batch_kg: num(r.initial_batch_kg),
    inspection_batch_kg: num(r.inspection_batch_kg),
    appearance: r.appearance ?? null,
    color_fe_co: r.color_fe_co ?? null,
    solid_content_pct: num(r.solid_content_pct),
    viscosity_s_25c: num(r.viscosity_s_25c),
    acid_value_mgkoh_g: num(r.acid_value_mgkoh_g),
    tolerance_g_ml: num(r.tolerance_g_ml),
    nco_content_pct: num(r.nco_content_pct),
    inspection_conclusion: r.inspection_conclusion ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}

function parseFpListQuery(q) {
  const page = Math.min(500, Math.max(1, Number(q.page) || 1));
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 50));
  const keyword = String(q.keyword || '').trim().slice(0, 200);
  return { page, pageSize, keyword };
}

function fpDec(body, key) {
  const v = body?.[key];
  if (v === '' || v === undefined || v === null) return null;
  const n = Number(String(v).replace(/,/g, '').replace(/，/g, ''));
  return Number.isFinite(n) ? n : null;
}

function fpStr(body, key, max) {
  const s = String(body?.[key] ?? '').trim();
  if (!s) return null;
  return s.slice(0, max);
}

/** 解析成品行写入（前端 camelCase） */
function parseFpWriteBody(body) {
  if (!body || typeof body !== 'object') return { error: '参数不能为空' };
  const product_model = String(body.productModel ?? '').trim().slice(0, 128);
  const product_batch_no = String(body.productBatchNo ?? '').trim().slice(0, 64);
  if (!product_model) return { error: '产品型号不能为空' };
  if (!product_batch_no) return { error: '产品批号不能为空' };
  return {
    data: {
      product_model,
      product_batch_no,
      barrel_count: fpDec(body, 'barrelCount'),
      initial_batch_kg: fpDec(body, 'initialBatchKg'),
      inspection_batch_kg: fpDec(body, 'inspectionBatchKg'),
      appearance: fpStr(body, 'appearance', 64),
      color_fe_co: fpStr(body, 'colorFeCo', 32),
      solid_content_pct: fpDec(body, 'solidContentPct'),
      viscosity_s_25c: fpDec(body, 'viscosityS25c'),
      acid_value_mgkoh_g: fpDec(body, 'acidValueMgkohG'),
      tolerance_g_ml: fpDec(body, 'toleranceGml'),
      nco_content_pct: fpDec(body, 'ncoContentPct'),
      inspection_conclusion: fpStr(body, 'inspectionConclusion', 64)
    }
  };
}

async function loadFpRowById(pool, rowId) {
  const [rows] = await pool.query(
    `SELECT id, year_id, sort_order, inspection_num, inspection_id, product_model, product_batch_no,
            barrel_count, initial_batch_kg, inspection_batch_kg,
            appearance, color_fe_co, solid_content_pct, viscosity_s_25c,
            acid_value_mgkoh_g, tolerance_g_ml, nco_content_pct, inspection_conclusion
     FROM qc_yearbook_finished_product_rows WHERE id = ? LIMIT 1`,
    [rowId]
  );
  return rows?.[0] || null;
}

async function nextFpSortOrder(pool, yearId) {
  const [[r]] = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM qc_yearbook_finished_product_rows WHERE year_id = ?',
    [yearId]
  );
  return Number(r?.n ?? 0);
}

async function nextFpInspectionNum(pool, yearId) {
  const [[r]] = await pool.query(
    'SELECT COALESCE(MAX(inspection_num), 0) + 1 AS n FROM qc_yearbook_finished_product_rows WHERE year_id = ?',
    [yearId]
  );
  return Number(r?.n ?? 1);
}

function formatFpInspectionId(calendarYear, inspectionNum) {
  const y = Number(calendarYear);
  const n = Number(inspectionNum);
  if (!Number.isFinite(y) || !Number.isFinite(n) || n < 1) return '';
  return `${y}-${String(n).padStart(5, '0')}`;
}

function yearFromYearbookFilename(name) {
  const m = /^物源(\d{4})年度品质管控数据表\s*\.xlsx$/i.exec(path.basename(String(name || '')));
  return m ? Number(m[1]) : null;
}

/** multipart 的 year 常为字符串，避免 Number(undefined) 等得到静默 NaN */
function parseBodyYear(raw) {
  const n = parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(n) ? n : NaN;
}

/** 成品检验台账：列表 */
async function handleGetFinishedProductRows(req, res, next) {
  try {
    const yearId = Number(req.params.yearId);
    if (!Number.isFinite(yearId) || yearId < 1) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: '无效的年份 id' });
    }
    const pool = getPool();
    const y = await loadYearById(pool, yearId);
    if (!y) return res.status(404).json({ error: 'YEAR_NOT_FOUND', message: '年份不存在' });

    const { page, pageSize, keyword } = parseFpListQuery(req.query);
    const offset = (page - 1) * pageSize;
    const params = [yearId];
    let where = 'fp.year_id = ?';
    if (keyword) {
      const safeKw = keyword.replace(/[%_\\]/g, ' ').trim();
      if (safeKw) {
        const like = `%${safeKw}%`;
        where += ` AND (
          fp.product_model LIKE ? OR fp.product_batch_no LIKE ? OR fp.appearance LIKE ?
          OR fp.color_fe_co LIKE ? OR fp.inspection_conclusion LIKE ? OR fp.inspection_id LIKE ?
        )`;
        params.push(like, like, like, like, like, like);
      }
    }

    const countSql = `SELECT COUNT(*) AS total FROM qc_yearbook_finished_product_rows fp WHERE ${where}`;
    const [[countRow]] = await pool.query(countSql, params);
    const total = Number(countRow?.total || 0);

    const listSql = `
      SELECT fp.id, fp.year_id, fp.sort_order, fp.inspection_num, fp.inspection_id, fp.product_model, fp.product_batch_no,
             fp.barrel_count, fp.initial_batch_kg, fp.inspection_batch_kg,
             fp.appearance, fp.color_fe_co, fp.solid_content_pct, fp.viscosity_s_25c,
             fp.acid_value_mgkoh_g, fp.tolerance_g_ml, fp.nco_content_pct, fp.inspection_conclusion,
             fp.created_at, fp.updated_at
      FROM qc_yearbook_finished_product_rows fp
      WHERE ${where}
      ORDER BY fp.id DESC
      LIMIT ? OFFSET ?`;
    const [items] = await pool.query(listSql, [...params, pageSize, offset]);

    res.json({
      year: { id: Number(y.id), year: Number(y.year), remark: y.remark ?? null },
      items: (items || []).map(mapFpRow),
      total,
      page,
      pageSize
    });
  } catch (e) {
    next(e);
  }
}

/** 成品检验台账：新增 */
async function handlePostFinishedProductRow(req, res, next) {
  try {
    const yearId = Number(req.params.yearId);
    if (!Number.isFinite(yearId) || yearId < 1) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: '无效的年份 id' });
    }
    const parsed = parseFpWriteBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: 'VALIDATION_FAILED', message: parsed.error });
    }
    const pool = getPool();
    const y = await loadYearById(pool, yearId);
    if (!y) return res.status(404).json({ error: 'YEAR_NOT_FOUND', message: '年份不存在' });

    const d = parsed.data;
    const sortOrder = await nextFpSortOrder(pool, yearId);
    const inspectionNum = await nextFpInspectionNum(pool, yearId);
    const calendarYear = Number(y.year);
    const inspectionId = formatFpInspectionId(calendarYear, inspectionNum);
    if (!inspectionId) {
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: '无法生成检验ID' });
    }
    const uid = Number(req.user?.userId) || null;

    const [ins] = await pool.query(
      `INSERT INTO qc_yearbook_finished_product_rows (
        year_id, sort_order, inspection_num, inspection_id, product_model, product_batch_no, barrel_count, initial_batch_kg, inspection_batch_kg,
        appearance, color_fe_co, solid_content_pct, viscosity_s_25c, acid_value_mgkoh_g, tolerance_g_ml, nco_content_pct,
        inspection_conclusion, created_by, updated_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        yearId,
        sortOrder,
        inspectionNum,
        inspectionId,
        d.product_model,
        d.product_batch_no,
        d.barrel_count,
        d.initial_batch_kg,
        d.inspection_batch_kg,
        d.appearance,
        d.color_fe_co,
        d.solid_content_pct,
        d.viscosity_s_25c,
        d.acid_value_mgkoh_g,
        d.tolerance_g_ml,
        d.nco_content_pct,
        d.inspection_conclusion,
        uid,
        uid
      ]
    );
    const id = Number(ins.insertId);
    await logOperationFromReq(req, {
      module: 'qc_yearbooks',
      action: 'fp_row_create',
      detail: JSON.stringify({ id, yearId, product_model: d.product_model.slice(0, 40) }),
      success: true
    });
    res.json({ id, inspection_id: inspectionId });
  } catch (e) {
    next(e);
  }
}

/** 成品检验台账：更新 */
async function handlePutFinishedProductRow(req, res, next) {
  try {
    const rowId = Number(req.params.rowId);
    if (!Number.isFinite(rowId) || rowId < 1) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: '无效的行 id' });
    }
    const parsed = parseFpWriteBody(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: 'VALIDATION_FAILED', message: parsed.error });
    }
    const pool = getPool();
    const row = await loadFpRowById(pool, rowId);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: '成品行不存在' });

    const d = parsed.data;
    const sortOrder = Number(row.sort_order ?? 0);
    const uid = Number(req.user?.userId) || null;

    await pool.query(
      `UPDATE qc_yearbook_finished_product_rows SET
        sort_order = ?, product_model = ?, product_batch_no = ?, barrel_count = ?, initial_batch_kg = ?, inspection_batch_kg = ?,
        appearance = ?, color_fe_co = ?, solid_content_pct = ?, viscosity_s_25c = ?, acid_value_mgkoh_g = ?,
        tolerance_g_ml = ?, nco_content_pct = ?, inspection_conclusion = ?, updated_by = ?
       WHERE id = ?`,
      [
        sortOrder,
        d.product_model,
        d.product_batch_no,
        d.barrel_count,
        d.initial_batch_kg,
        d.inspection_batch_kg,
        d.appearance,
        d.color_fe_co,
        d.solid_content_pct,
        d.viscosity_s_25c,
        d.acid_value_mgkoh_g,
        d.tolerance_g_ml,
        d.nco_content_pct,
        d.inspection_conclusion,
        uid,
        rowId
      ]
    );
    await logOperationFromReq(req, {
      module: 'qc_yearbooks',
      action: 'fp_row_update',
      detail: JSON.stringify({ rowId, year_id: row.year_id }),
      success: true
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

/** 成品检验台账：删除 */
async function handleDeleteFinishedProductRow(req, res, next) {
  try {
    const rowId = Number(req.params.rowId);
    if (!Number.isFinite(rowId) || rowId < 1) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: '无效的行 id' });
    }
    const pool = getPool();
    const row = await loadFpRowById(pool, rowId);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: '成品行不存在' });
    await pool.query('DELETE FROM qc_yearbook_finished_product_rows WHERE id = ?', [rowId]);
    await logOperationFromReq(req, {
      module: 'qc_yearbooks',
      action: 'fp_row_delete',
      detail: JSON.stringify({ rowId, year_id: row.year_id }),
      success: true
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

/** public 目录下可导入的物源年度品质管控 xlsx 列表 */
router.get('/public-excel-files', canRead, async (_req, res, next) => {
  try {
    const dir = resolveQcYearbookPublicDir();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (e && e.code === 'ENOENT') return res.json({ files: [] });
      throw e;
    }
    const files = [];
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!isYearbookXlsxBasename(ent.name)) continue;
      files.push({ name: ent.name });
    }
    files.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    res.json({ files });
  } catch (e) {
    next(e);
  }
});

/** 将物源YYYY年度品质管控数据表.xlsx 中「成品」表导入为当年成品结构化行 */
router.post(
  '/import-xlsx',
  canMutate,
  (req, res, next) => {
    uploadImport.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'FILE_TOO_LARGE', message: 'Excel 文件过大（单文件最大 50MB）' });
      }
      next(err);
    });
  },
  async (req, res, next) => {
    try {
      const year = parseBodyYear(req.body?.year);
      const replaceExisting =
        String(req.body?.replaceExisting || '') === '1' ||
        req.body?.replaceExisting === true ||
        String(req.body?.replaceExisting || '').toLowerCase() === 'true';
      const hasFile = !!(req.file && req.file.buffer);
      const publicFilename = String(req.body?.publicFilename || '').trim();

      if (!hasFile && !publicFilename) {
        return res.status(400).json({
          error: 'NO_FILE',
          message: '请上传 Excel（字段 file），或填写 publicFilename 从服务器 public 目录读取'
        });
      }
      if (hasFile && publicFilename) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: '请勿同时上传文件并填写 publicFilename' });
      }
      if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: 'VALIDATION_FAILED', message: '目标年份无效（2000–2100）' });
      }

      let buffer;
      let logicalName = '';
      if (hasFile) {
        buffer = req.file.buffer;
        logicalName = req.file.originalname || '';
      } else {
        if (!isYearbookXlsxBasename(publicFilename)) {
          return res.status(400).json({
            error: 'INVALID_FILE_NAME',
            message: '文件名须为「物源YYYY年度品质管控数据表.xlsx」形式'
          });
        }
        const abs = path.join(resolveQcYearbookPublicDir(), path.basename(publicFilename));
        try {
          buffer = await fs.readFile(abs);
        } catch (e) {
          if (e && e.code === 'ENOENT') {
            return res.status(404).json({ error: 'NOT_FOUND', message: '服务器 public 目录下未找到该文件' });
          }
          throw e;
        }
        logicalName = path.basename(publicFilename);
      }

      const fileYear = yearFromYearbookFilename(hasFile ? logicalName : publicFilename);
      if (fileYear != null && fileYear !== year) {
        return res.status(400).json({
          error: 'YEAR_FILE_MISMATCH',
          message: `Excel 文件名为「${fileYear} 年」，与所选目标年份「${year}」不一致，请调整后再导入。`
        });
      }

      const pool = getPool();
      const uid = Number(req.user?.userId) || null;

      const result = await importYearbookXlsxIntoDb(pool, {
        year,
        buffer,
        replaceExisting,
        userId: uid
      });

      await logOperationFromReq(req, {
        module: 'qc_yearbooks',
        action: 'import_xlsx',
        detail: JSON.stringify({
          year,
          sheetsImported: result.sheetsImported,
          recordsInserted: result.recordsInserted,
          finishedProductRowsInserted: result.finishedProductRowsInserted ?? 0,
          fromPublic: !hasFile,
          name: logicalName || publicFilename,
          sheetAllowList: ['成品']
        }),
        success: true
      });

      res.json({ ok: true, ...result });
    } catch (e) {
      if (e && Number(e.statusCode) === 400) {
        return res.status(400).json({
          error: e.code || 'BAD_REQUEST',
          message: e.message || '参数错误'
        });
      }
      next(e);
    }
  }
);

/** 年份列表（含成品行数） */
router.get('/years', canRead, async (_req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT y.id, y.year, y.remark, y.created_at,
              COUNT(DISTINCT fp.id) AS fp_row_count
       FROM qc_yearbook_years y
       LEFT JOIN qc_yearbook_finished_product_rows fp ON fp.year_id = y.id
       GROUP BY y.id, y.year, y.remark, y.created_at
       ORDER BY y.year DESC`
    );
    res.json({ years: (rows || []).map(mapYearRow) });
  } catch (e) {
    next(e);
  }
});

router.post('/years', canMutate, async (req, res, next) => {
  try {
    const parsed = postYearSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_FAILED', message: '年份或备注格式不正确' });
    }
    const { year, remark } = parsed.data;
    const pool = getPool();
    const [r] = await pool.query(
      'INSERT INTO qc_yearbook_years (year, remark) VALUES (?, ?)',
      [year, remark == null ? null : String(remark).trim() || null]
    );
    const id = Number(r.insertId);
    await logOperationFromReq(req, {
      module: 'qc_yearbooks',
      action: 'year_create',
      detail: JSON.stringify({ id, year }),
      success: true
    });
    res.json({ id, year, remark: remark ?? null });
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'DUPLICATE_YEAR', message: '该年份已存在' });
    }
    next(e);
  }
});

router.delete('/years/:yearId', canMutate, async (req, res, next) => {
  try {
    const yearId = Number(req.params.yearId);
    if (!Number.isFinite(yearId) || yearId < 1) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: '无效的年份 id' });
    }
    const pool = getPool();
    const y = await loadYearById(pool, yearId);
    if (!y) return res.status(404).json({ error: 'NOT_FOUND', message: '年份不存在' });
    const [del] = await pool.query('DELETE FROM qc_yearbook_years WHERE id = ?', [yearId]);
    await logOperationFromReq(req, {
      module: 'qc_yearbooks',
      action: 'year_delete',
      detail: JSON.stringify({ yearId, year: y.year }),
      success: true
    });
    res.json({ ok: true, affectedRows: Number(del?.affectedRows || 0) });
  } catch (e) {
    next(e);
  }
});

/** 成品检验台账（结构化行）；多组路径兼容不同网关/缓存（优先使用无连字符的 /fp） */
router.get('/years/:yearId/finished-product-rows', canRead, handleGetFinishedProductRows);
router.get('/years/:yearId/fp-rows', canRead, handleGetFinishedProductRows);
router.get('/years/:yearId/fp', canRead, handleGetFinishedProductRows);
router.post('/years/:yearId/finished-product-rows', canMutate, handlePostFinishedProductRow);
router.post('/years/:yearId/fp-rows', canMutate, handlePostFinishedProductRow);
router.post('/years/:yearId/fp', canMutate, handlePostFinishedProductRow);
router.put('/finished-product-rows/:rowId', canMutate, handlePutFinishedProductRow);
router.put('/fp-rows/:rowId', canMutate, handlePutFinishedProductRow);
router.put('/fp/:rowId', canMutate, handlePutFinishedProductRow);
router.delete('/finished-product-rows/:rowId', canMutate, handleDeleteFinishedProductRow);
router.delete('/fp-rows/:rowId', canMutate, handleDeleteFinishedProductRow);
router.delete('/fp/:rowId', canMutate, handleDeleteFinishedProductRow);
