import { describe, it, expect } from 'vitest';
import { formatDateTime } from './formatDateTime.js';

describe('formatDateTime', () => {
  it('should return empty placeholder for null/undefined/empty', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime('')).toBe('—');
    expect(formatDateTime(null, { empty: 'N/A' })).toBe('N/A');
  });

  it('should format ISO string to YYYY-MM-DD HH:mm:ss', () => {
    const result = formatDateTime('2026-04-14T10:30:45.123Z');
    // Note: Result depends on local timezone. In UTC+8 it becomes 18:30.
    // We check the structure instead of exact time for robustness across environments.
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(result.startsWith('2026-04-14')).toBe(true);
  });

  it('should handle Date object', () => {
    const date = new Date(2026, 3, 14, 10, 30, 45); // month is 0-based
    const result = formatDateTime(date);
    expect(result).toBe('2026-04-14 10:30:45');
  });

  it('should return original string for invalid date', () => {
    expect(formatDateTime('invalid-date')).toBe('invalid-date');
  });
});
