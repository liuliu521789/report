import { http } from './http';

export async function getSecuritySettings() {
  const { data } = await http.get('/api/security');
  return data;
}

export async function updateSecuritySettings(payload) {
  const { data } = await http.put('/api/security', payload);
  return data;
}
