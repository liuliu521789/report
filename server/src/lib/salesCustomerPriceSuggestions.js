import path from 'path';
import fs from 'fs/promises';
import ExcelJS from 'exceljs';

let _cachedData = null;
let _lastMtime = 0;

const XLSX_PATH = path.resolve(process.cwd(), '..', '物源发货流水单.xlsx');

function isGarbageModel(model) {
  if (!model || typeof model !== 'string') return true;
  const s = model.trim();
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
      const model = String(row.getCell(5).value || '').trim();
      const price = Number(row.getCell(7).value);
      if (!customer || isGarbageModel(model) || !Number.isFinite(price) || price <= 0) continue;
      if (!byCustomer[customer]) byCustomer[customer] = {};
      byCustomer[customer][model] = price;
    }
  }
  _cachedData = byCustomer;
  _lastMtime = stat.mtimeMs;
  return byCustomer;
}

export async function getCustomerPriceSuggestions(customerNames) {
  const data = await loadWorkbook();
  if (!data) return [];
  const seen = new Set();
  const results = [];
  for (const name of customerNames) {
    if (!name || !data[name]) continue;
    for (const [model, price] of Object.entries(data[name])) {
      const key = `${model}|${price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ product_model: model, unit_price: price });
    }
  }
  return results.sort((a, b) => a.product_model.localeCompare(b.product_model, 'zh'));
}

/**
 * 将 xlsx 中的客户单价数据全部导入 customer_prices 表（upsert）。
 * 返回 { matched: number, upserted: number, total_rows: number }
 */
export async function importPricesFromXlsx(pool) {
  const data = await loadWorkbook();
  if (!data) return { matched: 0, upserted: 0, total_rows: 0 };
  let totalRows = 0;
  let matched = 0;
  let upserted = 0;
  for (const [shortName, models] of Object.entries(data)) {
    totalRows += Object.keys(models).length;
    const [custRows] = await pool.query(
      'SELECT id FROM sales_customers WHERE customer_name = ? OR contact_name = ? LIMIT 1',
      [shortName, shortName]
    );
    if (!custRows.length) continue;
    const customerId = custRows[0].id;
    matched++;
    for (const [model, price] of Object.entries(models)) {
      await pool.query(
        `INSERT INTO customer_prices (customer_id, product_model, unit_price)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE unit_price = VALUES(unit_price)`,
        [customerId, model, price]
      );
      upserted++;
    }
  }
  return { matched, upserted, total_rows: totalRows };
}
