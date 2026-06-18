import fs from 'fs/promises';
import path from 'path';
import { Router } from 'express';
import { z } from 'zod';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';

import { getPool } from '../../db/pool.js';
import { logOperationFromReq } from '../../lib/audit.js';
import { listQuerySchema } from '../../lib/salesOrderListQuerySchema.js';
import { buildSalesOrdersExportXlsxBuffer, EXPORT_LIMIT as SALES_ORDER_EXPORT_LIMIT } from '../../lib/salesOrderExportBuild.js';
import {
  loadOrderFieldDefinitions,
  validateOrderDataInput,
  dataJsonToLegacyColumns,
  importHeaderSynonymsForField,
  splitLabelWarehouseCell
} from '../../lib/salesOrderFields.js';

import {
  perm,
  isSuper,
  canViewAllSalesOrders,
  isOrderCreatedByCurrentUser,
  assertFinanceOrderListScope,
  orderImportRowFingerprint,
  insertOrderWithData,
  lookupCustomerUnitPriceTon,
  lookupCustomerUnitPriceTonByCustomerName,
  applyLegUnitPriceAndAmount,
  extractUserImportUnitPriceTon,
  getOrCreateCustomer,
  normalizeImportHeaderLabel,
  coerceImportCell,
  resolveImportUnitPriceColumnIndex,
  parseImportUnitPriceKgToTon
} from './salesShared.js';
import {
  sendUnifiedError,
  sendUnifiedSuccess,
  upload,
  mapImportRowPersistError,
  orderDuplicateFingerprintKey,
  loadExistingDuplicateOrderBatch,
  snapshotRequesterForExportJob,
  buildSalesImportSampleRow
} from './salesOrderRouterHelpers.js';

const router = Router();

router.get('/orders/:id/status-logs', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_view_status_logs')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    if (!rows[0]) return sendUnifiedError(res, 404, 'NOT_FOUND');
    try {
      assertFinanceOrderListScope(req, rows[0]);
    } catch (e) {
      if (e.code === 'FORBIDDEN') return sendUnifiedError(res, 403, 'FORBIDDEN');
      throw e;
    }
    const seeAll = canViewAllSalesOrders(req);
    if (!seeAll && !isOrderCreatedByCurrentUser(rows[0], req)) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const [logs] = await pool.query(
      `SELECT l.*, u.username AS actor_username, u.real_name AS actor_real_name FROM sales_order_status_logs l
       LEFT JOIN users u ON u.id = l.actor_id WHERE l.order_id = ? ORDER BY l.created_at ASC`,
      [id]
    );
    sendUnifiedSuccess(res, { items: logs });
  } catch (e) {
    next(e);
  }
});

router.get('/orders/:id/edit-logs', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_view_status_logs')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    if (!rows[0]) return sendUnifiedError(res, 404, 'NOT_FOUND');
    try {
      assertFinanceOrderListScope(req, rows[0]);
    } catch (e) {
      if (e.code === 'FORBIDDEN') return sendUnifiedError(res, 403, 'FORBIDDEN');
      throw e;
    }
    const seeAll = canViewAllSalesOrders(req);
    if (!seeAll && !isOrderCreatedByCurrentUser(rows[0], req)) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const [logs] = await pool.query(
      `SELECT l.*, u.username AS actor_username, u.real_name AS actor_real_name FROM sales_order_edit_logs l
       LEFT JOIN users u ON u.id = l.actor_id WHERE l.order_id = ? ORDER BY l.created_at ASC`,
      [id]
    );
    sendUnifiedSuccess(res, { items: logs });
  } catch (e) {
    next(e);
  }
});

router.get('/customers/:customerId/contracts', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_view')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const customerId = Number(req.params.customerId);
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT c.*, u.username AS created_by_username, ru.username AS reviewer_username,
              ru.real_name AS reviewer_real_name,
              (SELECT a.comment_text FROM sales_contract_audit_logs a
               WHERE a.contract_id = c.id AND a.result = 'rejected'
               ORDER BY a.id DESC LIMIT 1) AS last_reject_comment
       FROM sales_contracts c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN users ru ON ru.id = c.reviewer_user_id
       WHERE c.customer_id = ?
       ORDER BY c.created_at DESC`,
      [customerId]
    );
    sendUnifiedSuccess(res, { items: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/export/jobs', async (req, res, next) => {
  try {
    const canExport =
      isSuper(req) ||
      perm(req, 'data_management', 'data_export_all') ||
      perm(req, 'data_management', 'data_export');
    if (!canExport) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const merged = { ...(typeof req.query === 'object' ? req.query : {}), ...(req.body && typeof req.body === 'object' ? req.body : {}) };
    const q = listQuerySchema.parse(merged);
    const pool = getPool();
    const uid = req.user.userId;
    const requester = snapshotRequesterForExportJob(req);
    const [ins] = await pool.query(
      `INSERT INTO sales_order_export_jobs (created_by, requester_json, filter_json, status)
       VALUES (?, CAST(? AS JSON), CAST(? AS JSON), 'pending')`,
      [uid, JSON.stringify(requester), JSON.stringify(q)]
    );
    const jobId = Number(ins.insertId);
    sendUnifiedSuccess(res, { id: jobId, status: 'pending' }, '导出任务已创建');
  } catch (e) {
    next(e);
  }
});

router.get('/orders/export/jobs/:id', async (req, res, next) => {
  try {
    const canExport =
      isSuper(req) ||
      perm(req, 'data_management', 'data_export_all') ||
      perm(req, 'data_management', 'data_export');
    if (!canExport) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
    const uid = req.user.userId;
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, status, total_hit, row_count_exported, last_error, created_at, finished_at
       FROM sales_order_export_jobs WHERE id = ? AND created_by = ? LIMIT 1`,
      [id, uid]
    );
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    sendUnifiedSuccess(res, {
      id: row.id,
      status: row.status,
      total_hit: row.total_hit != null ? Number(row.total_hit) : null,
      row_count_exported: row.row_count_exported != null ? Number(row.row_count_exported) : null,
      last_error: row.last_error || null,
      created_at: row.created_at,
      finished_at: row.finished_at
    });
  } catch (e) {
    next(e);
  }
});

router.get('/orders/export/jobs/:id/download', async (req, res, next) => {
  try {
    const canExport =
      isSuper(req) ||
      perm(req, 'data_management', 'data_export_all') ||
      perm(req, 'data_management', 'data_export');
    if (!canExport) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
    const uid = req.user.userId;
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, status, file_path FROM sales_order_export_jobs WHERE id = ? AND created_by = ? LIMIT 1`,
      [id, uid]
    );
    const row = rows[0];
    if (!row) return sendUnifiedError(res, 404, 'NOT_FOUND');
    if (row.status !== 'done') {
      return sendUnifiedError(res, 409, 'EXPORT_NOT_READY', { message: '导出尚未完成或已失败，请稍后重试' });
    }
    const rel = String(row.file_path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!rel || rel.includes('..')) return sendUnifiedError(res, 400, 'BAD_PATH');
    const abs = path.join(process.cwd(), rel);
    try {
      await fs.access(abs);
    } catch {
      return sendUnifiedError(res, 410, 'EXPORT_FILE_MISSING', { message: '导出文件已过期或不存在' });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="sales-orders-${id}.xlsx"`);
    res.sendFile(abs);
  } catch (e) {
    next(e);
  }
});

router.get('/orders/export/xlsx', async (req, res, next) => {
  try {
    const canExport =
      isSuper(req) ||
      perm(req, 'data_management', 'data_export_all') ||
      perm(req, 'data_management', 'data_export');
    if (!canExport) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const q = listQuerySchema.parse(req.query);
    const pool = getPool();
    const { buffer, rowCount, totalHit } = await buildSalesOrdersExportXlsxBuffer(pool, req, q);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-orders.xlsx"');
    res.send(buffer);
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '导出订单',
      detail: { count: rowCount, total_hit: totalHit, truncated: totalHit > SALES_ORDER_EXPORT_LIMIT }
    });
  } catch (e) {
    next(e);
  }
});

router.get('/orders/template/xlsx', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_input')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const pool = getPool();
    let fieldDefs = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    // 合并标签型号和仓库型号为一列
    const productModelDef = fieldDefs.find(d => d.field_key === 'product_model');
    const warehouseModelDef = fieldDefs.find(d => d.field_key === 'warehouse_model');
    if (productModelDef && warehouseModelDef) {
      fieldDefs = fieldDefs.filter(d => d.field_key !== 'warehouse_model');
      productModelDef.label_zh = '标签型号/仓库型号';
    }
    const headers = fieldDefs.map((d) => d.label_zh);
    const sampleRow = buildSalesImportSampleRow(fieldDefs);
    const colCount = headers.length;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SalesSystem';
    const ws = wb.addWorksheet('template');

    // 列宽
    ws.columns = headers.map(() => ({ width: 16 }));

    // 警告行（第1行）
    const warnCell = ws.getCell(1, 1);
    warnCell.value = '⚠ 请务必在导入系统前删除下方的测试数据行和本行提示语！';
    warnCell.font = { bold: true, color: { argb: 'FFCC0000' }, size: 11 };
    warnCell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.mergeCells(1, 1, 1, colCount);

    // 表头行（第2行）
    const headerRow = ws.getRow(2);
    headers.forEach((h, ci) => { headerRow.getCell(ci + 1).value = h; });
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // 测试数据行（第3行）—— 黄色背景
    const sampleRowObj = ws.getRow(3);
    sampleRow.forEach((v, ci) => { sampleRowObj.getCell(ci + 1).value = v; });
    sampleRowObj.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' }
      };
    });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-import-template.xlsx"');
    res.send(Buffer.from(buf));
  } catch (e) {
    next(e);
  }
});

router.post('/orders/import/xlsx', upload.single('file'), async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_input')) {
      return sendUnifiedError(res, 403, 'FORBIDDEN_ORDER_INPUT', {
        message: '缺少权限：销售·订单-录入/Excel导入'
      });
    }
    if (!req.file?.buffer) return sendUnifiedError(res, 400, 'FILE_REQUIRED');
    const uid = req.user.userId;
    const pool = getPool();
    const definitions = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    if (!definitions.length) return sendUnifiedError(res, 400, 'NO_FIELDS_DEFINED');
    const requiredHeaderLabels = definitions.filter((d) => d.required).map((d) => d.label_zh);
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return sendUnifiedError(res, 400, 'EMPTY_SHEET');
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    if (!data.length) return sendUnifiedError(res, 400, 'EMPTY_SHEET');
    const rawHeader = (data[0] || []).map((c) => c);
    const colIndexByNorm = new Map();
    for (let j = 0; j < rawHeader.length; j++) {
      const norm = normalizeImportHeaderLabel(rawHeader[j]);
      if (!norm) continue;
      if (colIndexByNorm.has(norm)) {
        return sendUnifiedError(res, 400, 'DUPLICATE_HEADER', {
          message: `表头「${norm}」重复，请删除重复列后重试`,
          label: norm
        });
      }
      colIndexByNorm.set(norm, j);
    }
    const columnIndexes = [];
    const productDefI = definitions.findIndex((d) => d.field_key === 'product_model');
    for (let i = 0; i < definitions.length; i++) {
      const def = definitions[i];
      let idx;
      for (const syn of importHeaderSynonymsForField(def)) {
        const norm = normalizeImportHeaderLabel(syn);
        if (!norm) continue;
        const hit = colIndexByNorm.get(norm);
        if (hit !== undefined) {
          idx = hit;
          break;
        }
      }
      if (idx === undefined && def.field_key === 'warehouse_model' && productDefI >= 0) {
        const pIdx = columnIndexes[productDefI];
        if (typeof pIdx === 'number') idx = pIdx;
      }
      if (idx === undefined) {
        if (!def.required) {
          columnIndexes.push(null);
          continue;
        }
        let hint = '';
        if (def.field_key === 'order_date') {
          hint = '；上传表中的「日期」列即为发货日期，无需改名';
        } else if (def.field_key === 'warehouse_model') {
          hint = '；若只有「标签型号/仓库型号」一列或仅有「标签型号」列，请将两值写在同一列（用 / 分隔）';
        }
        return sendUnifiedError(res, 400, 'HEADER_MISMATCH', {
          message: `未找到与「${def.label_zh}」对应的表头列${hint}。请与模板列名一致或包含同义表头（可带 * 前缀，列顺序可任意）`,
          expected: requiredHeaderLabels,
          got: rawHeader.map((c) => String(c ?? '').trim())
        });
      }
      columnIndexes.push(idx);
    }
    const warehouseDefI = definitions.findIndex((d) => d.field_key === 'warehouse_model');
    const unitPriceDefI = definitions.findIndex((d) => d.maps_to === 'unit_price');
    const mappedUnitPriceCol =
      unitPriceDefI >= 0 && typeof columnIndexes[unitPriceDefI] === 'number'
        ? columnIndexes[unitPriceDefI]
        : null;
    const importUnitPriceColI = resolveImportUnitPriceColumnIndex(
      colIndexByNorm,
      mappedUnitPriceCol != null ? [mappedUnitPriceCol] : []
    );
    const confirmDup =
      req.body?.confirm_duplicate_import === '1' ||
      req.body?.confirm_duplicate_import === 'true' ||
      req.body?.confirm_duplicate_import === true;

    const prepared = [];
    for (let ri = 1; ri < data.length; ri++) {
      const line = data[ri];
      if (!line || !line.some((c) => String(c || '').trim())) continue;
      const rowNum = ri + 1;
      const obj = {};
      definitions.forEach((d, j) => {
        const colI = columnIndexes[j];
        const cell = typeof colI === 'number' ? line[colI] : undefined;
        obj[d.field_key] = coerceImportCell(cell, d.field_type);
      });
      if (
        productDefI >= 0 &&
        warehouseDefI >= 0 &&
        typeof columnIndexes[productDefI] === 'number' &&
        columnIndexes[productDefI] === columnIndexes[warehouseDefI]
      ) {
        const raw = line[columnIndexes[productDefI]];
        const { label, warehouse } = splitLabelWarehouseCell(raw);
        obj.product_model = coerceImportCell(label, 'text');
        obj.warehouse_model = coerceImportCell(warehouse, 'text');
      }
      let importUnitPriceTon = null;
      if (typeof importUnitPriceColI === 'number') {
        importUnitPriceTon = parseImportUnitPriceKgToTon(
          coerceImportCell(line[importUnitPriceColI], 'number')
        );
      }
      prepared.push({ rowNum, data: obj, importUnitPriceTon });
    }

    const fpMap = new Map();
    for (const pr of prepared) {
      const fp = orderImportRowFingerprint(definitions, pr.data);
      if (!fpMap.has(fp)) fpMap.set(fp, []);
      fpMap.get(fp).push(pr.rowNum);
    }
    const duplicate_groups = [];
    for (const rows of fpMap.values()) {
      if (rows.length > 1) duplicate_groups.push({ rows: [...rows].sort((a, b) => a - b) });
    }
    if (duplicate_groups.length && !confirmDup) {
      return sendUnifiedError(res, 409, 'EXCEL_DUPLICATE_ROWS', {
        message:
          '表格中存在多行「全字段内容完全一致」的重复数据。请删除多余行；若业务上确需写入多笔相同订单，请在确认后继续导入。',
        duplicate_groups
      });
    }

    const errors = [];
    const duplicates = [];
    const created_ids = [];
    let ok = 0;
    const seeAllOrders = canViewAllSalesOrders(req);
    const codeKey = definitions.find((d) => d.maps_to === 'customer_code')?.field_key;
    const nameKey = definitions.find((d) => d.maps_to === 'customer_name')?.field_key;
    const unitPriceKey = definitions.find((d) => d.maps_to === 'unit_price')?.field_key;
    const modelKey = definitions.find((d) => d.maps_to === 'product_model')?.field_key;
    const warehouseModelKey = definitions.find((d) => d.maps_to === 'warehouse_model')?.field_key;
    const modelLikeKeys = definitions
      .filter((d) => /型号/i.test(String(d?.label_zh || d?.field_key || '')))
      .map((d) => d.field_key);

    const staged = [];
    for (const { rowNum, data: obj, importUnitPriceTon } of prepared) {
      const { errors: verr, data: normalized } = validateOrderDataInput(definitions, obj);
      if (verr.length) {
        errors.push({ row: rowNum, reason: verr.map((d) => `${d.label_zh}: ${d.message}`).join('；') });
        continue;
      }
      const userPriceTon = extractUserImportUnitPriceTon(
        obj,
        importUnitPriceTon,
        unitPriceKey
      );
      const leg = dataJsonToLegacyColumns(definitions, normalized);
      const userProvidedPrice = userPriceTon != null && userPriceTon > 0;
      if (userProvidedPrice) {
        if (unitPriceKey) normalized[unitPriceKey] = userPriceTon;
        leg.unit_price = userPriceTon;
        applyLegUnitPriceAndAmount(leg);
      }
      staged.push({ rowNum, data: obj, normalized, leg, userProvidedPrice });
    }

    const conn = await pool.getConnection();
    try {
      const customerCache = new Map();
      const resolved = [];
      for (const s of staged) {
        try {
          const ckey = `${codeKey ? String(s.normalized[codeKey] ?? '') : ''}\t${nameKey ? String(s.normalized[nameKey] ?? '') : ''}`;
          let customerId = customerCache.get(ckey);
          if (customerId == null) {
            customerId = await getOrCreateCustomer(conn, {
              customer_code: codeKey ? s.normalized[codeKey] : '',
              customer_name: nameKey ? s.normalized[nameKey] : '',
              userId: uid
            });
            customerCache.set(ckey, customerId);
          }
          if (customerId && !s.userProvidedPrice) {
            const modelCandidates = [];
            const pushCandidate = (v) => {
              const x = String(v ?? '').trim();
              if (!x) return;
              if (!modelCandidates.includes(x)) modelCandidates.push(x);
            };
            if (modelKey && s.normalized[modelKey]) pushCandidate(s.normalized[modelKey]);
            if (warehouseModelKey && s.normalized[warehouseModelKey]) pushCandidate(s.normalized[warehouseModelKey]);
            // 兜底：字段映射被改坏时，按“型号”类标签收集候选值继续补价
            for (const k of modelLikeKeys) pushCandidate(s.normalized?.[k]);
            pushCandidate(s.leg?.product_model);
            pushCandidate(s.leg?.warehouse_model);
            let p = null;
            for (const candidate of modelCandidates) {
              p = await lookupCustomerUnitPriceTon(conn, customerId, candidate);
              if (p != null && p > 0) break;
            }
            // 兜底：若按 customer_id 命不中，再按厂家名找已存在客户再匹配单价
            if (!(p != null && p > 0) && nameKey && s.normalized[nameKey]) {
              for (const candidate of modelCandidates) {
                p = await lookupCustomerUnitPriceTonByCustomerName(
                  conn,
                  s.normalized[nameKey],
                  candidate
                );
                if (p != null && p > 0) break;
              }
            }
            if (p != null && p > 0) {
              if (unitPriceKey) s.normalized[unitPriceKey] = p;
              s.leg.unit_price = p;
              applyLegUnitPriceAndAmount(s.leg);
            }
          }
          resolved.push({ ...s, customerId });
        } catch (err) {
          const reason =
            err?.code === 'VALIDATION'
              ? err.message
              : err?.code === 'CUSTOMER_DISABLED'
                ? '客户已停用，无法创建订单'
                : mapImportRowPersistError(err);
          errors.push({ row: s.rowNum, reason });
        }
      }

      const tuples = resolved.map((r) => [
        r.customerId,
        r.leg.product_code || '',
        r.leg.product_name || '',
        r.leg.product_model || '',
        r.leg.warehouse_model || '',
        r.leg.quantity || 0,
        r.leg.unit_price || 0,
        r.leg.amount || 0
      ]);

      const dupMap = await loadExistingDuplicateOrderBatch(pool, tuples, { createdByUid: uid, seeAllOrders });
      const sessionDupKeys = new Map();

      for (const r of resolved) {
        const k = orderDuplicateFingerprintKey(r.customerId, r.leg);
        const importedCustomer = nameKey ? String(r.normalized[nameKey] ?? '').trim() : '';
        const exDb = dupMap.get(k);
        if (exDb) {
          duplicates.push({
            row: r.rowNum,
            imported_customer: importedCustomer || String(exDb.customer_name || ''),
            imported_product: r.leg.product_name || '',
            imported_model: r.leg.product_model || '',
            imported_batch_no: r.leg.product_code || '',
            existing_order_no: exDb.order_no || '',
            existing_customer: String(exDb.customer_name || ''),
            existing_product: exDb.product_name || '',
            existing_batch_no: exDb.product_code || ''
          });
          continue;
        }
        const exSession = sessionDupKeys.get(k);
        if (exSession) {
          duplicates.push({
            row: r.rowNum,
            imported_customer: importedCustomer || String(exSession.customer_name || ''),
            imported_product: r.leg.product_name || '',
            imported_model: r.leg.product_model || '',
            imported_batch_no: r.leg.product_code || '',
            existing_order_no: exSession.order_no || '本批已导入',
            existing_customer: String(exSession.customer_name || ''),
            existing_product: r.leg.product_name || '',
            existing_batch_no: r.leg.product_code || ''
          });
          continue;
        }
        try {
          const insertData =
            unitPriceKey && r.userProvidedPrice
              ? { ...r.data, [unitPriceKey]: r.normalized[unitPriceKey] }
              : r.data;
          const ins = await insertOrderWithData(conn, {
            userId: uid,
            data: insertData,
            definitions,
            statusRemark: 'Excel导入',
            legacyOverride:
              Number(r.leg?.unit_price) > 0
                ? { unit_price: r.leg.unit_price, amount: r.leg.amount }
                : undefined
          });
          const customerLabel = nameKey ? String(r.normalized[nameKey] ?? '').trim() : '';
          sessionDupKeys.set(k, {
            order_no: ins.order_no,
            customer_name: customerLabel
          });
          created_ids.push(ins.id);
          ok++;
        } catch (err) {
          if (Array.isArray(err.details) && err.details.length) {
            errors.push({
              row: r.rowNum,
              reason: err.details.map((d) => `${d.label_zh}: ${d.message}`).join('；')
            });
          } else {
            errors.push({ row: r.rowNum, reason: mapImportRowPersistError(err) });
          }
        }
      }
    } finally {
      conn.release();
    }
    await logOperationFromReq(req, {
      module: '销售订单',
      action: '导入订单',
      detail: { ok, errors: errors.length, duplicates: duplicates.length, duplicate_groups_ok: confirmDup ? duplicate_groups.length : 0 }
    });
    sendUnifiedSuccess(
      res,
      {
        ok,
        errors,
        duplicates,
        created_ids,
        duplicate_import_confirmed: confirmDup && duplicate_groups.length > 0
      },
      '导入完成'
    );
  } catch (e) {
    next(e);
  }
});

export { router };
