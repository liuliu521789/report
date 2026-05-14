/**
 * 销售合同生成：买方「客户名称」优先使用名录中的全称。
 * 客户名录同步规则（见 salesCustomerDirectorySync）：customer_name = 客户名称（全称），contact_name = 简称。
 * 若订单关联的客户行仅有简称（常见于按简称新建客户、未与名录全称行合并），则按简称在名录中反查全称。
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ customer_name?: string, customer_contact?: string, customer_group?: string }} row 来自订单 JOIN sales_customers 的一行
 * @returns {Promise<string>}
 */
export async function resolveCustomerLegalNameForContract(conn, row) {
  const name = String(row?.customer_name ?? '').trim();
  const contact = String(row?.customer_contact ?? '').trim();
  const group = String(row?.customer_group ?? '').trim();

  if (!name) return '';

  // 已是「全称 + 简称」成对存储：customer_name 即为全称
  if (contact && name !== contact) return name;

  const tryLookup = async (useGroup) => {
    const args = [name];
    let sql = `SELECT customer_name FROM sales_customers
       WHERE is_active = 1
         AND contact_name IS NOT NULL AND TRIM(contact_name) <> ''
         AND TRIM(contact_name) = ?
         AND TRIM(customer_name) <> TRIM(contact_name)`;
    if (useGroup && group) {
      sql += ' AND customer_group = ?';
      args.push(group);
    }
    sql += ' ORDER BY id ASC LIMIT 1';
    const [r] = await conn.query(sql, args);
    return r.length ? String(r[0].customer_name || '').trim() : '';
  };

  const byGroup = await tryLookup(true);
  if (byGroup) return byGroup;
  if (group) {
    const any = await tryLookup(false);
    if (any) return any;
  }
  return name;
}
