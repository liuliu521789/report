import { http } from './http';

/** 企业微信通知 */
export async function wecomMeta() {
  const { data } = await http.get('/api/wecom/meta');
  return data;
}

export async function getWecomConfig() {
  const { data } = await http.get('/api/wecom/config');
  return data;
}

export async function updateWecomConfig(payload) {
  const { data } = await http.put('/api/wecom/config', payload);
  return data;
}

export async function listWecomRecipients() {
  const { data } = await http.get('/api/wecom/recipients');
  return data;
}

export async function createWecomRecipient(payload) {
  const { data } = await http.post('/api/wecom/recipients', payload);
  return data;
}

export async function updateWecomRecipient(id, payload) {
  const { data } = await http.put(`/api/wecom/recipients/${id}`, payload);
  return data;
}

export async function deleteWecomRecipient(id) {
  const { data } = await http.delete(`/api/wecom/recipients/${id}`);
  return data;
}

export async function listWecomTemplates() {
  const { data } = await http.get('/api/wecom/templates');
  return data;
}

export async function createWecomTemplate(payload) {
  const { data } = await http.post('/api/wecom/templates', payload);
  return data;
}

export async function updateWecomTemplate(id, payload) {
  const { data } = await http.put(`/api/wecom/templates/${id}`, payload);
  return data;
}

export async function deleteWecomTemplate(id) {
  const { data } = await http.delete(`/api/wecom/templates/${id}`);
  return data;
}

export async function getWecomTemplateSnippet(code) {
  const { data } = await http.get(`/api/wecom/templates/code/${encodeURIComponent(code)}/snippet`);
  return data;
}

export async function sendWecomNotification(payload) {
  const { data } = await http.post('/api/wecom/send', payload);
  return data;
}

export async function listWecomNotifyJobs(params) {
  const { data } = await http.get('/api/wecom/jobs', { params });
  return data;
}

export async function retryWecomNotifyJob(id) {
  const { data } = await http.post(`/api/wecom/jobs/${id}/retry`);
  return data;
}
