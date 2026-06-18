import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../../db/pool.js';
import { logOperationFromReq } from '../../lib/audit.js';
import {
  loadOrderFieldDefinitions
} from '../../lib/salesOrderFields.js';
import { bumpOrderFieldSchemaVersion, readOrderFieldSchemaVersion } from '../../lib/salesOrderFieldSchemaVersion.js';

import {
  perm,
  assertMapsToAvailable
} from './salesShared.js';
import { sendUnifiedError, sendUnifiedSuccess } from './salesOrderRouterHelpers.js';

const router = Router();

router.get('/order-fields', async (req, res, next) => {
  try {
    const can =
      perm(req, 'order_management', 'order_query') ||
      perm(req, 'order_management', 'order_input') ||
      perm(req, 'order_management', 'order_field_config') ||
      perm(req, 'order_management', 'order_status_qc');
    if (!can) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const pool = getPool();
    const all = perm(req, 'order_management', 'order_field_config') && String(req.query.all) === '1';
    const items = await loadOrderFieldDefinitions(pool, { activeOnly: !all });
    const schema_version = await readOrderFieldSchemaVersion(pool);
    sendUnifiedSuccess(res, { items, schema_version });
  } catch (e) {
    next(e);
  }
});

router.get('/order-fields/:id/impact', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
    const pool = getPool();
    const [defRows] = await pool.query(
      'SELECT id, field_key, label_zh, is_active, maps_to FROM sales_order_field_definitions WHERE id = ? LIMIT 1',
      [id]
    );
    const def = defRows[0];
    if (!def) return sendUnifiedError(res, 404, 'NOT_FOUND');
    const fk = String(def.field_key || '').replace(/[^a-z0-9_]/gi, '');
    let orderCountWithKey = 0;
    if (fk) {
      const jsonPath = `$.${fk}`;
      const [c1] = await pool.query(
        `SELECT COUNT(*) AS c FROM sales_orders
         WHERE data_json IS NOT NULL AND JSON_CONTAINS_PATH(data_json, 'one', ?)`,
        [jsonPath]
      );
      orderCountWithKey = Number(c1[0]?.c || 0);
    }
    sendUnifiedSuccess(res, {
      field_key: def.field_key,
      label_zh: def.label_zh,
      is_active: !!def.is_active,
      maps_to: def.maps_to || null,
      order_count_with_data_json_key: orderCountWithKey,
      hint:
        orderCountWithKey > 0
          ? '有历史订单的 data_json 仍包含该字段键；停用后新单不再使用该字段配置，列表展示以当前启用字段为准。'
          : ''
    });
  } catch (e) {
    next(e);
  }
});

const orderFieldCreateSchema = z.object({
  field_key: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64),
  label_zh: z.string().min(1).max(128),
  field_type: z.enum(['text', 'textarea', 'number', 'positive_number', 'date']),
  required: z.coerce.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
  maps_to: z
    .union([z.string().max(32), z.null()])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v))
});

router.post('/order-fields', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const body = orderFieldCreateSchema.parse(req.body || {});
    const pool = getPool();
    await assertMapsToAvailable(pool, body.maps_to, null);
    const [dup] = await pool.query('SELECT id FROM sales_order_field_definitions WHERE field_key = ?', [body.field_key]);
    if (dup.length) return sendUnifiedError(res, 400, 'FIELD_KEY_EXISTS');
    const [r] = await pool.query(
      `INSERT INTO sales_order_field_definitions (field_key, label_zh, field_type, required, sort_order, maps_to, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        body.field_key,
        body.label_zh,
        body.field_type,
        body.required ? 1 : 0,
        body.sort_order ?? 999,
        body.maps_to || null
      ]
    );
    await bumpOrderFieldSchemaVersion(pool);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '新增订单字段',
      detail: { id: r.insertId }
    });
    sendUnifiedSuccess(res, { id: r.insertId }, '创建成功');
  } catch (e) {
    if (e.code === 'MAPS_TO_CONFLICT' || e.code === 'BAD_MAPS_TO') {
      return sendUnifiedError(res, 400, e.code, { message: e.message });
    }
    next(e);
  }
});

const orderFieldPatchSchema = z.object({
  label_zh: z.string().min(1).max(128).optional(),
  field_type: z.enum(['text', 'textarea', 'number', 'positive_number', 'date']).optional(),
  required: z.coerce.boolean().optional(),
  sort_order: z.coerce.number().int().optional(),
  maps_to: z
    .union([z.string().max(32), z.null()])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v)),
  is_active: z.coerce.boolean().optional()
});

router.patch('/order-fields/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const body = orderFieldPatchSchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_order_field_definitions WHERE id = ?', [id]);
    if (!rows[0]) return sendUnifiedError(res, 404, 'NOT_FOUND');
    const willActive = body.is_active === false ? false : !!rows[0].is_active || body.is_active === true;
    const effMaps =
      body.maps_to !== undefined ? (body.maps_to === null ? null : body.maps_to) : rows[0].maps_to || null;
    if (willActive && effMaps) {
      await assertMapsToAvailable(pool, effMaps, id);
    }
    const updates = [];
    const args = [];
    if (body.label_zh != null) {
      updates.push('label_zh = ?');
      args.push(body.label_zh);
    }
    if (body.field_type != null) {
      updates.push('field_type = ?');
      args.push(body.field_type);
    }
    if (body.required != null) {
      updates.push('required = ?');
      args.push(body.required ? 1 : 0);
    }
    if (body.sort_order != null) {
      updates.push('sort_order = ?');
      args.push(body.sort_order);
    }
    if (body.maps_to !== undefined) {
      updates.push('maps_to = ?');
      args.push(body.maps_to || null);
    }
    if (body.is_active != null) {
      updates.push('is_active = ?');
      args.push(body.is_active ? 1 : 0);
    }
    if (!updates.length) return sendUnifiedSuccess(res, { ok: true });
    args.push(id);
    await pool.query(`UPDATE sales_order_field_definitions SET ${updates.join(', ')} WHERE id = ?`, args);
    await bumpOrderFieldSchemaVersion(pool);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '修改订单字段',
      detail: { id }
    });
    sendUnifiedSuccess(res, { ok: true }, '保存成功');
  } catch (e) {
    if (e.code === 'MAPS_TO_CONFLICT' || e.code === 'BAD_MAPS_TO') {
      return sendUnifiedError(res, 400, e.code, { message: e.message });
    }
    next(e);
  }
});

router.delete('/order-fields/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const pool = getPool();
    await pool.query('UPDATE sales_order_field_definitions SET is_active = 0 WHERE id = ?', [id]);
    await bumpOrderFieldSchemaVersion(pool);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '停用订单字段',
      detail: { id }
    });
    sendUnifiedSuccess(res, { ok: true }, '停用成功');
  } catch (e) {
    next(e);
  }
});

export { router };
