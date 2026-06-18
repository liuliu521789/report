import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  invoiceFieldsFromPartyBuyerItems,
  __test_only_invoiceFieldsFromBodyHtml,
  __test_only_extractTaxRateFromVisual
} from './contractInvoiceAutoFields.js';

describe('invoiceFieldsFromPartyBuyerItems', () => {
  const ctx = {
    buyerName: '测试公司全称',
    address: '上海市浦东新区',
    phone: '021-12345678',
    taxId: '91310000MA1KXXXXXX',
    bank: '中国工商银行',
    account: '6222000012345678'
  };

  it('maps party buyer labels and resolves placeholders', () => {
    const out = invoiceFieldsFromPartyBuyerItems(
      [
        { label: '单位', value: '测试公司' },
        { label: '地址', value: '上海市' },
        { label: '税号', value: '{{CUSTOMER_TAX_ID}}' },
        { label: '开户银行', value: '工行' },
        { label: '账号', value: '6222' }
      ],
      ctx
    );
    assert.equal(out.buyer_name, '测试公司');
    assert.equal(out.buyer_address, '上海市');
    assert.equal(out.buyer_tax_id, '91310000MA1KXXXXXX');
    assert.equal(out.buyer_bank_name, '工行');
    assert.equal(out.buyer_bank_account, '6222');
  });

  it('resolves empty value via fallback placeholders', () => {
    const out = invoiceFieldsFromPartyBuyerItems(
      [
        { label: '单位', value: '', fallback: '{{CUSTOMER_NAME}}' },
        { label: '地址', value: '', fallback: '{{CUSTOMER_ADDRESS}}' },
        { label: '电话', value: '', fallback: '{{CUSTOMER_PHONE}}' },
        { label: '税号', value: '', fallback: '{{CUSTOMER_TAX_ID}}' },
        { label: '开户银行', value: '', fallback: '{{CUSTOMER_BANK}}' },
        { label: '账号', value: '', fallback: '{{CUSTOMER_ACCOUNT}}' }
      ],
      ctx
    );
    assert.equal(out.buyer_name, '测试公司全称');
    assert.equal(out.buyer_address, '上海市浦东新区');
    assert.equal(out.buyer_phone, '021-12345678');
    assert.equal(out.buyer_tax_id, '91310000MA1KXXXXXX');
    assert.equal(out.buyer_bank_name, '中国工商银行');
    assert.equal(out.buyer_bank_account, '6222000012345678');
  });

  it('supports alias labels and placeholder written in value', () => {
    const out = invoiceFieldsFromPartyBuyerItems(
      [
        { label: '购方名称', value: '{{CUSTOMER_NAME}}' },
        { label: '注册地址', value: '{{CUSTOMER_ADDRESS}}' },
        { label: '联系电话', value: '{{CUSTOMER_PHONE}}' },
        { label: '统一社会信用代码', value: '{{CUSTOMER_TAX_ID}}' },
        { label: '开户行', value: '{{CUSTOMER_BANK}}' },
        { label: '银行账号', value: '{{CUSTOMER_ACCOUNT}}' }
      ],
      ctx
    );
    assert.equal(out.buyer_name, '测试公司全称');
    assert.equal(out.buyer_address, '上海市浦东新区');
    assert.equal(out.buyer_phone, '021-12345678');
    assert.equal(out.buyer_tax_id, '91310000MA1KXXXXXX');
    assert.equal(out.buyer_bank_name, '中国工商银行');
    assert.equal(out.buyer_bank_account, '6222000012345678');
  });
});

describe('__test_only_invoiceFieldsFromBodyHtml', () => {
  it('extracts buyer invoice fields from contract html text', () => {
    const html = `
      <div>购方：</div>
      <div>单位：测试客户有限公司</div>
      <div>注册地址：上海市徐汇区测试路1号</div>
      <div>联系电话：021-11112222</div>
      <div>统一社会信用代码：91310000MA1KTEST01</div>
      <div>开户行：中国银行上海分行</div>
      <div>银行账号：1234567890</div>
    `;
    const out = __test_only_invoiceFieldsFromBodyHtml(html);
    assert.equal(out.buyer_name, '测试客户有限公司');
    assert.equal(out.buyer_address, '上海市徐汇区测试路1号');
    assert.equal(out.buyer_phone, '021-11112222');
    assert.equal(out.buyer_tax_id, '91310000MA1KTEST01');
    assert.equal(out.buyer_bank_name, '中国银行上海分行');
    assert.equal(out.buyer_bank_account, '1234567890');
  });
});

describe('__test_only_extractTaxRateFromVisual', () => {
  it('extracts tax rate from 10-column visual table rows', () => {
    const r = __test_only_extractTaxRateFromVisual({
      tableRows: [['品名', '型号', '1130', '1000', '10', '15', '10000', '13%', '1300', '11300']]
    });
    assert.equal(r, 0.13);
  });

  it('extracts tax rate from 9-column visual table rows', () => {
    const r = __test_only_extractTaxRateFromVisual({
      tableRows: [['品名', '型号', '1000', '10', '15', '10000', '9', '900', '10900']]
    });
    assert.equal(r, 0.09);
  });
});
