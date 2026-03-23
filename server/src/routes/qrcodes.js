import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { nanoid } from 'nanoid';

import { getPool } from '../db/pool.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';

export const router = Router();

router.use(requireAuth);

const createSchema = z.object({
  reportIds: z.array(z.number().int().positive()).min(1).max(200)
});

router.post('/', requirePermission('qrcodes', 'create'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { reportIds } = parsed.data;

  const token = nanoid(24);
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [qrRes] = await conn.query(
      'INSERT INTO qrcodes (token, created_by) VALUES (?, ?)',
      [token, req.user.userId]
    );
    const qrcodeId = qrRes.insertId;

    // ensure reports exist (and not deleted); allow void reports to still be bound? We'll allow but client can see status.
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

    const base = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const scanUrl = `${base}/qr/${token}`;
    const dataUrl = await QRCode.toDataURL(scanUrl, { margin: 1, width: 280 });
    res.status(201).json({ id: qrcodeId, token, scanUrl, qrDataUrl: dataUrl });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.get('/', requirePermission('qrcodes', 'list'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT q.id, q.token, q.created_at AS createdAt,
            (SELECT COUNT(*) FROM qrcode_reports qr WHERE qr.qrcode_id = q.id) AS reportCount
     FROM qrcodes q
     ORDER BY q.id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  res.json({ items: rows });
});

router.get('/:id', requirePermission('qrcodes', 'viewDetail'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const [qrRows] = await pool.query(
    'SELECT id, token, created_at AS createdAt FROM qrcodes WHERE id=? LIMIT 1',
    [id]
  );
  const qrcode = qrRows?.[0];
  if (!qrcode) return res.status(404).json({ error: 'NOT_FOUND' });

  const [rRows] = await pool.query(
    `SELECT r.id, r.report_no AS reportNo, r.batch_no AS batchNo, r.product_name AS productName, r.conclusion, r.status
     FROM qrcode_reports qr
     JOIN reports r ON r.id = qr.report_id
     WHERE qr.qrcode_id = ?
     ORDER BY r.id DESC`,
    [id]
  );

  res.json({ qrcode: { ...qrcode, reports: rRows } });
});

// Get QR image for existing qrcode id (regenerate dataURL)
router.get('/:id/qr', requirePermission('qrcodes', 'viewDetail'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const [qrRows] = await pool.query('SELECT id, token FROM qrcodes WHERE id=? LIMIT 1', [id]);
  const qrcode = qrRows?.[0];
  if (!qrcode) return res.status(404).json({ error: 'NOT_FOUND' });

  const base = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  const scanUrl = `${base}/qr/${qrcode.token}`;
  const dataUrl = await QRCode.toDataURL(scanUrl, { margin: 1, width: 280 });
  res.json({ id: qrcode.id, token: qrcode.token, scanUrl, qrDataUrl: dataUrl });
});

