import { describe, expect, it } from 'vitest';
import { normalizeReportDateInput, normalizeReportDateFieldValue } from './reportDate.js';

describe('normalizeReportDateInput', () => {
  it('normalizes ISO date with single-digit month/day', () => {
    expect(normalizeReportDateInput('2026-3-20')).toBe('2026-03-20');
    expect(normalizeReportDateInput('2026-03-5')).toBe('2026-03-05');
  });

  it('normalizes slash and dot separators', () => {
    expect(normalizeReportDateInput('2026/3/20')).toBe('2026-03-20');
    expect(normalizeReportDateInput('2026.03.20')).toBe('2026-03-20');
  });

  it('normalizes Chinese date text', () => {
    expect(normalizeReportDateInput('2026年3月20日')).toBe('2026-03-20');
  });

  it('returns empty for nullish', () => {
    expect(normalizeReportDateInput(null)).toBe('');
    expect(normalizeReportDateInput('')).toBe('');
  });

  it('normalizes plain string field values', () => {
    expect(normalizeReportDateFieldValue('2026-3-20')).toEqual({
      zh: '2026-03-20',
      en: '2026-03-20'
    });
  });
});
