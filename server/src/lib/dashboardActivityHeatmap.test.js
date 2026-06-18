import { describe, expect, it } from 'vitest';

import {
  addYmdDays,
  buildUtcDayRange,
  formatYmdInTz,
  listHeatmapOptions,
  normalizeRowDateKey,
  packHeatmapDays,
  pickHeatmapSource,
  rowsToCountMap
} from './dashboardActivityHeatmap.js';

const baseCtx = { isSuper: false, canReports: true, canSalesOrders: true, seeAllSales: false, uid: 1 };

describe('dashboardActivityHeatmap', () => {
  it('listHeatmapOptions includes reports and sales when permitted', () => {
    const options = listHeatmapOptions(baseCtx);
    expect(options.map((o) => o.type)).toEqual(['reports', 'sales_orders', 'operations']);
    expect(options.find((o) => o.type === 'sales_orders')?.label).toBe('订单录入');
  });

  it('pickHeatmapSource honors requested type and sales default for录入', () => {
    const options = listHeatmapOptions(baseCtx);
    expect(pickHeatmapSource(options, 'sales_orders')?.type).toBe('sales_orders');
    expect(pickHeatmapSource(options, 'reports')?.type).toBe('reports');
    expect(pickHeatmapSource(options, 'invalid')?.type).toBe('reports');
    expect(pickHeatmapSource(options, null, { preferSalesOrders: true })?.type).toBe('sales_orders');
    expect(pickHeatmapSource(options)?.type).toBe('reports');
  });

  it('sales scope is all when seeAllSales', () => {
    const options = listHeatmapOptions({ ...baseCtx, canReports: false, seeAllSales: true });
    expect(pickHeatmapSource(options, 'sales_orders')?.scope).toBe('all');
  });

  it('packHeatmapDays aggregates total and max', () => {
    const keys = ['2026-06-01', '2026-06-02', '2026-06-03'];
    const map = rowsToCountMap([
      { d: '2026-06-01', c: 2 },
      { d: '2026-06-03', c: 5 }
    ]);
    const { days, total, max } = packHeatmapDays(keys, map);
    expect(days).toEqual([
      { date: '2026-06-01', count: 2 },
      { date: '2026-06-02', count: 0 },
      { date: '2026-06-03', count: 5 }
    ]);
    expect(total).toBe(7);
    expect(max).toBe(5);
  });

  it('buildUtcDayRange is contiguous in Shanghai calendar', () => {
    expect(buildUtcDayRange('2026-06-01', '2026-06-03')).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(addYmdDays('2026-06-01', 1)).toBe('2026-06-02');
  });

  it('formatYmdInTz uses Asia/Shanghai', () => {
    const d = new Date('2026-06-04T18:00:00Z');
    expect(formatYmdInTz(d)).toBe('2026-06-05');
  });

  it('rowsToCountMap accepts mysql2 Date values', () => {
    const map = rowsToCountMap([{ d: new Date('2026-06-04T00:00:00.000Z'), c: 3 }]);
    expect(map['2026-06-04']).toBe(3);
    expect(normalizeRowDateKey(new Date('2026-06-04T00:00:00.000Z'))).toBe('2026-06-04');
  });
});
