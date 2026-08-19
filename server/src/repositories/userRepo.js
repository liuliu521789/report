/**
 * users 表数据访问层（仅 SQL，不写业务规则）。
 * 业务规则放在 services/userService.js。
 */

import { getPool } from '../db/pool.js';

const ACTIVE_FILTER = 'u.deleted_at IS NULL';

/** 员工账号列表：董事长第一；超级管理员/管理类在前；管理员账号类型在员工之上 */
const USER_LIST_ORDER_BY = `
  CASE WHEN IFNULL(c.code, '') = 'chairman' THEN 0 ELSE 1 END ASC,
  CASE u.account_type
    WHEN 'super_admin' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'employee' THEN 3
    ELSE 4
  END ASC,
  CASE WHEN IFNULL(c.code, '') = 'sales_admin' THEN 0 ELSE 1 END ASC,
  IFNULL(c.sort_order, 9999) ASC,
  u.id ASC`;

const BASE_SELECT = `
  SELECT u.id, u.username, u.real_name AS realName, u.phone, u.account_type AS accountType,
         u.employee_category_id AS employeeCategoryId,
         u.department_id AS departmentId,
         u.is_active AS isActive,
         IFNULL(u.token_version, 0) AS tokenVersion,
         IFNULL(u.force_change_password, 0) AS forceChangePassword,
         IFNULL(u.require_two_factor, 0) AS requireTwoFactor,
         (CASE WHEN u.totp_enabled_at IS NOT NULL THEN 1 ELSE 0 END) AS totpBound,
         u.totp_enabled_at AS totpEnabledAt,
         u.created_at AS createdAt, u.updated_at AS updatedAt,
         u.password_changed_at AS passwordChangedAt,
         c.name_zh AS categoryNameZh, c.code AS categoryCode,
         IFNULL(c.require_two_factor, 0) AS categoryRequireTwoFactor,
         d.name_zh AS departmentNameZh
  FROM users u
  LEFT JOIN employee_categories c ON c.id = u.employee_category_id
  LEFT JOIN departments d ON d.id = u.department_id
`;

function buildFilters({ keyword, accountType, isActive, categoryId, departmentId, includeDeleted = false }) {
  const where = [];
  const params = [];
  if (!includeDeleted) where.push(ACTIVE_FILTER);
  if (keyword && String(keyword).trim()) {
    where.push('(u.username LIKE ? OR u.real_name LIKE ? OR u.phone LIKE ? OR u.wecom_userid LIKE ?)');
    const like = `%${String(keyword).trim().slice(0, 64)}%`;
    params.push(like, like, like, like);
  }
  if (accountType && ['super_admin', 'manager', 'employee'].includes(accountType)) {
    where.push('u.account_type = ?');
    params.push(accountType);
  }
  if (isActive === true || isActive === 1) {
    where.push('u.is_active = 1');
  } else if (isActive === false || isActive === 0) {
    where.push('u.is_active = 0');
  }
  if (Number.isInteger(categoryId) && categoryId > 0) {
    where.push('u.employee_category_id = ?');
    params.push(categoryId);
  }
  if (Number.isInteger(departmentId) && departmentId > 0) {
    where.push('u.department_id = ?');
    params.push(departmentId);
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export async function findUsersPaged({
  page = 1,
  pageSize = 20,
  keyword = '',
  accountType = '',
  isActive = null,
  categoryId = null,
  departmentId = null
}) {
  const pool = getPool();
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.max(1, Math.min(200, Math.floor(pageSize)));
  const offset = (safePage - 1) * safeSize;
  const { whereSql, params } = buildFilters({ keyword, accountType, isActive, categoryId, departmentId });

  const [countRows] = await pool.query(`SELECT COUNT(*) AS c FROM users u ${whereSql}`, params);
  const total = Number(countRows?.[0]?.c || 0);

  const [rows] = await pool.query(
    `${BASE_SELECT} ${whereSql} ORDER BY ${USER_LIST_ORDER_BY} LIMIT ? OFFSET ?`,
    [...params, safeSize, offset]
  );
  return { items: rows || [], total, page: safePage, pageSize: safeSize };
}

/** 仅返回下拉用最小字段（不含敏感字段） */
export async function findUsersLite({ activeOnly = true, accountType = '' } = {}) {
  const pool = getPool();
  const where = ['u.deleted_at IS NULL'];
  const params = [];
  if (activeOnly) where.push('u.is_active = 1');
  if (accountType) {
    where.push('u.account_type = ?');
    params.push(accountType);
  }
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.account_type AS accountType, u.phone,
            u.real_name AS realName,
            u.is_active AS isActive,
            c.name_zh AS categoryNameZh, c.code AS categoryCode
     FROM users u
     LEFT JOIN employee_categories c ON c.id = u.employee_category_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${USER_LIST_ORDER_BY}`,
    params
  );
  return rows || [];
}

/** 详情，含敏感字段（permissions_json / wecom_userid） */
export async function findUserDetail(id, { includeDeleted = false } = {}) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.account_type AS accountType, u.phone,
            u.real_name AS realName,
            u.employee_category_id AS employeeCategoryId,
            u.department_id AS departmentId,
            u.wecom_userid AS wecomUserId,
            u.permissions_json AS permissionsJson,
            u.is_active AS isActive,
            IFNULL(u.token_version, 0) AS tokenVersion,
            IFNULL(u.force_change_password, 0) AS forceChangePassword,
            IFNULL(u.require_two_factor, 0) AS requireTwoFactor,
            u.totp_enabled_at AS totpEnabledAt,
            u.password_changed_at AS passwordChangedAt,
            u.created_at AS createdAt,
            u.updated_at AS updatedAt,
            c.name_zh AS categoryNameZh, c.code AS categoryCode,
            d.name_zh AS departmentNameZh
     FROM users u
     LEFT JOIN employee_categories c ON c.id = u.employee_category_id
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.id = ? ${includeDeleted ? '' : 'AND u.deleted_at IS NULL'} LIMIT 1`,
    [id]
  );
  return rows?.[0] || null;
}

export async function countActiveSuperAdminsExcluding(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM users
     WHERE account_type = 'super_admin' AND is_active = 1 AND deleted_at IS NULL AND id != ?`,
    [id]
  );
  return Number(rows?.[0]?.c || 0);
}

export async function insertUser({
  username,
  realName,
  passwordHash,
  accountType,
  employeeCategoryId,
  departmentId,
  phone,
  wecomUserId,
  permissionsJson,
  forceChangePassword = false,
  requireTwoFactor = false
}) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO users
       (username, password_hash, account_type, employee_category_id, department_id, phone, wecom_userid,
        real_name, permissions_json, is_active, token_version, force_change_password, require_two_factor,
        password_changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, CURRENT_TIMESTAMP(3))`,
    [
      username,
      passwordHash,
      accountType,
      employeeCategoryId ?? null,
      departmentId ?? null,
      phone ?? null,
      wecomUserId ?? null,
      String(realName || username).trim().slice(0, 64),
      permissionsJson ?? null,
      forceChangePassword ? 1 : 0,
      requireTwoFactor ? 1 : 0
    ]
  );
  return Number(result.insertId);
}

export async function updateUserFields(id, sets, params) {
  if (!sets.length) return false;
  const pool = getPool();
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  return true;
}

export async function updatePasswordById(id, passwordHash, { forceChangePassword = false } = {}) {
  const pool = getPool();
  await pool.query(
    `UPDATE users SET password_hash = ?, force_change_password = ?,
                      password_changed_at = CURRENT_TIMESTAMP(3),
                      token_version = token_version + 1
     WHERE id = ?`,
    [passwordHash, forceChangePassword ? 1 : 0, id]
  );
}

export async function softDeleteUser(id) {
  const pool = getPool();
  await pool.query(
    `UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3),
                      is_active = 0,
                      token_version = token_version + 1,
                      phone = NULL,
                      wecom_userid = NULL,
                      username = CONCAT('deleted_', id, '_', UNIX_TIMESTAMP())
     WHERE id = ?`,
    [id]
  );
}

export async function loadCategoryDefaultsJson(categoryId) {
  if (!categoryId) return null;
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT default_permissions_json FROM employee_categories WHERE id=? LIMIT 1',
    [categoryId]
  );
  return rows?.[0]?.default_permissions_json ?? null;
}

export async function loadCategoryCode(categoryId) {
  if (!categoryId) return null;
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT code FROM employee_categories WHERE id=? LIMIT 1',
    [categoryId]
  );
  return rows?.[0]?.code ? String(rows[0].code) : null;
}

export async function departmentExists(id) {
  if (id == null) return true;
  const pool = getPool();
  const [rows] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [id]);
  return !!rows?.[0];
}
