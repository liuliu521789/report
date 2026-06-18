import { describe, it, expect } from 'vitest';
import {
  parseQuantityToLegacyNumber,
  specNumericToTonFactor,
  tonsFromQtyAndSpec,
  kgFromQtyAndSpec,
  roundOrderDecimal4,
  grossAmountFromQtySpecUnitPrice,
  grossAmountFromRowDisplayData
} from './salesOrderTonAmount';

describe('parseQuantityToLegacyNumber', () => {
  it('returns 0 for null/empty', () => {
    expect(parseQuantityToLegacyNumber(null)).toBe(0);
    expect(parseQuantityToLegacyNumber('')).toBe(0);
    expect(parseQuantityToLegacyNumber(undefined)).toBe(0);
  });

  it('returns positive numbers as-is', () => {
    expect(parseQuantityToLegacyNumber(5)).toBe(5);
    expect(parseQuantityToLegacyNumber(3.14)).toBe(3.14);
  });

  it('returns 0 for negative or zero', () => {
    expect(parseQuantityToLegacyNumber(0)).toBe(0);
    expect(parseQuantityToLegacyNumber(-3)).toBe(0);
  });

  it('extracts number from string with units', () => {
    expect(parseQuantityToLegacyNumber('18桶')).toBe(18);
    expect(parseQuantityToLegacyNumber('200kg')).toBe(200);
    expect(parseQuantityToLegacyNumber('10.5吨')).toBe(10.5);
  });

  it('returns 0 for non-numeric string', () => {
    expect(parseQuantityToLegacyNumber('abc')).toBe(0);
  });
});

describe('specNumericToTonFactor', () => {
  it('returns null for empty/null', () => {
    expect(specNumericToTonFactor(null)).toBeNull();
    expect(specNumericToTonFactor('')).toBeNull();
  });

  it('returns numeric value for plain spec (ton-based)', () => {
    expect(specNumericToTonFactor('0.2')).toBe(0.2);
    expect(specNumericToTonFactor('1')).toBe(1);
    expect(specNumericToTonFactor('0.5吨')).toBe(0.5);
  });

  it('converts kg-based spec to tons', () => {
    expect(specNumericToTonFactor('200kg')).toBe(0.2);
    expect(specNumericToTonFactor('200千克')).toBe(0.2);
    expect(specNumericToTonFactor('500公斤')).toBe(0.5);
  });
});

describe('tonsFromQtyAndSpec', () => {
  it('returns null for invalid inputs', () => {
    expect(tonsFromQtyAndSpec(null, '0.2')).toBeNull();
    expect(tonsFromQtyAndSpec('18', null)).toBeNull();
    expect(tonsFromQtyAndSpec('', '')).toBeNull();
  });

  it('calculates tons = qty * spec (ton-based)', () => {
    expect(tonsFromQtyAndSpec('18桶', '0.2吨')).toBe(3.6);
    expect(tonsFromQtyAndSpec(10, '0.5')).toBe(5);
  });

  it('calculates tons with kg-based spec', () => {
    expect(tonsFromQtyAndSpec('18桶', '200kg')).toBe(3.6);
    expect(tonsFromQtyAndSpec(10, '500千克')).toBe(5);
  });

  it('rounds to 2 decimal places', () => {
    expect(tonsFromQtyAndSpec(3, '0.333吨')).toBe(1);
    // 0.15kg = 0.00015吨, 100 * 0.00015 = 0.015
    expect(tonsFromQtyAndSpec(100, '0.15kg')).toBe(0.02);
  });
});

describe('kgFromQtyAndSpec', () => {
  it('returns null for invalid inputs', () => {
    expect(kgFromQtyAndSpec(null, '200kg')).toBeNull();
    expect(kgFromQtyAndSpec('18', null)).toBeNull();
  });

  it('calculates kg with kg-based spec', () => {
    expect(kgFromQtyAndSpec('18桶', '200kg')).toBe(3600);
    expect(kgFromQtyAndSpec(10, '500千克')).toBe(5000);
  });

  it('calculates kg with ton-based spec', () => {
    expect(kgFromQtyAndSpec('18桶', '0.2吨')).toBe(3600);
    expect(kgFromQtyAndSpec(10, '0.5')).toBe(5000);
  });
});

describe('roundOrderDecimal4', () => {
  it('returns 0 for null/empty/non-finite', () => {
    expect(roundOrderDecimal4(null)).toBe(0);
    expect(roundOrderDecimal4('')).toBe(0);
    expect(roundOrderDecimal4(NaN)).toBe(0);
    expect(roundOrderDecimal4(Infinity)).toBe(0);
  });

  it('rounds to 4 decimal places', () => {
    expect(roundOrderDecimal4(1.23456)).toBe(1.2346);
    expect(roundOrderDecimal4(1.23454)).toBe(1.2345);
    expect(roundOrderDecimal4(10.00004)).toBe(10);
  });

  it('handles string input', () => {
    expect(roundOrderDecimal4('3.14159')).toBe(3.1416);
  });
});

describe('grossAmountFromQtySpecUnitPrice', () => {
  it('returns null when tons cannot be calculated', () => {
    expect(grossAmountFromQtySpecUnitPrice(null, '0.2', 10)).toBeNull();
    expect(grossAmountFromQtySpecUnitPrice('18', null, 10)).toBeNull();
  });

  it('returns null when unit price is invalid', () => {
    expect(grossAmountFromQtySpecUnitPrice('18', '0.2', 0)).toBeNull();
    expect(grossAmountFromQtySpecUnitPrice('18', '0.2', null)).toBeNull();
  });

  it('calculates gross amount = unitPrice * tons', () => {
    // 18 * 0.2 = 3.6 tons, 10 * 3.6 = 36
    expect(grossAmountFromQtySpecUnitPrice('18', '0.2吨', 10)).toBe(36);
    // 10 * 0.5 = 5 tons, 8.5 * 5 = 42.5
    expect(grossAmountFromQtySpecUnitPrice(10, '0.5', 8.5)).toBe(42.5);
  });
});

describe('grossAmountFromRowDisplayData', () => {
  const definitions = [
    { field_key: 'qty', maps_to: 'quantity', is_active: true },
    { field_key: 'spec', maps_to: 'product_name', is_active: true },
    { field_key: 'price', maps_to: 'unit_price', is_active: true }
  ];

  it('returns null for missing row or definitions', () => {
    expect(grossAmountFromRowDisplayData(null, definitions)).toBeNull();
    expect(grossAmountFromRowDisplayData({}, null)).toBeNull();
    expect(grossAmountFromRowDisplayData({}, [])).toBeNull();
  });

  it('extracts values from display_data and calculates', () => {
    const row = {
      display_data: { qty: '18桶', spec: '200kg', price: 10 }
    };
    // 18 * 0.2 = 3.6 tons, 10 * 3.6 = 36
    expect(grossAmountFromRowDisplayData(row, definitions)).toBe(36);
  });

  it('returns null when required fields are missing', () => {
    const row = { display_data: { qty: '18', price: 10 } };
    expect(grossAmountFromRowDisplayData(row, definitions)).toBeNull();
  });
});
