import { describe, it, expect } from 'vitest';
import { listQuerySchema } from './salesOrderListQuerySchema.js';

describe('listQuerySchema', () => {
  it('applies defaults for empty input', () => {
    const result = listQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(20);
    expect(result.sort).toBe('created_at_desc');
  });

  it('parses optional filter fields', () => {
    const result = listQuerySchema.parse({
      customer_name: 'Test',
      status: 'pending_review',
      product_model: 'M1'
    });
    expect(result.customer_name).toBe('Test');
    expect(result.status).toBe('pending_review');
    expect(result.product_model).toBe('M1');
  });

  it('coerces id to positive integer', () => {
    const result = listQuerySchema.parse({ id: '42' });
    expect(result.id).toBe(42);
  });

  it('rejects negative id', () => {
    expect(() => listQuerySchema.parse({ id: '-1' })).toThrow();
  });

  it('validates page_size values', () => {
    expect(listQuerySchema.parse({ page_size: 10 }).page_size).toBe(10);
    expect(listQuerySchema.parse({ page_size: 50 }).page_size).toBe(50);
    expect(listQuerySchema.parse({ page_size: 100 }).page_size).toBe(100);
    expect(listQuerySchema.parse({ page_size: 200 }).page_size).toBe(200);
    expect(listQuerySchema.parse({ page_size: 500 }).page_size).toBe(500);
  });

  it('rejects invalid page_size', () => {
    expect(() => listQuerySchema.parse({ page_size: 15 })).toThrow();
    expect(() => listQuerySchema.parse({ page_size: 300 })).toThrow();
  });

  it('defaults page_size to 20 when empty/null', () => {
    expect(listQuerySchema.parse({ page_size: undefined }).page_size).toBe(20);
    expect(listQuerySchema.parse({ page_size: null }).page_size).toBe(20);
    expect(listQuerySchema.parse({ page_size: '' }).page_size).toBe(20);
  });

  it('validates sort enum', () => {
    expect(listQuerySchema.parse({ sort: 'created_at_asc' }).sort).toBe('created_at_asc');
    expect(listQuerySchema.parse({ sort: 'customer_name_desc' }).sort).toBe('customer_name_desc');
  });

  it('rejects invalid sort value', () => {
    expect(() => listQuerySchema.parse({ sort: 'invalid_sort' })).toThrow();
  });

  it('coerces boolean preprocessors', () => {
    const r1 = listQuerySchema.parse({ pending_finance_only: '1' });
    expect(r1.pending_finance_only).toBe(true);

    const r2 = listQuerySchema.parse({ pending_finance_only: 'true' });
    expect(r2.pending_finance_only).toBe(true);

    const r3 = listQuerySchema.parse({ pending_finance_only: true });
    expect(r3.pending_finance_only).toBe(true);
  });

  it('coerces sales_user_id to number', () => {
    const result = listQuerySchema.parse({ sales_user_id: '5' });
    expect(result.sales_user_id).toBe(5);
  });

  it('validates flow_bucket enum', () => {
    const result = listQuerySchema.parse({ flow_bucket: 'pending_finance' });
    expect(result.flow_bucket).toBe('pending_finance');
    expect(listQuerySchema.parse({ flow_bucket: 'finance_rejected' }).flow_bucket).toBe('finance_rejected');
    expect(listQuerySchema.parse({ flow_bucket: 'qc_rejected' }).flow_bucket).toBe('qc_rejected');
  });

  it('rejects invalid flow_bucket', () => {
    expect(() => listQuerySchema.parse({ flow_bucket: 'invalid' })).toThrow();
  });

  it('coerces page to positive integer', () => {
    const result = listQuerySchema.parse({ page: '3' });
    expect(result.page).toBe(3);
  });

  it('rejects page < 1', () => {
    expect(() => listQuerySchema.parse({ page: 0 })).toThrow();
  });

  it('parses customer_list_name_mode with default short', () => {
    expect(listQuerySchema.parse({}).customer_list_name_mode).toBe('short');
    expect(listQuerySchema.parse({ customer_list_name_mode: 'full' }).customer_list_name_mode).toBe('full');
  });

  it('rejects invalid customer_list_name_mode', () => {
    expect(() => listQuerySchema.parse({ customer_list_name_mode: 'alias' })).toThrow();
  });
});
