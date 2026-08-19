import { normalizeAdminApiBaseUrl } from '../utils/apiBaseNormalize.js';
import { http } from './http';

export async function downloadBackup() {
  const token = localStorage.getItem('token');
  const raw = String(import.meta.env.VITE_APP_API_BASE_URL || '').trim();
  const base = normalizeAdminApiBaseUrl(raw || 'http://localhost:3001');
  const url = `${base}/api/sql`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '下载失败' }));
    throw new Error(err.error || '下载失败');
  }
  return res.blob();
}

export async function restoreBackup(sql) {
  const { data } = await http.post('/api/sql', { sql });
  return data;
}
