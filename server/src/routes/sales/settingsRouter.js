import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../../db/pool.js';
import { logOperationFromReq } from '../../lib/audit.js';
import {
  loadActiveOrderFlowDefinition,
  saveOrderFlowDefinition,
  FLOW_ASSIGNEE_CATEGORIES,
  FLOW_NODE_TYPES,
  terminalFlowNodes,
  categoryLabelZh,
  nodeTypeLabelZh
} from '../../lib/salesOrderFlowConfig.js';

import {
  perm,
  isSuper
} from './salesShared.js';
import { sendUnifiedError, sendUnifiedSuccess } from './salesOrderRouterHelpers.js';

const router = Router();

/** 订单号前缀（系统管理员或 data_export_all）；新订单号已不再使用此前缀 */
router.get('/settings', async (req, res, next) => {
  try {
    if (!perm(req, 'data_management', 'data_export_all') && !isSuper(req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const pool = getPool();
    const [rows] = await pool.query('SELECT order_no_prefix, last_order_seq FROM sales_settings WHERE id = 1');
    sendUnifiedSuccess(res, { settings: rows[0] || { order_no_prefix: 'SO', last_order_seq: 0 } });
  } catch (e) {
    next(e);
  }
});

router.patch('/settings', async (req, res, next) => {
  try {
    if (!perm(req, 'data_management', 'data_export_all') && !isSuper(req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const schema = z.object({
      order_no_prefix: z.string().min(1).max(32).optional()
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    if (body.order_no_prefix != null) {
      await pool.query('UPDATE sales_settings SET order_no_prefix = ? WHERE id = 1', [body.order_no_prefix]);
    }
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '修改销售设置',
      detail: body
    });
    const [rows] = await pool.query('SELECT order_no_prefix, last_order_seq FROM sales_settings WHERE id = 1');
    sendUnifiedSuccess(res, { settings: rows[0] }, '保存成功');
  } catch (e) {
    next(e);
  }
});

const orderFlowBodySchema = z.object({
  version: z.number().int().positive().optional(),
  steps: z.array(z.record(z.unknown())).min(1).max(8)
});

router.get('/order-flow', async (req, res, next) => {
  try {
    const canView =
      perm(req, 'process_management', 'view_flow')
      || perm(req, 'process_management', 'edit_flow')
      || perm(req, 'order_management', 'order_query')
      || perm(req, 'order_management', 'order_status_finance')
      || perm(req, 'order_management', 'order_status_qc')
      || isSuper(req);
    if (!canView) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const pool = getPool();
    const { definition, version } = await loadActiveOrderFlowDefinition(pool);
    sendUnifiedSuccess(res, {
      definition,
      version,
      meta: {
        node_types: Object.keys(FLOW_NODE_TYPES).map((key) => ({
          value: key,
          label: nodeTypeLabelZh(key)
        })),
        assignee_categories: FLOW_ASSIGNEE_CATEGORIES.map((code) => ({
          value: code,
          label: categoryLabelZh(code)
        })),
        terminal_nodes: terminalFlowNodes()
      }
    });
  } catch (e) {
    next(e);
  }
});

router.put('/order-flow', async (req, res, next) => {
  try {
    if (!perm(req, 'process_management', 'edit_flow') && !isSuper(req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const body = orderFlowBodySchema.parse(req.body || {});
    const pool = getPool();
    try {
      const saved = await saveOrderFlowDefinition(pool, body);
      await logOperationFromReq(req, {
        module: '销售订单',
        action: '保存订单审核流程配置',
        detail: { version: saved.version, step_count: saved.definition.steps.length }
      });
      sendUnifiedSuccess(res, saved, '流程配置已保存');
    } catch (e) {
      if (e.code === 'VALIDATION_FAILED') {
        return sendUnifiedError(res, 400, 'VALIDATION_FAILED', {
          message: e.message,
          details: e.details
        });
      }
      throw e;
    }
  } catch (e) {
    if (e?.name === 'ZodError') return sendUnifiedError(res, 400, 'VALIDATION_FAILED', { message: '请求格式无效' });
    next(e);
  }
});

export { router };
