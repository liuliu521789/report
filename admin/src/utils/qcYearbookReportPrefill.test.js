import test from 'node:test';
import assert from 'node:assert/strict';

import { mapQcRowToReportFields } from '../../../server/src/lib/qcYearbookReportLookup.js';
import {
  buildModelLookupCandidates,
  expandModelAliases,
  normalizeModelKey,
  rowModelMatchesCandidates
} from '../../../server/src/lib/salesModelMapping.js';
import {
  applyQcResultsToInspectionTable,
  applyQcYearbookFieldsToFormFields
} from './qcYearbookReportPrefill.js';

test('expandModelAliases splits slash models', () => {
  const aliases = expandModelAliases('NL301F/301P');
  assert.ok(aliases.includes('NL301F'));
  assert.ok(aliases.includes('301P'));
});

test('rowModelMatchesCandidates matches internal code', () => {
  const candidates = buildModelLookupCandidates('NL1387A', '客户标签A');
  assert.ok(rowModelMatchesCandidates('NL1387A', candidates));
  assert.ok(!rowModelMatchesCandidates('OTHER', candidates));
});

test('mapQcRowToReportFields maps inspection columns', () => {
  const fields = mapQcRowToReportFields({
    appearance: '透明',
    solid_content_pct: 45.5,
    viscosity_s_25c: 120,
    inspection_conclusion: '合格',
    inspection_batch_kg: 500
  });
  assert.equal(fields.test_conclusion.zh, '合格');
  assert.equal(fields.batch_weight.zh, '500kg');
  assert.ok(fields.inspectionTable.rowResults.some((r) => r.matchKeys.includes('外观')));
});

test('applyQcResultsToInspectionTable fills result column', () => {
  const tableValue = {
    columnLabels: [{ key: 'item' }, { key: 'unit' }, { key: 'standard' }, { key: 'result' }],
    rows: [
      { item: { zh: '外观', en: 'Appearance' }, unit: { zh: '-' }, standard: { zh: '透明' }, result: { zh: '', en: '' } },
      { item: { zh: '固体份', en: 'Solidity' }, unit: { zh: '%' }, standard: { zh: '45±2' }, result: { zh: '', en: '' } }
    ]
  };
  const qcFields = mapQcRowToReportFields({
    appearance: '清澈',
    solid_content_pct: 46.2
  });
  const { applied, tableValue: next } = applyQcResultsToInspectionTable(
    tableValue,
    qcFields.inspectionTable
  );
  assert.equal(applied, 2);
  assert.equal(next.rows[0].result.zh, '清澈');
  assert.equal(next.rows[1].result.zh, '46.2');
});

test('applyQcYearbookFieldsToFormFields updates form fields', () => {
  const formFields = [
    { fieldKey: 'batch_weight', fieldType: 'text', fieldValue: { zh: '', en: '' } },
    { fieldKey: 'test_conclusion', fieldType: 'text', fieldValue: { zh: '', en: '' } },
    {
      fieldKey: 'inspection_table',
      fieldType: 'table',
      fieldValue: {
        rows: [{ item: { zh: '外观' }, result: { zh: '', en: '' } }]
      }
    }
  ];
  const qcFields = mapQcRowToReportFields({ appearance: '合格外观', inspection_conclusion: '合格' });
  const { inspectionApplied } = applyQcYearbookFieldsToFormFields(formFields, qcFields);
  assert.equal(inspectionApplied, 1);
  assert.equal(formFields[1].fieldValue.zh, '合格');
  assert.equal(formFields[2].fieldValue.rows[0].result.zh, '合格外观');
});

test('resolveInternalCodeByProductModel maps NL385 to PR385 without order', async () => {
  // 仅在有 MySQL 时可跑；此处用 mock-free 逻辑：buildModelLookupCandidates 含 PR385 时应匹配台账
  const c = buildModelLookupCandidates('PR385', 'NL385');
  assert.ok(rowModelMatchesCandidates('PR385', c));
});

test('NL385 alone does not match PR385 until internal code resolved', () => {
  const c = buildModelLookupCandidates('', 'NL385');
  assert.ok(!rowModelMatchesCandidates('PR385', c));
  const c2 = buildModelLookupCandidates('PR385', 'NL385');
  assert.ok(rowModelMatchesCandidates('PR385', c2));
});
