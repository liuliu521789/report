import jwt from 'jsonwebtoken';

const PURPOSE = 'wecom_finance_review';

/**
 * 企业微信「财务审核」文本卡片链接 JWT：绑定首笔订单 id，批量提交时 landing 页提示笔数。
 */
export function signWecomFinanceReviewToken(orderId, batchCount = 1) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  const id = Number(orderId);
  const n = Number(batchCount);
  if (!Number.isFinite(id) || id <= 0) {
    const e = new Error('BAD_ORDER_ID');
    e.code = 'BAD_ORDER_ID';
    throw e;
  }
  const bc = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  return jwt.sign({ purpose: PURPOSE, orderId: id, batchCount: bc }, secret, { expiresIn: '14d' });
}

export function verifyWecomFinanceReviewToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  const p = jwt.verify(String(token || ''), secret);
  if (!p || p.purpose !== PURPOSE) {
    const e = new Error('INVALID_TOKEN');
    e.code = 'INVALID_TOKEN';
    throw e;
  }
  const orderId = Number(p.orderId);
  const batchCount = Number(p.batchCount);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    const e = new Error('INVALID_TOKEN');
    e.code = 'INVALID_TOKEN';
    throw e;
  }
  const bc = Number.isFinite(batchCount) && batchCount >= 1 ? Math.floor(batchCount) : 1;
  return { orderId, batchCount: bc };
}
