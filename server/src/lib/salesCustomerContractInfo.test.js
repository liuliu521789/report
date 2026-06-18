import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBuyerFieldsForContract } from './salesCustomerContractInfo.js';

describe('resolveBuyerFieldsForContract', () => {
  it('fills missing buyer fields from resolved legal customer row', async () => {
    const calls = [];
    const conn = {
      async query(sql, args) {
        calls.push({ sql, args });
        return [[{
          address: '上海市浦东新区世纪大道100号',
          contact_person: '张三',
          phone: '021-88886666',
          fax: '021-88880000',
          bank_name: '中国建设银行上海分行',
          bank_account: '621700001234567890',
          tax_id: '91310000MA1KABCDE1'
        }]];
      }
    };

    const out = await resolveBuyerFieldsForContract(
      conn,
      {
        customer_address: '',
        customer_contact: '',
        customer_phone: '',
        customer_fax: '',
        customer_bank: '',
        customer_account: '',
        customer_tax_id: ''
      },
      '上海测试客户有限公司',
      '测试客户'
    );

    assert.equal(out.address, '上海市浦东新区世纪大道100号');
    assert.equal(out.contact, '张三');
    assert.equal(out.phone, '021-88886666');
    assert.equal(out.fax, '021-88880000');
    assert.equal(out.bank, '中国建设银行上海分行');
    assert.equal(out.account, '621700001234567890');
    assert.equal(out.taxId, '91310000MA1KABCDE1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[0], '上海测试客户有限公司');
  });

  it('keeps original non-empty values and only backfills empty ones', async () => {
    const conn = {
      async query() {
        return [[{
          address: '上海市静安区A路',
          contact_person: '李四',
          phone: '021-66668888',
          fax: '021-66660000',
          bank_name: '中国银行上海分行',
          bank_account: '95566000123456789',
          tax_id: '91310000MA1KZZZZZ2'
        }]];
      }
    };

    const out = await resolveBuyerFieldsForContract(
      conn,
      {
        customer_address: '已有地址',
        customer_contact: '',
        customer_phone: '',
        customer_fax: '',
        customer_bank: '',
        customer_account: '已有账号',
        customer_tax_id: ''
      },
      '上海测试客户有限公司',
      '测试客户'
    );

    assert.equal(out.address, '已有地址');
    assert.equal(out.contact, '李四');
    assert.equal(out.phone, '021-66668888');
    assert.equal(out.fax, '021-66660000');
    assert.equal(out.bank, '中国银行上海分行');
    assert.equal(out.account, '已有账号');
    assert.equal(out.taxId, '91310000MA1KZZZZZ2');
  });
});
