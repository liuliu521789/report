import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { logOperationFromReq } from '../lib/audit.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { loadSupportContactSettings, sendSupportWecomRequest } from '../lib/supportContactService.js';

function wrapAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function userFacingError(code) {
  const map = {
    SUPPORT_NOT_CONFIGURED: '尚未配置技术工程师企业微信，请联系有权限的同事维护',
    REQUEST_TOO_FREQUENT: '发送过于频繁，请稍后再试',
    WECOM_NOT_CONFIGURED: '企业微信应用尚未配置完整，无法发送通知',
    WECOM_SEND_ERROR: '企业微信发送失败，请稍后重试或改用复制说明',
    MISSING_RECIPIENT: '技术工程师企业微信 UserID 未配置'
  };
  return map[code] || '操作失败，请稍后重试';
}

export const router = Router();

router.use(requireAuth);

router.get(
  '/',
  wrapAsync(async (_req, res) => {
    const pool = getPool();
    const data = await loadSupportContactSettings(pool);
    res.json(data);
  })
);

const putSchema = z.object({
  engineerWechatId: z.union([z.string(), z.null()]).optional(),
  engineerWecomUserid: z.union([z.string(), z.null()]).optional(),
  engineerDisplayName: z.union([z.string(), z.null()]).optional()
});

router.put(
  '/',
  requireSuperAdmin,
  wrapAsync(async (req, res) => {
    const parsed = putSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });

    const engineerWechatId =
      parsed.data.engineerWechatId == null
        ? undefined
        : String(parsed.data.engineerWechatId).trim().slice(0, 64);
    const engineerWecomUserid =
      parsed.data.engineerWecomUserid == null
        ? undefined
        : String(parsed.data.engineerWecomUserid).trim().slice(0, 64);
    const engineerDisplayName =
      parsed.data.engineerDisplayName == null
        ? undefined
        : String(parsed.data.engineerDisplayName).trim().slice(0, 64);

    const pool = getPool();
    const [existing] = await pool.query(
      'SELECT engineer_wechat_id, engineer_wecom_userid, engineer_display_name FROM support_contact_settings WHERE id=1 LIMIT 1'
    );
    const cur = existing?.[0] || {};

    const nextWechat =
      engineerWechatId !== undefined
        ? engineerWechatId
        : cur.engineer_wechat_id != null
          ? String(cur.engineer_wechat_id).trim()
          : '';
    const nextWecom =
      engineerWecomUserid !== undefined
        ? engineerWecomUserid
        : cur.engineer_wecom_userid != null
          ? String(cur.engineer_wecom_userid).trim()
          : '';
    const nextName =
      engineerDisplayName !== undefined
        ? engineerDisplayName
        : cur.engineer_display_name != null
          ? String(cur.engineer_display_name).trim()
          : '';

    await pool.query(
      `INSERT INTO support_contact_settings (id, engineer_wechat_id, engineer_wecom_userid, engineer_display_name, updated_by)
       VALUES (1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         engineer_wechat_id=VALUES(engineer_wechat_id),
         engineer_wecom_userid=VALUES(engineer_wecom_userid),
         engineer_display_name=VALUES(engineer_display_name),
         updated_by=VALUES(updated_by),
         updated_at=CURRENT_TIMESTAMP(3)`,
      [nextWechat, nextWecom, nextName, req.user.userId]
    );

    await logOperationFromReq(req, {
      module: '账号管理',
      action: '修改技术支持联系',
      detail: { hasWecom: !!nextWecom, hasWechat: !!nextWechat, hasName: !!nextName },
      success: true
    });

    const data = await loadSupportContactSettings(pool);
    res.json({ ok: true, ...data });
  })
);

const requestSchema = z.object({
  message: z.string().max(500).optional(),
  pagePath: z.string().max(200).optional()
});

router.post(
  '/request',
  wrapAsync(async (req, res) => {
    const parsed = requestSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });

    const pool = getPool();
    try {
      const data = await sendSupportWecomRequest(pool, {
        userId: req.user.userId,
        username: req.user.username,
        realName: req.user.realName,
        message: parsed.data.message,
        pagePath: parsed.data.pagePath
      });

      await logOperationFromReq(req, {
        module: '操作指南',
        action: '企业微信联系技术工程师',
        detail: { hasMessage: !!parsed.data.message },
        success: true
      });

      res.json({
        ok: true,
        message: `已通过企业微信通知${data.engineerDisplayName || '技术工程师'}，请留意企业微信回复`,
        ...data
      });
    } catch (e) {
      const code = e?.code || 'UNKNOWN';
      if (code === 'REQUEST_TOO_FREQUENT') {
        return res.status(429).json({
          error: code,
          message: userFacingError(code),
          retryAfterSec: e.retryAfterSec
        });
      }
      if (
        code === 'SUPPORT_NOT_CONFIGURED' ||
        code === 'WECOM_NOT_CONFIGURED' ||
        code === 'MISSING_RECIPIENT'
      ) {
        return res.status(503).json({ error: code, message: userFacingError(code) });
      }
      if (code === 'WECOM_SEND_ERROR' || code === 'WECOM_TIMEOUT' || code === 'WECOM_NETWORK_ERROR') {
        return res.status(502).json({ error: code, message: userFacingError('WECOM_SEND_ERROR') });
      }
      throw e;
    }
  })
);
