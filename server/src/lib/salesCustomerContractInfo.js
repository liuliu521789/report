/**
 * 销售合同生成：买方完整信息兜底查询。
 * 当订单关联的 sales_customers 行仅有 customer_name（常见于按名称新建客户、未补充完整信息），
 * 但名录中存在同名的完整客户行时，按 resolvedName（全称）反查 address、contact_person 等字段。
 */

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ customer_address?: string, customer_contact?: string, customer_phone?: string, customer_fax?: string, customer_bank?: string, customer_account?: string, customer_tax_id?: string }} fromRow - 订单 JOIN sales_customers 的原始字段
 * @param {string} resolvedName - resolveCustomerLegalNameForContract 解析出的客户全称（可能与 fromRow 中的名称不同）
 * @param {string} originalName - fromRow 中原始的 customer_name
 * @returns {Promise<{ address: string, contact: string, phone: string, fax: string, bank: string, account: string, taxId: string }>}
 */
export async function resolveBuyerFieldsForContract(conn, fromRow, resolvedName, originalName) {
  let address = fromRow.customer_address || '';
  let contact = fromRow.customer_contact || '';
  let phone = fromRow.customer_phone || '';
  let fax = fromRow.customer_fax || '';
  let bank = fromRow.customer_bank || '';
  let account = fromRow.customer_account || '';
  let taxId = fromRow.customer_tax_id || '';

  const fullName = String(resolvedName || '').trim();
  const orig = String(originalName || '').trim();
  if (!fullName || fullName === orig) {
    return { address, contact, phone, fax, bank, account, taxId };
  }

  const [rows] = await conn.query(
    `SELECT address, contact_person, phone, fax, bank_name, bank_account, tax_id
     FROM sales_customers
     WHERE is_active = 1 AND customer_name = ? LIMIT 1`,
    [fullName]
  );
  if (rows.length) {
    const r = rows[0];
    // 以原始来源优先，仅补齐空字段，避免覆盖已录入内容。
    address = address || r.address || '';
    contact = contact || r.contact_person || '';
    phone = phone || r.phone || '';
    fax = fax || r.fax || '';
    bank = bank || r.bank_name || '';
    account = account || r.bank_account || '';
    taxId = taxId || r.tax_id || '';
  }
  return { address, contact, phone, fax, bank, account, taxId };
}
