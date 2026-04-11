import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

import { nanoid } from 'nanoid';

import { getPool } from '../db/pool.js';
import { logOperationFromReq } from '../lib/audit.js';
import { normalizePublicAssetUrl } from '../lib/publicBaseUrl.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

/** Express 4 不会自动捕获 async 路由里的异常，需交给 next，否则可能拖垮进程 */
function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const router = Router();

const MAX_TOTAL = 500;
const MAX_BATCH = 40;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

router.use(requireAuth);
router.use(requireSuperAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_BATCH }
});

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function extFromMime(mime) {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return null;
}

function uploadsFilesystemPath(imageUrl) {
  const t = String(imageUrl || '').trim();
  if (!t) return null;
  let pathname;
  if (t.startsWith('/')) {
    pathname = t.split(/[?#]/)[0];
  } else {
    try {
      pathname = new URL(t).pathname;
    } catch {
      return null;
    }
  }
  if (!pathname.startsWith('/uploads/')) return null;
  const rel = pathname.slice('/uploads/'.length);
  return path.join(process.cwd(), 'uploads', rel);
}

/** BIGINT 等可能无法被 res.json 序列化 */
function jsonSafeId(v) {
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function mapLibraryRow(row) {
  return {
    id: jsonSafeId(row.id),
    name: row.name,
    /** 相对路径，由管理端当前域 +代理加载，避免浏览器直连 API 端口超时 */
    imageUrl: normalizePublicAssetUrl(row.imageUrl),
    createdAt: row.createdAt
  };
}

router.get(
  '/',
  wrapAsync(async (_req, res) => {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, name, image_url AS imageUrl, created_at AS createdAt
       FROM report_image_library
       ORDER BY created_at DESC, id DESC`
    );
    const items = (rows || []).map(mapLibraryRow);
    res.json({ items, maxTotal: MAX_TOTAL, maxBatch: MAX_BATCH });
  })
);

router.post('/batch', upload.array('files', MAX_BATCH), wrapAsync(async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'NO_FILES' });

  for (const f of files) {
    if (!f.mimetype?.startsWith('image/')) {
      return res.status(400).json({ error: 'UNSUPPORTED_TYPE' });
    }
    const ext = extFromMime(f.mimetype);
    if (!ext) return res.status(400).json({ error: 'UNSUPPORTED_TYPE' });
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  const dir = path.join(process.cwd(), 'uploads', 'report-images');
  await ensureDir(dir);

  const writtenPaths = [];
  try {
    await conn.beginTransaction();
    const [[{ cnt }]] = await conn.query('SELECT COUNT(*) AS cnt FROM report_image_library');
    const current = Number(cnt) || 0;
    if (current + files.length > MAX_TOTAL) {
      await conn.rollback();
      return res.status(400).json({
        error: 'LIBRARY_FULL',
        max: MAX_TOTAL,
        current
      });
    }

    const inserted = [];
    for (const f of files) {
      const ext = extFromMime(f.mimetype);
      const filename = `rimg_${Date.now()}_${nanoid(10)}${ext}`;
      const fullPath = path.join(dir, filename);
      await fs.writeFile(fullPath, f.buffer);
      writtenPaths.push(fullPath);
      const imageUrl = `/uploads/report-images/${filename}`;
      const name = String(f.originalname || 'image').slice(0, 255);
      const [result] = await conn.query(
        'INSERT INTO report_image_library (name, image_url, created_by) VALUES (?, ?, ?)',
        [name, imageUrl, req.user.userId]
      );
      inserted.push({
        id: jsonSafeId(result.insertId),
        name,
        imageUrl,
        createdAt: Date.now()
      });
    }

    await conn.commit();
    await logOperationFromReq(req, {
      module: '系统图片库',
      action: '批量上传图片',
      detail: { count: inserted.length },
      success: true
    });
    res.status(201).json({ items: inserted });
  } catch (e) {
    await conn.rollback();
    await Promise.all(writtenPaths.map((p) => fs.unlink(p).catch(() => {})));
    throw e;
  } finally {
    conn.release();
  }
}));

const bulkIdsSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(500)
});

router.delete('/batch', wrapAsync(async (req, res) => {
  const parsed = bulkIdsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { ids } = parsed.data;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await conn.query(
      `SELECT id, image_url AS imageUrl FROM report_image_library WHERE id IN (${placeholders})`,
      ids
    );
    const [result] = await conn.query(
      `DELETE FROM report_image_library WHERE id IN (${placeholders})`,
      ids
    );
    await conn.commit();
    const deletedCount = Number(result?.affectedRows || 0);
    await logOperationFromReq(req, {
      module: '系统图片库',
      action: '批量删除图片',
      detail: { requested: ids.length, deleted: deletedCount },
      success: true
    });
    res.json({ ok: true, deletedCount });

    for (const row of rows || []) {
      const p = uploadsFilesystemPath(row.imageUrl);
      if (p) {
        await fs.unlink(p).catch(() => {});
      }
    }
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));
