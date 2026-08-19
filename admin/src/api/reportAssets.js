import { http } from './http';

export async function listReportImageLibrary() {
  const { data } = await http.get('/api/report-image-library');
  return data;
}

export async function uploadReportImageLibraryBatch(files) {
  const fd = new FormData();
  for (let i = 0; i < files.length; i += 1) {
    fd.append('files', files[i]);
  }
  const { data } = await http.post('/api/report-image-library/batch', fd, {
    timeout: 120000
  });
  return data;
}

export async function deleteReportImageLibraryBatch(ids) {
  const { data } = await http.delete('/api/report-image-library/batch', { data: { ids } });
  return data;
}

export async function listReportStyles() {
  const { data } = await http.get('/api/report-styles');
  return data;
}

export async function getReportStyle(id) {
  const { data } = await http.get(`/api/report-styles/${id}`);
  return data;
}

export async function createReportStyle(payload) {
  const { data } = await http.post('/api/report-styles', payload);
  return data;
}

export async function updateReportStyle(id, payload) {
  const { data } = await http.put(`/api/report-styles/${id}`, payload);
  return data;
}

export async function deleteReportStyle(id) {
  const { data } = await http.delete(`/api/report-styles/${id}`);
  return data;
}
