import { describe, it, expect } from 'vitest';
import { orderListCustomerDisplayName } from './salesOrderCustomerDisplay.js';

describe('orderListCustomerDisplayName', () => {
  it('short mode prefers contact_name', () => {
    expect(
      orderListCustomerDisplayName(
        { customer_name: '某某涂料有限公司', contact_name: '立邦' },
        'short'
      )
    ).toBe('立邦');
  });

  it('full mode prefers customer_name', () => {
    expect(
      orderListCustomerDisplayName(
        { customer_name: '某某涂料有限公司', contact_name: '立邦' },
        'full'
      )
    ).toBe('某某涂料有限公司');
  });

  it('falls back when one side is empty', () => {
    expect(orderListCustomerDisplayName({ customer_name: '仅全称' }, 'short')).toBe('仅全称');
    expect(orderListCustomerDisplayName({ contact_name: '仅简称' }, 'full')).toBe('仅简称');
  });
});
