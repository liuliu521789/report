import path from 'path';
import fs from 'fs/promises';
import ExcelJS from 'exceljs';

let _cachedData = null;
let _lastMtime = 0;

const XLSX_PATH = path.resolve(process.cwd(), '..', '物源发货流水单.xlsx');

function isGarbage(value) {
  if (!value || typeof value !== 'string') return true;
  const s = value.trim();
  if (!s) return true;
  if (s === '[object Object]') return true;
  if (/^[\s\-—]+$/.test(s)) return true;
  return false;
}

async function loadWorkbook() {
  try {
    await fs.access(XLSX_PATH);
  } catch {
    return null;
  }
  const stat = await fs.stat(XLSX_PATH);
  if (_cachedData && stat.mtimeMs === _lastMtime) return _cachedData;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const byCustomer = {};
  for (const ws of wb.worksheets) {
    const sheetName = (ws.name || '').trim();
    if (sheetName === 'Sheet2' || /回桶/i.test(sheetName)) continue;
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const customer = String(row.getCell(4).value || '').trim();
      const customerModel = String(row.getCell(5).value || '').trim();
      const internalModel = String(row.getCell(9).value || '').trim();
      if (!customer || isGarbage(customerModel) || isGarbage(internalModel)) continue;
      if (!byCustomer[customer]) byCustomer[customer] = new Map();
      const key = customerModel;
      if (!byCustomer[customer].has(key)) {
        byCustomer[customer].set(key, { customer_model: customerModel, internal_model: internalModel });
      }
    }
  }
  _cachedData = byCustomer;
  _lastMtime = stat.mtimeMs;
  return byCustomer;
}

export async function getCustomerModelMappings(customerNames) {
  const data = await loadWorkbook();
  if (!data) return [];
  const seen = new Set();
  const results = [];
  for (const name of customerNames) {
    if (!name || !data[name]) continue;
    for (const item of data[name].values()) {
      const key = `${item.customer_model}|${item.internal_model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(item);
    }
  }
  return results.sort((a, b) => a.customer_model.localeCompare(b.customer_model, 'zh'));
}
