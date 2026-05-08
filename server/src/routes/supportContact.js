import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { logOperationFromReq } from '../lib/audit.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const router = Router();

router.use(requireAuth);

router.get(
  '/',
  wrapAsync(async (_req, res) => {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT engineer_wechat_id AS engineerWechatId FROM support_contact_settings WHERE id=1 LIMIT 1'
    );
    const raw = rows?.[0]?.engineerWechatId;
    res.json({ engineerWechatId: raw == null ? '' : String(raw).trim() });
  })
);

const putSchema = z.object({
  engineerWechatId: z.union([z.string(), z.null()]).optional()
});

router.put(
  '/',
  requireSuperAdmin,
  wrapAsync(async (req, res) => {
    const parsed = putSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const raw = parsed.data.engineerWechatId;
    const engineerWechatId = String(raw == null ? '' : raw).trim().slice(0, 64);

    const pool = getPool();
    await pool.query(
      `INSERT INTO support_contact_settings (id, engineer_wechat_id, updated_by)
       VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE
         engineer_wechat_id=VALUES(engineer_wechat_id),
         updated_by=VALUES(updated_by),
         updated_at=CURRENT_TIMESTAMP(3)`,
      [engineerWechatId, req.user.userId]
    );

    await logOperationFromReq(req, {
      module: '账号管理',
      action: '修改技术工程师微信号',
      detail: { hasValue: !!engineerWechatId },
      success: true
    });

    res.json({ ok: true, engineerWechatId });
  })
);
