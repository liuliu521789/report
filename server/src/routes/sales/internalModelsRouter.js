import fs from 'fs/promises';
import { Router } from 'express';
import { z } from 'zod';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';

import { getPool } from '../../db/pool.js';
import { logOperationFromReq } from '../../lib/audit.js';

import {
  perm
} from './salesShared.js';
import { sendUnifiedError, sendUnifiedSuccess, upload, detectInternalModelImportLayout } from './salesOrderRouterHelpers.js';

const router = Router();

router.get('/internal-models', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const q = String(req.query.q || '').trim();
    const statusFilter = req.query.status || req.query.is_active;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize || req.query.limit) || 20));
    const offset = (page - 1) * pageSize;
    const pool = getPool();
    let where = 'WHERE 1=1';
    const args = [];
    if (statusFilter !== undefined && statusFilter !== '') {
      const isActive = statusFilter === '1' || statusFilter === 'true' || statusFilter === 'active' || statusFilter === true;
      where += ' AND is_active = ?';
      args.push(isActive ? 1 : 0);
    }
    if (q) {
      where += ' AND (internal_code LIKE ? OR name LIKE ?)';
      const p = `%${q}%`;
      args.push(p, p);
    }
    const countSql = `SELECT COUNT(*) as total FROM sales_internal_models ${where}`;
    const [countRows] = await pool.query(countSql, args);
    const total = Number(countRows[0]?.total || 0);

    const sql = `SELECT
      id, internal_code, name, product_name, is_active, remarks,
      created_at, updated_at,
      (SELECT username FROM users WHERE id = created_by LIMIT 1) as created_by_username,
      (SELECT username FROM users WHERE id = updated_by LIMIT 1) as updated_by_username
      FROM sales_internal_models ${where}
      ORDER BY internal_code ASC, id DESC
      LIMIT ? OFFSET ?`;
    const queryArgs = [...args, pageSize, offset];
    const [rows] = await pool.query(sql, queryArgs);
    sendUnifiedSuccess(res, {
      items: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/internal-models', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const schema = z.object({
      internal_code: z.string().min(1).max(64).regex(/^[A-Za-z0-9\-_]+$/, '编码只能包含字母、数字、-、_'),
      name: z.string().min(1).max(128),
      product_name: z.string().max(256).optional().nullable().transform(v => v || null),
      is_active: z.preprocess((v) => v !== false && v !== 'false' && v !== 0 && v !== '0', z.boolean()).default(true),
      remarks: z.string().max(512).optional().nullable().transform(v => v || null)
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    // 重复编码校验
    const [dup] = await pool.query('SELECT id FROM sales_internal_models WHERE internal_code = ? LIMIT 1', [body.internal_code]);
    if (dup.length > 0) return sendUnifiedError(res, 400, 'DUPLICATE_INTERNAL_CODE');
    const [r] = await pool.query(
      `INSERT INTO sales_internal_models (internal_code, name, product_name, is_active, remarks, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        body.internal_code.toUpperCase(),
        body.name,
        body.product_name,
        body.is_active ? 1 : 0,
        body.remarks,
        req.user.userId,
        req.user.userId
      ]
    );
    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '新增内部型号',
      detail: { id: r.insertId, internal_code: body.internal_code, name: body.name }
    });
    sendUnifiedSuccess(res, { id: r.insertId, success: true }, '创建成功');
  } catch (e) {
    if (e.errors?.length) {
      return sendUnifiedError(res, 400, 'VALIDATION_ERROR', { details: e.errors });
    }
    next(e);
  }
});

router.patch('/internal-models/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_ID');
    const schema = z.object({
      internal_code: z.string().min(1).max(64).regex(/^[A-Za-z0-9\-_]+$/, '编码只能包含字母、数字、-、_').optional(),
      name: z.string().min(1).max(128).optional(),
      product_name: z.string().max(256).optional().nullable().transform(v => v || null),
      is_active: z.preprocess((v) => v === true || v === 'true' || v === 1 || v === '1', z.boolean()).optional(),
      remarks: z.string().max(512).optional().nullable().transform(v => v || null)
    });
    const body = schema.parse(req.body || {});
    if (Object.keys(body).length === 0) return sendUnifiedError(res, 400, 'NO_CHANGES');
    const pool = getPool();
    // 重复编码校验（如果修改编码）
    if (body.internal_code !== undefined) {
      const [dup] = await pool.query(
        'SELECT id FROM sales_internal_models WHERE internal_code = ? AND id != ? LIMIT 1',
        [body.internal_code, id]
      );
      if (dup.length > 0) return sendUnifiedError(res, 400, 'DUPLICATE_INTERNAL_CODE');
    }
    const setParts = [];
    const values = [];
    if (body.internal_code !== undefined) {
      setParts.push('internal_code = ?');
      values.push(body.internal_code.toUpperCase());
    }
    if (body.name !== undefined) {
      setParts.push('name = ?');
      values.push(body.name);
    }
    if (body.product_name !== undefined) {
      setParts.push('product_name = ?');
      values.push(body.product_name);
    }
    if (body.is_active !== undefined) {
      setParts.push('is_active = ?');
      values.push(body.is_active ? 1 : 0);
    }
    if (body.remarks !== undefined) {
      setParts.push('remarks = ?');
      values.push(body.remarks);
    }
    setParts.push('updated_by = ?');
    values.push(req.user.userId);
    const sql = `UPDATE sales_internal_models SET ${setParts.join(', ')} WHERE id = ?`;
    values.push(id);
    const [result] = await pool.query(sql, values);
    if (result.affectedRows === 0) return sendUnifiedError(res, 404, 'NOT_FOUND');
    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '编辑内部型号',
      detail: { id, ...body }
    });
    sendUnifiedSuccess(res, { success: true, id }, '保存成功');
  } catch (e) {
    if (e.errors?.length) {
      return sendUnifiedError(res, 400, 'VALIDATION_ERROR', { details: e.errors });
    }
    next(e);
  }
});

/** 上传表格（xlsx/xls）批量导入：表头为「名称/客户型号」+「英文代码」时按列名取数；否则默认前两列为 名称、内部编码 */
router.post('/internal-models/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    if (!req.file?.buffer) return sendUnifiedError(res, 400, 'FILE_REQUIRED');
    const uid = req.user.userId;
    const pool = getPool();
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return sendUnifiedError(res, 400, 'EMPTY_SHEET');
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    if (!rows.length) return sendUnifiedError(res, 400, 'EMPTY_SHEET');

    const { startRow, nameIdx, codeIdx, productNameIdx } = detectInternalModelImportLayout(rows);

    const codeRe = /^[A-Za-z0-9\-_]+$/;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (let ri = startRow; ri < rows.length; ri++) {
      const line = rows[ri] || [];
      let rawName = String(line[nameIdx] ?? '').trim();
      const rawCodeCell = String(line[codeIdx] ?? '')
        .trim()
        .toUpperCase();
      if (!rawCodeCell && !rawName) {
        skipped += 1;
        continue;
      }
      if (!rawCodeCell) {
        skipped += 1;
        errors.push({ row: ri + 1, reason: '缺少内部编码（英文代码列）' });
        continue;
      }
      // 支持一个单元格内多个编码：BP301P/NL301P、A／B、A,B、A;B 等
      // 按"单行显示"需求：会规范化后合并为一个 internal_code（如 BP301P/NL301P），不拆多行
      const codeCandidates = rawCodeCell
        .split(/[\/／,，;；\s]+/)
        .map((s) => String(s || '').trim().toUpperCase())
        .filter(Boolean);
      const uniqueCodes = [...new Set(codeCandidates)];
      if (!uniqueCodes.length) {
        skipped += 1;
        errors.push({ row: ri + 1, reason: '缺少内部编码（英文代码列）' });
        continue;
      }
      const invalidCodes = uniqueCodes.filter((c) => !codeRe.test(c));
      const validCodes = uniqueCodes.filter((c) => codeRe.test(c));
      if (invalidCodes.length) {
        errors.push({ row: ri + 1, reason: `编码格式不合法: ${invalidCodes.join(',')}` });
      }
      if (!validCodes.length) {
        skipped += 1;
        continue;
      }
      const mergedCode = validCodes.join('/');
      const name = (rawName || mergedCode).slice(0, 128);
      const rawProductName = productNameIdx >= 0 ? String(line[productNameIdx] ?? '').trim().slice(0, 256) : '';
      const remarks = uniqueCodes.length > 1 ? '表格导入（一行多编码，单行展示）' : '表格导入';
      const [r] = await pool.query(
        `INSERT INTO sales_internal_models (internal_code, name, product_name, is_active, remarks, created_by, updated_by)
         VALUES (?, ?, ?, 1, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), product_name = VALUES(product_name), remarks = VALUES(remarks), updated_by = VALUES(updated_by)`,
        [mergedCode, name, rawProductName || null, remarks, uid, uid]
      );
      if (Number(r.affectedRows) === 1) inserted += 1;
      else if (Number(r.affectedRows) === 2) updated += 1;
    }

    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '表格导入内部型号',
      detail: {
        filename: req.file.originalname,
        inserted,
        updated,
        skipped,
        errorCount: errors.length
      }
    });

    sendUnifiedSuccess(
      res,
      {
        ok: true,
        inserted,
        updated,
        skipped,
        errors: errors.slice(0, 50),
        layout: { nameColumnIndex: nameIdx, codeColumnIndex: codeIdx, dataStartRow: startRow + 1 }
      },
      '导入完成'
    );
  } catch (e) {
    next(e);
  }
});

/** 下载导入模板 xlsx */
router.get('/internal-models/template', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('内部型号导入模板');
    ws.columns = [
      { header: '品名', key: 'product_name', width: 30 },
      { header: '内部编码', key: 'internal_code', width: 20 }
    ];
    ws.addRow({ product_name: '示例品名A', internal_code: 'EXAMPLE-A' });
    ws.addRow({ product_name: '示例品名B', internal_code: 'EXAMPLE-B' });
    const buf = await wb.xlsx.writeBuffer();
    const encodedName = encodeURIComponent('内部型号导入模板.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.send(Buffer.from(buf));
  } catch (e) {
    next(e);
  }
});

/** 导出全部内部型号为 xlsx */
router.get('/internal-models/export', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT internal_code, name, product_name, is_active, remarks
       FROM sales_internal_models
       ORDER BY internal_code ASC, id DESC`
    );
    const labelRow = ['内部编码', '客户型号', '品名', '状态', '备注'];
    const wsData = [
      labelRow,
      ...rows.map((r) => [
        r.internal_code,
        r.name,
        r.product_name || '',
        r.is_active ? '启用' : '停用',
        r.remarks || ''
      ])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, '内部型号');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const encodedName = encodeURIComponent('内部型号.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.send(buf);
    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '导出全部',
      detail: { count: rows.length }
    });
  } catch (e) {
    next(e);
  }
});

/** 根据型号编码查询品名（支持 customerId 参数，通过客户型号对照兜底） */
router.get('/internal-models/lookup', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const model = String(req.query.model || '').trim().toUpperCase();
    if (!model) return sendUnifiedError(res, 400, 'BAD_REQUEST', { details: '缺少 model 参数' });
    const customerId = Number(req.query.customerId) || 0;
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT internal_code, name, product_name FROM sales_internal_models WHERE (internal_code = ? OR name = ?) AND product_name IS NOT NULL LIMIT 1`,
      [model, model]
    );
    if (rows.length && rows[0].product_name) return sendUnifiedSuccess(res, rows[0]);
    // 直匹配无结果时，通过客户型号对照兜底
    if (customerId > 0) {
      const [mappingRows] = await pool.query(
        `SELECT im.internal_code, im.name, im.product_name
         FROM sales_customer_model_mappings cm
         INNER JOIN sales_internal_models im ON im.internal_code = cm.internal_model AND im.product_name IS NOT NULL
         WHERE cm.customer_id = ? AND UPPER(cm.customer_model) = ?
         LIMIT 1`,
        [customerId, model]
      );
      if (mappingRows.length) return sendUnifiedSuccess(res, mappingRows[0]);
    }
    sendUnifiedSuccess(res, null);
  } catch (e) {
    next(e);
  }
});

router.post('/internal-models/batch-delete', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const schema = z.object({
      ids: z.array(z.coerce.number().int().positive()).min(1).max(500)
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const ph = body.ids.map(() => '?').join(',');
    const [r] = await pool.query(`DELETE FROM sales_internal_models WHERE id IN (${ph})`, body.ids);
    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '批量删除内部型号',
      detail: { ids: body.ids, deleted: r.affectedRows }
    });
    sendUnifiedSuccess(res, { ok: true, deleted: r.affectedRows }, '删除成功');
  } catch (e) {
    if (e.errors?.length) return sendUnifiedError(res, 400, 'VALIDATION_ERROR');
    next(e);
  }
});

router.post('/internal-models/batch-enable', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const schema = z.object({
      ids: z.array(z.coerce.number().int().positive()).min(1).max(500)
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const ph = body.ids.map(() => '?').join(',');
    const [existRows] = await pool.query(
      `SELECT id, is_active FROM sales_internal_models WHERE id IN (${ph})`,
      body.ids
    );
    const matched = Array.isArray(existRows) ? existRows.length : 0;
    const [r] = await pool.query(
      `UPDATE sales_internal_models
       SET is_active = 1, updated_by = ?
       WHERE id IN (${ph}) AND is_active <> 1`,
      [req.user.userId, ...body.ids]
    );
    const changed = Number(r.affectedRows || 0);
    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '批量启用内部型号',
      detail: { ids: body.ids, matched, changed }
    });
    sendUnifiedSuccess(res, { ok: true, matched, changed }, '启用成功');
  } catch (e) {
    if (e.errors?.length) return sendUnifiedError(res, 400, 'VALIDATION_ERROR');
    next(e);
  }
});

router.post('/internal-models/delete-all', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_field_config')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const schema = z.object({
      q: z.string().trim().max(128).optional().default(''),
      status: z.enum(['', 'active', 'inactive']).optional().default('')
    });
    const body = schema.parse(req.body || {});
    const q = String(body.q || '').trim();
    const status = String(body.status || '').trim();
    const pool = getPool();
    let where = 'WHERE 1=1';
    const args = [];
    if (status === 'active') {
      where += ' AND is_active = 1';
    } else if (status === 'inactive') {
      where += ' AND is_active = 0';
    }
    if (q) {
      where += ' AND (internal_code LIKE ? OR name LIKE ?)';
      const p = `%${q}%`;
      args.push(p, p);
    }
    const [r] = await pool.query(`DELETE FROM sales_internal_models ${where}`, args);
    await logOperationFromReq(req, {
      module: '内部型号管理',
      action: '删除全部内部型号（按筛选）',
      detail: { q, status, deleted: Number(r.affectedRows || 0) }
    });
    sendUnifiedSuccess(res, { ok: true, deleted: Number(r.affectedRows || 0) }, '删除成功');
  } catch (e) {
    if (e.errors?.length) return sendUnifiedError(res, 400, 'VALIDATION_ERROR');
    next(e);
  }
});

export { router };
