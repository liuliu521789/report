import jwt from 'jsonwebtoken';

const PURPOSE = 'wecom_contract_review';

/**
 * 企业微信合同审批页链接 JWT：绑定合同与当前审批人，避免链接被转发滥用。
 */
export function signWecomContractReviewToken(contractId, reviewerUserId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const e = new Error('JWT_SECRET_NOT_SET');
    e.code = 'JWT_SECRET_NOT_SET';
    throw e;
  }
  const cid = Number(contractId);
  const rid = Number(reviewerUserId);
  if (!Number.isFinite(cid) || cid <= 0 || !Number.isFinite(rid) || rid <= 0) {
    const e = new Error('BAD_IDS');
    e.code = 'BAD_IDS';
    throw e;
  }
  return jwt.sign({ purpose: PURPOSE, contractId: cid, reviewerUserId: rid }, secret, { expiresIn: '14d' });
}

export function verifyWecomContractReviewToken(token) {
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
  const contractId = Number(p.contractId);
  const reviewerUserId = Number(p.reviewerUserId);
  if (!Number.isFinite(contractId) || contractId <= 0 || !Number.isFinite(reviewerUserId) || reviewerUserId <= 0) {
    const e = new Error('INVALID_TOKEN');
    e.code = 'INVALID_TOKEN';
    throw e;
  }
  return { contractId, reviewerUserId };
}
