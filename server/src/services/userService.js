/**
 * 账号业务规则集中地：
 * - 「至少保留 1 名启用的超级管理员」
 * - 「员工/管理员必须绑定员工类别」
 * - 「super_admin 切换为员工时清空员工字段」
 * - 「权限点合并 + 裁剪未知键」
 * - 操作日志 detail 自动 diff
 *
 * 服务层只负责"业务正确"，不直接负责 HTTP 状态码——通过抛 BizError 由路由层映射。
 */

import { hashPassword } from './password.js';
import { logOperationFromReq } from '../lib/audit.js';
import {
  ALLOWED_PERMISSION_KEYS,
  ALLOWED_PERMISSION_MODULES,
  emptyPermissions
} from '../lib/permissionSchema.js';
import { isPermissionedStaffType } from '../lib/accountTypes.js';
import {
  countActiveSuperAdminsExcluding,
  departmentExists,
  findUserDetail,
  insertUser,
  loadCategoryCode,
  loadCategoryDefaultsJson,
  softDeleteUser,
  updatePasswordById,
  updateUserFields
} from '../repositories/userRepo.js';
import { bumpTokenVersion, invalidateUserGuard } from '../lib/sessionGuard.js';
import { getPool } from '../db/pool.js';
import { getSecuritySettings, validatePasswordPlain } from '../lib/securityPolicy.js';

export class BizError extends Error {
  constructor(code, message, status = 400) {
    super(message || code);
    this.code = code;
    this.statusCode = status;
  }
}

/** 解析 raw permissions JSON 字段（字符串/对象皆可） */
function parsePermissionsJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    return JSON.parse(typeof raw === 'string' ? raw : String(raw));
  } catch {
    return null;
  }
}

/** 与权限 schema 对齐：未知模块 / 未知操作直接丢弃；reports.fieldEdit 仅过滤为布尔 */
function prunePermissions(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const mod of Object.keys(input)) {
    if (!ALLOWED_PERMISSION_MODULES.has(mod)) continue;
    const node = input[mod];
    if (!node || typeof node !== 'object') continue;
    out[mod] = {};
    const allowed = ALLOWED_PERMISSION_KEYS[mod];
    for (const k of Object.keys(node)) {
      if (mod === 'reports' && k === 'fieldEdit') {
        if (node.fieldEdit && typeof node.fieldEdit === 'object') {
          const fe = {};
          for (const fk of Object.keys(node.fieldEdit)) fe[fk] = !!node.fieldEdit[fk];
          out[mod].fieldEdit = fe;
        }
        continue;
      }
      if (allowed.has(k)) out[mod][k] = !!node[k];
    }
  }
  return out;
}

/** base ⊕ override（同 mergePermissions，但带 schema 裁剪） */
export function mergePermissionsForSave(baseRaw, overrideRaw) {
  const base = prunePermissions(parsePermissionsJson(baseRaw)) || emptyPermissions();
  const override = prunePermissions(parsePermissionsJson(overrideRaw));
  if (!override) return base;
  const out = JSON.parse(JSON.stringify(base));
  for (const mod of Object.keys(override)) {
    if (!out[mod]) out[mod] = {};
    if (mod === 'reports' && override.reports.fieldEdit) {
      out.reports.fieldEdit = { ...(out.reports.fieldEdit || {}), ...override.reports.fieldEdit };
    }
    for (const k of Object.keys(override[mod])) {
      if (mod === 'reports' && k === 'fieldEdit') continue;
      out[mod][k] = !!override[mod][k];
    }
  }
  return out;
}

async function effectivePermissionsJson(categoryId, override) {
  if (!categoryId) return null;
  const baseRaw = await loadCategoryDefaultsJson(categoryId);
  const merged = mergePermissionsForSave(baseRaw, override);
  return JSON.stringify(merged);
}

function normalizePrefix(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  return s || 'EMP';
}

async function generateAutoLoginId(accountType, employeeCategoryId) {
  let prefix = 'EMP';
  if (accountType === 'super_admin') {
    prefix = 'SA';
  } else if (accountType === 'manager') {
    prefix = 'MGR';
  } else if (employeeCategoryId) {
    const code = await loadCategoryCode(employeeCategoryId);
    if (code) prefix = code;
  }
  prefix = normalizePrefix(prefix);
  const pool = getPool();
  const ym = new Date().toISOString().slice(2, 7).replace('-', '');
  const base = `${prefix}-${ym}`;
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM users
     WHERE username LIKE ?`,
    [`${base}-%`]
  );
  const next = Number(rows?.[0]?.c || 0) + 1;
  return `${base}-${String(next).padStart(3, '0')}`;
}

/** 创建账号（参数已经 zod 校验过） */
export async function createUserUseCase(req, payload) {
  const {
    username,
    realName,
    password,
    accountType,
    employeeCategoryId,
    departmentId,
    phone,
    wecomUserId,
    permissions,
    forceChangePassword = true,
    requireTwoFactor = false
  } = payload;

  if (isPermissionedStaffType(accountType) && !employeeCategoryId) {
    throw new BizError('BAD_REQUEST', '员工/管理账号必须绑定员工类别');
  }
  if (accountType === 'super_admin' && employeeCategoryId) {
    throw new BizError('BAD_REQUEST', '超级管理员不需要员工类别');
  }
  if (departmentId != null && !(await departmentExists(departmentId))) {
    throw new BizError('BAD_DEPARTMENT', '所选部门不存在');
  }

  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const pv = validatePasswordPlain(password, settings);
  if (!pv.ok) throw new BizError(pv.code, pv.message);

  const passwordHash = await hashPassword(password);

  let permissionsJson = null;
  if (isPermissionedStaffType(accountType)) {
    permissionsJson = await effectivePermissionsJson(employeeCategoryId, permissions);
  }

  const wecom =
    isPermissionedStaffType(accountType) && wecomUserId != null && String(wecomUserId).trim() !== ''
      ? String(wecomUserId).trim().slice(0, 64)
      : null;
  const normalizedPhone =
    phone == null || String(phone).trim() === '' ? null : String(phone).trim().slice(0, 32);

  let id;
  let createdLoginId = String(username || '').trim();
  for (let i = 0; i < 5; i += 1) {
    if (!createdLoginId) {
      createdLoginId = await generateAutoLoginId(accountType, employeeCategoryId);
    }
    try {
    id = await insertUser({
      username: createdLoginId,
      realName: String(realName || createdLoginId).trim().slice(0, 64),
      passwordHash,
      accountType,
      employeeCategoryId: isPermissionedStaffType(accountType) ? employeeCategoryId : null,
      departmentId: isPermissionedStaffType(accountType) ? departmentId ?? null : null,
      phone: normalizedPhone,
      wecomUserId: wecom,
      permissionsJson,
      forceChangePassword: !!forceChangePassword,
      requireTwoFactor: accountType === 'super_admin' && requireTwoFactor === true
    });
      break;
    } catch (e) {
      if (String(e?.code) === 'ER_DUP_ENTRY') {
        const msg = String(e?.sqlMessage || '');
        if (msg.includes('uk_users_phone')) {
          throw new BizError('PHONE_DUPLICATE', '手机号已被其他账号使用', 409);
        }
        if (msg.includes('uk_users_username') && !String(username || '').trim()) {
          createdLoginId = '';
          continue;
        }
        throw new BizError('USERNAME_EXISTS', '用户名已存在', 409);
      }
      throw e;
    }
  }
  if (!id) throw new BizError('CREATE_USER_FAILED', '创建账号失败');

  await logOperationFromReq(req, {
    module: '员工账号',
    action: '创建账号',
    detail: {
      id,
      username: createdLoginId,
      realName: String(realName || createdLoginId),
      accountType,
      employeeCategoryId,
      departmentId,
      phone: normalizedPhone,
      hasWecom: !!wecom
    },
    success: true
  });

  return { id, username: createdLoginId };
}

function diffUser(before, intended) {
  const fields = ['username', 'realName', 'phone', 'accountType', 'employeeCategoryId', 'departmentId', 'wecomUserId', 'isActive', 'requireTwoFactor'];
  const before_ = {};
  const after_ = {};
  for (const f of fields) {
    if (intended[f] !== undefined && intended[f] !== before[f]) {
      before_[f] = before[f];
      after_[f] = intended[f];
    }
  }
  return { before: before_, after: after_ };
}

/** 更新账号 */
export async function updateUserUseCase(req, id, payload) {
  const before = await findUserDetail(id);
  if (!before) throw new BizError('NOT_FOUND', '账号不存在', 404);

  const self = Number(req.user.userId) === Number(id);
  if (self && payload.isActive === false) throw new BizError('CANNOT_DISABLE_SELF', '不能停用自己的账号');

  const nextType = payload.accountType !== undefined ? payload.accountType : before.accountType;
  const nextActive = payload.isActive !== undefined ? !!payload.isActive : !!before.isActive;
  const nextCat = nextType === 'super_admin'
    ? null
    : (payload.employeeCategoryId !== undefined ? payload.employeeCategoryId : before.employeeCategoryId);

  if (isPermissionedStaffType(nextType) && !nextCat) {
    throw new BizError('BAD_REQUEST', '员工/管理账号必须绑定员工类别');
  }

  const wasActiveSuper = before.accountType === 'super_admin' && !!before.isActive;
  const willBeActiveSuper = nextType === 'super_admin' && nextActive;
  if (wasActiveSuper && !willBeActiveSuper) {
    const others = await countActiveSuperAdminsExcluding(id);
    if (others < 1) throw new BizError('LAST_SUPER_ADMIN', '至少需保留一名启用的超级管理员');
  }

  if (payload.departmentId !== undefined && payload.departmentId != null) {
    if (!(await departmentExists(payload.departmentId))) {
      throw new BizError('BAD_DEPARTMENT', '所选部门不存在');
    }
  }

  const sets = [];
  const params = [];
  let invalidateSession = false;

  if (payload.accountType !== undefined) {
    sets.push('account_type = ?');
    params.push(payload.accountType);
    if (payload.accountType === 'super_admin') {
      sets.push('employee_category_id = NULL', 'department_id = NULL', 'wecom_userid = NULL', 'permissions_json = NULL');
    }
    invalidateSession = true;
  }
  if (payload.username !== undefined) {
    sets.push('username = ?');
    params.push(String(payload.username).trim().slice(0, 64));
  }
  if (payload.realName !== undefined) {
    sets.push('real_name = ?');
    params.push(String(payload.realName).trim().slice(0, 64));
  }
  if (payload.employeeCategoryId !== undefined && isPermissionedStaffType(nextType)) {
    sets.push('employee_category_id = ?');
    params.push(payload.employeeCategoryId);
    invalidateSession = true;
  }
  if (payload.departmentId !== undefined && isPermissionedStaffType(nextType)) {
    sets.push('department_id = ?');
    params.push(payload.departmentId);
  }
  if (payload.phone !== undefined) {
    const p = payload.phone == null || String(payload.phone).trim() === ''
      ? null
      : String(payload.phone).trim().slice(0, 32);
    sets.push('phone = ?');
    params.push(p);
  }
  if (payload.wecomUserId !== undefined && isPermissionedStaffType(nextType)) {
    const w = payload.wecomUserId == null || String(payload.wecomUserId).trim() === ''
      ? null
      : String(payload.wecomUserId).trim().slice(0, 64);
    sets.push('wecom_userid = ?');
    params.push(w);
  }
  if (payload.isActive !== undefined) {
    sets.push('is_active = ?');
    params.push(payload.isActive ? 1 : 0);
    if (!payload.isActive) invalidateSession = true;
  }
  if (payload.requireTwoFactor !== undefined && payload.accountType !== 'employee' && payload.accountType !== 'manager') {
    /** super_admin 强制 TOTP 开关 */
    if (nextType === 'super_admin') {
      sets.push('require_two_factor = ?');
      params.push(payload.requireTwoFactor ? 1 : 0);
    }
  }

  if (payload.permissions !== undefined) {
    if (isPermissionedStaffType(nextType) && nextCat) {
      const merged = await effectivePermissionsJson(nextCat, payload.permissions);
      sets.push('permissions_json = ?');
      params.push(merged);
      invalidateSession = true;
    } else if (nextType === 'super_admin') {
      sets.push('permissions_json = NULL');
      invalidateSession = true;
    }
  }

  if (payload.password !== undefined) {
    const pool = getPool();
    const settings = await getSecuritySettings(pool);
    const pv = validatePasswordPlain(payload.password, settings);
    if (!pv.ok) throw new BizError(pv.code, pv.message);
    /** 走单独的 updatePasswordById：会同时 bump token_version */
    await updatePasswordById(id, await hashPassword(payload.password), { forceChangePassword: !self });
    invalidateUserGuard(id);
  }

  if (sets.length) {
    if (invalidateSession) {
      sets.push('token_version = token_version + 1');
    }
    try {
      await updateUserFields(id, sets, params);
    } catch (e) {
      if (String(e?.code) === 'ER_DUP_ENTRY') {
        const msg = String(e?.sqlMessage || '');
        if (msg.includes('uk_users_phone')) {
          throw new BizError('PHONE_DUPLICATE', '手机号已被其他账号使用', 409);
        }
        throw new BizError('USERNAME_EXISTS', '用户名已存在', 409);
      }
      throw e;
    }
    if (invalidateSession) invalidateUserGuard(id);
  }

  const intended = {
    username: payload.username,
    realName: payload.realName,
    phone: payload.phone == null ? null : String(payload.phone).trim() || null,
    accountType: payload.accountType,
    employeeCategoryId: payload.employeeCategoryId,
    departmentId: payload.departmentId,
    wecomUserId: payload.wecomUserId == null ? null : String(payload.wecomUserId).trim() || null,
    isActive: payload.isActive,
    requireTwoFactor: payload.requireTwoFactor
  };
  const detail = {
    userId: id,
    diff: diffUser(before, intended),
    resetPassword: payload.password !== undefined ? true : undefined,
    permissionsUpdated: payload.permissions !== undefined ? true : undefined
  };
  await logOperationFromReq(req, {
    module: '员工账号',
    action: '更新账号',
    detail,
    success: true
  });
}

/** 软删除账号 */
export async function softDeleteUserUseCase(req, id) {
  const before = await findUserDetail(id);
  if (!before) throw new BizError('NOT_FOUND', '账号不存在', 404);
  if (Number(req.user.userId) === Number(id)) throw new BizError('CANNOT_DELETE_SELF', '不能删除自己的账号');
  if (before.accountType === 'super_admin' && before.isActive) {
    const others = await countActiveSuperAdminsExcluding(id);
    if (others < 1) throw new BizError('LAST_SUPER_ADMIN', '至少需保留一名启用的超级管理员');
  }
  await softDeleteUser(id);
  invalidateUserGuard(id);
  await logOperationFromReq(req, {
    module: '员工账号',
    action: '删除账号',
    detail: { userId: id, username: before.username, accountType: before.accountType },
    success: true
  });
}

/** 重置密码：生成临时密码，强制下次登录改密 */
export async function resetUserPasswordUseCase(req, id, customPassword) {
  const before = await findUserDetail(id);
  if (!before) throw new BizError('NOT_FOUND', '账号不存在', 404);
  const pool = getPool();
  const settings = await getSecuritySettings(pool);

  const password = customPassword && String(customPassword).length >= settings.minPasswordLength
    ? String(customPassword)
    : generateTemporaryPassword(Math.max(10, settings.minPasswordLength));

  const pv = validatePasswordPlain(password, settings);
  if (!pv.ok) throw new BizError(pv.code, pv.message);

  await updatePasswordById(id, await hashPassword(password), { forceChangePassword: true });
  invalidateUserGuard(id);

  await logOperationFromReq(req, {
    module: '员工账号',
    action: '重置密码',
    detail: { userId: id, generated: !customPassword, forceChangePassword: true },
    success: true
  });
  return { temporaryPassword: password };
}

/** 强制踢线（不修改密码） */
export async function forceLogoutUserUseCase(req, id) {
  const before = await findUserDetail(id);
  if (!before) throw new BizError('NOT_FOUND', '账号不存在', 404);
  await bumpTokenVersion(undefined, id);
  await logOperationFromReq(req, {
    module: '员工账号',
    action: '强制下线',
    detail: { userId: id, username: before.username },
    success: true
  });
}

/** 临时密码生成器：保留可读字符（去掉 0 / O / 1 / l 等易混淆） */
export function generateTemporaryPassword(length = 12) {
  const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const ls = 'abcdefghjkmnpqrstuvwxyz';
  const ds = '23456789';
  const sy = '!@#$%^&*';
  const all = cs + ls + ds + sy;
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  /** 至少各取一类，凑够长度后打乱 */
  const out = [pick(cs), pick(ls), pick(ds), pick(sy)];
  while (out.length < length) out.push(pick(all));
  return out.sort(() => Math.random() - 0.5).join('');
}
