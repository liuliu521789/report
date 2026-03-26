import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';

import { getPool } from '../db/pool.js';
import { logOperationFromReq } from '../lib/audit.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const router = Router();

router.use(requireAuth);
router.use(requirePermission('stamps', 'manage'));

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
  return null;
}

// Upload stamp image (local file) => returns imageUrl
router.post('/upload', upload.single('file'), async (req, res) => {
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

router.get('/', async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, name, seal_type AS sealType, image_url AS imageUrl, is_active AS isActive, created_at AS createdAt FROM company_stamps ORDER BY created_at DESC, id DESC'
  );
  res.json({ items: rows });
});

const upsertSchema = z.object({
  name: z.string().min(1).max(128),
  sealType: z.enum(sealTypeValues),
  imageUrl: z.string().min(1).max(512),
  isActive: z.boolean().optional()
});

const bulkIdsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500)
});

router.post('/', async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { name, sealType, imageUrl, isActive = true } = parsed.data;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (isActive) {
      await conn.query('UPDATE company_stamps SET is_active=0 WHERE seal_type=?', [sealType]);
    }
    const [result] = await conn.query(
      'INSERT INTO company_stamps (name, seal_type, image_url, is_active, created_by) VALUES (?, ?, ?, ?, ?)',
      [name, sealType, imageUrl, isActive ? 1 : 0, req.user.userId]
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

router.delete('/bulk', async (req, res) => {
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

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });

  const { name, sealType, imageUrl, isActive = false } = parsed.data;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Keep "single active" per seal_type
    if (isActive) {
      await conn.query('UPDATE company_stamps SET is_active=0 WHERE seal_type=?', [sealType]);
    }

    const [result] = await conn.query(
      'UPDATE company_stamps SET name=?, seal_type=?, image_url=?, is_active=? WHERE id=?',
      [name, sealType, imageUrl, isActive ? 1 : 0, id]
    );

    if (!result?.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ error: 'NOT_FOUND' });
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

router.post('/:id/activate', async (req, res) => {
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

router.delete('/:id', async (req, res) => {
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

