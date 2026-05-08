import { http } from './http';

export async function login(username, password, extra = {}) {
  const { data } = await http.post('/api/auth/login', { username, password, ...extra });
  return data;
}

export async function getLoginCaptcha() {
  const { data } = await http.get('/api/auth/captcha');
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
  const blob = new Blob([res.data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `login-logs-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
  const blob = new Blob([res.data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `operation-logs-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
  const blob = new Blob([res.data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `error-logs-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadErrorLogsExport() {
  const res = await http.get('/api/audit/errors/export', { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `error-logs-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
  const blob = new Blob([res.data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reports-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
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

export async function getCompanySettings() {
  const { data } = await http.get('/api/company/settings');
  return data;
}

export async function updateCompanySettings(payload) {
  const { data } = await http.put('/api/company/settings', payload);
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

export async function getDashboardSummary() {
  const { data } = await http.get('/api/dashboard/summary');
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
    responseType: 'blob'
  });
  return res;
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

export async function createSalesOrder(payload) {
  const { data } = await http.post('/api/sales/orders', payload);
  return data;
}

export async function patchSalesOrder(id, payload) {
  const { data } = await http.patch(`/api/sales/orders/${id}`, payload);
  return data;
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

export async function financeReviewSalesOrder(id, payload) {
  const { data } = await http.post(`/api/sales/orders/${id}/finance-review`, payload);
  return data;
}

export async function batchFinanceReviewSalesOrder(payload) {
  const { data } = await http.post('/api/sales/orders/batch-finance-review', payload);
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

export async function downloadSalesContractDocument(contractId, filename) {
  const data = await fetchSalesContractDocumentBlob(contractId);
  const url = URL.createObjectURL(data);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
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

export async function downloadBackup() {
  const token = localStorage.getItem('token');
  const base = (import.meta.env.VITE_APP_API_BASE_URL || 'http://localhost:3001').replace('localhost:3003', 'localhost:3001');
  const url = `${base}/api/sql`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '下载失败' }));
    throw new Error(err.error || '下载失败');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `backup_${new Date().toISOString().slice(0, 10)}.sql`;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

export async function restoreBackup(sql) {
  const { data } = await http.post('/api/sql', { sql });
  return data;
}

