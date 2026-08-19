import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyResultFormatToTable,
  formatInspectionResultValue,
  isNumericInspectionValue,
  syncResultRawFromDisplay
} from './inspectionResultFormat.js';

test('isNumericInspectionValue accepts plain numbers only', () => {
  assert.equal(isNumericInspectionValue('46.2'), true);
  assert.equal(isNumericInspectionValue('透明'), false);
  assert.equal(isNumericInspectionValue('45±2'), false);
  assert.equal(isNumericInspectionValue('<0.5'), false);
});

test('formatInspectionResultValue decimal2 and integer', () => {
  assert.equal(formatInspectionResultValue('46.234', 'decimal2'), '46.23');
  assert.equal(formatInspectionResultValue('46.234', 'integer'), '46');
  assert.equal(formatInspectionResultValue('46.5', 'integer'), '47');
  assert.equal(formatInspectionResultValue('透明', 'integer'), '透明');
  assert.equal(formatInspectionResultValue('46', 'decimal2'), '46.00');
});

test('applyResultFormatToTable updates numeric rows only', () => {
  const tableValue = {
    rows: [
      { result: { zh: '46.234', en: '46.234' } },
      { result: { zh: '合格', en: 'Pass' } }
    ]
  };
  const { applied, tableValue: next } = applyResultFormatToTable(tableValue, 'integer');
  assert.equal(applied, 1);
  assert.equal(next.rows[0].result.zh, '46');
  assert.equal(next.rows[1].result.zh, '合格');
  assert.equal(next.resultFormat, 'integer');
});

test('applyResultFormatToTable preserves raw across format switches', () => {
  const tableValue = {
    rows: [{ result: { zh: '61.9700', en: '61.9700' } }]
  };
  const intTable = applyResultFormatToTable(tableValue, 'integer').tableValue;
  assert.equal(intTable.rows[0].result.zh, '62');
  const decTable = applyResultFormatToTable(intTable, 'decimal2').tableValue;
  assert.equal(decTable.rows[0].result.zh, '61.97');
  assert.equal(decTable.rows[0].result.raw, '61.9700');
});

test('syncResultRawFromDisplay keeps raw when blur without edit', () => {
  const cell = { zh: '62', en: '62', raw: '61.9700' };
  syncResultRawFromDisplay(cell, 'integer');
  assert.equal(cell.raw, '61.9700');
});
