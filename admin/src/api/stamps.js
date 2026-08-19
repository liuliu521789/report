import { http } from './http';

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

export async function switchStampImage(id, imageType) {
  const { data } = await http.post(`/api/stamps/${id}/switch-image`, { imageType });
  return data;
}
