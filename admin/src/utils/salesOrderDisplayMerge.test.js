import { describe, it, expect } from 'vitest';
import {
  legacyRowToDataJson,
  mergeRowDataJson,
  prepareOrderRowForContractHtml,
  diffSalesOrderEditLog
} from './salesOrderDisplayMerge';

describe('legacyRowToDataJson', () => {
  it('returns empty object for null/undefined', () => {
    expect(legacyRowToDataJson(null)).toEqual({});
    expect(legacyRowToDataJson(undefined)).toEqual({});
  });

  it('maps legacy columns to dataJson', () => {
    const row = {
      customer_code: 'C001',
      customer_name: 'Test',
      product_code: 'P001',
      product_name: 'Spec 0.2吨',
      quantity: 10,
      unit_price: 5000,
      amount: 50000
    };
    const result = legacyRowToDataJson(row);
    expect(result.customer_code).toBe('C001');
    expect(result.product_name).toBe('Spec 0.2吨');
    expect(result.quantity).toBe(10);
  });

  it('skips null/undefined/empty values', () => {
    const row = { customer_name: 'Test', product_code: null, remark: '' };
    const result = legacyRowToDataJson(row);
    expect(result).toHaveProperty('customer_name');
    expect(result).not.toHaveProperty('product_code');
    expect(result).not.toHaveProperty('remark');
  });
});

describe('mergeRowDataJson', () => {
  const definitions = [
    { field_key: 'customer_name', maps_to: 'customer_name', is_active: true },
    { field_key: 'product_model', maps_to: 'product_model', is_active: true },
    { field_key: 'quantity', maps_to: 'quantity', is_active: true },
    { field_key: 'price', maps_to: 'unit_price', is_active: true },
    { field_key: 'remark', maps_to: 'remark', is_active: false }
  ];

  it('merges legacy columns into display_data for active fields only', () => {
    const row = { customer_name: 'ABC', product_model: 'M1', quantity: 10, remark: 'note' };
    const { display_data } = mergeRowDataJson(row, definitions);
    expect(display_data.customer_name).toBe('ABC');
    expect(display_data.product_model).toBe('M1');
    expect(display_data).not.toHaveProperty('remark');
  });

  it('merges data_json over legacy columns', () => {
    const row = {
      customer_name: 'Legacy',
      data_json: JSON.stringify({ customer_name: 'FromJSON', product_model: 'M2' })
    };
    const { dataJson, display_data } = mergeRowDataJson(row, definitions);
    expect(dataJson.customer_name).toBe('FromJSON');
    expect(display_data.customer_name).toBe('FromJSON');
  });

  it('overrides price from physical column when positive', () => {
    const row = {
      customer_name: 'ABC',
      unit_price: 8500,
      data_json: JSON.stringify({ price: 5000 })
    };
    const { display_data, dataJson } = mergeRowDataJson(row, definitions);
    expect(display_data.price).toBe(8500);
    expect(dataJson.price).toBe(8500);
  });

  it('handles empty definitions', () => {
    const row = { customer_name: 'ABC' };
    const { display_data } = mergeRowDataJson(row, []);
    expect(display_data).toEqual({});
  });
});

describe('prepareOrderRowForContractHtml', () => {
  const definitions = [
    { field_key: 'customer_name', maps_to: 'customer_name', is_active: true },
    { field_key: 'product_name', maps_to: 'product_name', is_active: true },
    { field_key: 'product_model', maps_to: 'product_model', is_active: true },
    { field_key: 'qty', maps_to: 'quantity', is_active: true },
    { field_key: 'price', maps_to: 'unit_price', is_active: true },
    { field_key: 'amt', maps_to: 'amount', is_active: true }
  ];

  it('returns row as-is for null/empty inputs', () => {
    expect(prepareOrderRowForContractHtml(null, definitions)).toBeNull();
    expect(prepareOrderRowForContractHtml({}, null)).toEqual({});
    expect(prepareOrderRowForContractHtml({}, [])).toEqual({});
  });

  it('picks display_data values and falls back to row', () => {
    const row = {
      customer_name: 'Fallback Name',
      product_name: 'Legacy Spec',
      unit_price: 0,
      data_json: JSON.stringify({ price: 9000 })
    };
    const result = prepareOrderRowForContractHtml(row, definitions);
    expect(result.customer_name).toBe('Fallback Name');
    expect(result.product_name).toBe('Legacy Spec');
    expect(result.unit_price).toBe(9000);
  });

  it('uses JSON value for explicitly picked fields when row value is empty', () => {
    const row = {
      data_json: JSON.stringify({ product_name: 'JSON Spec', price: 8000 })
    };
    const result = prepareOrderRowForContractHtml(row, definitions);
    expect(result.product_name).toBe('JSON Spec');
    expect(result.unit_price).toBe(8000);
  });

  it('includes display_data in output', () => {
    const row = { customer_name: 'Test', product_name: '0.2吨' };
    const result = prepareOrderRowForContractHtml(row, definitions);
    expect(result).toHaveProperty('display_data');
    expect(result.display_data.customer_name).toBe('Test');
  });
});

describe('diffSalesOrderEditLog', () => {
  const definitions = [
    { field_key: 'customer_name', label_zh: '客户名称', maps_to: 'customer_name', is_active: true },
    { field_key: 'quantity', label_zh: '数量', maps_to: 'quantity', is_active: true },
    { field_key: 'unit_price', label_zh: '单价', maps_to: 'unit_price', is_active: true }
  ];

  it('returns changed fields with labels', () => {
    const before = {
      data_json: { customer_name: '甲公司', quantity: '10桶', unit_price: 5000 }
    };
    const after = {
      data_json: { customer_name: '甲公司', quantity: '12桶', unit_price: 5000 }
    };
    const changes = diffSalesOrderEditLog(before, after, definitions);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      field_key: 'quantity',
      label: '数量',
      before: '10桶',
      after: '12桶'
    });
  });

  it('skips unchanged fields', () => {
    const row = { data_json: { customer_name: '甲公司', quantity: '10桶' } };
    expect(diffSalesOrderEditLog(row, row, definitions)).toEqual([]);
  });
});
