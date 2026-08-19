import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../../db/pool.js';
import { requireAuth } from '../../middleware/auth.js';

export const router = Router();

function safeParseJson(raw, fallback) {
  if (raw == null) return fallback;
  try {
    return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
  } catch {
    return fallback;
  }
}

/** GET /api/sales/order-calc-rules — 列出所有规则 */
router.get('/order-calc-rules', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, name, formulas_json, total_amount_target_col_index, decimal_places, rounding_mode, is_current, created_by, created_at, updated_at FROM order_calc_rules ORDER BY updated_at DESC'
    );
    const rules = rows.map((r) => ({
      id: String(r.id),
      name: r.name,
      formulas: safeParseJson(r.formulas_json, []),
      totalAmountTargetColIndex: r.total_amount_target_col_index != null ? r.total_amount_target_col_index : 9,
      decimalPlaces: r.decimal_places != null ? r.decimal_places : 2,
      roundingMode: r.rounding_mode || 'round',
      isCurrent: !!r.is_current,
      createdAt: r.created_at ? r.created_at.getTime() : 0,
      updatedAt: r.updated_at ? r.updated_at.getTime() : 0
    }));
    res.json({ items: rules });
  } catch (e) {
    next(e);
  }
});

/** POST /api/sales/order-calc-rules — 创建规则 */
router.post('/order-calc-rules', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(128),
      formulas: z.array(z.object({
        formulaText: z.string().min(1),
        targetColIndex: z.number().int().min(0)
      })).min(1),
      totalAmountTargetColIndex: z.number().int().min(0).optional(),
      setCurrent: z.boolean().optional()
    });
    const body = schema.parse(req.body);
    const pool = getPool();
    if (body.setCurrent) {
      await pool.query('UPDATE order_calc_rules SET is_current = 0');
    }
    const [result] = await pool.query(
      'INSERT INTO order_calc_rules (name, formulas_json, total_amount_target_col_index, is_current, created_by) VALUES (?, ?, ?, ?, ?)',
      [body.name, JSON.stringify(body.formulas), body.totalAmountTargetColIndex ?? 9, body.setCurrent ? 1 : 0, req.user?.id || null]
    );
    const id = String(result.insertId);
    res.status(201).json({ id });
  } catch (e) {
    next(e);
  }
});

/** PUT /api/sales/order-calc-rules/:id — 更新规则 */
router.put('/order-calc-rules/:id', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(128).optional(),
      formulas: z.array(z.object({
        formulaText: z.string().min(1),
        targetColIndex: z.number().int().min(0)
      })).min(1).optional(),
      totalAmountTargetColIndex: z.number().int().min(0).optional(),
      decimalPlaces: z.number().int().min(0).max(6).optional(),
      roundingMode: z.enum(['round', 'ceil', 'floor']).optional(),
      setCurrent: z.boolean().optional()
    });
    const body = schema.parse(req.body);
    const pool = getPool();
    const sets = [];
    const params = [];
    if (body.name != null) {
      sets.push('name = ?');
      params.push(body.name);
    }
    if (body.formulas != null) {
      sets.push('formulas_json = ?');
      params.push(JSON.stringify(body.formulas));
    }
    if (body.totalAmountTargetColIndex != null) {
      sets.push('total_amount_target_col_index = ?');
      params.push(body.totalAmountTargetColIndex);
    }
    if (body.decimalPlaces != null) {
      sets.push('decimal_places = ?');
      params.push(body.decimalPlaces);
    }
    if (body.roundingMode != null) {
      sets.push('rounding_mode = ?');
      params.push(body.roundingMode);
    }
    if (body.setCurrent != null) {
      sets.push('is_current = ?');
      params.push(body.setCurrent ? 1 : 0);
    }
    if (sets.length) {
      params.push(req.params.id);
      await pool.query(`UPDATE order_calc_rules SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** POST /api/sales/order-calc-rules/:id/set-current — 设为当前规则 */
router.post('/order-calc-rules/:id/set-current', requireAuth, async (req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT id FROM order_calc_rules WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: '规则不存在' });
    await pool.query('UPDATE order_calc_rules SET is_current = 0');
    await pool.query('UPDATE order_calc_rules SET is_current = 1 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
