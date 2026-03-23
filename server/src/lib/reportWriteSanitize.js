import { canEditReportFieldKey } from './reportFieldEdit.js';

export function mergeReportFieldsForWrite(existingFields, incomingFields, effectivePermissions) {
  const ce = (k) => canEditReportFieldKey(effectivePermissions, k);
  const em = new Map((existingFields || []).map((f) => [f.fieldKey, f]));
  const incomingKeys = new Set((incomingFields || []).map((f) => f.fieldKey));
  const out = [];
  for (const f of incomingFields || []) {
    if (ce(f.fieldKey)) {
      out.push(f);
    } else {
      const old = em.get(f.fieldKey);
      if (old) out.push(old);
    }
  }
  for (const f of existingFields || []) {
    if (!incomingKeys.has(f.fieldKey) && !ce(f.fieldKey)) {
      out.push(f);
    }
  }
  return out.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

/**
 * 防止客户端篡改无编辑权限的字段（仅 PUT 更新已有报告）
 */
export function sanitizeReportPutBody(user, existingReport, existingFields, body) {
  if (user.accountType === 'super_admin') return body;
  const eff = user.permissions;
  const ce = (k) => canEditReportFieldKey(eff, k);

  const next = { ...body };
  if (!ce('report_no')) next.reportNo = existingReport.reportNo;
  if (!ce('conclusion')) next.conclusion = existingReport.conclusion ?? 'unknown';
  if (!ce('product_name')) {
    next.productName = existingReport.productName;
    next.productNameEn = existingReport.productNameEn ?? null;
  }
  if (!ce('batch_no')) {
    next.batchNo = existingReport.batchNo ?? null;
    next.batchNoEn = existingReport.batchNoEn ?? null;
  }

  next.fields = mergeReportFieldsForWrite(existingFields, body.fields || [], eff);
  return next;
}
