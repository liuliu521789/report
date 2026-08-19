import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatInspectionResultValue,
  normalizeInspectionTableForDisplay
} from './inspectionResultFormat.js';

test('normalizeInspectionTableForDisplay formats result column for preview', () => {
  const table = {
    resultFormat: 'decimal2',
    rows: [{ result: { zh: '61.9700', en: '61.9700' } }]
  };
  const out = normalizeInspectionTableForDisplay(table);
  assert.equal(out.rows[0].result.zh, '61.97');
});

test('normalizeInspectionTableForDisplay uses raw when present', () => {
  const table = {
    resultFormat: 'decimal2',
    rows: [{ result: { zh: '62', en: '62', raw: '61.9700' } }]
  };
  const out = normalizeInspectionTableForDisplay(table);
  assert.equal(out.rows[0].result.zh, '61.97');
});

test('integer format in preview', () => {
  assert.equal(formatInspectionResultValue('61.9700', 'integer'), '62');
});
