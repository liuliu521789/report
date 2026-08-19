import { describe, it, expect } from 'vitest';
import {
  allocateNextQrcodeUid,
  attachQrcodeUid,
  backfillQrcodeUids,
  buildQrcodeUid,
  normalizeQrcodeUidSearch,
  parseYearSeqUid,
  resolveQrcodeUid
} from './qrcodeUid.js';

describe('buildQrcodeUid', () => {
  it('formats year and 6-digit sequence', () => {
    expect(buildQrcodeUid(2026, 1)).toBe('QR-2026-000001');
    expect(buildQrcodeUid(2026, 123456)).toBe('QR-2026-123456');
  });

  it('rejects invalid seq', () => {
    expect(() => buildQrcodeUid(2026, 0)).toThrow();
    expect(() => buildQrcodeUid(2026, 1000000)).toThrow();
  });
});

describe('parseYearSeqUid', () => {
  it('parses QR-YYYY-NNNNNN', () => {
    expect(parseYearSeqUid('QR-2026-000042')).toEqual({
      year: 2026,
      seq: 42,
      uid: 'QR-2026-000042'
    });
    expect(parseYearSeqUid('qr-2026-000001')?.uid).toBe('QR-2026-000001');
  });

  it('returns null for legacy id-only format', () => {
    expect(parseYearSeqUid('QR-0000000042')).toBe(null);
  });
});

describe('normalizeQrcodeUidSearch', () => {
  it('normalizes valid search input', () => {
    expect(normalizeQrcodeUidSearch('qr-2026-000005')).toBe('QR-2026-000005');
  });
});

describe('attachQrcodeUid', () => {
  it('uses stored qrcode_uid', () => {
    expect(attachQrcodeUid({ id: 5, qrcode_uid: 'QR-2026-000005' })).toEqual({
      id: 5,
      qrcode_uid: 'QR-2026-000005',
      qrcodeUid: 'QR-2026-000005'
    });
  });
});

describe('resolveQrcodeUid', () => {
  it('reads camelCase or snake_case', () => {
    expect(resolveQrcodeUid({ qrcodeUid: 'QR-2026-000001' })).toBe('QR-2026-000001');
    expect(resolveQrcodeUid({ qrcode_uid: 'QR-2026-000002' })).toBe('QR-2026-000002');
  });
});

describe('backfillQrcodeUids', () => {
  it('assigns sequential uids per Beijing year from created_at', async () => {
    const updates = [];
    const pool = {
      query: async (sql, params) => {
        if (sql.includes('SELECT qrcode_uid FROM qrcodes WHERE qrcode_uid IS NOT NULL')) {
          return [[]];
        }
        if (sql.includes('SELECT id, created_at')) {
          return [
            [
              { id: 1, createdAt: '2025-12-31T16:00:00.000Z' },
              { id: 2, createdAt: '2026-01-01T01:00:00.000Z' },
              { id: 3, createdAt: '2026-06-01T00:00:00.000Z' }
            ]
          ];
        }
        if (sql.startsWith('UPDATE qrcodes SET qrcode_uid')) {
          updates.push(params);
          return [{ affectedRows: 1 }];
        }
        return [[]];
      }
    };
    const n = await backfillQrcodeUids(pool);
    expect(n).toBe(3);
    expect(updates[0][0]).toBe('QR-2026-000001');
    expect(updates[1][0]).toBe('QR-2026-000002');
    expect(updates[2][0]).toBe('QR-2026-000003');
  });

  it('continues sequence after existing uids in the same year', async () => {
    const updates = [];
    const pool = {
      query: async (sql, params) => {
        if (sql.includes('SELECT qrcode_uid FROM qrcodes WHERE qrcode_uid IS NOT NULL')) {
          return [[{ qrcode_uid: 'QR-2026-000010' }]];
        }
        if (sql.includes('SELECT id, created_at')) {
          return [[{ id: 11, createdAt: '2026-06-21T04:00:00.000Z' }]];
        }
        if (sql.startsWith('UPDATE qrcodes SET qrcode_uid')) {
          updates.push(params);
          return [{ affectedRows: 1 }];
        }
        return [[]];
      }
    };
    await backfillQrcodeUids(pool);
    expect(updates[0][0]).toBe('QR-2026-000011');
  });
});

describe('allocateNextQrcodeUid', () => {
  it('increments within the same year', async () => {
    const conn = {
      query: async (sql) => {
        if (sql.includes('SELECT qrcode_uid')) {
          return [[{ qrcode_uid: 'QR-2026-000099' }]];
        }
        return [[]];
      }
    };
    const uid = await allocateNextQrcodeUid(conn, new Date('2026-06-21T12:00:00+08:00'));
    expect(uid).toBe('QR-2026-000100');
  });

  it('starts at 000001 when no rows for year', async () => {
    const conn = { query: async () => [[]] };
    const uid = await allocateNextQrcodeUid(conn, new Date('2027-01-01T00:00:00+08:00'));
    expect(uid).toBe('QR-2027-000001');
  });
});
