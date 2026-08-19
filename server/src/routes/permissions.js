/**
 * 权限模型 schema：前端权限勾选面板的「单一来源」。
 * 已登录任意账号即可读取（schema 是公开元数据，不含任何用户数据）。
 */

import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { defaultPermissionsForRole, listPermissionSchema } from '../lib/permissionSchema.js';

export const router = Router();

router.use(requireAuth);

router.get('/schema', (req, res) => {
  res.json({ items: listPermissionSchema() });
});

/** 内置岗位 code 对应的系统推荐默认权限（新建员工类别时一键套用） */
router.get('/role-defaults/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toLowerCase();
  if (!code) return res.status(400).json({ error: 'BAD_REQUEST' });
  res.json({ permissions: defaultPermissionsForRole(code) });
});
