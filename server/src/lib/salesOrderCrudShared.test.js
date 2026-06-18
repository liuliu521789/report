import { describe, it, expect } from 'vitest';
import {
  applyLegUnitPriceAndAmount,
  extractUserImportUnitPriceTon,
  randomWyCustomerCode
} from './salesOrderCrudShared.js';

describe('applyLegUnitPriceAndAmount', () => {
  it('returns leg unchanged when unit_price is invalid', () => {
    const leg = { unit_price: 0, quantity: 10, product_name: '0.2吨' };
    expect(applyLegUnitPriceAndAmount(leg)).toBe(leg);
    expect(leg.amount).toBeUndefined();
  });

  it('returns leg unchanged when leg is null', () => {
    expect(applyLegUnitPriceAndAmount(null)).toBeNull();
  });

  it('calculates amount from tons * unit_price when spec is available', () => {
    const leg = { unit_price: 10000, quantity: 18, product_name: '0.2吨' };
    applyLegUnitPriceAndAmount(leg);
    // 18 * 0.2 = 3.6 tons, 10000 * 3.6 = 36000
    expect(leg.amount).toBe(36000);
  });

  it('calculates amount from qty * unit_price when spec has no ton factor', () => {
    const leg = { unit_price: 500, quantity: 10, product_name: '' };
    applyLegUnitPriceAndAmount(leg);
    expect(leg.amount).toBe(5000);
  });

  it('handles kg-based spec', () => {
    const leg = { unit_price: 10000, quantity: 10, product_name: '500kg' };
    applyLegUnitPriceAndAmount(leg);
    // 10 * 0.5 = 5 tons, 10000 * 5 = 50000
    expect(leg.amount).toBe(50000);
  });
});

describe('extractUserImportUnitPriceTon', () => {
  it('returns null for empty inputs', () => {
    expect(extractUserImportUnitPriceTon({}, null, null)).toBeNull();
    expect(extractUserImportUnitPriceTon(null, null, 'price')).toBeNull();
  });

  it('extracts price from data using unitPriceKey (kg → ton conversion)', () => {
    const data = { price: 5 };
    // 5 * 1000 = 5000
    expect(extractUserImportUnitPriceTon(data, null, 'price')).toBe(5000);
  });

  it('handles string price in data', () => {
    const data = { price: '8.5' };
    expect(extractUserImportUnitPriceTon(data, null, 'price')).toBe(8500);
  });

  it('falls back to importUnitPriceTon when no key match', () => {
    const data = { other: 123 };
    // importUnitPriceTon is already in 元/吨
    expect(extractUserImportUnitPriceTon(data, 5000, 'price')).toBe(5000);
  });

  it('returns null for zero or negative importUnitPriceTon', () => {
    expect(extractUserImportUnitPriceTon({}, 0, null)).toBeNull();
    expect(extractUserImportUnitPriceTon({}, -100, null)).toBeNull();
  });

  it('skips empty string value in data', () => {
    const data = { price: '' };
    expect(extractUserImportUnitPriceTon(data, null, 'price')).toBeNull();
  });
});

describe('randomWyCustomerCode', () => {
  it('starts with WY prefix', () => {
    const code = randomWyCustomerCode();
    expect(code.startsWith('WY')).toBe(true);
  });

  it('has correct length (WY + 8 chars)', () => {
    const code = randomWyCustomerCode();
    // WY prefix + up to 8 chars (some special chars replaced)
    expect(code.length).toBeGreaterThanOrEqual(3);
    expect(code.length).toBeLessThanOrEqual(10);
  });

  it('contains only uppercase letters and digits', () => {
    const code = randomWyCustomerCode();
    expect(code).toMatch(/^WY[A-Z0-9]+$/);
  });

  it('generates unique codes', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(randomWyCustomerCode());
    }
    // Very unlikely all 100 are the same
    expect(codes.size).toBeGreaterThan(90);
  });
});
