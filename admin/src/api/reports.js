import { http } from './http';

export async function listReports(params) {
  const { data } = await http.get('/api/reports', { params });
  return data;
}

export async function getReport(id) {
  const { data } = await http.get(`/api/reports/${id}`);
  return data;
}

/** 产品名称联想（历史报告、内部型号、订单标签型号） */
export async function suggestReportProductNames(q, extraParams = {}) {
  const { data } = await http.get('/api/reports/suggest-product-names', {
    params: { q, ...extraParams }
  });
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

export async function exportReportsJson(ids) {
  const res = await http.post('/api/reports/export/json', { ids }, { responseType: 'blob' });
  return new Blob([res.data], { type: 'application/json' });
}

export async function createQrcode(reportIds, force = false) {
  const { data } = await http.post('/api/qrcodes', { reportIds, force });
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
