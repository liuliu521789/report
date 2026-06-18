import { describe, it, expect } from 'vitest';
import { normalizeCustomerLookupKey, compactCustomerLookupKey } from './salesCustomerMatch.js';

describe('salesCustomerMatch', () => {
  it('trims lookup keys', () => {
    expect(normalizeCustomerLookupKey('  华信  ')).toBe('华信');
  });

  it('compacts whitespace in lookup keys', () => {
    expect(compactCustomerLookupKey('华 信')).toBe('华信');
  });
});
