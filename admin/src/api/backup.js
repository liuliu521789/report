import { http } from './http';

export async function getBackups() {
  const { data } = await http.get('/api/backups');
  return data.backups || [];
}

export async function getBackupJobs() {
  const { data } = await http.get('/api/backups/jobs');
  return data.jobs || [];
}

export async function runBackup() {
  const { data } = await http.post('/api/backups/run');
  return data.backup;
}

export async function rotateBackupEncryption() {
  const { data } = await http.post('/api/backups/reencrypt');
  return data.result;
}

export async function verifyBackupRecoverability(backupId = '') {
  const { data } = await http.post('/api/backups/verify', { backupId });
  return data.result;
}

export async function restoreBackup(id) {
  const { data } = await http.post(`/api/backups/restore/${id}`);
  return data.result;
}

export async function deleteBackup(id) {
  const { data } = await http.delete(`/api/backups/${id}`);
  return !!data?.ok;
}

export async function downloadBackup(id) {
  const res = await http.get(`/api/backups/download/${id}`, { responseType: 'blob', timeout: 120000 });
  const disposition = String(res.headers?.['content-disposition'] || '');
  const matched = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const filename = matched?.[1] ? decodeURIComponent(matched[1]) : `backup_${id}.tar.gz`;
  return { blob: res.data, filename };
}
