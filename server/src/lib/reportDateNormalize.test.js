import { describe, expect, it } from 'vitest';
import { normalizeReportFieldValueForDisplay } from './reportDateNormalize.js';

describe('normalizeReportFieldValueForDisplay', () => {
  it('normalizes date fields to { zh, en }', () => {
    expect(
      normalizeReportFieldValueForDisplay('analysis_date', { zh: '2026-3-20', en: '2026-3-20' })
    ).toEqual({ zh: '2026-03-20', en: '2026-03-20' });
  });

  it('preserves inspection_table rows and columnLabels', () => {
    const table = {
      columnLabels: [{ key: 'item', zh: '检验项目', en: 'Test item' }],
      rows: [{ item: { zh: '外观', en: 'Appearance' }, result: { zh: '合格', en: 'Pass' } }]
    };
    expect(normalizeReportFieldValueForDisplay('inspection_table', table)).toEqual(table);
  });

  it('formats numeric inspection result for display', () => {
    const table = {
      resultFormat: 'decimal2',
      columnLabels: [{ key: 'result', zh: '检测值', en: 'Test value' }],
      rows: [{ result: { zh: '61.9700', en: '61.9700' } }]
    };
    const out = normalizeReportFieldValueForDisplay('inspection_table', table);
    expect(out.rows[0].result.zh).toBe('61.97');
  });
});
