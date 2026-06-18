import { http } from './http';
import { normalizeAdminApiBaseUrl } from '../utils/apiBaseNormalize.js';

export async function login(username, password, extra = {}) {
  const { data } = await http.post('/api/auth/login', { username, password, ...extra });
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

/** 超级管理员：以指定员工身份签发会话（权限与该员工一致） */
export async function impersonateUser(userId) {
  const { data } = await http.post('/api/auth/impersonate', { userId });
  return data;
}

export async function totpProvision(pendingToken) {
  const { data } = await http.post('/api/auth/totp/provision', { pendingToken });
  return data;
}

export async function totpActivate(pendingToken, code) {
  const { data } = await http.post('/api/auth/totp/activate', { pendingToken, code });
  return data;
}

export async function totpVerifyLogin(pendingToken, code) {
  const { data } = await http.post('/api/auth/totp/verify-login', { pendingToken, code });
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

export async function downloadErrorLogsExport() {
  const res = await http.get('/api/audit/errors/export', { responseType: 'blob' });
  return new Blob([res.data], { type: 'application/json' });
}

/**
 * 成品台账接口：部分网关/反代对特定路径段返回 404；若响应体已是本系统 JSON（含 error），则不再换路径重试。
 */
function isStructuredApi404(err) {
  if (err?.response?.status !== 404) return false;
  const d = err?.response?.data;
  return !!(d && typeof d === 'object' && typeof d.error === 'string');
}

function qcStripApiFallback(pathWithoutDomain) {
  if (!pathWithoutDomain.startsWith('/api/qc-yearbooks')) return [];
  return [pathWithoutDomain.replace(/^\/api\/qc-yearbooks/, '/qc-yearbooks')];
}

async function requestWithQcYearbook404PathFallback(urls, requester) {
  let lastErr;
  for (let i = 0; i < urls.length; i += 1) {
    try {
      return await requester(urls[i]);
    } catch (e) {
      lastErr = e;
      if (e?.response?.status !== 404 || isStructuredApi404(e)) throw e;
      if (i === urls.length - 1) throw e;
    }
  }
  throw lastErr;
}

/** 年度品质管控台账：年份与成品行 */
export async function lookupQcYearbookForReport(params) {
  const { data } = await http.get('/api/qc-yearbooks/lookup-for-report', { params });
  return data?.data?.qcYearbook ?? data?.qcYearbook ?? null;
}

export async function listQcYearbookYears() {
  const urls = ['/api/qc-yearbooks/years', ...qcStripApiFallback('/api/qc-yearbooks/years')];
  const res = await requestWithQcYearbook404PathFallback(urls, (url) => http.get(url));
  return res.data;
}

export async function createQcYearbookYear(payload) {
  const urls = ['/api/qc-yearbooks/years', ...qcStripApiFallback('/api/qc-yearbooks/years')];
  const res = await requestWithQcYearbook404PathFallback(urls, (url) => http.post(url, payload));
  return res.data;
}

export async function deleteQcYearbookYear(yearId) {
  const yid = encodeURIComponent(String(yearId));
  const primary = `/api/qc-yearbooks/years/${yid}`;
  const urls = [primary, ...qcStripApiFallback(primary)];
  const res = await requestWithQcYearbook404PathFallback(urls, (url) => http.delete(url));
  return res.data;
}

/** public 下可导入的「物源YYYY年度品质管控数据表.xlsx」列表 */
export async function listQcYearbookPublicExcelFiles() {
  const primary = '/api/qc-yearbooks/public-excel-files';
  const urls = [primary, ...qcStripApiFallback(primary)];
  const res = await requestWithQcYearbook404PathFallback(urls, (url) => http.get(url));
  return res.data;
}

export async function listQcYearbookFinishedProductRows(yearId, params) {
  const yid = encodeURIComponent(String(yearId));
  const primary = `/api/qc-yearbooks/years/${yid}/fp`;
  const urls = [
    primary,
    `/api/qc-yearbooks/years/${yid}/fp-rows`,
    `/api/qc-yearbooks/years/${yid}/finished-product-rows`,
    ...qcStripApiFallback(primary)
  ];
  const res = await requestWithQcYearbook404PathFallback(urls, (url) =>
    http.get(url, { params: params || {} })
  );
  return res.data;
}

export async function createQcYearbookFinishedProductRow(yearId, payload) {
  const yid = encodeURIComponent(String(yearId));
  const primary = `/api/qc-yearbooks/years/${yid}/fp`;
  const urls = [
    primary,
    `/api/qc-yearbooks/years/${yid}/fp-rows`,
    `/api/qc-yearbooks/years/${yid}/finished-product-rows`,
    ...qcStripApiFallback(primary)
  ];
  const res = await requestWithQcYearbook404PathFallback(urls, (url) => http.post(url, payload));
  return res.data;
}

export async function updateQcYearbookFinishedProductRow(rowId, payload) {
  const rid = encodeURIComponent(String(rowId));
  const primary = `/api/qc-yearbooks/fp/${rid}`;
  const urls = [
    primary,
    `/api/qc-yearbooks/fp-rows/${rid}`,
    `/api/qc-yearbooks/finished-product-rows/${rid}`,
    ...qcStripApiFallback(primary)
  ];
  const res = await requestWithQcYearbook404PathFallback(urls, (url) => http.put(url, payload));
  return res.data;
}

export async function deleteQcYearbookFinishedProductRow(rowId) {
  const rid = encodeURIComponent(String(rowId));
  const primary = `/api/qc-yearbooks/fp/${rid}`;
  const urls = [
    primary,
    `/api/qc-yearbooks/fp-rows/${rid}`,
    `/api/qc-yearbooks/finished-product-rows/${rid}`,
    ...qcStripApiFallback(primary)
  ];
  const res = await requestWithQcYearbook404PathFallback(urls, (url) => http.delete(url));
  return res.data;
}

/** FormData：year、replaceExisting、file 或 publicFilename（仅导入「成品」工作表） */
export async function importQcYearbookFromXlsx(formData) {
  const primary = '/api/qc-yearbooks/import-xlsx';
  const urls = [primary, ...qcStripApiFallback(primary)];
  const res = await requestWithQcYearbook404PathFallback(urls, (url) =>
    http.post(url, formData, {
      timeout: 300000
    })
  );
  return res.data;
}

/** 分页 / 筛选 / 搜索：{ items, total, page, pageSize } */
export async function listUsers(params) {
  const { data } = await http.get('/api/users', { params: params || {} });
  return data;
}

/** 下拉用：仅 id/username/accountType/isActive/categoryNameZh，含 deleted_at IS NULL 过滤 */
export async function listUsersLite(params) {
  const { data } = await http.get('/api/users/lite', { params: params || {} });
  return data;
}

export async function getUserDetail(id) {
  const { data } = await http.get(`/api/users/${id}`);
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

export async function deleteUser(id) {
  const { data } = await http.delete(`/api/users/${id}`);
  return data;
}

/** 重置密码：返回 { temporaryPassword }，并强制下次登录改密 */
export async function resetUserPassword(id, password) {
  const payload = password ? { password } : {};
  const { data } = await http.post(`/api/users/${id}/reset-password`, payload);
  return data;
}

export async function forceLogoutUser(id) {
  const { data } = await http.post(`/api/users/${id}/force-logout`);
  return data;
}

export async function logout() {
  const { data } = await http.post('/api/auth/logout');
  return data;
}

export async function getPermissionSchema() {
  const { data } = await http.get('/api/permissions/schema');
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

export async function listDepartmentsTree() {
  const { data } = await http.get('/api/departments/tree');
  return data;
}

export async function listDepartmentsFlat() {
  const { data } = await http.get('/api/departments/flat');
  return data;
}

export async function createDepartment(payload) {
  const { data } = await http.post('/api/departments', payload);
  return data;
}

export async function updateDepartment(id, payload) {
  const { data } = await http.put(`/api/departments/${id}`, payload);
  return data;
}

export async function deleteDepartment(id) {
  const { data } = await http.delete(`/api/departments/${id}`);
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

export async function uploadContractSignature(contractId, signatureDataUrl) {
  const fd = new FormData();
  const blob = await (await fetch(signatureDataUrl)).blob();
  fd.append('signature', blob, 'signature.png');
  const { data } = await http.post(`/api/sales/contracts/${contractId}/signature`, fd, {
    timeout: 30000,
    silentProgress: true
  });
  return data;
}

export async function getContractSignature(contractId) {
  const { data } = await http.get(`/api/sales/contracts/${contractId}/signature`);
  return data;
}

export async function stampContractPdf(contractId) {
  const { data } = await http.post(`/api/sales/contracts/${contractId}/stamp-pdf`, {}, {
    responseType: 'blob',
    timeout: 60000,
    silentProgress: true
  });
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

export async function updateFooterSealPosition(footerSealPosition) {
  const { data } = await http.patch('/api/company/settings/footer-seal-position', {
    footerSealPosition
  });
  return data;
}

export async function getQuickRoleUsers() {
  const { data } = await http.get('/api/company/quick-role-users');
  return data;
}

export async function updateQuickRoleUsers(payload) {
  const { data } = await http.put('/api/company/quick-role-users', payload);
  return data;
}

export async function getSupportContact() {
  const { data } = await http.get('/api/support-contact');
  return data;
}

export async function updateSupportContact(payload) {
  const { data } = await http.put('/api/support-contact', payload);
  return data;
}

export async function requestSupportContact(payload = {}) {
  const { data } = await http.post('/api/support-contact/request', payload);
  return data;
}

export async function getDashboardSummary() {
  const { data } = await http.get('/api/dashboard/summary');
  return data;
}

export async function getDashboardActivityHeatmap(params = {}) {
  const { data } = await http.get('/api/dashboard/activity-heatmap', { params });
  return data;
}

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

/** ---------- 销售 / 合同 ---------- */
export async function listSalesOrderFields(params) {
  const { data } = await http.get('/api/sales/order-fields', { params });
  return data;
}

export async function createSalesOrderField(payload) {
  const { data } = await http.post('/api/sales/order-fields', payload);
  return data;
}

export async function updateSalesOrderField(id, payload) {
  const { data } = await http.patch(`/api/sales/order-fields/${id}`, payload);
  return data;
}

export async function deleteSalesOrderField(id) {
  const { data } = await http.delete(`/api/sales/order-fields/${id}`);
  return data;
}

export async function getSalesSettings() {
  const { data } = await http.get('/api/sales/settings');
  return data;
}

export async function patchSalesSettings(payload) {
  const { data } = await http.patch('/api/sales/settings', payload);
  return data;
}

export async function getSalesOrderFlowConfig() {
  const { data } = await http.get('/api/sales/order-flow');
  return data;
}

export async function saveSalesOrderFlowConfig(payload) {
  const { data } = await http.put('/api/sales/order-flow', payload);
  return data;
}

export async function listSalesCustomers(params) {
  const { data } = await http.get('/api/sales/customers', { params });
  return data;
}

export async function createSalesCustomer(payload) {
  const { data } = await http.post('/api/sales/customers', payload);
  return data;
}

export async function updateSalesCustomer(id, payload) {
  const { data } = await http.patch(`/api/sales/customers/${id}`, payload);
  return data;
}

/** 下载客户导入模板 xlsx */
export async function downloadCustomerImportTemplate() {
  const { data } = await http.get('/api/sales/customers/template', { responseType: 'blob' });
  return data;
}

export async function toggleCustomerStatus(id, isActive) {
  const { data } = await http.patch(`/api/sales/customers/${id}/status`, { is_active: isActive });
  return data;
}

export async function getCustomerStats(id) {
  const { data } = await http.get(`/api/sales/customers/${id}/stats`);
  return data;
}

export async function batchDeleteCustomers(payload) {
  const { data } = await http.post('/api/sales/customers/bulk-delete', payload);
  return data;
}

export async function exportCustomers(params = {}) {
  const res = await http.get('/api/sales/customers/export', {
    params,
    responseType: 'blob',
    timeout: 120000
  });
  return res.data;
}

/** 从服务器 public/客户名称.xlsx 同步当前分组（康铭/物源 sheet），覆盖该分组目录 */
export async function importSalesCustomersExcel(formData) {
  const { data } = await http.post('/api/sales/customers/import', formData, {
    timeout: 120000
  });
  return data;
}

/** 客户产品单价管理 API */
export async function listCustomerPrices(customerId) {
  const { data } = await http.get(`/api/sales/customers/${customerId}/prices`);
  return data;
}

export async function createCustomerPrice(customerId, payload) {
  const { data } = await http.post(`/api/sales/customers/${customerId}/prices`, payload);
  return data;
}

export async function patchCustomerPrice(customerId, priceId, payload) {
  const { data } = await http.patch(`/api/sales/customers/${customerId}/prices/${priceId}`, payload);
  return data;
}

export async function deleteCustomerPrice(customerId, priceId) {
  const { data } = await http.delete(`/api/sales/customers/${customerId}/prices/${priceId}`);
  return data;
}

export async function listCustomerPriceSuggestions(customerId) {
  const { data } = await http.get(`/api/sales/customers/${customerId}/price-suggestions`);
  return data;
}

export async function listCustomerModelMappings(customerId) {
  const { data } = await http.get(`/api/sales/customers/${customerId}/model-mappings`);
  return data;
}

export async function updateCustomerModelMapping(customerId, mappingId, payload) {
  const { data } = await http.put(`/api/sales/customers/${customerId}/model-mappings/${mappingId}`, payload);
  return data;
}

export async function deleteCustomerModelMapping(customerId, mappingId, body) {
  const config = body !== undefined ? { data: body } : {};
  const { data } = await http.delete(`/api/sales/customers/${customerId}/model-mappings/${mappingId}`, config);
  return data;
}

export async function lookupCustomerPrice({ customerName, productModel, customerId }) {
  const params = { customerName, productModel };
  if (customerId != null && customerId !== '') params.customerId = customerId;
  const { data } = await http.get('/api/sales/customer-price', { params });
  return data;
}

/** 内部型号管理 API */
export async function listSalesInternalModels(params) {
  const { data } = await http.get('/api/sales/internal-models', { params });
  return data;
}

export async function createSalesInternalModel(payload) {
  const { data } = await http.post('/api/sales/internal-models', payload);
  return data;
}

export async function patchSalesInternalModel(id, payload) {
  const { data } = await http.patch(`/api/sales/internal-models/${id}`, payload);
  return data;
}

export async function batchDeleteInternalModels(payload) {
  const { data } = await http.post('/api/sales/internal-models/batch-delete', payload);
  return data;
}

export async function batchEnableInternalModels(payload) {
  const { data } = await http.post('/api/sales/internal-models/batch-enable', payload);
  return data;
}

export async function deleteAllInternalModels(payload) {
  const { data } = await http.post('/api/sales/internal-models/delete-all', payload);
  return data;
}

/** 上传 Excel 批量导入内部型号（multipart，字段名 file；勿手动设 Content-Type，需带 boundary） */
export async function importInternalModelsFromExcel(formData) {
  const { data } = await http.post('/api/sales/internal-models/import', formData);
  return data;
}

/** 下载内部型号导入模板 xlsx */
export async function downloadInternalModelsTemplate() {
  const { data } = await http.get('/api/sales/internal-models/template', { responseType: 'blob' });
  return data;
}

/** 导出全部内部型号 xlsx */
export async function exportInternalModels() {
  const { data } = await http.get('/api/sales/internal-models/export', { responseType: 'blob' });
  return data;
}

/** 根据型号编码查询品名（支持 customerId 参数，通过客户型号对照兜底） */
export async function lookupInternalModelProductName(model, customerId) {
  const params = { model };
  if (customerId) params.customerId = customerId;
  const { data } = await http.get('/api/sales/internal-models/lookup', { params });
  return data;
}

export async function listSalesMessages(params) {
  const { data } = await http.get('/api/sales/messages', { params, silentProgress: true });
  return data;
}

export async function markSalesMessageRead(id) {
  const { data } = await http.post(`/api/sales/messages/${id}/read`);
  return data;
}

export async function clearSalesMessages() {
  const { data } = await http.post('/api/sales/messages/clear', {}, { silentProgress: true });
  return data;
}

export async function deleteSalesMessage(id) {
  const { data } = await http.delete(`/api/sales/messages/${id}`, { silentProgress: true });
  return data;
}

export async function batchDeleteSalesMessages(ids) {
  const { data } = await http.post('/api/sales/messages/batch-delete', { ids }, { silentProgress: true });
  return data;
}

export async function listSalesOrders(params, options = {}) {
  const { data } = await http.get('/api/sales/orders', {
    params,
    silentProgress: options.silent === true
  });
  return data;
}

/** 流程看板各阶段数量（与列表相同的可见范围与文本筛选；默认不按列表日期收窄） */
export async function getSalesOrderFlowSummary(params, options = {}) {
  const { data } = await http.get('/api/sales/orders/flow-summary', {
    params,
    silentProgress: options.silent === true
  });
  return data;
}

/** SLA 超期笔数（阈值来自服务端环境变量） */
export async function getSalesOrderSlaSummary(params, options = {}) {
  const { data } = await http.get('/api/sales/orders/sla-summary', {
    params,
    silentProgress: options.silent === true
  });
  return data;
}

/** 停用字段前：统计 data_json 中含该键的订单数 */
export async function getSalesOrderFieldImpact(id) {
  const { data } = await http.get(`/api/sales/order-fields/${encodeURIComponent(id)}/impact`);
  return data;
}

export async function createSalesOrder(payload) {
  const { data } = await http.post('/api/sales/orders', payload);
  return data;
}

export async function patchSalesOrder(id, payload) {
  const { data } = await http.patch(`/api/sales/orders/${id}`, payload);
  return data;
}

/** 从订单获取新建报告预填（刷新页面后可恢复） */
export async function getSalesOrderReportPrefill(orderId) {
  const { data } = await http.get(`/api/sales/orders/${orderId}/report-prefill`);
  return data?.data ?? data;
}

export async function listSalesQrcodeBindCandidates(params) {
  const { data } = await http.get('/api/sales/qrcodes/bind-candidates', { params });
  return data;
}

export async function patchSalesOrderQcQrcode(orderId, payload) {
  const { data } = await http.patch(`/api/sales/orders/${orderId}/qc-qrcode`, payload);
  return data;
}

export async function submitSalesOrderReview(id) {
  const { data } = await http.post(`/api/sales/orders/${id}/submit`);
  return data;
}

export async function batchSubmitSalesOrderReview(ids) {
  const { data } = await http.post('/api/sales/orders/batch-submit', { ids });
  return data;
}

export async function withdrawSalesOrderReview(id) {
  const { data } = await http.post(`/api/sales/orders/${id}/withdraw`);
  return data;
}

export async function batchWithdrawSalesOrderReview(ids) {
  const { data } = await http.post('/api/sales/orders/batch-withdraw', { ids });
  return data;
}

export async function financeReviewSalesOrder(id, payload) {
  const { data } = await http.post(`/api/sales/orders/${id}/finance-review`, payload);
  return data;
}

export async function batchFinanceReviewSalesOrder(payload) {
  const { data } = await http.post('/api/sales/orders/batch-finance-review', payload);
  return data;
}

export async function batchQcReviewSalesOrder(payload) {
  const { data } = await http.post('/api/sales/orders/batch-qc-review', payload);
  return data;
}

export async function qcReviewSalesOrder(id, payload) {
  const { data } = await http.post(`/api/sales/orders/${id}/qc-review`, payload);
  return data;
}

export async function shipSalesOrder(id, payload) {
  const { data } = await http.post(`/api/sales/orders/${id}/ship`, payload);
  return data;
}

export async function batchShipSalesOrders(payload) {
  const { data } = await http.post('/api/sales/orders/batch-ship', payload);
  return data;
}

export async function completeSalesOrder(id) {
  const { data } = await http.post(`/api/sales/orders/${id}/complete`);
  return data;
}

export async function cancelSalesOrder(id) {
  const { data } = await http.post(`/api/sales/orders/${id}/cancel`);
  return data;
}

export async function deleteSalesOrder(id) {
  const { data } = await http.delete(`/api/sales/orders/${id}`);
  return data;
}

export async function batchDeleteSalesOrders(ids) {
  const { data } = await http.post('/api/sales/orders/batch-delete', { ids });
  return data;
}

export async function listSalesOrderStatusLogs(id) {
  const { data } = await http.get(`/api/sales/orders/${id}/status-logs`);
  return data;
}

export async function listSalesOrderEditLogs(id) {
  const { data } = await http.get(`/api/sales/orders/${id}/edit-logs`);
  return data;
}

export async function listCustomerContracts(customerId) {
  const { data } = await http.get(`/api/sales/customers/${customerId}/contracts`);
  return data;
}

export async function exportSalesOrdersXlsx(params) {
  const res = await http.get('/api/sales/orders/export/xlsx', { params, responseType: 'blob' });
  return res.data;
}

/** 创建异步导出任务（筛选条件与列表 query 一致） */
export async function createSalesOrderExportJob(payload, options = {}) {
  const { data } = await http.post('/api/sales/orders/export/jobs', payload, {
    timeout: 60000,
    silentProgress: options.silent === true
  });
  return data;
}

export async function getSalesOrderExportJob(id, options = {}) {
  const { data } = await http.get(`/api/sales/orders/export/jobs/${id}`, {
    timeout: 30000,
    silentProgress: options.silent === true
  });
  return data;
}

export async function downloadSalesOrderExportJobFile(id) {
  const res = await http.get(`/api/sales/orders/export/jobs/${id}/download`, {
    responseType: 'blob',
    timeout: 120000
  });
  return res.data;
}

export async function downloadSalesImportTemplate() {
  const res = await http.get('/api/sales/orders/template/xlsx', { responseType: 'blob' });
  return res.data;
}

export async function importSalesOrdersXlsx(file, { confirmDuplicate = false } = {}) {
  const fd = new FormData();
  fd.append('file', file);
  if (confirmDuplicate) fd.append('confirm_duplicate_import', '1');
  const { data } = await http.post('/api/sales/orders/import/xlsx', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  });
  return data;
}

export async function listContractTemplates() {
  const { data } = await http.get('/api/sales/contract-templates');
  return data;
}

export async function getContractTemplate(id) {
  const { data } = await http.get(`/api/sales/contract-templates/${id}`);
  return data;
}

export async function createContractTemplate(payload) {
  const { data } = await http.post('/api/sales/contract-templates', payload);
  return data;
}

export async function updateContractTemplate(id, payload) {
  const { data } = await http.patch(`/api/sales/contract-templates/${id}`, payload);
  return data;
}

export async function deleteContractTemplate(id) {
  const { data } = await http.delete(`/api/sales/contract-templates/${id}`);
  return data;
}

export async function generateSalesContract(payload) {
  const { data } = await http.post('/api/sales/contracts/generate', payload);
  return data;
}

export async function bindSalesOrderContract(orderId, payload) {
  const { data } = await http.post(`/api/sales/orders/${orderId}/bind-contract`, payload);
  return data;
}

export async function listSalesContracts(params = {}) {
  const { data } = await http.get('/api/sales/contracts', { params });
  return data;
}

export async function getSalesContract(id) {
  const { data } = await http.get(`/api/sales/contracts/${id}`);
  return data;
}

export async function patchSalesContract(id, payload) {
  const { data } = await http.patch(`/api/sales/contracts/${id}`, payload);
  return data;
}

export async function deleteSalesContract(id) {
  const { data } = await http.delete(`/api/sales/contracts/${id}`);
  return data;
}

export async function bulkDeleteSalesContracts(payload) {
  const { data } = await http.post('/api/sales/contracts/bulk-delete', payload);
  return data;
}

export async function submitSalesContract(id, payload) {
  const { data } = await http.post(`/api/sales/contracts/${id}/submit`, payload);
  return data;
}

export async function reviewSalesContract(id, payload) {
  const { data } = await http.post(`/api/sales/contracts/${id}/review`, payload);
  return data;
}

/** 创建人撤回待审合同（退回草稿） */
export async function withdrawSalesContractReview(id) {
  const { data } = await http.post(`/api/sales/contracts/${id}/withdraw`);
  return data;
}

/** 创建人催办当前审批人（站内信 + 企业微信，频率限制见服务端） */
export async function remindSalesContractReviewer(id) {
  const { data } = await http.post(`/api/sales/contracts/${id}/remind-reviewer`);
  return data;
}

/** 新建「文档合同」草稿（与模板生成合同相同列表与审核流程） */
export async function uploadSalesContractDocument({ customerId, title, file }) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('customer_id', String(customerId));
  if (title != null && String(title).trim()) fd.append('title', String(title).trim());
  const { data } = await http.post('/api/sales/contracts/upload-document', fd, {
    timeout: 120000,
    silentProgress: true
  });
  return data;
}

export async function replaceSalesContractDocument(contractId, file) {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await http.post(`/api/sales/contracts/${contractId}/replace-document`, fd, {
    timeout: 120000,
    silentProgress: true
  });
  return data;
}

export async function fetchSalesContractDocumentBlob(contractId) {
  const { data } = await http.get(`/api/sales/contracts/${contractId}/document`, {
    responseType: 'blob',
    timeout: 120000,
    silentProgress: true
  });
  return data;
}

export async function downloadSalesContractDocument(contractId) {
  return fetchSalesContractDocumentBlob(contractId);
}

export async function downloadSalesContractDocx(contractId) {
  const { data } = await http.get(`/api/sales/contracts/${contractId}/export-docx`, {
    responseType: 'blob',
    timeout: 60000,
    silentProgress: true
  });
  return data;
}

export async function downloadSalesContractPdf(contractId) {
  const { data } = await http.get(`/api/sales/contracts/${contractId}/export-pdf`, {
    responseType: 'blob',
    timeout: 120000,
    silentProgress: true
  });
  return data;
}

/** ---------- 合同开票 ---------- */
export async function listContractInvoices(contractId) {
  const { data } = await http.get(`/api/sales/contracts/${contractId}/invoices`);
  return data;
}

export async function listAllContractInvoices(params) {
  const { data } = await http.get('/api/sales/invoices', { params });
  return data;
}

export async function getContractInvoiceAudits(invoiceId) {
  const { data } = await http.get(`/api/sales/invoices/${invoiceId}/audits`);
  return data;
}

export async function createContractInvoice(contractId, payload) {
  const { data } = await http.post(`/api/sales/contracts/${contractId}/invoices`, payload);
  return data;
}

export async function updateContractInvoice(invoiceId, payload) {
  const { data } = await http.patch(`/api/sales/invoices/${invoiceId}`, payload);
  return data;
}

export async function deleteContractInvoice(invoiceId) {
  const { data } = await http.delete(`/api/sales/invoices/${invoiceId}`);
  return data;
}

export async function submitContractInvoice(invoiceId) {
  const { data } = await http.post(`/api/sales/invoices/${invoiceId}/submit`);
  return data;
}

export async function fulfillContractInvoice(invoiceId, payload) {
  const { data } = await http.post(`/api/sales/invoices/${invoiceId}/fulfill`, payload);
  return data;
}

export async function withdrawContractInvoice(invoiceId) {
  const { data } = await http.post(`/api/sales/invoices/${invoiceId}/withdraw`);
  return data;
}

export async function listSalesProcessLogs(params) {
  const { data } = await http.get('/api/sales/process/order-logs', { params });
  return data;
}

export async function listFinanceReviewers(params) {
  const { data } = await http.get('/api/sales/finance-reviewers', { params });
  return data;
}

export async function listSalesUsersForFilter() {
  const { data } = await http.get('/api/sales/sales-users');
  return data;
}

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

