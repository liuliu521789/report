import { getAuthToken } from '../stores/auth';
import { absoluteApiOrigin } from './absoluteApiOrigin.js';

/** 管理端打开与客户预览同结构的报告 HTML（需登录 token） */
export function customerReportPreviewUrl(reportId, { autoPrint = false, t } = {}) {
  const base = absoluteApiOrigin();
  const token = getAuthToken();
  const q = new URLSearchParams({
    id: String(reportId),
    adminPreview: '1',
    accessToken: token,
    _t: String(t ?? Date.now())
  });
  if (autoPrint) q.set('autoPrint', '1');
  return `${base}/miniprogram/report.html?${q.toString()}`;
}
