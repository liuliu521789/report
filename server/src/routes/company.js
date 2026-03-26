import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { requireAnyPermissionPairs, requireAuth, requirePermission } from '../middleware/auth.js';
import { nanoid } from 'nanoid';

export const router = Router();

/** 填写/预览报告需加载公司抬头；管理端「公司信息」仍用 company.manage 写接口 */
const canReadCompanyForReports = requireAnyPermissionPairs([
  ['company', 'manage'],
  ['reports', 'list'],
  ['reports', 'view'],
  ['reports', 'edit'],
  ['reports', 'create'],
  ['reports', 'previewPrint']
]);

router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

function extFromMime(mime) {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  return null;
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

router.get('/settings', canReadCompanyForReports, async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.query('SELECT * FROM company_settings WHERE id=1 LIMIT 1');
  const s = rows?.[0] || null;
  res.json({ settings: s });
});

const settingsSchema = z.object({
  companyNameZh: z.string().max(128).optional().nullable().transform((v) => v ?? ''),
  companyNameEn: z.string().max(256).optional().nullable().transform((v) => v ?? ''),
  reportTitleZh: z.string().max(128).optional().nullable().transform((v) => v ?? ''),
  reportTitleEn: z.string().max(256).optional().nullable().transform((v) => v ?? ''),
  descriptionZh: z.string().max(256).optional().nullable(),
  descriptionEn: z.string().max(256).optional().nullable(),
  logoUrl: z.string().max(512).optional().nullable()
});

router.put('/settings', requirePermission('company', 'manage'), async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const {
    companyNameZh,
    companyNameEn,
    reportTitleZh,
    reportTitleEn,
    descriptionZh,
    descriptionEn,
    logoUrl
  } = parsed.data;

  const pool = getPool();
  await pool.query(
    `INSERT INTO company_settings
      (id, company_name_zh, company_name_en, report_title_zh, report_title_en, description_zh, description_en, logo_url, created_by)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      company_name_zh=VALUES(company_name_zh),
      company_name_en=VALUES(company_name_en),
      report_title_zh=VALUES(report_title_zh),
      report_title_en=VALUES(report_title_en),
      description_zh=VALUES(description_zh),
      description_en=VALUES(description_en),
      logo_url=VALUES(logo_url),
      updated_at=CURRENT_TIMESTAMP(3)`,
    [companyNameZh, companyNameEn, reportTitleZh, reportTitleEn, descriptionZh ?? null, descriptionEn ?? null, logoUrl ?? null, req.user.userId]
  );
  res.json({ ok: true });
});

router.post('/settings/logo', requirePermission('company', 'manage'), upload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'NO_FILE' });
  const ext = extFromMime(f.mimetype);
  if (!ext) return res.status(400).json({ error: 'UNSUPPORTED_TYPE' });

  const base = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  const dir = path.join(process.cwd(), 'uploads', 'company');
  await ensureDir(dir);

  const filename = `company_logo_${Date.now()}_${nanoid(8)}${ext}`;
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, f.buffer);

  res.json({ logoUrl: `${base}/uploads/company/${filename}` });
});

