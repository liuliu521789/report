/**
 * 权限模型 schema：前端权限勾选面板的「单一来源」。
 * 已登录任意账号即可读取（schema 是公开元数据，不含任何用户数据）。
 */

import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { listPermissionSchema } from '../lib/permissionSchema.js';

export const router = Router();

router.use(requireAuth);

router.get('/schema', (req, res) => {
  res.json({ items: listPermissionSchema() });
});
