/** 客户名称/简称查找用规范化 */

export function normalizeCustomerLookupKey(name) {
  return String(name || '').trim();
}

export function compactCustomerLookupKey(name) {
  return normalizeCustomerLookupKey(name).replace(/\s+/g, '');
}

/**
 * 按全称或简称查找已有客户（交叉匹配，与手工新增时的重名校验一致）。
 * 多条命中时优先：启用 > 有简称且全称≠简称 > 全称更长 > id 更小。
 *
 * @returns {Promise<{ id: number, is_active: number } | null>}
 */
export async function findSalesCustomerByAlias(conn, rawName) {
  const name = normalizeCustomerLookupKey(rawName);
  if (!name) return null;
  const compact = compactCustomerLookupKey(name);
  const args = [name, name];
  let extra = '';
  if (compact && compact !== name) {
    extra = ` OR REPLACE(TRIM(customer_name), ' ', '') = ? OR REPLACE(TRIM(contact_name), ' ', '') = ?`;
    args.push(compact, compact);
  }
  const [rows] = await conn.query(
    `SELECT id, is_active, customer_name, contact_name
     FROM sales_customers
     WHERE customer_name = ? OR contact_name = ?${extra}
     ORDER BY
       is_active DESC,
       CASE
         WHEN NULLIF(TRIM(contact_name), '') IS NOT NULL
          AND TRIM(customer_name) <> TRIM(contact_name) THEN 0
         ELSE 1
       END,
       CHAR_LENGTH(customer_name) DESC,
       id ASC
     LIMIT 1`,
    args
  );
  return rows.length ? rows[0] : null;
}
