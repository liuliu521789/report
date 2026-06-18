/**
 * 财务岗位企业微信收件人（从 wecomNotify 抽出，供开票通知等模块使用，避免循环依赖）。
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<string>}
 */
export async function resolveFinanceWecomTouser(pool) {
  const [comp] = await pool.query(
    'SELECT quick_role_finance_user_id AS uid FROM company_settings WHERE id=1 LIMIT 1'
  );
  const designated = comp?.[0]?.uid != null ? Number(comp[0].uid) : null;
  if (designated && Number.isFinite(designated) && designated > 0) {
    const [uRows] = await pool.query(
      'SELECT wecom_userid FROM users WHERE id=? AND is_active=1 LIMIT 1',
      [designated]
    );
    const w = uRows?.[0]?.wecom_userid != null ? String(uRows[0].wecom_userid).trim() : '';
    if (w) return w;
    return '';
  }
  const [rows] = await pool.query(
    `SELECT u.wecom_userid FROM users u
     INNER JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code = 'finance'
       AND u.wecom_userid IS NOT NULL AND TRIM(u.wecom_userid) <> ''`
  );
  const ids = (rows || []).map((r) => String(r.wecom_userid).trim()).filter(Boolean);
  return [...new Set(ids)].join('|');
}
