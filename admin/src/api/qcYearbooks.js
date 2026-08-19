import { http } from './http';

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
