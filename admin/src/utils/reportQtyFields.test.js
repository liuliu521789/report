import { describe, expect, it } from 'vitest';
import {
  formatPackingValue,
  formatReportQtyKg,
  parseReportQtyNumber,
  specTextToPackingKg
} from './reportQtyFields.js';

describe('parseReportQtyNumber', () => {
  it('extracts number from mixed unit text', () => {
    expect(parseReportQtyNumber('13400kg')).toBe(13400);
    expect(parseReportQtyNumber('200KG/桶')).toBe(200);
    expect(parseReportQtyNumber('10.5吨')).toBe(10.5);
  });
});

describe('formatReportQtyKg', () => {
  it('uses fixed lowercase kg for zh and en', () => {
    expect(formatReportQtyKg(13400)).toEqual({ zh: '13400kg', en: '13400 kg' });
    expect(formatPackingValue(200)).toEqual({ zh: '200kg', en: '200 kg' });
  });
});

describe('specTextToPackingKg', () => {
  it('converts ton spec to kg', () => {
    expect(specTextToPackingKg('0.2吨')).toBe(200);
    expect(specTextToPackingKg('200kg')).toBe(200);
  });
});
