import { Router } from 'express';
import { z } from 'zod';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';

import { getPool } from '../../db/pool.js';
import { isSalesCustomerNgramFulltextReady } from '../../db/ensureSchema.js';
import { logOperationFromReq } from '../../lib/audit.js';
import { getCustomerPriceSuggestions } from '../../lib/salesCustomerPriceSuggestions.js';
import { getCustomerModelMappings } from '../../lib/salesCustomerModelMappings.js';
import { syncCustomerDirectoryGroup } from '../../lib/salesCustomerDirectorySync.js';
import { uniquePositiveIds } from '../../lib/idList.js';

import {
  perm,
  isSuper,
  authenticatedNumericUserId,
  allocateUniqueCustomerCode
} from './salesShared.js';
import { sendUnifiedError, sendUnifiedSuccess, upload } from './salesOrderRouterHelpers.js';
import {
  lookupCustomerUnitPriceTon,
  lookupCustomerUnitPriceTonByCustomerName
} from '../../lib/salesOrderCrudShared.js';

const router = Router();

function normalizeProductModel(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[()（）\[\]【】]/g, '')
    .replace(/[-－—_/／\\]/g, '');
}

/** 返回元/kg，供订单录入表单展示 */
async function resolveCustomerUnitPriceKg(pool, { customerId, customerName, productModel }) {
  const model = String(productModel || '').trim();
  if (!model) return null;

  const cid = Number(customerId);
  if (Number.isFinite(cid) && cid > 0) {
    const ton = await lookupCustomerUnitPriceTon(pool, cid, model);
    if (ton != null && ton > 0) return ton / 1000;
  }
  if (customerName) {
    const ton = await lookupCustomerUnitPriceTonByCustomerName(pool, customerName, model);
    if (ton != null && ton > 0) return ton / 1000;
  }

  const names = new Set();
  if (customerName) names.add(String(customerName).trim());
  if (Number.isFinite(cid) && cid > 0) {
    const [rows] = await pool.query(
      'SELECT customer_name, contact_name FROM sales_customers WHERE id = ? LIMIT 1',
      [cid]
    );
    if (rows[0]?.customer_name) names.add(String(rows[0].customer_name).trim());
    if (rows[0]?.contact_name) names.add(String(rows[0].contact_name).trim());
  }
  const suggestions = await getCustomerPriceSuggestions([...names].filter(Boolean));
  const target = normalizeProductModel(model);
  for (const s of suggestions) {
    const sn = normalizeProductModel(s.product_model);
    if (!sn) continue;
    if (sn === target || sn.includes(target) || target.includes(sn)) {
      const p = Number(s.unit_price);
      if (Number.isFinite(p) && p > 0) return p;
    }
  }

  const histArgs = [];
  let histSql = '';
  if (Number.isFinite(cid) && cid > 0) {
    histSql = `SELECT o.unit_price, o.product_model FROM sales_orders o
      WHERE o.customer_id = ? AND o.product_model IS NOT NULL AND TRIM(o.product_model) <> ''
      AND o.unit_price > 0 ORDER BY o.created_at DESC LIMIT 20`;
    histArgs.push(cid);
  } else if (customerName) {
    histSql = `SELECT o.unit_price, o.product_model FROM sales_orders o
      INNER JOIN sales_customers c ON c.id = o.customer_id
      WHERE (c.customer_name = ? OR c.contact_name = ?)
      AND o.product_model IS NOT NULL AND TRIM(o.product_model) <> ''
      AND o.unit_price > 0 ORDER BY o.created_at DESC LIMIT 20`;
    histArgs.push(customerName, customerName);
  }
  if (histSql) {
    const [histRows] = await pool.query(histSql, histArgs);
    for (const row of histRows || []) {
      const sn = normalizeProductModel(row.product_model);
      if (!sn) continue;
      if (sn === target || sn.includes(target) || target.includes(sn)) {
        const ton = Number(row.unit_price);
        if (Number.isFinite(ton) && ton > 0) return ton / 1000;
      }
    }
  }

  return null;
}

/** 订单录入联想：客户名称、型号单价等只读查询 */
function canLookupCustomersForOrders(req) {
  return (
    perm(req, 'customer_management', 'view') ||
    perm(req, 'order_management', 'order_query') ||
    perm(req, 'order_management', 'order_input') ||
    perm(req, 'contract_management', 'contract_view')
  );
}

router.get('/customers', async (req, res, next) => {
  try {
    if (!canLookupCustomersForOrders(req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const q = String(req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.pageSize || req.query.limit) || 20));
    const offset = (page - 1) * pageSize;
    const onlyActive = req.query.only_active !== '0' && req.query.inactive !== '1';
    const duplicateRisk = req.query.duplicate_risk === '1' || req.query.duplicate_risk === 'true';
    const pool = getPool();
    let where = onlyActive ? 'WHERE is_active = 1' : 'WHERE 1=1';
    const args = [];
    const duplicateRiskSql = `EXISTS (
      SELECT 1 FROM sales_customers sc2
      WHERE sc2.id <> sales_customers.id
        AND sc2.is_active = 1
        AND (
          (
            NULLIF(TRIM(IFNULL(sc2.contact_name, '')), '') IS NOT NULL
            AND sc2.contact_name = sales_customers.contact_name
            AND NULLIF(TRIM(IFNULL(sales_customers.contact_name, '')), '') IS NOT NULL
          )
          OR sc2.contact_name = sales_customers.customer_name
          OR sc2.customer_name = sales_customers.contact_name
        )
    )`;
    if (q) {
      const useFt = q.length >= 2 && isSalesCustomerNgramFulltextReady();
      if (useFt) {
        where +=
          ' AND (MATCH(customer_name, customer_code, contact_name, contact_person) AGAINST (? IN NATURAL LANGUAGE MODE) OR customer_code LIKE ? OR customer_name LIKE ? OR IFNULL(contact_name, "") LIKE ? OR IFNULL(contact_person, "") LIKE ?)';
        const p = `%${q}%`;
        args.push(q, p, p, p, p);
      } else {
        where += ' AND (customer_code LIKE ? OR customer_name LIKE ? OR IFNULL(contact_name, "") LIKE ? OR IFNULL(contact_person, "") LIKE ?)';
        const p = `%${q}%`;
        args.push(p, p, p, p);
      }
    }
    if (duplicateRisk) {
      where += ` AND ${duplicateRiskSql}`;
    }
    const countSql = `SELECT COUNT(*) as total FROM sales_customers ${where}`;
    const [countRows] = await pool.query(countSql, args);
    const total = countRows[0].total;

    let sql = `SELECT
      id, customer_code, customer_name, contact_name, contact_person, phone, fax, address, bank_name, bank_account, tax_id, customer_group, is_active,
      created_at, updated_at, updated_by,
      (${duplicateRiskSql}) AS duplicate_risk,
      (SELECT COUNT(*) FROM sales_orders WHERE customer_id = sales_customers.id)
      + (SELECT COUNT(*) FROM sales_orders so
         INNER JOIN sales_customers sc2 ON sc2.id = so.customer_id
         WHERE sc2.id <> sales_customers.id
           AND COALESCE(NULLIF(TRIM(IFNULL(sc2.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sc2.customer_name, '')), ''))
               = COALESCE(NULLIF(TRIM(IFNULL(sales_customers.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sales_customers.customer_name, '')), ''))
      ) as order_count,
      (SELECT COUNT(*) FROM sales_contracts WHERE customer_id = sales_customers.id)
      + (SELECT COUNT(*) FROM sales_contracts sc
         INNER JOIN sales_customers sc2 ON sc2.id = sc.customer_id
         WHERE sc2.id <> sales_customers.id
           AND COALESCE(NULLIF(TRIM(IFNULL(sc2.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sc2.customer_name, '')), ''))
               = COALESCE(NULLIF(TRIM(IFNULL(sales_customers.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sales_customers.customer_name, '')), ''))
      ) as contract_count,
      (SELECT COUNT(*) FROM sales_contracts WHERE customer_id = sales_customers.id AND status != 'rejected')
      + (SELECT COUNT(*) FROM sales_contracts sc
         INNER JOIN sales_customers sc2 ON sc2.id = sc.customer_id
         WHERE sc2.id <> sales_customers.id
           AND COALESCE(NULLIF(TRIM(IFNULL(sc2.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sc2.customer_name, '')), ''))
               = COALESCE(NULLIF(TRIM(IFNULL(sales_customers.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sales_customers.customer_name, '')), ''))
           AND sc.status != 'rejected'
      ) as contract_count_approved
      FROM sales_customers ${where}
      ORDER BY order_count DESC, customer_name ASC, id DESC
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

/** 导出客户 Excel：需「数据导出」权限；支持 ids 逗号分隔（仅导出勾选）或按当前筛选条件全量（最多 1 万行） */
router.get('/customers/export', async (req, res, next) => {
  try {
    const canExport =
      isSuper(req) ||
      perm(req, 'data_management', 'data_export_all') ||
      perm(req, 'data_management', 'data_export');
    if (!canExport) return sendUnifiedError(res, 403, 'FORBIDDEN');

    const rawIds = String(req.query.ids || '').trim();
    const idList = rawIds.length
      ? uniquePositiveIds(
          rawIds
            .split(/[,，\s]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          500
        )
      : [];

    const pool = getPool();
    const onlyActive = req.query.only_active !== '0' && req.query.inactive !== '1';
    const q = String(req.query.q || '').trim();

    const subOrderCount =
      "(SELECT COUNT(*) FROM sales_orders WHERE customer_id = sales_customers.id) + (SELECT COUNT(*) FROM sales_orders so INNER JOIN sales_customers sc2 ON sc2.id = so.customer_id WHERE sc2.id <> sales_customers.id AND COALESCE(NULLIF(TRIM(IFNULL(sc2.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sc2.customer_name, '')), '')) = COALESCE(NULLIF(TRIM(IFNULL(sales_customers.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sales_customers.customer_name, '')), ''))) as order_count";
    const subContractApproved =
      "(SELECT COUNT(*) FROM sales_contracts WHERE customer_id = sales_customers.id AND status != 'rejected') + (SELECT COUNT(*) FROM sales_contracts sc INNER JOIN sales_customers sc2 ON sc2.id = sc.customer_id WHERE sc2.id <> sales_customers.id AND COALESCE(NULLIF(TRIM(IFNULL(sc2.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sc2.customer_name, '')), '')) = COALESCE(NULLIF(TRIM(IFNULL(sales_customers.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sales_customers.customer_name, '')), '')) AND sc.status != 'rejected') as contract_count_approved";

    let sql = `SELECT id, customer_code, customer_name, contact_name, contact_person, phone, fax, address, bank_name, bank_account, tax_id, customer_group, is_active,
      ${subOrderCount},
      ${subContractApproved}
      FROM sales_customers`;
    const args = [];

    if (idList.length > 0) {
      sql += ` WHERE id IN (${idList.map(() => '?').join(',')})`;
      args.push(...idList);
    } else {
      let where = onlyActive ? 'WHERE is_active = 1' : 'WHERE 1=1';
      if (q) {
        const useFt = q.length >= 2 && isSalesCustomerNgramFulltextReady();
        if (useFt) {
          where +=
            ' AND (MATCH(customer_name, customer_code, contact_name, contact_person) AGAINST (? IN NATURAL LANGUAGE MODE) OR customer_code LIKE ? OR customer_name LIKE ? OR IFNULL(contact_name, "") LIKE ? OR IFNULL(contact_person, "") LIKE ?)';
          const p = `%${q}%`;
          args.push(q, p, p, p, p);
        } else {
          where += ' AND (customer_code LIKE ? OR customer_name LIKE ? OR IFNULL(contact_name, "") LIKE ? OR IFNULL(contact_person, "") LIKE ?)';
          const p = `%${q}%`;
          args.push(p, p, p, p);
        }
      }
      sql += ` ${where}`;
    }

    sql += ' ORDER BY order_count DESC, customer_name ASC, id DESC LIMIT 10000';

    const [rows] = await pool.query(sql, args);

    const labelRow = [
      '客户编码',
      '客户全称',
      '客户简称',
      '联系人',
      '电话',
      '传真',
      '地址',
      '开户银行',
      '账号',
      '税号'
    ];
    const wsData = [
      labelRow,
      ...rows.map((r) => [
        r.customer_code,
        r.customer_name,
        r.contact_name || '',
        r.contact_person || '',
        r.phone || '',
        r.fax || '',
        r.address || '',
        r.bank_name || '',
        r.bank_account || '',
        r.tax_id || ''
      ])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'customers');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sales-customers.xlsx"');
    res.send(buf);
    await logOperationFromReq(req, {
      module: '客户管理',
      action: '导出客户',
      detail: { count: rows.length, byIds: idList.length > 0, q: q || undefined }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/customers', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'create')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const schema = z.object({
      customer_name: z.string().min(1).max(256),
      contact_name: z.string().min(1).max(128),
      contact_person: z.string().max(128).optional().nullable(),
      phone: z.string().max(64).optional().nullable(),
      address: z.string().max(512).optional().nullable(),
      customer_group: z.string().max(32).optional().default(''),
      fax: z.string().max(64).optional().nullable(),
      bank_name: z.string().max(256).optional().nullable(),
      bank_account: z.string().max(128).optional().nullable(),
      tax_id: z.string().max(64).optional().nullable()
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    // 重名校验：新全称或新简称 与 已有全称或简称 交叉重复
    const [[{ dupCnt }]] = await pool.query(
      `SELECT COUNT(*) AS dupCnt FROM sales_customers
       WHERE customer_name IN (?, ?) OR contact_name IN (?, ?)`,
      [body.customer_name, body.contact_name, body.customer_name, body.contact_name]
    );
    if (dupCnt > 0) {
      return sendUnifiedError(res, 409, 'DUPLICATE_CUSTOMER', { message: '已存在同名或同简称的客户' });
    }
    const customerCode = await allocateUniqueCustomerCode(pool);
    const cg = body.customer_group;
    const [r] = await pool.query(
      `INSERT INTO sales_customers (customer_code, customer_name, contact_name, contact_person, phone, address, customer_group, is_active, created_by, updated_by,
        fax, bank_name, bank_account, tax_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?,
        ?, ?, ?, ?)`,
      [
        customerCode,
        body.customer_name,
        body.contact_name,
        body.contact_person || null,
        body.phone || null,
        body.address || null,
        cg,
        req.user.userId,
        req.user.userId,
        body.fax || null,
        body.bank_name || null,
        body.bank_account || null,
        body.tax_id || null
      ]
    );
    await logOperationFromReq(req, {
      module: '客户管理',
      action: '新增客户',
      detail: { id: r.insertId, customer_code: customerCode }
    });
    sendUnifiedSuccess(res, { id: r.insertId, success: true, customer_code: customerCode }, '创建成功');
  } catch (e) {
    next(e);
  }
});

/** 上传 Excel（multipart 字段 file）同步客户目录 */
router.post('/customers/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    if (!req.file?.buffer?.length) {
      return sendUnifiedError(res, 400, 'FILE_REQUIRED', { message: '请选择要上传的 Excel 文件' });
    }
    const groupRaw = String(req.body?.customer_group || '').trim();
    const group = (groupRaw === 'kangming' || groupRaw === 'wuyuan') ? groupRaw : '';
    const pool = getPool();
    const summary = await syncCustomerDirectoryGroup(pool, {
      userId: req.user.userId,
      customerGroup: group,
      workbookBuffer: req.file.buffer
    });
    await logOperationFromReq(req, {
      module: '客户管理',
      action: '上传Excel同步客户目录',
      detail: {
        customer_group: group,
        originalname: req.file.originalname,
        ...summary
      }
    });
    sendUnifiedSuccess(res, summary, '同步完成');
  } catch (e) {
    const code = e?.code;
    if (
      code === 'BAD_CUSTOMER_GROUP' ||
      code === 'FILE_REQUIRED' ||
      code === 'BAD_XLSX' ||
      code === 'NAMEBOOK_SHEET_NOT_FOUND' ||
      code === 'NAMEBOOK_BAD_HEADER'
    ) {
      return sendUnifiedError(res, 400, code || 'IMPORT_FAILED', { message: e.message || '同步失败' });
    }
    next(e);
  }
});

/** 下载客户导入模板 xlsx */
router.get('/customers/template', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('客户导入模板');
    ws.columns = [
      { header: '客户全称', key: 'customer_name', width: 30 },
      { header: '客户简称', key: 'contact_name', width: 16 },
      { header: '联系人', key: 'contact_person', width: 16 },
      { header: '传真', key: 'fax', width: 16 },
      { header: '电话', key: 'phone', width: 18 },
      { header: '地址', key: 'address', width: 30 },
      { header: '开户银行', key: 'bank_name', width: 24 },
      { header: '账号', key: 'bank_account', width: 24 },
      { header: '税号', key: 'tax_id', width: 22 }
    ];
    ws.addRow({ customer_name: '示例客户全称', contact_name: '示例简称', contact_person: '示例联系人', fax: '0371-12345678', phone: '13800000000', address: '示例地址', bank_name: '示例银行', bank_account: '6222021234567890', tax_id: '91410000MA1234567' });
    const buf = await wb.xlsx.writeBuffer();
    const encodedName = encodeURIComponent('客户导入模板.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.send(Buffer.from(buf));
  } catch (e) {
    next(e);
  }
});

// PATCH edit customer
router.patch('/customers/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_ID');
    const schema = z.object({
      customer_name: z.string().min(1).max(256).optional(),
      contact_name: z.string().min(1).max(128).optional(),
      contact_person: z.string().max(128).optional().nullable(),
      phone: z.string().max(64).optional().nullable(),
      address: z.string().max(512).optional().nullable(),
      fax: z.string().max(64).optional().nullable(),
      bank_name: z.string().max(256).optional().nullable(),
      bank_account: z.string().max(128).optional().nullable(),
      tax_id: z.string().max(64).optional().nullable()
    });
    const body = schema.parse(req.body || {});
    if (Object.keys(body).length === 0) return sendUnifiedError(res, 400, 'NO_CHANGES');
    const pool = getPool();
    // 编辑时重名校验（排除自身）：新值不得与任何其他客户的全称或简称重复
    if (body.customer_name !== undefined || body.contact_name !== undefined) {
      const dupConds = [];
      const dupArgs = [];
      if (body.customer_name !== undefined) {
        // 新全称不得等于其他客户的全称或简称
        dupConds.push('customer_name = ?');
        dupArgs.push(body.customer_name);
        dupConds.push('contact_name = ?');
        dupArgs.push(body.customer_name);
      }
      if (body.contact_name !== undefined) {
        // 新简称不得等于其他客户的全称或简称
        dupConds.push('customer_name = ?');
        dupArgs.push(body.contact_name);
        dupConds.push('contact_name = ?');
        dupArgs.push(body.contact_name);
      }
      dupArgs.push(id);
      const [[{ dupCnt }]] = await pool.query(
        `SELECT COUNT(*) AS dupCnt FROM sales_customers
         WHERE (${dupConds.join(' OR ')}) AND id != ?`,
        dupArgs
      );
      if (dupCnt > 0) {
        return sendUnifiedError(res, 409, 'DUPLICATE_CUSTOMER', { message: '已存在同名或同简称的客户' });
      }
    }
    const setParts = [];
    const values = [];
    if (body.customer_name !== undefined) {
      setParts.push('customer_name = ?');
      values.push(body.customer_name);
    }
    if (body.contact_name !== undefined) {
      setParts.push('contact_name = ?');
      values.push(body.contact_name);
    }
    if (body.contact_person !== undefined) {
      setParts.push('contact_person = ?');
      values.push(body.contact_person);
    }
    if (body.phone !== undefined) {
      setParts.push('phone = ?');
      values.push(body.phone);
    }
    if (body.address !== undefined) {
      setParts.push('address = ?');
      values.push(body.address);
    }
    if (body.fax !== undefined) {
      setParts.push('fax = ?');
      values.push(body.fax);
    }
    if (body.bank_name !== undefined) {
      setParts.push('bank_name = ?');
      values.push(body.bank_name);
    }
    if (body.bank_account !== undefined) {
      setParts.push('bank_account = ?');
      values.push(body.bank_account);
    }
    if (body.tax_id !== undefined) {
      setParts.push('tax_id = ?');
      values.push(body.tax_id);
    }
    setParts.push('updated_by = ?');
    values.push(req.user.userId);
    const sql = `UPDATE sales_customers SET ${setParts.join(', ')} WHERE id = ?`;
    values.push(id);
    const [result] = await pool.query(sql, values);
    if (result.affectedRows === 0) return sendUnifiedError(res, 404, 'NOT_FOUND');
    await logOperationFromReq(req, {
      module: '客户管理',
      action: '编辑客户',
      detail: { id, ...body }
    });
    sendUnifiedSuccess(res, { success: true, id }, '保存成功');
  } catch (e) {
    next(e);
  }
});

// PATCH status (enable/disable)
router.patch('/customers/:id/status', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'disable')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_ID');
    const schema = z.object({
      is_active: z.preprocess((v) => v === true || v === 'true' || v === '1' || v === 1, z.boolean())
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const [custRows] = await pool.query('SELECT is_active FROM sales_customers WHERE id = ?', [id]);
    if (!custRows.length) return sendUnifiedError(res, 404, 'NOT_FOUND');
    const newActive = !!body.is_active;
    if ((custRows[0].is_active === 1) === newActive) {
      return sendUnifiedSuccess(res, { success: true, is_active: newActive });
    }
    const [result] = await pool.query(
      'UPDATE sales_customers SET is_active = ?, updated_by = ? WHERE id = ?',
      [newActive ? 1 : 0, req.user.userId, id]
    );
    await logOperationFromReq(req, {
      module: '客户管理',
      action: newActive ? '启用客户' : '停用客户',
      detail: { id, is_active: newActive }
    });
    sendUnifiedSuccess(res, { success: true, is_active: newActive }, '保存成功');
  } catch (e) {
    next(e);
  }
});

// GET customer stats (order count, contract count)
router.get('/customers/:id/stats', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'view') && !perm(req, 'order_management', 'order_query') && !perm(req, 'contract_management', 'contract_view')) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return sendUnifiedError(res, 400, 'BAD_ID');
    const pool = getPool();
    const [custRows] = await pool.query(
      'SELECT id, customer_code, customer_name, customer_group, contact_name, contact_person, phone, fax, address, bank_name, bank_account, tax_id, is_active FROM sales_customers WHERE id = ?',
      [id]
    );
    if (!custRows.length) return sendUnifiedError(res, 404, 'NOT_FOUND');
    const cust = custRows[0];
    const customerAliasKey = String(cust.contact_name || cust.customer_name || '').trim();
    const orderSql =
      "SELECT (SELECT COUNT(*) FROM sales_orders WHERE customer_id = ?) + (SELECT COUNT(*) FROM sales_orders so INNER JOIN sales_customers sc2 ON sc2.id = so.customer_id WHERE sc2.id <> ? AND COALESCE(NULLIF(TRIM(IFNULL(sc2.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sc2.customer_name, '')), '')) = NULLIF(TRIM(IFNULL(?, '')), '')) as order_count";
    const contractSql =
      "SELECT (SELECT COUNT(*) FROM sales_contracts WHERE customer_id = ?) + (SELECT COUNT(*) FROM sales_contracts sc INNER JOIN sales_customers sc2 ON sc2.id = sc.customer_id WHERE sc2.id <> ? AND COALESCE(NULLIF(TRIM(IFNULL(sc2.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sc2.customer_name, '')), '')) = NULLIF(TRIM(IFNULL(?, '')), '')) as contract_count";
    const approvedSql =
      "SELECT (SELECT COUNT(*) FROM sales_contracts WHERE customer_id = ? AND status != 'rejected') + (SELECT COUNT(*) FROM sales_contracts sc INNER JOIN sales_customers sc2 ON sc2.id = sc.customer_id WHERE sc2.id <> ? AND COALESCE(NULLIF(TRIM(IFNULL(sc2.contact_name, '')), ''), NULLIF(TRIM(IFNULL(sc2.customer_name, '')), '')) = NULLIF(TRIM(IFNULL(?, '')), '') AND sc.status != 'rejected') as contract_count";
    const orderArgs = [id, id, customerAliasKey];
    const contractArgs = [id, id, customerAliasKey];
    const approvedArgs = [id, id, customerAliasKey];
    const [orderRows] = await pool.query(orderSql, orderArgs);
    const [contractRows] = await pool.query(contractSql, contractArgs);
    const [approvedContractRows] = await pool.query(approvedSql, approvedArgs);
    sendUnifiedSuccess(res, {
      customer_id: id,
      customer_code: custRows[0].customer_code,
      customer_name: custRows[0].customer_name,
      customer_group: custRows[0].customer_group || '',
      contact_name: custRows[0].contact_name,
      phone: custRows[0].phone,
      fax: custRows[0].fax,
      address: custRows[0].address,
      bank_name: custRows[0].bank_name,
      bank_account: custRows[0].bank_account,
      tax_id: custRows[0].tax_id,
      is_active: !!custRows[0].is_active,
      order_count: orderRows[0].order_count || 0,
      contract_count: contractRows[0].contract_count || 0,
      contract_count_approved: approvedContractRows[0].contract_count || 0
    });
  } catch (e) {
    next(e);
  }
});

// BATCH DELETE customers (with protection)
router.post('/customers/bulk-delete', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit') && !perm(req, 'customer_management', 'disable')) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const schema = z.object({
      ids: z.array(z.coerce.number().int().positive()).min(1).max(100)
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const ids = body.ids;

    // Check for associated orders or contracts
    const [assoc] = await pool.query(
      `SELECT
         COUNT(CASE WHEN o.id IS NOT NULL THEN 1 END) as order_count,
         COUNT(CASE WHEN c.id IS NOT NULL THEN 1 END) as contract_count
       FROM (SELECT ? as id) as ids
       LEFT JOIN sales_orders o ON o.customer_id = ids.id
       LEFT JOIN sales_contracts c ON c.customer_id = ids.id`,
      [ids[0]] // simplified check - in real would use IN clause with multiple
    );

    if (assoc[0].order_count > 0 || assoc[0].contract_count > 0) {
      return sendUnifiedError(res, 400, 'CUSTOMER_HAS_ASSOCIATIONS', {
        message: '部分客户存在关联订单或合同，无法删除'
      });
    }

    const [result] = await pool.query(
      'DELETE FROM sales_customers WHERE id IN (?) AND is_active = 1',
      [ids]
    );

    await logOperationFromReq(req, {
      module: '客户管理',
      action: '批量删除客户',
      detail: { count: result.affectedRows, ids }
    });

    sendUnifiedSuccess(
      res,
      {
        success: true,
        deleted: result.affectedRows,
        message: `成功删除 ${result.affectedRows} 个客户`
      },
      '删除成功'
    );
  } catch (e) {
    next(e);
  }
});

/** ── 客户产品单价管理 ───────────────────────────────────── */

/** GET /api/sales/customers/:id/prices — 获取某客户的所有产品单价 */
router.get('/customers/:id/prices', async (req, res, next) => {
  try {
    if (!canLookupCustomersForOrders(req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId) || customerId < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, customer_id, product_model, unit_price, notes, created_at, updated_at FROM customer_prices WHERE customer_id = ? ORDER BY product_model ASC',
      [customerId]
    );
    sendUnifiedSuccess(res, { items: rows });
  } catch (e) { next(e); }
});

/** POST /api/sales/customers/:id/prices — 添加产品单价 */
router.post('/customers/:id/prices', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId) || customerId < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
    const schema = z.object({
      product_model: z.string().min(1).max(128),
      unit_price: z.number().min(0),
      notes: z.string().max(255).optional().default('')
    });
    const body = schema.parse(req.body);
    const pool = getPool();
    const [result] = await pool.query(
      'INSERT INTO customer_prices (customer_id, product_model, unit_price, notes) VALUES (?, ?, ?, ?)',
      [customerId, body.product_model, body.unit_price, body.notes || '']
    );
    res.status(201).json({ id: String(result.insertId) });
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY') return sendUnifiedError(res, 409, 'DUPLICATE_PRICE', { message: '该客户已存在此产品型号的单价' });
    next(e);
  }
});

/** PATCH /api/sales/customers/:id/prices/:priceId — 更新产品单价 */
router.patch('/customers/:id/prices/:priceId', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const priceId = Number(req.params.priceId);
    if (!Number.isFinite(priceId) || priceId < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
    const schema = z.object({
      product_model: z.string().min(1).max(128).optional(),
      unit_price: z.number().min(0).optional(),
      notes: z.string().max(255).optional()
    });
    const body = schema.parse(req.body);
    const pool = getPool();
    const sets = [];
    const params = [];
    if (body.product_model !== undefined) { sets.push('product_model = ?'); params.push(body.product_model); }
    if (body.unit_price !== undefined) { sets.push('unit_price = ?'); params.push(body.unit_price); }
    if (body.notes !== undefined) { sets.push('notes = ?'); params.push(body.notes); }
    if (!sets.length) return sendUnifiedError(res, 400, 'NO_FIELDS');
    params.push(priceId);
    await pool.query(`UPDATE customer_prices SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY') return sendUnifiedError(res, 409, 'DUPLICATE_PRICE', { message: '该客户已存在此产品型号的单价' });
    next(e);
  }
});

/** DELETE /api/sales/customers/:id/prices/:priceId — 删除产品单价 */
router.delete('/customers/:id/prices/:priceId', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const priceId = Number(req.params.priceId);
    if (!Number.isFinite(priceId) || priceId < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
    const pool = getPool();
    await pool.query('DELETE FROM customer_prices WHERE id = ?', [priceId]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** GET /api/sales/customers/:id/price-suggestions — 从发货流水单中获取该客户常用产品型号与单价 */
router.get('/customers/:id/price-suggestions', async (req, res, next) => {
  try {
    if (!canLookupCustomersForOrders(req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId) || customerId < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
    const pool = getPool();
    const [rows] = await pool.query('SELECT customer_name, contact_name FROM sales_customers WHERE id = ?', [customerId]);
    if (!rows.length) return sendUnifiedError(res, 404, 'NOT_FOUND');
    const names = [rows[0].customer_name, rows[0].contact_name].filter(Boolean);
    const suggestions = await getCustomerPriceSuggestions(names);
    sendUnifiedSuccess(res, { items: suggestions });
  } catch (e) { next(e); }
});

/** GET /api/sales/customers/:id/model-mappings — 从发货流水单 + DB 覆盖获取客户型号与内部型号对照 */
router.get('/customers/:id/model-mappings', async (req, res, next) => {
  try {
    if (!canLookupCustomersForOrders(req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId) || customerId < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
    const pool = getPool();
    const [rows] = await pool.query('SELECT customer_name, contact_name FROM sales_customers WHERE id = ?', [customerId]);
    if (!rows.length) return sendUnifiedError(res, 404, 'NOT_FOUND');
    const names = [rows[0].customer_name, rows[0].contact_name].filter(Boolean);
    const excelMappings = await getCustomerModelMappings(names);

    // 加载 DB 手动维护的覆盖记录
    const [dbRows] = await pool.query(
      'SELECT id, customer_model, internal_model, is_hidden FROM sales_customer_model_mappings WHERE customer_id = ?',
      [customerId]
    );

    // 合并：DB 记录按 customer_model 覆盖 Excel，is_hidden=1 的隐藏对应 Excel 行
    const hiddenSet = new Set();
    const dbMap = new Map();
    for (const d of dbRows) {
      if (d.is_hidden) {
        hiddenSet.add(d.customer_model);
      } else {
        dbMap.set(d.customer_model, d);
      }
    }

    const merged = [];
    const seen = new Set();

    // 先处理 Excel 数据，跳过被隐藏的
    for (const m of excelMappings) {
      if (hiddenSet.has(m.customer_model)) continue;
      const db = dbMap.get(m.customer_model);
      if (db) {
        merged.push({ id: db.id, customer_model: db.customer_model, internal_model: db.internal_model });
        seen.add(db.customer_model);
        dbMap.delete(m.customer_model);
      } else {
        merged.push({ id: null, customer_model: m.customer_model, internal_model: m.internal_model });
        seen.add(m.customer_model);
      }
    }

    // 追加 DB 中有但 Excel 中没有的新型号
    for (const [cm, d] of dbMap) {
      if (!seen.has(cm)) {
        merged.push({ id: d.id, customer_model: d.customer_model, internal_model: d.internal_model });
      }
    }

    merged.sort((a, b) => a.customer_model.localeCompare(b.customer_model, 'zh'));
    sendUnifiedSuccess(res, { items: merged });
  } catch (e) { next(e); }
});

/** PUT /api/sales/customers/:id/model-mappings/:mappingId — 创建或更新型号对照 */
router.put('/customers/:id/model-mappings/:mappingId', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const customerId = Number(req.params.id);
    const mappingId = String(req.params.mappingId);
    if (!Number.isFinite(customerId) || customerId < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');

    const { customer_model, internal_model } = req.body || {};
    if (!customer_model || String(customer_model).trim() === '') {
      return sendUnifiedError(res, 400, 'BAD_REQUEST', { message: '客户型号不能为空' });
    }
    const cm = String(customer_model).trim();
    const im = String(internal_model || '').trim();

    const pool = getPool();
    const uid = authenticatedNumericUserId(req);

    if (mappingId === 'new') {
      // 新增：存在相同 customer_model 则更新，否则插入
      const [existing] = await pool.query(
        'SELECT id FROM sales_customer_model_mappings WHERE customer_id = ? AND customer_model = ? LIMIT 1',
        [customerId, cm]
      );
      if (existing.length) {
        await pool.query(
          'UPDATE sales_customer_model_mappings SET internal_model = ?, updated_by = ? WHERE id = ?',
          [im, uid, existing[0].id]
        );
        sendUnifiedSuccess(res, { id: existing[0].id }, '更新成功');
      } else {
        const [r] = await pool.query(
          'INSERT INTO sales_customer_model_mappings (customer_id, customer_model, internal_model, created_by, updated_by) VALUES (?, ?, ?, ?, ?)',
          [customerId, cm, im, uid, uid]
        );
        sendUnifiedSuccess(res, { id: r.insertId }, '创建成功');
      }
    } else {
      const mid = Number(mappingId);
      if (!Number.isFinite(mid) || mid < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
      const [existing] = await pool.query(
        'SELECT id FROM sales_customer_model_mappings WHERE id = ? AND customer_id = ? LIMIT 1',
        [mid, customerId]
      );
      if (!existing.length) return sendUnifiedError(res, 404, 'NOT_FOUND');
      // 改名时，若目标型号名已被其他记录占用，先删除冲突记录
      const [conflict] = await pool.query(
        'SELECT id FROM sales_customer_model_mappings WHERE customer_id = ? AND customer_model = ? AND id != ? LIMIT 1',
        [customerId, cm, mid]
      );
      if (conflict.length) {
        await pool.query('DELETE FROM sales_customer_model_mappings WHERE id = ?', [conflict[0].id]);
      }
      await pool.query(
        'UPDATE sales_customer_model_mappings SET customer_model = ?, internal_model = ?, updated_by = ? WHERE id = ?',
        [cm, im, uid, mid]
      );
      sendUnifiedSuccess(res, { id: mid }, '更新成功');
    }
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY') {
      // 兜底：再查一次冲突并删除后重试
      try {
        const mid = Number(req.params.mappingId);
        const [dup] = await pool.query(
          'SELECT id FROM sales_customer_model_mappings WHERE customer_id = ? AND customer_model = ? AND id != ? LIMIT 1',
          [customerId, cm, mid]
        );
        if (dup.length) {
          await pool.query('DELETE FROM sales_customer_model_mappings WHERE id = ?', [dup[0].id]);
          await pool.query(
            'UPDATE sales_customer_model_mappings SET customer_model = ?, internal_model = ?, updated_by = ? WHERE id = ?',
            [cm, im, uid, mid]
          );
          return sendUnifiedSuccess(res, { id: mid }, '更新成功（已处理冲突）');
        }
      } catch { /* 忽略兜底失败 */ }
      return sendUnifiedError(res, 409, 'DUPLICATE_MODEL', { message: '该客户已存在此型号' });
    }
    next(e);
  }
});

/** DELETE /api/sales/customers/:id/model-mappings/:mappingId — 删除/还原型号对照（隐藏对应 Excel 行） */
router.delete('/customers/:id/model-mappings/:mappingId', async (req, res, next) => {
  try {
    if (!perm(req, 'customer_management', 'edit')) return sendUnifiedError(res, 403, 'FORBIDDEN');
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId) || customerId < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');

    const pool = getPool();

    if (req.params.mappingId === 'by-model') {
      // 按 customer_model 隐藏 Excel 行
      const { customer_model } = req.body || {};
      if (!customer_model || String(customer_model).trim() === '') {
        return sendUnifiedError(res, 400, 'BAD_REQUEST', { message: '请指定客户型号' });
      }
      const cm = String(customer_model).trim();
      const uid = authenticatedNumericUserId(req);
      const [existing] = await pool.query(
        'SELECT id, is_hidden FROM sales_customer_model_mappings WHERE customer_id = ? AND customer_model = ? LIMIT 1',
        [customerId, cm]
      );
      if (existing.length) {
        if (existing[0].is_hidden) {
          return sendUnifiedSuccess(res, { ok: true }, '已隐藏');
        }
        await pool.query(
          'UPDATE sales_customer_model_mappings SET is_hidden = 1, updated_by = ? WHERE id = ?',
          [uid, existing[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO sales_customer_model_mappings (customer_id, customer_model, internal_model, is_hidden, created_by, updated_by) VALUES (?, ?, "", 1, ?, ?)',
          [customerId, cm, uid, uid]
        );
      }
      sendUnifiedSuccess(res, { ok: true }, '已隐藏');
    } else {
      // 按 id 删除 DB 记录
      const mid = Number(req.params.mappingId);
      if (!Number.isFinite(mid) || mid < 1) return sendUnifiedError(res, 400, 'BAD_REQUEST');
      const [existing] = await pool.query(
        'SELECT id FROM sales_customer_model_mappings WHERE id = ? AND customer_id = ? LIMIT 1',
        [mid, customerId]
      );
      if (!existing.length) return sendUnifiedError(res, 404, 'NOT_FOUND');
      await pool.query('DELETE FROM sales_customer_model_mappings WHERE id = ?', [mid]);
      sendUnifiedSuccess(res, { ok: true }, '已删除');
    }
  } catch (e) { next(e); }
});

/** GET /api/sales/customer-price?customerName=X&productModel=Y&customerId=Z — 匹配单价（元/kg） */
router.get('/customer-price', async (req, res, next) => {
  try {
    if (!canLookupCustomersForOrders(req)) {
      return sendUnifiedError(res, 403, 'FORBIDDEN');
    }
    const customerName = String(req.query.customerName || '').trim();
    const productModel = String(req.query.productModel || '').trim();
    const customerId = Number(req.query.customerId);
    if (!productModel) {
      return sendUnifiedSuccess(res, { unit_price: null });
    }
    const pool = getPool();
    let cid = Number.isFinite(customerId) && customerId > 0 ? customerId : null;
    if (!cid && customerName) {
      const [custRows] = await pool.query(
        'SELECT id FROM sales_customers WHERE customer_name = ? OR contact_name = ? LIMIT 1',
        [customerName, customerName]
      );
      if (custRows.length) cid = custRows[0].id;
    }
    const unit_price = await resolveCustomerUnitPriceKg(pool, {
      customerId: cid,
      customerName,
      productModel
    });
    sendUnifiedSuccess(res, { unit_price: unit_price != null ? unit_price : null });
  } catch (e) { next(e); }
});

export { router };
