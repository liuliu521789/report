import { http } from './http';

export async function listLoginLogs(params) {
  const { data } = await http.get('/api/audit/login', { params });
  return data;
}

export async function bulkDeleteLoginLogs(ids) {
  const { data } = await http.delete('/api/audit/login/bulk', { data: { ids } });
  return data;
}

export async function exportLoginLogs(ids) {
  const res = await http.post('/api/audit/login/export', { ids }, { responseType: 'blob' });
  return new Blob([res.data], { type: 'application/json' });
}

export async function listAuditOperations(params) {
  const { data } = await http.get('/api/audit/operations', { params });
  return data;
}

export async function bulkDeleteAuditOperations(ids) {
  const { data } = await http.delete('/api/audit/operations/bulk', { data: { ids } });
  return data;
}

export async function exportAuditOperations(ids) {
  const res = await http.post('/api/audit/operations/export', { ids }, { responseType: 'blob' });
  return new Blob([res.data], { type: 'application/json' });
}

export async function listMyOperations(params) {
  const { data } = await http.get('/api/audit/my-operations', { params });
  return data;
}

export async function listErrorLogs(params) {
  const { data } = await http.get('/api/audit/errors', { params });
  return data;
}

export async function bulkDeleteErrorLogs(ids) {
  const { data } = await http.delete('/api/audit/errors/bulk', { data: { ids } });
  return data;
}

export async function exportErrorLogs(ids) {
  const res = await http.post('/api/audit/errors/export', { ids }, { responseType: 'blob' });
  return new Blob([res.data], { type: 'application/json' });
}
