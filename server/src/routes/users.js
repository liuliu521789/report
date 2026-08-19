import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { isPermissionedStaffType } from '../lib/accountTypes.js';
import {
  BizError,
  createUserUseCase,
  forceLogoutUserUseCase,
  resetUserPasswordUseCase,
  resetUserTotpUseCase,
  softDeleteUserUseCase,
  updateUserUseCase
} from '../services/userService.js';
import {
  findUserDetail,
  findUsersLite,
  findUsersPaged
} from '../repositories/userRepo.js';
import { parsePermissionsJson } from '../lib/permissions.js';

export const router = Router();

router.use(requireAuth);
router.use(requireSuperAdmin);

const ACCOUNT_TYPES = ['super_admin', 'employee', 'manager'];

const createSchema = z.object({
  username: z.string().min(1).max(64).optional(),
  loginId: z.string().min(1).max(64).optional(),
  realName: z.string().min(1).max(64).optional(),
  password: z.string().min(6).max(128).optional(),
  accountType: z.enum(ACCOUNT_TYPES),
  employeeCategoryId: z.number().int().positive().nullable().optional(),
  departmentId: z.union([z.number().int().positive(), z.null()]).optional(),
  phone: z.union([z.string().max(32), z.null()]).optional(),
  wecomUserId: z.string().max(64).optional().nullable(),
  permissions: z.any().optional().nullable(),
  forceChangePassword: z.boolean().optional(),
  requireTwoFactor: z.boolean().optional()
});

const updateSchema = z
  .object({
    username: z.string().min(1).max(64).optional(),
    loginId: z.string().min(1).max(64).optional(),
    realName: z.string().min(1).max(64).optional(),
    accountType: z.enum(ACCOUNT_TYPES).optional(),
    employeeCategoryId: z.number().int().positive().nullable().optional(),
    departmentId: z.union([z.number().int().positive(), z.null()]).optional(),
    phone: z.union([z.string().max(32), z.null()]).optional(),
    wecomUserId: z.union([z.string().max(64), z.null()]).optional(),
    permissions: z.any().optional().nullable(),
    isActive: z.boolean().optional(),
    password: z.string().min(6).max(128).optional(),
    forceChangePassword: z.boolean().optional(),
    requireTwoFactor: z.boolean().optional()
  })
  .refine(
    (d) => Object.values(d).some((v) => v !== undefined),
    { message: 'BAD_REQUEST' }
  );

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  keyword: z.string().max(64).optional().default(''),
  accountType: z.enum(['', ...ACCOUNT_TYPES]).optional().default(''),
  isActive: z.enum(['', '0', '1']).optional().default(''),
  categoryId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional()
});

const liteQuerySchema = z.object({
  accountType: z.enum(['', ...ACCOUNT_TYPES]).optional().default(''),
  activeOnly: z.enum(['', '0', '1']).optional().default('1')
});

function isActiveFromQuery(v) {
  if (v === '1') return true;
  if (v === '0') return false;
  return null;
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function handleBizError(e, res) {
  if (e instanceof BizError) {
    return res.status(e.statusCode || 400).json({ error: e.code, message: e.message });
  }
  return null;
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query || {});
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const q = parsed.data;
    const result = await findUsersPaged({
      page: q.page,
      pageSize: q.pageSize,
      keyword: q.keyword,
      accountType: q.accountType || '',
      isActive: isActiveFromQuery(q.isActive),
      categoryId: q.categoryId ?? null,
      departmentId: q.departmentId ?? null
    });
    res.json({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize
    });
  })
);

/** 下拉用：只返回最小字段，不含 permissions / wecom_userid */
router.get(
  '/lite',
  asyncRoute(async (req, res) => {
    const parsed = liteQuerySchema.safeParse(req.query || {});
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const items = await findUsersLite({
      activeOnly: parsed.data.activeOnly !== '0',
      accountType: parsed.data.accountType || ''
    });
    res.json({ items });
  })
);

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
    const row = await findUserDetail(id);
    if (!row) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({
      item: {
        ...row,
        permissions: parsePermissionsJson(row.permissionsJson),
        permissionsJson: undefined
      }
    });
  })
);

router.post(
  '/',
  asyncRoute(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const loginId = String(parsed.data.loginId || parsed.data.username || '').trim();
    const payload = {
      ...parsed.data,
      username: loginId || undefined,
      realName: String(parsed.data.realName || '').trim()
    };
    if (
      isPermissionedStaffType(payload.accountType) &&
      !payload.employeeCategoryId
    ) {
      return res.status(400).json({ error: 'BAD_REQUEST' });
    }
    try {
      const { id, username } = await createUserUseCase(req, payload);
      res.status(201).json({ id, loginId: username });
    } catch (e) {
      const handled = handleBizError(e, res);
      if (handled) return;
      throw e;
    }
  })
);

router.put(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    const payload = {
      ...parsed.data,
      username:
        parsed.data.loginId !== undefined
          ? String(parsed.data.loginId || '').trim()
          : parsed.data.username,
      realName: parsed.data.realName !== undefined ? String(parsed.data.realName || '').trim() : undefined
    };
    if (payload.username === '') return res.status(400).json({ error: 'BAD_REQUEST' });
    if (payload.realName === '') return res.status(400).json({ error: 'BAD_REQUEST' });
    try {
      await updateUserUseCase(req, id, payload);
      res.json({ ok: true });
    } catch (e) {
      const handled = handleBizError(e, res);
      if (handled) return;
      throw e;
    }
  })
);

router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
    try {
      await softDeleteUserUseCase(req, id);
      res.json({ ok: true });
    } catch (e) {
      const handled = handleBizError(e, res);
      if (handled) return;
      throw e;
    }
  })
);

const resetPwSchema = z.object({
  password: z.string().min(6).max(128).optional()
});

router.post(
  '/:id/reset-password',
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
    const parsed = resetPwSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
    try {
      const { temporaryPassword } = await resetUserPasswordUseCase(req, id, parsed.data.password);
      res.json({ ok: true, temporaryPassword });
    } catch (e) {
      const handled = handleBizError(e, res);
      if (handled) return;
      throw e;
    }
  })
);

router.post(
  '/:id/force-logout',
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
    try {
      await forceLogoutUserUseCase(req, id);
      res.json({ ok: true });
    } catch (e) {
      const handled = handleBizError(e, res);
      if (handled) return;
      throw e;
    }
  })
);

router.post(
  '/:id/reset-totp',
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
    try {
      await resetUserTotpUseCase(req, id);
      res.json({ ok: true });
    } catch (e) {
      const handled = handleBizError(e, res);
      if (handled) return;
      throw e;
    }
  })
);
