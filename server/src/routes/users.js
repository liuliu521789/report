import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { hashPassword } from '../services/password.js';
import { emptyPermissions, mergePermissions, parsePermissionsJson } from '../lib/permissions.js';
import { getSecuritySettings, validatePasswordPlain } from '../lib/securityPolicy.js';
import { logOperationFromReq } from '../lib/audit.js';
import { isPermissionedStaffType } from '../lib/accountTypes.js';

export const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

const createSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(6).max(128),
  accountType: z.enum(['super_admin', 'employee', 'manager']),
  employeeCategoryId: z.number().int().positive().nullable().optional(),
  departmentId: z.union([z.number().int().positive(), z.null()]).optional(),
  wecomUserId: z.string().max(64).optional().nullable(),
  permissions: z.any().optional().nullable()
});

const updateSchema = z
  .object({
    accountType: z.enum(['super_admin', 'employee', 'manager']).optional(),
    employeeCategoryId: z.number().int().positive().nullable().optional(),
    departmentId: z.union([z.number().int().positive(), z.null()]).optional(),
    wecomUserId: z.union([z.string().max(64), z.null()]).optional(),
    permissions: z.any().optional().nullable(),
    isActive: z.boolean().optional(),
    password: z.string().min(6).max(128).optional()
  })
  .refine(
    (d) =>
      d.accountType !== undefined ||
      d.employeeCategoryId !== undefined ||
      d.departmentId !== undefined ||
      d.wecomUserId !== undefined ||
      d.permissions !== undefined ||
      d.isActive !== undefined ||
      (typeof d.password === 'string' && d.password.length >= 6),
    { message: 'BAD_REQUEST' }
  );

async function countActiveSuperAdminsExcluding(pool, excludeId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS c FROM users WHERE account_type = ? AND is_active = 1 AND id != ?',
    ['super_admin', excludeId]
  );
  return Number(rows?.[0]?.c || 0);
}

router.get('/', async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT u.id, u.username, u.account_type AS accountType, u.employee_category_id AS employeeCategoryId,
            u.department_id AS departmentId, u.wecom_userid AS wecomUserId, u.permissions_json AS permissionsJson, u.is_active AS isActive,
            u.created_at AS createdAt, u.updated_at AS updatedAt,
            c.name_zh AS categoryNameZh, c.code AS categoryCode,
            d.name_zh AS departmentNameZh
     FROM users u
     LEFT JOIN employee_categories c ON c.id = u.employee_category_id
     LEFT JOIN departments d ON d.id = u.department_id
     ORDER BY u.id ASC`
  );
  const items = (rows || []).map((r) => ({
    ...r,
    permissions: parsePermissionsJson(r.permissionsJson)
  }));
  res.json({ items });
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { username, password, accountType, employeeCategoryId, departmentId: deptIn, wecomUserId, permissions } =
    parsed.data;

  if (isPermissionedStaffType(accountType) && !employeeCategoryId) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }
  if (accountType === 'super_admin' && employeeCategoryId) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }

  const pool = getPool();
  let departmentId = isPermissionedStaffType(accountType) ? (deptIn === undefined ? null : deptIn) : null;
  if (departmentId != null) {
    const [dRows] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [departmentId]);
    if (!dRows?.[0]) return res.status(400).json({ error: 'BAD_DEPARTMENT' });
  }
  const settings = await getSecuritySettings(pool);
  const pv = validatePasswordPlain(password, settings);
  if (!pv.ok) return res.status(400).json({ error: pv.code, message: pv.message });

  const passwordHash = hashPassword(password);
  let permissionsJson = null;
  if (isPermissionedStaffType(accountType)) {
    const [cRows] = await pool.query('SELECT default_permissions_json FROM employee_categories WHERE id=?', [
      employeeCategoryId
    ]);
    const base = parsePermissionsJson(cRows?.[0]?.default_permissions_json);
    const merged = mergePermissions(base || emptyPermissions(), permissions || {});
    permissionsJson = JSON.stringify(merged);
  }

  try {
    const wecom =
      isPermissionedStaffType(accountType) && wecomUserId != null && String(wecomUserId).trim() !== ''
        ? String(wecomUserId).trim()
        : null;
    const [result] = await pool.query(
      `INSERT INTO users (username, password_hash, account_type, employee_category_id, department_id, wecom_userid, permissions_json, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        username,
        passwordHash,
        accountType,
        isPermissionedStaffType(accountType) ? employeeCategoryId : null,
        isPermissionedStaffType(accountType) ? departmentId : null,
        isPermissionedStaffType(accountType) ? wecom : null,
        permissionsJson
      ]
    );
    await logOperationFromReq(req, {
      module: '员工账号',
      action: '创建账号',
      detail: { username, accountType },
      success: true
    });
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'USERNAME_EXISTS' });
    const errno = Number(e?.errno);
    const msg = String(e?.sqlMessage || e?.message || '');
    if (errno === 1265 || errno === 1366 || msg.toLowerCase().includes('account_type')) {
      return res.status(400).json({
        error: 'ACCOUNT_TYPE_SCHEMA',
        message:
          '数据库 users.account_type 可能仍为旧 ENUM（缺少 manager）。请重启后端以执行自动迁移，或手动运行 migrations/027_users_account_type_manager.sql'
      });
    }
    throw e;
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { accountType, employeeCategoryId, departmentId: deptBody, wecomUserId, permissions, isActive, password } =
    parsed.data;

  const pool = getPool();
  const [uRows] = await pool.query(
    'SELECT id, account_type, is_active, employee_category_id, department_id, permissions_json FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  const existing = uRows?.[0];
  if (!existing) return res.status(404).json({ error: 'NOT_FOUND' });

  const self = Number(req.user.userId) === id;

  if (self && isActive === false) return res.status(400).json({ error: 'CANNOT_DISABLE_SELF' });

  const nextType = accountType !== undefined ? accountType : existing.account_type;
  const nextActive = isActive !== undefined ? isActive : !!existing.is_active;
  const nextCat =
    nextType === 'super_admin'
      ? null
      : employeeCategoryId !== undefined
        ? employeeCategoryId
        : existing.employee_category_id;

  if (isPermissionedStaffType(nextType) && !nextCat) return res.status(400).json({ error: 'BAD_REQUEST' });

  const wasActiveSuper = existing.account_type === 'super_admin' && !!existing.is_active;
  const willBeActiveSuper = nextType === 'super_admin' && nextActive;

  if (wasActiveSuper && !willBeActiveSuper) {
    const others = await countActiveSuperAdminsExcluding(pool, id);
    if (others < 1) return res.status(400).json({ error: 'LAST_SUPER_ADMIN' });
  }

  if (self && isPermissionedStaffType(accountType) && existing.account_type === 'super_admin') {
    const others = await countActiveSuperAdminsExcluding(pool, id);
    if (others < 1) return res.status(400).json({ error: 'LAST_SUPER_ADMIN' });
  }

  const sets = [];
  const params = [];

  if (accountType !== undefined) {
    sets.push('account_type = ?');
    params.push(accountType);
    if (accountType === 'super_admin') {
      sets.push('employee_category_id = NULL');
      sets.push('department_id = NULL');
      sets.push('wecom_userid = NULL');
      sets.push('permissions_json = NULL');
    }
  }
  if (employeeCategoryId !== undefined && isPermissionedStaffType(nextType)) {
    sets.push('employee_category_id = ?');
    params.push(employeeCategoryId);
  }
  if (deptBody !== undefined && isPermissionedStaffType(nextType)) {
    if (deptBody != null) {
      const [dRows] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [deptBody]);
      if (!dRows?.[0]) return res.status(400).json({ error: 'BAD_DEPARTMENT' });
    }
    sets.push('department_id = ?');
    params.push(deptBody);
  }
  if (wecomUserId !== undefined && isPermissionedStaffType(nextType)) {
    const w =
      wecomUserId === null || String(wecomUserId).trim() === '' ? null : String(wecomUserId).trim().slice(0, 64);
    sets.push('wecom_userid = ?');
    params.push(w);
  }
  if (isActive !== undefined) {
    sets.push('is_active = ?');
    params.push(isActive ? 1 : 0);
  }
  if (password !== undefined) {
    const settings = await getSecuritySettings(pool);
    const pv = validatePasswordPlain(password, settings);
    if (!pv.ok) return res.status(400).json({ error: pv.code, message: pv.message });
    sets.push('password_hash = ?');
    params.push(hashPassword(password));
  }

  if (permissions !== undefined) {
    const catId = isPermissionedStaffType(nextType) ? nextCat : null;
    if (isPermissionedStaffType(nextType) && catId) {
      const [cRows] = await pool.query('SELECT default_permissions_json FROM employee_categories WHERE id=?', [catId]);
      const base = parsePermissionsJson(cRows?.[0]?.default_permissions_json);
      const merged = mergePermissions(base || emptyPermissions(), permissions || {});
      sets.push('permissions_json = ?');
      params.push(JSON.stringify(merged));
    } else if (nextType === 'super_admin') {
      sets.push('permissions_json = NULL');
    }
  }

  if (sets.length === 0) return res.status(400).json({ error: 'BAD_REQUEST' });

  params.push(id);
  try {
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  } catch (e) {
    const errno = Number(e?.errno);
    const msg = String(e?.sqlMessage || e?.message || '');
    if (
      errno === 1265 ||
      errno === 1366 ||
      msg.toLowerCase().includes('account_type') ||
      (msg.includes('Data truncated') && /account_type/i.test(sets.join(' ')))
    ) {
      return res.status(400).json({
        error: 'ACCOUNT_TYPE_SCHEMA',
        message:
          '数据库 users.account_type 可能仍为旧 ENUM（缺少 manager）。请重启后端以执行自动迁移，或手动运行 migrations/027_users_account_type_manager.sql'
      });
    }
    throw e;
  }
  const detail = { userId: id };
  if (password !== undefined) detail.resetPassword = true;
  if (permissions !== undefined) detail.permissionsUpdated = true;
  if (isActive !== undefined) detail.isActive = nextActive;
  await logOperationFromReq(req, {
    module: '员工账号',
    action: '更新账号',
    detail,
    success: true
  });
  res.json({ ok: true });
});
