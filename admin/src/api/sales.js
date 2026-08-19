import { http } from './http';

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

/** 订单质检二维码全尺寸图（用于下载/打印，非列表 72px 缩略图） */
export async function getSalesOrderQrcodeQr(orderId) {
  const { data } = await http.get(`/api/sales/orders/${orderId}/qrcode-qr`);
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
