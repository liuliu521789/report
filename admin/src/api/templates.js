import { http } from './http';

export async function listTemplates(params) {
  const { data } = await http.get('/api/templates', { params });
  return data;
}

export async function getTemplate(id) {
  const { data } = await http.get(`/api/templates/${id}`);
  return data;
}

/** 按产品名称联想报告模板检验项目（支持带 fromOrder 做客户型号->内部编码映射） */
export async function suggestTemplateByProduct(productName, extraParams = {}) {
  const { data } = await http.get('/api/templates/suggest-by-product', {
    params: { productName, ...extraParams }
  });
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

export async function deleteTemplates(ids) {
  const { data } = await http.delete('/api/templates', { data: { ids } });
  return data;
}

export async function importTemplateDocx(file) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await http.post('/api/templates/import-docx', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
}

/** 批量导入 DOCX 报告模板（multipart，字段名 files；单次最多 500 个，具体以后端返回为准） */
export async function importTemplateDocxBatch(files) {
  const formData = new FormData();
  const list = Array.isArray(files) ? files : [];
  for (let i = 0; i < list.length; i += 1) {
    const f = list[i];
    if (f) formData.append('files', f);
  }
  const { data } = await http.post('/api/templates/import-docx-batch', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 600000
  });
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
