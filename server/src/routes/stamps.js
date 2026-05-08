import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';

import { getPool } from '../db/pool.js';
import { logOperationFromReq } from '../lib/audit.js';
import { requireAuth, requireAnyPermission, requirePermission } from '../middleware/auth.js';
import { normalizePublicAssetUrl } from '../lib/publicBaseUrl.js';

export const router = Router();

const canViewStamps = requireAnyPermission('stamps', ['manage', 'view']);

router.use(requireAuth);

const SealType = {
  DEPARTMENT_QC: 'department_qc',
  INSPECTOR: 'inspector',
  SUPERVISOR: 'supervisor',
  PASS: 'pass',
  RECHECK: 'recheck'
};

const sealTypeValues = Object.values(SealType);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function extFromMime(mime) {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/svg+xml') return '.svg';
  return null;
}

// Upload stamp image (local file) => returns imageUrl
router.post('/upload', requirePermission('stamps', 'manage'), upload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'NO_FILE' });
  const ext = extFromMime(f.mimetype);
  if (!ext) return res.status(400).json({ error: 'UNSUPPORTED_TYPE' });

  const base = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  const dir = path.join(process.cwd(), 'uploads', 'stamps');
  await ensureDir(dir);

  const filename = `stamp_${Date.now()}_${nanoid(8)}${ext}`;
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, f.buffer);

  res.json({ imageUrl: `${base}/uploads/stamps/${filename}` });
});

router.get('/', canViewStamps, async (req, res) => {
  const pool = getPool();
  
  // 检查字段是否存在
  let hasSvgFields = false;
  try {
    const [columns] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_stamps' AND COLUMN_NAME = 'svg_image_url'"
    );
    hasSvgFields = columns.length > 0;
  } catch (e) {
    // ignore
  }
  
  const selectFields = hasSvgFields 
    ? 'id, name, seal_type AS sealType, image_url AS imageUrl, svg_image_url AS svgImageUrl, active_image_type AS activeImageType, is_active AS isActive, created_at AS createdAt'
    : 'id, name, seal_type AS sealType, image_url AS imageUrl, NULL AS svgImageUrl, \'original\' AS activeImageType, is_active AS isActive, created_at AS createdAt';
  
  const [rows] = await pool.query(
    `SELECT ${selectFields} FROM company_stamps ORDER BY created_at DESC, id DESC`
  );
  const items = (rows || []).map(row => ({
    ...row,
    imageUrl: normalizePublicAssetUrl(row.imageUrl),
    svgImageUrl: row.svgImageUrl ? normalizePublicAssetUrl(row.svgImageUrl) : null
  }));
  res.json({ items });
});

const createSchema = z.object({
  name: z.string().min(1).max(128),
  sealType: z.enum(sealTypeValues),
  imageUrl: z.string().min(1).max(512),
  svgImageUrl: z.string().max(512).nullable().optional(),
  activeImageType: z.enum(['original', 'svg']).optional(),
  isActive: z.boolean().optional()
});

const updateSchema = z.object({
  name: z.string().min(1).max(128),
  sealType: z.enum(sealTypeValues),
  imageUrl: z.string().max(512).nullable().optional(),
  svgImageUrl: z.string().max(512).nullable().optional(),
  activeImageType: z.enum(['original', 'svg']).optional(),
  isActive: z.boolean().optional()
});

const bulkIdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500)
});

router.post('/', requirePermission('stamps', 'manage'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { name, sealType, imageUrl, svgImageUrl = null, activeImageType = 'original', isActive = true } = parsed.data;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (isActive) {
      await conn.query('UPDATE company_stamps SET is_active=0 WHERE seal_type=?', [sealType]);
    }
    const [result] = await conn.query(
      'INSERT INTO company_stamps (name, seal_type, image_url, svg_image_url, active_image_type, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, sealType, imageUrl, svgImageUrl, activeImageType, isActive ? 1 : 0, req.user.userId]
    );
    await conn.commit();
    await logOperationFromReq(req, {
      module: '公司章',
      action: '新增公司章',
      detail: { sealId: result.insertId, sealType },
      success: true
    });
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.delete('/bulk', requirePermission('stamps', 'manage'), async (req, res) => {
  const parsed = bulkIdsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { ids } = parsed.data;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `DELETE FROM company_stamps WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    await conn.commit();
    await logOperationFromReq(req, {
      module: '公司章',
      action: '批量删除公司章',
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

router.put('/:id', requirePermission('stamps', 'manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });

  const { name, sealType, imageUrl = null, svgImageUrl = null, activeImageType = 'original', isActive = false } = parsed.data;

  const pool = getPool();
  
  // 检查字段是否存在
  let hasSvgFields = false;
  try {
    const [columns] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_stamps' AND COLUMN_NAME = 'svg_image_url'"
    );
    hasSvgFields = columns.length > 0;
  } catch (e) {
    // ignore
  }
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 获取当前记录
    const [existingRows] = await conn.query('SELECT * FROM company_stamps WHERE id=? LIMIT 1', [id]);
    const existing = existingRows?.[0];
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }

    // Keep "single active" per seal_type
    if (isActive) {
      await conn.query('UPDATE company_stamps SET is_active=0 WHERE seal_type=?', [sealType]);
    }

    // 使用传入的值，如果为空则保留原值
    const finalImageUrl = imageUrl || existing.image_url;
    const finalSvgImageUrl = svgImageUrl || existing.svg_image_url;
    const finalActiveImageType = activeImageType || existing.active_image_type || 'original';

    let result;
    if (hasSvgFields) {
      [result] = await conn.query(
        'UPDATE company_stamps SET name=?, seal_type=?, image_url=?, svg_image_url=?, active_image_type=?, is_active=? WHERE id=?',
        [name, sealType, finalImageUrl, finalSvgImageUrl, finalActiveImageType, isActive ? 1 : 0, id]
      );
    } else {
      [result] = await conn.query(
        'UPDATE company_stamps SET name=?, seal_type=?, image_url=?, is_active=? WHERE id=?',
        [name, sealType, finalImageUrl, isActive ? 1 : 0, id]
      );
    }

    await conn.commit();
    await logOperationFromReq(req, {
      module: '公司章',
      action: '修改公司章',
      detail: { stampId: id, sealType, isActive: !!isActive },
      success: true
    });
    res.json({ ok: true, updatedCount: Number(result?.affectedRows || 0) });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.post('/:id/activate', requirePermission('stamps', 'manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, seal_type AS sealType FROM company_stamps WHERE id=? LIMIT 1', [id]);
    const stamp = rows?.[0];
    if (!stamp) {
      await conn.rollback();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    await conn.query('UPDATE company_stamps SET is_active=0 WHERE seal_type=?', [stamp.sealType]);
    await conn.query('UPDATE company_stamps SET is_active=1 WHERE id=?', [id]);
    await conn.commit();
    await logOperationFromReq(req, {
      module: '公司章',
      action: '激活/切换公司章',
      detail: { stampId: id, sealType: stamp.sealType },
      success: true
    });
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.delete('/:id', requirePermission('stamps', 'manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  await pool.query('DELETE FROM company_stamps WHERE id=?', [id]);
  await logOperationFromReq(req, {
    module: '公司章',
    action: '删除公司章记录',
    detail: { stampId: id },
    success: true
  });
  res.json({ ok: true });
});

router.post('/:id/switch-image', requirePermission('stamps', 'manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const { imageType } = req.body;
  if (!['original', 'svg'].includes(imageType)) {
    return res.status(400).json({ error: 'INVALID_IMAGE_TYPE' });
  }

  const pool = getPool();
  
  // 检查字段是否存在
  let hasSvgFields = false;
  try {
    const [columns] = await pool.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'company_stamps' AND COLUMN_NAME = 'svg_image_url'"
    );
    hasSvgFields = columns.length > 0;
  } catch (e) {
    // ignore
  }
  
  if (!hasSvgFields) {
    return res.status(400).json({ error: 'SVG_FIELDS_NOT_EXISTS', message: '请重启服务器以初始化SVG字段' });
  }
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const [rows] = await conn.query('SELECT id, svg_image_url FROM company_stamps WHERE id=? LIMIT 1', [id]);
    const stamp = rows?.[0];
    if (!stamp) {
      await conn.rollback();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    
    if (imageType === 'svg' && !stamp.svg_image_url) {
      await conn.rollback();
      return res.status(400).json({ error: 'NO_SVG_IMAGE' });
    }

    await conn.query('UPDATE company_stamps SET active_image_type=? WHERE id=?', [imageType, id]);
    await conn.commit();
    
    await logOperationFromReq(req, {
      module: '公司章',
      action: '切换印章图片类型',
      detail: { stampId: id, imageType },
      success: true
    });
    
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

