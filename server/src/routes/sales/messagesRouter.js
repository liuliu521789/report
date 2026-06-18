import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../../db/pool.js';
import { authenticatedNumericUserId, jsonSafeSalesInternalMessageRow } from './salesShared.js';
import { sendUnifiedError, sendUnifiedSuccess } from './salesOrderRouterHelpers.js';

const router = Router();

router.get('/messages', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return sendUnifiedError(res, 401, 'UNAUTHORIZED');
    const pool = getPool();
    const unreadOnly = String(req.query.unread || '') === '1';
    let sql = `SELECT id, category, title, body_text, ref_type, ref_id, read_at, created_at FROM sales_internal_messages WHERE to_user_id = ?`;
    const args = [uid];
    if (unreadOnly) sql += ' AND read_at IS NULL';
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const [rows] = await pool.query(sql, args);
    sendUnifiedSuccess(res, { items: (rows || []).map(jsonSafeSalesInternalMessageRow) });
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') {
      // eslint-disable-next-line no-console
      console.error('[server] sales_internal_messages 缺失，请重启服务以执行建表自检');
      return sendUnifiedSuccess(res, { items: [] });
    }
    // eslint-disable-next-line no-console
    console.error('[sales/messages]', e.code || '', e.message || e);
    next(e);
  }
});

/** 清空当前用户全部站内信（仅本人收件箱） */
router.post('/messages/clear', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return sendUnifiedError(res, 401, 'UNAUTHORIZED');
    const pool = getPool();
    await pool.query('DELETE FROM sales_internal_messages WHERE to_user_id = ?', [uid]);
    sendUnifiedSuccess(res, { ok: true }, '清空成功');
  } catch (e) {
    next(e);
  }
});

router.post('/messages/:id/read', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return sendUnifiedError(res, 401, 'UNAUTHORIZED');
    const id = Number(req.params.id);
    const pool = getPool();
    await pool.query('UPDATE sales_internal_messages SET read_at = NOW(3) WHERE id = ? AND to_user_id = ?', [
      id,
      uid
    ]);
    sendUnifiedSuccess(res, { ok: true }, '已标记已读');
  } catch (e) {
    next(e);
  }
});

/** 删除单条站内信（仅本人收件箱） */
router.delete('/messages/:id', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return sendUnifiedError(res, 401, 'UNAUTHORIZED');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return sendUnifiedError(res, 400, 'INVALID_ID');
    const pool = getPool();
    const [r] = await pool.query('DELETE FROM sales_internal_messages WHERE id = ? AND to_user_id = ?', [id, uid]);
    sendUnifiedSuccess(res, { ok: true, deleted: Number(r.affectedRows || 0) }, '删除成功');
  } catch (e) {
    next(e);
  }
});

const batchDeleteSalesMessagesSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200)
});

/** 批量删除站内信（仅本人收件箱） */
router.post('/messages/batch-delete', async (req, res, next) => {
  try {
    const uid = authenticatedNumericUserId(req);
    if (uid == null) return sendUnifiedError(res, 401, 'UNAUTHORIZED');
    const parsed = batchDeleteSalesMessagesSchema.safeParse(req.body);
    if (!parsed.success) return sendUnifiedError(res, 400, 'VALIDATION_ERROR');
    const ids = [...new Set(parsed.data.ids)];
    const pool = getPool();
    const ph = ids.map(() => '?').join(',');
    const [r] = await pool.query(
      `DELETE FROM sales_internal_messages WHERE to_user_id = ? AND id IN (${ph})`,
      [uid, ...ids]
    );
    sendUnifiedSuccess(res, { ok: true, deleted: Number(r.affectedRows || 0) }, '删除成功');
  } catch (e) {
    next(e);
  }
});

export { router };
