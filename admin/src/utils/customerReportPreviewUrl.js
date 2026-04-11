import { getAuthToken } from '../stores/auth';

/** 管理端打开与客户预览同结构的报告 HTML（需登录 token） */
export function customerReportPreviewUrl(reportId, { autoPrint = false } = {}) {
  const base = import.meta.env.VITE_APP_API_BASE_URL || 'http://localhost:3001';
  const token = getAuthToken();
  const q = new URLSearchParams({
    id: String(reportId),
    adminPreview: '1',
    accessToken: token
  });
  if (autoPrint) q.set('autoPrint', '1');
  return `${base}/miniprogram/report.html?${q.toString()}`;
}
