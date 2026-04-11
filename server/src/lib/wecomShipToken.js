import jwt from 'jsonwebtoken';

const PURPOSE = 'wecom_order_ship';

/**
 * 企业微信「完成发货」链接用 JWT（依赖 PUBLIC_BASE_URL 拼绝对地址）。
 * 与登录 JWT 共用 JWT_SECRET；payload 含 purpose 以免误用。
 */
export function signWecomShipToken(orderId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  const id = Number(orderId);
  if (!Number.isFinite(id) || id <= 0) {
    const e = new Error('BAD_ORDER_ID');
    e.code = 'BAD_ORDER_ID';
    throw e;
  }
  return jwt.sign({ purpose: PURPOSE, orderId: id }, secret, { expiresIn: '30d' });
}

export function verifyWecomShipToken(token) {
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
  const id = Number(p.orderId);
  if (!Number.isFinite(id) || id <= 0) {
    const e = new Error('INVALID_TOKEN');
    e.code = 'INVALID_TOKEN';
    throw e;
  }
  return { orderId: id };
}
