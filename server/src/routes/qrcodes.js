import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { nanoid } from 'nanoid';

import { getPool } from '../db/pool.js';
import { attachQrcodeUid, allocateNextQrcodeUid, normalizeQrcodeUidSearch } from '../lib/qrcodeUid.js';
import { resolvePublicBaseUrl } from '../lib/publicBaseUrl.js';
import { requireAuth, requireAnyPermission, requirePermission } from '../middleware/auth.js';

export const router = Router();

router.use(requireAuth);

const createSchema = z.object({
  reportIds: z.array(z.number().int().positive()).min(1).max(200),
  force: z.boolean().optional()
});
const deleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200)
});

router.post('/', requirePermission('qrcodes', 'create'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { reportIds, force } = parsed.data;

  const pool = getPool();

  if (!force) {
    const [alreadyBound] = await pool.query(
      `SELECT DISTINCT qr.report_id, r.report_no, r.product_name, r.batch_no
       FROM qrcode_reports qr
       JOIN reports r ON r.id = qr.report_id
       WHERE qr.report_id IN (${reportIds.map(() => '?').join(',')})`,
      reportIds
    );
    if (alreadyBound.length > 0) {
      return res.status(409).json({
        error: 'REPORT_ALREADY_BOUND',
        message: `${alreadyBound.length} 个报告已关联二维码`,
        already_bound: alreadyBound.map((r) => ({
          report_id: r.report_id,
          report_no: r.report_no,
          product_name: r.product_name,
          batch_no: r.batch_no
        }))
      });
    }
  }

  const token = nanoid(24);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const qrcodeUid = await allocateNextQrcodeUid(conn);

    const [qrRes] = await conn.query(
      'INSERT INTO qrcodes (token, qrcode_uid, created_by) VALUES (?, ?, ?)',
      [token, qrcodeUid, req.user.userId]
    );
    const qrcodeId = qrRes.insertId;

    const [existing] = await conn.query(
      `SELECT id FROM reports WHERE id IN (${reportIds.map(() => '?').join(',')})`,
      reportIds
    );
    const existingIds = new Set(existing.map((r) => r.id));
    for (const rid of reportIds) {
      if (!existingIds.has(rid)) {
        await conn.rollback();
        return res.status(400).json({ error: 'REPORT_NOT_FOUND', reportId: rid });
      }
    }

    for (const rid of reportIds) {
      await conn.query(
        'INSERT INTO qrcode_reports (qrcode_id, report_id) VALUES (?, ?)',
        [qrcodeId, rid]
      );
    }

    await conn.commit();

    const base = resolvePublicBaseUrl(req);
    const scanUrl = `${base}/api/public/qr/${token}`;
    const dataUrl = await QRCode.toDataURL(scanUrl, { margin: 1, width: 280 });
    res.status(201).json(
      attachQrcodeUid({
        id: qrcodeId,
        qrcodeId,
        qrcodeUid,
        token,
        scanUrl,
        qrDataUrl: dataUrl
      })
    );
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.get('/', requirePermission('qrcodes', 'list'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  const base = resolvePublicBaseUrl(req);

  const pool = getPool();
  const where = [];
  const params = [];
  if (q) {
    const like = `%${q}%`;
    const exactUid = normalizeQrcodeUidSearch(q);
    const idNum = /^\d+$/.test(q) ? Number(q) : null;
    const matchParts = ['qrc.token LIKE ?', 'qrc.qrcode_uid LIKE ?'];
    const matchParams = [like, like];
    if (exactUid) {
      matchParts.push('qrc.qrcode_uid = ?');
      matchParams.push(exactUid);
    }
    if (idNum != null) {
      matchParts.push('qrc.id = ?');
      matchParams.push(idNum);
    }
    matchParts.push(
      `EXISTS (
        SELECT 1
        FROM qrcode_reports qr
        JOIN reports r ON r.id = qr.report_id
        LEFT JOIN sales_customers c ON c.id = r.customer_id
        WHERE qr.qrcode_id = qrc.id
          AND (
            r.product_name LIKE ?
            OR r.batch_no LIKE ?
            OR r.report_uid LIKE ?
            OR c.customer_name LIKE ?
            OR c.contact_name LIKE ?
          )
      )`
    );
    matchParams.push(like, like, like, like, like);
    where.push(`(${matchParts.join(' OR ')})`);
    params.push(...matchParams);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM qrcodes qrc
     ${sqlWhere}`,
    params
  );
  const total = Number(countRows?.[0]?.total || 0);
  const [baseRows] = await pool.query(
    `SELECT qrc.id, qrc.token, qrc.qrcode_uid AS qrcodeUid, qrc.created_at AS createdAt
     FROM qrcodes qrc
     ${sqlWhere}
     ORDER BY qrc.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  if (!baseRows.length) return res.json({ items: [], total, limit, offset });

  const ids = baseRows.map((r) => r.id);
  const [rows] = await pool.query(
    `SELECT q.id, q.token, q.qrcode_uid AS qrcodeUid, q.created_at AS createdAt,
            r.product_name AS productName, r.batch_no AS batchNo,
            c.customer_name AS customerName, c.contact_name AS customerContact
     FROM qrcodes q
     LEFT JOIN qrcode_reports qr ON qr.qrcode_id = q.id
     LEFT JOIN reports r ON r.id = qr.report_id
     LEFT JOIN sales_customers c ON c.id = r.customer_id
     WHERE q.id IN (${ids.map(() => '?').join(',')})
     ORDER BY q.id DESC, r.id DESC`,
    ids
  );

  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id,
        qrcodeId: row.id,
        qrcodeUid: row.qrcodeUid || '',
        token: row.token,
        createdAt: row.createdAt,
        reportCount: 0,
        reportTags: [],
        customerTags: [],
        _customerKeys: new Set()
      });
    }
    const item = byId.get(row.id);
    if (row.productName || row.batchNo) {
      item.reportCount += 1;
      item.reportTags.push({
        productName: row.productName || '',
        batchNo: row.batchNo || '',
        customerName: row.customerName || '',
        customerContact: row.customerContact || ''
      });
    }
    if (row.customerName || row.customerContact) {
      const customerKey = `${row.customerName || ''}\0${row.customerContact || ''}`;
      if (!item._customerKeys.has(customerKey)) {
        item._customerKeys.add(customerKey);
        item.customerTags.push({
          customerName: row.customerName || '',
          customerContact: row.customerContact || ''
        });
      }
    }
  }

  const items = baseRows.map((r) => byId.get(r.id) || {
    id: r.id,
    qrcodeId: r.id,
    qrcodeUid: r.qrcodeUid || '',
    token: r.token,
    createdAt: r.createdAt,
    reportCount: 0,
    reportTags: [],
    customerTags: []
  });
  for (const item of items) {
    delete item._customerKeys;
    attachQrcodeUid(item);
    const scanUrl = `${base}/api/public/qr/${item.token}`;
    try {
      item.qrThumbDataUrl = await QRCode.toDataURL(scanUrl, { margin: 1, width: 72 });
    } catch {
      item.qrThumbDataUrl = '';
    }
  }
  res.json({ items, total, limit, offset });
});

router.get('/:id', requirePermission('qrcodes', 'viewDetail'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const [qrRows] = await pool.query(
    'SELECT id, token, qrcode_uid AS qrcodeUid, created_at AS createdAt FROM qrcodes WHERE id=? LIMIT 1',
    [id]
  );
  const qrcode = qrRows?.[0];
  if (!qrcode) return res.status(404).json({ error: 'NOT_FOUND' });

  const [rRows] = await pool.query(
    `SELECT r.id, r.report_uid AS reportUid, r.report_no AS reportNo, r.batch_no AS batchNo,
            r.product_name AS productName, r.conclusion, r.status,
            c.customer_name AS customerName, c.contact_name AS customerContact
     FROM qrcode_reports qr
     JOIN reports r ON r.id = qr.report_id
     LEFT JOIN sales_customers c ON c.id = r.customer_id
     WHERE qr.qrcode_id = ?
     ORDER BY r.id DESC`,
    [id]
  );

  res.json({
    qrcode: attachQrcodeUid({ ...qrcode, qrcodeId: qrcode.id, reports: rRows })
  });
});

// Get QR image for existing qrcode id (regenerate dataURL)
router.get('/:id/qr', requirePermission('qrcodes', 'viewDetail'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const [qrRows] = await pool.query('SELECT id, token, qrcode_uid AS qrcodeUid FROM qrcodes WHERE id=? LIMIT 1', [id]);
  const qrcode = qrRows?.[0];
  if (!qrcode) return res.status(404).json({ error: 'NOT_FOUND' });

  const base = resolvePublicBaseUrl(req);
  const scanUrl = `${base}/api/public/qr/${qrcode.token}`;
  const dataUrl = await QRCode.toDataURL(scanUrl, { margin: 1, width: 280 });
  res.json(
    attachQrcodeUid({
      id: qrcode.id,
      qrcodeId: qrcode.id,
      token: qrcode.token,
      scanUrl,
      qrDataUrl: dataUrl
    })
  );
});

router.delete('/', requireAnyPermission('qrcodes', ['delete', 'create']), async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { ids } = parsed.data;
  const pool = getPool();
  const [result] = await pool.query(
    `DELETE FROM qrcodes WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  res.json({ ok: true, deletedCount: Number(result?.affectedRows || 0) });
});

