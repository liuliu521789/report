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

    // 新模板格式：客户全称、客户简称、联系人、传真、电话、地址、开户银行、账号、税号
    const fullNameIdx = r.findIndex((c) => c === '客户全称');
    if (fullNameIdx >= 0) {
      const colMap = { nameIdx: fullNameIdx };
      const labels = ['客户简称', '联系人', '传真', '电话', '地址', '开户银行', '账号', '税号'];
      const keys = ['shortIdx', 'contactPersonIdx', 'faxIdx', 'phoneIdx', 'addressIdx', 'bankNameIdx', 'bankAccountIdx', 'taxIdIdx'];
      for (let k = 0; k < labels.length; k++) {
        const idx = r.findIndex((c) => c === labels[k]);
        if (idx >= 0) colMap[keys[k]] = idx;
      }
      return { headerRow: i, ...colMap };
    }

    // 旧模板格式：客户名称、简称
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
  const legacySheetName = customerGroup ? CUSTOMER_DIRECTORY_SHEETS[customerGroup] : null;
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

  // 优先使用导入模板工作表，其次使用传统分组工作表
  let sheet = wb.Sheets['客户导入模板'];
  let sheetName = '客户导入模板';
  if (!sheet && legacySheetName) {
    sheetName = legacySheetName;
    sheet = wb.Sheets[sheetName];
  }
  if (!sheet) {
    // 尝试查找任意可用工作表
    const allSheets = wb.SheetNames;
    for (const name of allSheets) {
      sheet = wb.Sheets[name];
      sheetName = name;
      break;
    }
  }
  if (!sheet) {
    const errMsg = legacySheetName
      ? `上传文件中未找到工作表「${legacySheetName}」或「客户导入模板」`
      : '上传文件中未找到任何工作表';
    const e = new Error(errMsg);
    e.code = 'NAMEBOOK_SHEET_NOT_FOUND';
    throw e;
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const header = detectHeader(rows);
  if (!header) {
    const e = new Error('未找到「客户名称」或「客户全称」表头行');
    e.code = 'NAMEBOOK_BAD_HEADER';
    throw e;
  }

  const isNewFormat = header.contactPersonIdx !== undefined; // 新模板特有字段
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
    const rec = { name };
    if (isNewFormat) {
      const shortRaw = header.shortIdx >= 0 ? line[header.shortIdx] : '';
      rec.short = normalizeCustomerKey(shortRaw) || name;
      rec.contact_person = header.contactPersonIdx >= 0 ? normalizeCustomerKey(line[header.contactPersonIdx]) : undefined;
      rec.fax = header.faxIdx >= 0 ? normalizeCustomerKey(line[header.faxIdx]) : undefined;
      rec.phone = header.phoneIdx >= 0 ? normalizeCustomerKey(line[header.phoneIdx]) : undefined;
      rec.address = header.addressIdx >= 0 ? normalizeCustomerKey(line[header.addressIdx]) : undefined;
      rec.bank_name = header.bankNameIdx >= 0 ? normalizeCustomerKey(line[header.bankNameIdx]) : undefined;
      rec.bank_account = header.bankAccountIdx >= 0 ? normalizeCustomerKey(line[header.bankAccountIdx]) : undefined;
      rec.tax_id = header.taxIdIdx >= 0 ? normalizeCustomerKey(line[header.taxIdIdx]) : undefined;
    } else {
      const shortRaw = header.shortIdx >= 0 ? line[header.shortIdx] : '';
      rec.short = normalizeCustomerKey(shortRaw) || name;
    }
    parsed.push(rec);
  }

  const conn = await pool.getConnection();
  let inserted = 0;
  let updated = 0;
  let deactivated = 0;
  let deleted = 0;
  try {
    await conn.beginTransaction();
    const [existing] = customerGroup
      ? await conn.query(
          `SELECT sc.id, sc.customer_name
           FROM sales_customers sc
           WHERE sc.customer_group = ?`,
          [customerGroup]
        )
      : await conn.query(
          `SELECT sc.id, sc.customer_name
           FROM sales_customers sc`
        );
    const byName = new Map();
    const byShort = new Map();
    for (const r of existing) {
      const kn = normalizeCustomerKey(r.customer_name);
      const ks = normalizeCustomerKey(r.contact_name);
      if (kn && !byName.has(kn)) byName.set(kn, r);
      if (ks && !byShort.has(ks)) byShort.set(ks, r);
    }

    const resolveExisting = (rec) =>
      byName.get(rec.name) ||
      byShort.get(rec.name) ||
      (rec.short ? byShort.get(rec.short) || byName.get(rec.short) : null);

    const parsedNames = new Set(parsed.map((r) => r.name));

    const OPTIONAL_FIELDS = ['contact_person', 'fax', 'phone', 'address', 'bank_name', 'bank_account', 'tax_id'];
    for (const rec of parsed) {
      const prev = resolveExisting(rec);
      if (prev) {
        if (isNewFormat) {
          const setParts = ['customer_name = ?', 'contact_name = ?', 'is_active = 1', 'updated_by = ?'];
          const vals = [rec.name, rec.short, userId];
          for (const f of OPTIONAL_FIELDS) {
            if (rec[f] !== undefined) {
              setParts.push(`${f} = ?`);
              vals.push(rec[f] || null);
            }
          }
          vals.push(prev.id);
          await conn.query(`UPDATE sales_customers SET ${setParts.join(', ')} WHERE id = ?`, vals);
        } else {
          await conn.query(
            `UPDATE sales_customers
             SET customer_name = ?, contact_name = ?, is_active = 1, updated_by = ?
             WHERE id = ?`,
            [rec.name, rec.short, userId, prev.id]
          );
        }
        updated += 1;
      } else {
        const code = await allocateUniqueCustomerCode(conn);
        if (isNewFormat) {
          const cols = ['customer_code', 'customer_name', 'contact_name', 'customer_group', 'is_active', 'created_by', 'updated_by'];
          const placeholders = ['?', '?', '?', '?', '1', '?', '?'];
          const vals = [code, rec.name, rec.short, customerGroup, userId, userId];
          for (const f of OPTIONAL_FIELDS) {
            if (rec[f] !== undefined) {
              cols.push(f);
              placeholders.push('?');
              vals.push(rec[f] || null);
            }
          }
          await conn.query(
            `INSERT INTO sales_customers (${cols.join(', ')})
             VALUES (${placeholders.join(', ')})`,
            vals
          );
        } else {
          await conn.query(
            `INSERT INTO sales_customers
             (customer_code, customer_name, contact_name, phone, address, customer_group, is_active, created_by, updated_by)
             VALUES (?, ?, ?, NULL, NULL, ?, 1, ?, ?)`,
            [code, rec.name, rec.short, customerGroup, userId, userId]
          );
        }
        inserted += 1;
      }
    }

    // 表中无、库中有：无订单且无合同则删除，否则停用
    for (const [name, rec] of byName) {
      if (parsedNames.has(name)) continue;
      const [[{ order_cnt }]] = await conn.query(
        'SELECT COUNT(*) AS order_cnt FROM sales_orders WHERE customer_id = ?',
        [rec.id]
      );
      const [[{ contract_cnt }]] = await conn.query(
        'SELECT COUNT(*) AS contract_cnt FROM sales_contracts WHERE customer_id = ?',
        [rec.id]
      );
      if (order_cnt > 0 || contract_cnt > 0) {
        await conn.query(
          'UPDATE sales_customers SET is_active = 0, updated_by = ? WHERE id = ?',
          [userId, rec.id]
        );
        deactivated += 1;
      } else {
        await conn.query('DELETE FROM sales_customers WHERE id = ?', [rec.id]);
        deleted += 1;
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
    deactivated,
    deleted,
    skippedEmpty,
    skippedDup,
    totalInFile: parsed.length
  };
}
