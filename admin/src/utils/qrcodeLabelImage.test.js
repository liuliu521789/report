import { describe, it, expect } from 'vitest';
import {
  DEFAULT_QRCODE_LABEL_FIELDS,
  composeQrcodeLabelLines,
  enrichReportsForQrcodeLabel,
  formatQrcodeLabelCustomer,
  formatQrcodeLabelLayout,
  formatQrcodeLabelLines,
  mmToPx,
  QRCODE_LABEL_DPI,
  resolveQrcodeLabelPreset,
  qrcodeLabelFieldsToOptions
} from './qrcodeLabelImage';

describe('qrcodeLabelFieldsToOptions', () => {
  it('maps checkbox values to options', () => {
    expect(qrcodeLabelFieldsToOptions(['product', 'batch'])).toEqual({
      qrcodeUid: false,
      product: true,
      batch: true,
      customer: false
    });
  });
});

describe('label preset helpers', () => {
  it('converts mm to px at 203dpi', () => {
    expect(mmToPx(50, QRCODE_LABEL_DPI)).toBe(400);
    expect(mmToPx(30, QRCODE_LABEL_DPI)).toBe(240);
  });

  it('falls back to default preset', () => {
    expect(resolveQrcodeLabelPreset('unknown').widthMm).toBe(50);
    expect(resolveQrcodeLabelPreset('60x40').heightMm).toBe(40);
  });
});

describe('formatQrcodeLabelCustomer', () => {
  it('prefers short name (contact_name) for labels', () => {
    expect(
      formatQrcodeLabelCustomer({
        customerName: '某某化工有限公司',
        customerContact: '某某化工'
      })
    ).toBe('某某化工');
  });
});

describe('composeQrcodeLabelLines', () => {
  it('returns empty when nothing selected', () => {
    expect(composeQrcodeLabelLines([{ batchNo: 'A' }], {})).toEqual([]);
  });

  it('single report: header line then product/batch pair', () => {
    expect(
      composeQrcodeLabelLines(
        [{ productName: 'NL3010-60', batchNo: '202603184', customerContact: '华信' }],
        qrcodeLabelFieldsToOptions(DEFAULT_QRCODE_LABEL_FIELDS),
        { qrcodeUid: 'QR-2026-000004' }
      )
    ).toEqual(['QR-2026-000004/华信', 'NL3010-60/202603184']);
  });

  it('multiple reports: header then pairs on one line', () => {
    expect(
      composeQrcodeLabelLines(
        [
          { productName: '产品甲', batchNo: 'A', customerName: '甲公司' },
          { productName: '产品乙', batchNo: 'B', customerName: '乙公司' }
        ],
        qrcodeLabelFieldsToOptions(['qrcodeUid', 'product', 'batch', 'customer']),
        { qrcodeUid: 'QR-2026-000002' }
      )
    ).toEqual(['QR-2026-000002/甲公司/乙公司', '产品甲/A · 产品乙/B']);
  });

  it('product/batch only on one pair line', () => {
    expect(
      composeQrcodeLabelLines(
        [{ productName: 'NL3010-60', batchNo: '202603184' }],
        qrcodeLabelFieldsToOptions(['product', 'batch'])
      )
    ).toEqual(['NL3010-60/202603184']);
  });

  it('customer only on header line', () => {
    expect(
      composeQrcodeLabelLines(
        [{ customerName: '甲公司' }, { customerName: '乙公司' }],
        qrcodeLabelFieldsToOptions(['customer'])
      )
    ).toEqual(['甲公司/乙公司']);
  });
});

describe('formatQrcodeLabelLayout', () => {
  it('returns line items', () => {
    expect(
      formatQrcodeLabelLayout(
        [{ productName: '产品甲', batchNo: 'A', customerContact: 'XX' }],
        qrcodeLabelFieldsToOptions(['product', 'batch', 'customer', 'qrcodeUid']),
        { qrcodeUid: 'QR-2026-000001' }
      )
    ).toEqual([
      { type: 'line', text: 'QR-2026-000001/XX' },
      { type: 'line', text: '产品甲/A' }
    ]);
  });
});

describe('formatQrcodeLabelLines', () => {
  it('aliases composeQrcodeLabelLines', () => {
    expect(
      formatQrcodeLabelLines(
        [{ productName: '产品甲', batchNo: 'A' }],
        qrcodeLabelFieldsToOptions(['product', 'batch'])
      )
    ).toEqual(['产品甲/A']);
  });
});

describe('enrichReportsForQrcodeLabel', () => {
  it('fills missing customer from fallback reportTags', () => {
    const enriched = enrichReportsForQrcodeLabel(
      [{ id: 1, productName: 'P1', batchNo: 'A' }],
      [{ id: 1, productName: 'P1', batchNo: 'A', customerName: '甲公司' }]
    );
    expect(formatQrcodeLabelCustomer(enriched[0])).toBe('甲公司');
  });
});
