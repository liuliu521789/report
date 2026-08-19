/** 二维码业务编号：QR-{年份}-{6位序号}，如 QR-2026-000001 */
export const QRCODE_UID_SEQ_LEN = 6;
export const QRCODE_UID_MAX_SEQ = 10 ** QRCODE_UID_SEQ_LEN - 1;
const YEAR_SEQ_RE = /^QR-(\d{4})-(\d{6})$/i;

export function beijingYearFromDate(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric'
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const n = Number(y);
  return Number.isFinite(n) ? n : new Date().getFullYear();
}

export function buildQrcodeUid(year, seq) {
  const y = Number(year);
  const s = Number(seq);
  if (!Number.isFinite(y) || y < 2000 || y > 9999) throw new Error('QRCODE_UID_BAD_YEAR');
  if (!Number.isFinite(s) || s < 1 || s > QRCODE_UID_MAX_SEQ) throw new Error('QRCODE_UID_BAD_SEQ');
  return `QR-${y}-${String(Math.trunc(s)).padStart(QRCODE_UID_SEQ_LEN, '0')}`;
}

export function parseYearSeqUid(uid) {
  const m = YEAR_SEQ_RE.exec(String(uid || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const seq = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(seq) || seq < 1) return null;
  return { year, seq, uid: buildQrcodeUid(year, seq) };
}

/** 搜索框输入 QR-2026-000001 时规范化为标准大小写 */
export function normalizeQrcodeUidSearch(input) {
  const parsed = parseYearSeqUid(input);
  return parsed?.uid || null;
}

/** @deprecated 仅兼容旧展示；新数据应读库字段 qrcode_uid */
export function formatLegacyQrcodeUidFromId(qrcodeId) {
  const n = Number(qrcodeId);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `QR-${String(Math.trunc(n)).padStart(10, '0')}`;
}

export function resolveQrcodeUid(record) {
  if (!record) return '';
  const uid = record.qrcodeUid ?? record.qrcode_uid;
  return uid ? String(uid) : '';
}

export function attachQrcodeUid(record) {
  if (!record) return record;
  const qrcodeUid = resolveQrcodeUid(record);
  return qrcodeUid ? { ...record, qrcodeUid } : { ...record };
}

/** 事务内分配下一个 QR-年份-序号（按北京时间年份，删码不回收序号） */
export async function allocateNextQrcodeUid(conn, at = new Date()) {
  const year = beijingYearFromDate(at);
  const prefix = `QR-${year}-`;
  const [rows] = await conn.query(
    `SELECT qrcode_uid
     FROM qrcodes
     WHERE qrcode_uid LIKE ?
     ORDER BY qrcode_uid DESC
     LIMIT 1
     FOR UPDATE`,
    [`${prefix}%`]
  );
  let next = 1;
  const parsed = parseYearSeqUid(rows?.[0]?.qrcode_uid);
  if (parsed?.year === year) next = parsed.seq + 1;
  return buildQrcodeUid(year, next);
}

/** 为历史数据按 created_at（北京时间年份）补全 qrcode_uid */
export async function backfillQrcodeUids(pool) {
  const counters = new Map();
  const [existing] = await pool.query(
    `SELECT qrcode_uid FROM qrcodes WHERE qrcode_uid IS NOT NULL AND TRIM(qrcode_uid) <> ''`
  );
  for (const row of existing) {
    const parsed = parseYearSeqUid(row.qrcode_uid);
    if (!parsed) continue;
    const prev = counters.get(parsed.year) || 0;
    if (parsed.seq > prev) counters.set(parsed.year, parsed.seq);
  }

  const [rows] = await pool.query(
    `SELECT id, created_at AS createdAt
     FROM qrcodes
     WHERE qrcode_uid IS NULL OR TRIM(qrcode_uid) = ''
     ORDER BY created_at ASC, id ASC`
  );
  if (!rows.length) return 0;

  let updated = 0;
  for (const row of rows) {
    const year = beijingYearFromDate(row.createdAt);
    const next = (counters.get(year) || 0) + 1;
    counters.set(year, next);
    const uid = buildQrcodeUid(year, next);
    await pool.query('UPDATE qrcodes SET qrcode_uid = ? WHERE id = ?', [uid, row.id]);
    updated += 1;
  }
  return updated;
}
