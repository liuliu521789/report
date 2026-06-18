import { describe, it, expect } from 'vitest';
import {
  MAPS_TO_KEYS,
  normalizeOrderDateInput,
  roundOrderDecimal4,
  parseQuantityToLegacyNumber,
  specNumericToTonFactor,
  tonsFromQtyAndSpec,
  legacyRowToDataJson,
  dataJsonToLegacyColumns,
  validateOrderDataInput,
  splitLabelWarehouseCell,
  importHeaderSynonymsForField
} from './salesOrderFields.js';

describe('MAPS_TO_KEYS', () => {
  it('contains expected keys', () => {
    expect(MAPS_TO_KEYS.has('customer_name')).toBe(true);
    expect(MAPS_TO_KEYS.has('quantity')).toBe(true);
    expect(MAPS_TO_KEYS.has('unit_price')).toBe(true);
    expect(MAPS_TO_KEYS.has('nonexistent')).toBe(false);
  });
});

describe('normalizeOrderDateInput', () => {
  it('returns empty error for null/undefined', () => {
    expect(normalizeOrderDateInput(null)).toEqual({ ok: false, error: 'empty' });
    expect(normalizeOrderDateInput(undefined)).toEqual({ ok: false, error: 'empty' });
  });

  it('handles Date object', () => {
    const d = new Date(2025, 2, 15); // March 15, 2025
    const result = normalizeOrderDateInput(d);
    expect(result.ok).toBe(true);
    expect(result.value).toBe('2025-03-15');
  });

  it('handles YYYY-MM-DD string', () => {
    expect(normalizeOrderDateInput('2025-03-15')).toEqual({ ok: true, value: '2025-03-15' });
  });

  it('handles YYYY/MM/DD string', () => {
    expect(normalizeOrderDateInput('2025/3/15')).toEqual({ ok: true, value: '2025-03-15' });
  });

  it('handles Chinese date format', () => {
    expect(normalizeOrderDateInput('2025年3月15日')).toEqual({ ok: true, value: '2025-03-15' });
  });

  it('handles MM/DD with current year', () => {
    const yNow = new Date().getFullYear();
    const result = normalizeOrderDateInput('3/15');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(`${yNow}-03-15`);
  });

  it('handles month day Chinese format', () => {
    const yNow = new Date().getFullYear();
    const result = normalizeOrderDateInput('3月15日');
    expect(result.ok).toBe(true);
    expect(result.value).toBe(`${yNow}-03-15`);
  });

  it('handles Excel serial date', () => {
    // 45292 = 2024-01-01 in Excel
    const result = normalizeOrderDateInput(45292);
    expect(result.ok).toBe(true);
    expect(result.value).toBe('2024-01-01');
  });

  it('returns parse error for garbage string', () => {
    expect(normalizeOrderDateInput('not a date')).toEqual({ ok: false, error: 'parse' });
  });

  it('handles empty string', () => {
    expect(normalizeOrderDateInput('')).toEqual({ ok: false, error: 'empty' });
  });

  it('handles whitespace-only string', () => {
    expect(normalizeOrderDateInput('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('strips time portion from datetime string', () => {
    const result = normalizeOrderDateInput('2025-03-15T10:30:00');
    expect(result.ok).toBe(true);
    expect(result.value).toBe('2025-03-15');
  });

  it('handles YYYYMMDD format', () => {
    expect(normalizeOrderDateInput('20250315')).toEqual({ ok: true, value: '2025-03-15' });
  });

  it('handles DD/MM/YYYY format', () => {
    expect(normalizeOrderDateInput('15/03/2025')).toEqual({ ok: true, value: '2025-03-15' });
  });
});

describe('roundOrderDecimal4', () => {
  it('returns 0 for null/empty', () => {
    expect(roundOrderDecimal4(null)).toBe(0);
    expect(roundOrderDecimal4('')).toBe(0);
  });

  it('returns 0 for non-finite', () => {
    expect(roundOrderDecimal4(NaN)).toBe(0);
    expect(roundOrderDecimal4(Infinity)).toBe(0);
  });

  it('rounds to 4 decimal places', () => {
    expect(roundOrderDecimal4(1.23456)).toBe(1.2346);
    expect(roundOrderDecimal4(1.23454)).toBe(1.2345);
  });

  it('handles string input', () => {
    expect(roundOrderDecimal4('3.14159')).toBe(3.1416);
  });
});

describe('parseQuantityToLegacyNumber', () => {
  it('returns 0 for null/empty', () => {
    expect(parseQuantityToLegacyNumber(null)).toBe(0);
    expect(parseQuantityToLegacyNumber('')).toBe(0);
  });

  it('returns positive numbers as-is', () => {
    expect(parseQuantityToLegacyNumber(5)).toBe(5);
  });

  it('returns 0 for negative', () => {
    expect(parseQuantityToLegacyNumber(-3)).toBe(0);
  });

  it('extracts number from string with units', () => {
    expect(parseQuantityToLegacyNumber('18桶')).toBe(18);
    expect(parseQuantityToLegacyNumber('10.5吨')).toBe(10.5);
  });
});

describe('specNumericToTonFactor', () => {
  it('returns null for empty', () => {
    expect(specNumericToTonFactor(null)).toBeNull();
    expect(specNumericToTonFactor('')).toBeNull();
  });

  it('returns numeric value for ton-based spec', () => {
    expect(specNumericToTonFactor('0.2')).toBe(0.2);
    expect(specNumericToTonFactor('0.5吨')).toBe(0.5);
  });

  it('converts kg-based spec to tons', () => {
    expect(specNumericToTonFactor('200kg')).toBe(0.2);
    expect(specNumericToTonFactor('500千克')).toBe(0.5);
    expect(specNumericToTonFactor('500公斤')).toBe(0.5);
  });
});

describe('tonsFromQtyAndSpec', () => {
  it('returns null for invalid inputs', () => {
    expect(tonsFromQtyAndSpec(null, '0.2')).toBeNull();
    expect(tonsFromQtyAndSpec('10', null)).toBeNull();
  });

  it('calculates tons = qty * spec', () => {
    expect(tonsFromQtyAndSpec('18桶', '0.2吨')).toBe(3.6);
    expect(tonsFromQtyAndSpec(10, '0.5')).toBe(5);
  });

  it('handles kg-based spec', () => {
    expect(tonsFromQtyAndSpec('18桶', '200kg')).toBe(3.6);
  });

  it('rounds to 2 decimal places', () => {
    expect(tonsFromQtyAndSpec(3, '0.333吨')).toBe(1);
  });
});

describe('legacyRowToDataJson', () => {
  it('returns empty for null', () => {
    expect(legacyRowToDataJson(null)).toEqual({});
  });

  it('maps legacy columns', () => {
    const row = { customer_name: 'Test', quantity: 10 };
    const result = legacyRowToDataJson(row);
    expect(result.customer_name).toBe('Test');
    expect(result.quantity).toBe(10);
  });

  it('skips null/empty values', () => {
    const row = { customer_name: 'Test', product_code: null };
    const result = legacyRowToDataJson(row);
    expect(result).not.toHaveProperty('product_code');
  });
});

describe('dataJsonToLegacyColumns', () => {
  const definitions = [
    { field_key: 'customer_name', maps_to: 'customer_name', is_active: true },
    { field_key: 'product_name', maps_to: 'product_name', is_active: true },
    { field_key: 'product_code', maps_to: 'product_code', is_active: true },
    { field_key: 'product_model', maps_to: 'product_model', is_active: true },
    { field_key: 'warehouse_model', maps_to: 'warehouse_model', is_active: true },
    { field_key: 'qty', maps_to: 'quantity', is_active: true },
    { field_key: 'price', maps_to: 'unit_price', is_active: true },
    { field_key: 'amt', maps_to: 'amount', is_active: true },
    { field_key: 'note', maps_to: 'remark', is_active: true }
  ];

  it('maps data_json to legacy columns', () => {
    const data = {
      customer_name: 'Test',
      product_name: 'Spec',
      qty: '10',
      price: '5000'
    };
    const result = dataJsonToLegacyColumns(definitions, data);
    expect(result.product_name).toBe('Spec');
    expect(result.quantity).toBe(10);
    expect(result.unit_price).toBe(5000);
  });

  it('calculates amount from tons * unit_price when amount not explicit', () => {
    const data = { qty: '18桶', product_name: '0.2吨', price: '10000' };
    const result = dataJsonToLegacyColumns(definitions, data);
    // 18 * 0.2 = 3.6 tons, 10000 * 3.6 = 36000
    expect(result.amount).toBe(36000);
  });

  it('uses explicit amount when provided', () => {
    const data = { qty: '10', price: '5000', amt: '99999' };
    const result = dataJsonToLegacyColumns(definitions, data);
    expect(result.amount).toBe(99999);
  });

  it('truncates string fields', () => {
    const data = { product_code: 'x'.repeat(200), note: 'y'.repeat(2000) };
    const result = dataJsonToLegacyColumns(definitions, data);
    expect(result.product_code.length).toBeLessThanOrEqual(128);
    expect(result.remark.length).toBeLessThanOrEqual(1024);
  });
});

describe('validateOrderDataInput', () => {
  const definitions = [
    { field_key: 'customer_name', label_zh: '厂家', field_type: 'text', required: true, is_active: true, maps_to: 'customer_name' },
    { field_key: 'product_name', label_zh: '规格', field_type: 'text', required: false, is_active: true, maps_to: 'product_name' },
    { field_key: 'qty', label_zh: '数量', field_type: 'number', required: false, is_active: true, maps_to: 'quantity' }
  ];

  it('reports errors for missing required fields', () => {
    const { errors, data } = validateOrderDataInput(definitions, {});
    expect(errors.length).toBe(1);
    expect(errors[0].field_key).toBe('customer_name');
  });

  it('passes with required field provided', () => {
    const { errors } = validateOrderDataInput(definitions, { customer_name: 'Test' });
    expect(errors.length).toBe(0);
  });

  it('normalizes number fields for quantity', () => {
    const { data } = validateOrderDataInput(definitions, { customer_name: 'Test', qty: '10.5' });
    expect(data.qty).toBe(10.5);
  });

  it('handles null input gracefully', () => {
    const { errors, data } = validateOrderDataInput(definitions, null);
    expect(errors.length).toBe(1);
  });
});

describe('splitLabelWarehouseCell', () => {
  it('returns empty for null/empty', () => {
    expect(splitLabelWarehouseCell(null)).toEqual({ label: '', warehouse: '' });
    expect(splitLabelWarehouseCell('')).toEqual({ label: '', warehouse: '' });
  });

  it('splits by slash', () => {
    expect(splitLabelWarehouseCell('ABC/XYZ')).toEqual({ label: 'ABC', warehouse: 'XYZ' });
  });

  it('splits by fullwidth slash', () => {
    expect(splitLabelWarehouseCell('ABC／XYZ')).toEqual({ label: 'ABC', warehouse: 'XYZ' });
  });

  it('returns label only when no slash', () => {
    expect(splitLabelWarehouseCell('ABC')).toEqual({ label: 'ABC', warehouse: '' });
  });

  it('trims whitespace', () => {
    expect(splitLabelWarehouseCell('  ABC / XYZ  ')).toEqual({ label: 'ABC', warehouse: 'XYZ' });
  });
});

describe('importHeaderSynonymsForField', () => {
  it('returns empty for null', () => {
    expect(importHeaderSynonymsForField(null)).toEqual([]);
  });

  it('includes label_zh', () => {
    const result = importHeaderSynonymsForField({ label_zh: '厂家', field_key: 'customer_name', maps_to: 'customer_name' });
    expect(result).toContain('厂家');
  });

  it('adds date synonyms for order_date', () => {
    const result = importHeaderSynonymsForField({ label_zh: '发货日期', field_key: 'order_date', maps_to: null });
    expect(result).toContain('日期');
    expect(result).toContain('送货日期');
  });

  it('adds price synonyms for unit_price mapping', () => {
    const result = importHeaderSynonymsForField({ label_zh: '单价', field_key: 'price', maps_to: 'unit_price' });
    expect(result).toContain('价格');
    expect(result).toContain('含税单价');
  });

  it('adds combined headers for product_model', () => {
    const result = importHeaderSynonymsForField({ label_zh: '标签型号', field_key: 'product_model', maps_to: 'product_model' });
    expect(result).toContain('标签型号/仓库型号');
  });

  it('deduplicates synonyms', () => {
    const result = importHeaderSynonymsForField({ label_zh: '发货日期', field_key: 'order_date', maps_to: null });
    const unique = [...new Set(result)];
    expect(result.length).toBe(unique.length);
  });
});
