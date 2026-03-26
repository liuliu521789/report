import { http } from './http';

export async function login(username, password) {
  const { data } = await http.post('/api/auth/login', { username, password });
  return data;
}

export async function bootstrapAdmin(username, password) {
  const { data } = await http.post('/api/auth/bootstrap-admin', { username, password });
  return data;
}

export async function getMe() {
  const { data } = await http.get('/api/auth/me');
  return data;
}

export async function changePassword(oldPassword, newPassword) {
  const { data } = await http.post('/api/auth/change-password', { oldPassword, newPassword });
  return data;
}

export async function getSecuritySettings() {
  const { data } = await http.get('/api/security');
  return data;
}

export async function updateSecuritySettings(payload) {
  const { data } = await http.put('/api/security', payload);
  return data;
}

export async function listLoginLogs(params) {
  const { data } = await http.get('/api/audit/login', { params });
  return data;
}

export async function listAuditOperations(params) {
  const { data } = await http.get('/api/audit/operations', { params });
  return data;
}

export async function listMyOperations(params) {
  const { data } = await http.get('/api/audit/my-operations', { params });
  return data;
}

export async function listErrorLogs(params) {
  const { data } = await http.get('/api/audit/errors', { params });
  return data;
}

export async function downloadErrorLogsExport() {
  const res = await http.get('/api/audit/errors/export', { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `error-logs-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function listUsers() {
  const { data } = await http.get('/api/users');
  return data;
}

export async function createUser(payload) {
  const { data } = await http.post('/api/users', payload);
  return data;
}

export async function updateUser(id, payload) {
  const { data } = await http.put(`/api/users/${id}`, payload);
  return data;
}

export async function listEmployeeCategories() {
  const { data } = await http.get('/api/employee-categories');
  return data;
}

export async function createEmployeeCategory(payload) {
  const { data } = await http.post('/api/employee-categories', payload);
  return data;
}

export async function updateEmployeeCategory(id, payload) {
  const { data } = await http.put(`/api/employee-categories/${id}`, payload);
  return data;
}

export async function deleteEmployeeCategory(id) {
  const { data } = await http.delete(`/api/employee-categories/${id}`);
  return data;
}

export async function listReports(params) {
  const { data } = await http.get('/api/reports', { params });
  return data;
}

export async function getReport(id) {
  const { data } = await http.get(`/api/reports/${id}`);
  return data;
}

export async function createReport(payload) {
  const { data } = await http.post('/api/reports', payload);
  return data;
}

export async function updateReport(id, payload) {
  const { data } = await http.put(`/api/reports/${id}`, payload);
  return data;
}

export async function voidReport(id) {
  const { data } = await http.post(`/api/reports/${id}/void`);
  return data;
}

export async function activateReport(id) {
  const { data } = await http.post(`/api/reports/${id}/activate`);
  return data;
}

export async function bulkPassReports(ids) {
  const { data } = await http.post('/api/reports/bulk/conclusion-pass', { ids });
  return data;
}

export async function bulkVoidReports(ids) {
  const { data } = await http.post('/api/reports/bulk/void', { ids });
  return data;
}

export async function bulkActivateReports(ids) {
  const { data } = await http.post('/api/reports/bulk/activate', { ids });
  return data;
}

export async function bulkDeleteReports(ids) {
  const { data } = await http.delete('/api/reports/bulk', { data: { ids } });
  return data;
}

export async function createQrcode(reportIds) {
  const { data } = await http.post('/api/qrcodes', { reportIds });
  return data;
}

export async function listQrcodes(params) {
  const { data } = await http.get('/api/qrcodes', { params });
  return data;
}

export async function getQrcode(id) {
  const { data } = await http.get(`/api/qrcodes/${id}`);
  return data;
}

export async function getQrcodeQr(id) {
  const { data } = await http.get(`/api/qrcodes/${id}/qr`);
  return data;
}

export async function deleteQrcodes(ids) {
  const { data } = await http.delete('/api/qrcodes', { data: { ids } });
  return data;
}

export async function listTemplates(params) {
  const { data } = await http.get('/api/templates', { params });
  return data;
}

export async function getTemplate(id) {
  const { data } = await http.get(`/api/templates/${id}`);
  return data;
}

export async function createTemplate(payload) {
  const { data } = await http.post('/api/templates', payload);
  return data;
}

export async function updateTemplate(id, payload) {
  const { data } = await http.put(`/api/templates/${id}`, payload);
  return data;
}

export async function deleteTemplate(id) {
  const { data } = await http.delete(`/api/templates/${id}`);
  return data;
}

export async function saveReportAsTemplate(reportId, payload) {
  const { data } = await http.post(`/api/reports/${reportId}/save-as-template`, payload);
  return data;
}

export async function getReportSeals(reportId) {
  const { data } = await http.get(`/api/reports/${reportId}/seals`);
  return data;
}

export async function applyReportSeals(reportId, sealTypes) {
  const { data } = await http.post(`/api/reports/${reportId}/seals`, { sealTypes });
  return data;
}

export async function removeReportSeal(reportId, sealType) {
  const { data } = await http.delete(`/api/reports/${reportId}/seals/${sealType}`);
  return data;
}

export async function translateZhToEn(text) {
  const { data } = await http.post('/api/translate', {
    q: text,
    source: 'zh',
    target: 'en',
    format: 'text'
  });
  return data?.translatedText ?? '';
}

export async function listStamps() {
  const { data } = await http.get('/api/stamps');
  return data;
}

export async function createStamp(payload) {
  const { data } = await http.post('/api/stamps', payload);
  return data;
}

export async function activateStamp(id) {
  const { data } = await http.post(`/api/stamps/${id}/activate`);
  return data;
}

export async function deleteStamp(id) {
  const { data } = await http.delete(`/api/stamps/${id}`);
  return data;
}

export async function updateStamp(id, payload) {
  const { data } = await http.put(`/api/stamps/${id}`, payload);
  return data;
}

export async function bulkDeleteStamps(ids) {
  const { data } = await http.delete('/api/stamps/bulk', { data: { ids } });
  return data;
}

export async function getCompanySettings() {
  const { data } = await http.get('/api/company/settings');
  return data;
}

export async function updateCompanySettings(payload) {
  const { data } = await http.put('/api/company/settings', payload);
  return data;
}

