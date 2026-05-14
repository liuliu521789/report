import XLSX from 'xlsx';
import { allocateUniqueCustomerCode } from './salesOrderCrudShared.js';

/** 与上传 Excel 中工作表名一致（按当前 Tab 对应分组选表） */
export const CUSTOMER_DIRECTORY_SHEETS = {
  kangming: '康铭',
  wuyuan: '物源'
};

function normalizeCustomerKey(name) {
  return String(name || '').trim();
}

function detectHeader(rows) {
  const maxScan = Math.min(rows.length, 30);
  for (let i = 0; i < maxScan; i++) {
    const r = rows[i].map((c) => String(c ?? '').trim());
    const nameIdx = r.findIndex((c) => c === '客户名称' || c.includes('客户名称'));
    if (nameIdx < 0) continue;
    const shortIdx = r.findIndex((c) => c === '简称');
    return { headerRow: i, nameIdx, shortIdx: shortIdx >= 0 ? shortIdx : -1 };
  }
  return null;
}

/**
 * 从用户上传的 xlsx/xls 中读取指定工作表，同步到 sales_customers.customer_group。
 * - 按「客户名称」去重；与库内同组同名（trim）视为同一客户并更新简称（简称空则用全称）。
 * - 表中无、库中有：无订单且无合同则删除；否则停用。
 *
 * @param {Buffer} workbookBuffer
 */
export async function syncCustomerDirectoryGroup(pool, { userId, customerGroup, workbookBuffer }) {
  const sheetName = CUSTOMER_DIRECTORY_SHEETS[customerGroup];
  if (!sheetName) {
    const e = new Error('BAD_CUSTOMER_GROUP');
    e.code = 'BAD_CUSTOMER_GROUP';
    throw e;
  }
  if (!workbookBuffer || workbookBuffer.length === 0) {
    const e = new Error('请上传有效的 Excel 文件');
    e.code = 'FILE_REQUIRED';
    throw e;
  }

  let wb;
  try {
    wb = XLSX.read(workbookBuffer, { type: 'buffer', cellDates: false });
  } catch {
    const e = new Error('无法解析 Excel，请确认文件为 .xlsx 或 .xls 且未损坏');
    e.code = 'BAD_XLSX';
    throw e;
  }

  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    const e = new Error(`上传文件中未找到工作表「${sheetName}」，请使用包含「康铭」「物源」工作表的模板`);
    e.code = 'NAMEBOOK_SHEET_NOT_FOUND';
    throw e;
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const header = detectHeader(rows);
  if (!header) {
    const e = new Error('未找到「客户名称」表头行');
    e.code = 'NAMEBOOK_BAD_HEADER';
    throw e;
  }

  const parsed = [];
  const seen = new Set();
  let skippedEmpty = 0;
  let skippedDup = 0;
  for (let i = header.headerRow + 1; i < rows.length; i++) {
    const line = rows[i];
    if (!line || !line.length) continue;
    const name = normalizeCustomerKey(line[header.nameIdx]);
    if (!name) {
      skippedEmpty += 1;
      continue;
    }
    const key = name;
    if (seen.has(key)) {
      skippedDup += 1;
      continue;
    }
    seen.add(key);
    const shortRaw = header.shortIdx >= 0 ? line[header.shortIdx] : '';
    const short = normalizeCustomerKey(shortRaw) || name;
    parsed.push({ name, short });
  }

  const conn = await pool.getConnection();
  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  let deactivated = 0;
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query(
      `SELECT sc.id, sc.customer_name,
        (SELECT COUNT(*) FROM sales_orders o WHERE o.customer_id = sc.id) AS order_count,
        (SELECT COUNT(*) FROM sales_contracts c WHERE c.customer_id = sc.id) AS contract_count
       FROM sales_customers sc
       WHERE sc.customer_group = ?`,
      [customerGroup]
    );
    const byName = new Map();
    for (const r of existing) {
      const k = normalizeCustomerKey(r.customer_name);
      if (!k) continue;
      if (!byName.has(k)) byName.set(k, r);
    }

    const fileKeys = new Set(parsed.map((p) => p.name));

    for (const rec of parsed) {
      const prev = byName.get(rec.name);
      if (prev) {
        await conn.query(
          `UPDATE sales_customers
           SET customer_name = ?, contact_name = ?, is_active = 1, updated_by = ?
           WHERE id = ?`,
          [rec.name, rec.short, userId, prev.id]
        );
        updated += 1;
      } else {
        const code = await allocateUniqueCustomerCode(conn);
        await conn.query(
          `INSERT INTO sales_customers
           (customer_code, customer_name, contact_name, phone, address, customer_group, is_active, created_by, updated_by)
           VALUES (?, ?, ?, NULL, NULL, ?, 1, ?, ?)`,
          [code, rec.name, rec.short, customerGroup, userId, userId]
        );
        inserted += 1;
      }
    }

    for (const r of existing) {
      const k = normalizeCustomerKey(r.customer_name);
      if (!k || fileKeys.has(k)) continue;
      const oc = Number(r.order_count) || 0;
      const cc = Number(r.contract_count) || 0;
      if (oc === 0 && cc === 0) {
        await conn.query('DELETE FROM sales_customers WHERE id = ?', [r.id]);
        deleted += 1;
      } else {
        await conn.query(
          'UPDATE sales_customers SET is_active = 0, updated_by = ? WHERE id = ?',
          [userId, r.id]
        );
        deactivated += 1;
      }
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  return {
    sheetName,
    inserted,
    updated,
    deleted,
    deactivated,
    skippedEmpty,
    skippedDup,
    totalInFile: parsed.length
  };
}
