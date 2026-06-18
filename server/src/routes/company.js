import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { requireAnyPermissionPairs, requireAuth, requirePermission, requireSuperAdmin } from '../middleware/auth.js';
import { nanoid } from 'nanoid';
import { normalizePublicAssetUrl } from '../lib/publicBaseUrl.js';

export const router = Router();

/** 填写/预览报告需加载公司抬头；管理端「公司信息」仍用 company.manage 写接口 */
const canReadCompanyForReports = requireAnyPermissionPairs([
  ['company', 'manage'],
  ['company', 'view'],
  ['reports', 'list'],
  ['reports', 'view'],
  ['reports', 'edit'],
  ['reports', 'create'],
  ['reports', 'previewPrint']
]);

router.use(requireAuth);

const quickRoleUsersSchema = z.object({
  salesUserId: z.union([z.number().int().positive(), z.null()]).optional(),
  financeUserId: z.union([z.number().int().positive(), z.null()]).optional(),
  warehouseUserId: z.union([z.number().int().positive(), z.null()]).optional()
});

async function assertQuickRoleUsers(pool, salesUserId, financeUserId, warehouseUserId) {
  const ids = [salesUserId, financeUserId, warehouseUserId].filter((x) => x != null);
  if (!ids.length) return;
  const uniq = [...new Set(ids)];
  const [rows] = await pool.query(
    `SELECT id, account_type AS accountType, is_active AS isActive FROM users WHERE id IN (${uniq.map(() => '?').join(',')})`,
    uniq
  );
  const map = new Map((rows || []).map((r) => [Number(r.id), r]));
  for (const id of uniq) {
    const u = map.get(id);
    if (!u || u.accountType !== 'employee' || !u.isActive) {
      const e = new Error('INVALID_QUICK_ROLE_USER');
      e.code = 'INVALID_QUICK_ROLE_USER';
      throw e;
    }
  }
}

router.get('/quick-role-users', requireSuperAdmin, async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT quick_role_sales_user_id, quick_role_finance_user_id, quick_role_warehouse_user_id FROM company_settings WHERE id=1 LIMIT 1'
  );
  const r = rows?.[0] || {};
  res.json({
    salesUserId: r.quick_role_sales_user_id != null ? Number(r.quick_role_sales_user_id) : null,
    financeUserId: r.quick_role_finance_user_id != null ? Number(r.quick_role_finance_user_id) : null,
    warehouseUserId: r.quick_role_warehouse_user_id != null ? Number(r.quick_role_warehouse_user_id) : null
  });
});

router.put('/quick-role-users', requireSuperAdmin, async (req, res) => {
  const parsed = quickRoleUsersSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const salesUserId = parsed.data.salesUserId ?? null;
  const financeUserId = parsed.data.financeUserId ?? null;
  const warehouseUserId = parsed.data.warehouseUserId ?? null;
  const pool = getPool();
  try {
    await assertQuickRoleUsers(pool, salesUserId, financeUserId, warehouseUserId);
  } catch (e) {
    if (e.code === 'INVALID_QUICK_ROLE_USER') {
      return res.status(400).json({ error: 'INVALID_QUICK_ROLE_USER' });
    }
    throw e;
  }
  await pool.query(
    `INSERT INTO company_settings (id, quick_role_sales_user_id, quick_role_finance_user_id, quick_role_warehouse_user_id)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      quick_role_sales_user_id = VALUES(quick_role_sales_user_id),
      quick_role_finance_user_id = VALUES(quick_role_finance_user_id),
      quick_role_warehouse_user_id = VALUES(quick_role_warehouse_user_id),
      updated_at = CURRENT_TIMESTAMP(3)`,
    [salesUserId, financeUserId, warehouseUserId]
  );
  res.json({ ok: true });
});

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
  const raw = rows?.[0] || null;
  const s = raw
    ? {
      ...raw,
      logo_url: normalizePublicAssetUrl(raw.logo_url)
    }
    : null;
  res.json({ settings: s });
});

const settingsSchema = z.object({
  companyNameZh: z.string().max(128).optional().nullable(),
  companyNameEn: z.string().max(256).optional().nullable(),
  email: z.string().max(128).optional().nullable(),
  address: z.string().max(256).optional().nullable(),
  reportTitleZh: z.string().max(128).optional().nullable(),
  reportTitleEn: z.string().max(256).optional().nullable(),
  descriptionZh: z.string().max(256).optional().nullable(),
  descriptionEn: z.string().max(256).optional().nullable(),
  logoUrl: z.string().max(512).optional().nullable()
});

const footerSealPositionSchema = z.object({
  footerSealPosition: z.enum(['below', 'above', 'right'])
});

router.patch(
  '/settings/footer-seal-position',
  requireAnyPermissionPairs([
    ['company', 'manage'],
    ['reports', 'seals']
  ]),
  async (req, res) => {
    const parsed = footerSealPositionSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    try {
      await pool.query(
        `INSERT INTO company_settings (id, footer_seal_position)
         VALUES (1, ?)
         ON DUPLICATE KEY UPDATE
          footer_seal_position = VALUES(footer_seal_position),
          updated_at = CURRENT_TIMESTAMP(3)`,
        [parsed.data.footerSealPosition]
      );
      res.json({ ok: true, footerSealPosition: parsed.data.footerSealPosition });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[footer-seal-position]', e?.message || e);
      return res.status(500).json({ error: 'SAVE_FAILED', message: '保存章位置失败，请重启服务后重试' });
    }
  }
);

router.put('/settings', requirePermission('company', 'manage'), async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  const [rows] = await pool.query('SELECT * FROM company_settings WHERE id=1 LIMIT 1');
  const current = rows?.[0] || {};
  const body = req.body || {};
  const data = parsed.data || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const companyNameZh = has('companyNameZh')
    ? (data.companyNameZh ?? '')
    : (current.company_name_zh ?? '');
  const companyNameEn = has('companyNameEn')
    ? (data.companyNameEn ?? '')
    : (current.company_name_en ?? '');
  const email = has('email')
    ? (data.email ?? null)
    : (current.company_email ?? null);
  const address = has('address')
    ? (data.address ?? null)
    : (current.company_address ?? null);
  const reportTitleZh = has('reportTitleZh')
    ? (data.reportTitleZh ?? '')
    : (current.report_title_zh ?? '');
  const reportTitleEn = has('reportTitleEn')
    ? (data.reportTitleEn ?? '')
    : (current.report_title_en ?? '');
  const descriptionZh = has('descriptionZh')
    ? (data.descriptionZh ?? null)
    : (current.description_zh ?? null);
  const descriptionEn = has('descriptionEn')
    ? (data.descriptionEn ?? null)
    : (current.description_en ?? null);
  const logoUrl = has('logoUrl')
    ? (data.logoUrl ?? null)
    : (current.logo_url ?? null);

  await pool.query(
    `INSERT INTO company_settings
      (id, company_name_zh, company_name_en, company_email, company_address, report_title_zh, report_title_en, description_zh, description_en, logo_url, created_by)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      company_name_zh=VALUES(company_name_zh),
      company_name_en=VALUES(company_name_en),
      company_email=VALUES(company_email),
      company_address=VALUES(company_address),
      report_title_zh=VALUES(report_title_zh),
      report_title_en=VALUES(report_title_en),
      description_zh=VALUES(description_zh),
      description_en=VALUES(description_en),
      logo_url=VALUES(logo_url),
      updated_at=CURRENT_TIMESTAMP(3)`,
    [companyNameZh, companyNameEn, email ?? null, address ?? null, reportTitleZh, reportTitleEn, descriptionZh ?? null, descriptionEn ?? null, logoUrl ?? null, req.user.userId]
  );
  res.json({ ok: true });
});

router.post('/settings/logo', requirePermission('company', 'manage'), upload.single('file'), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'NO_FILE' });
  const ext = extFromMime(f.mimetype);
  if (!ext) return res.status(400).json({ error: 'UNSUPPORTED_TYPE' });

  const dir = path.join(process.cwd(), 'uploads', 'company');
  await ensureDir(dir);

  const filename = `company_logo_${Date.now()}_${nanoid(8)}${ext}`;
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, f.buffer);

  res.json({ logoUrl: `/uploads/company/${filename}` });
});

