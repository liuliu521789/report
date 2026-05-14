import { Router } from 'express';
import { createReadStream } from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { z } from 'zod';
import { nanoid } from 'nanoid';

import { getPool } from '../db/pool.js';
import { isSalesCustomerNgramFulltextReady } from '../db/ensureSchema.js';
import { requireAuth } from '../middleware/auth.js';
import { logOperationFromReq } from '../lib/audit.js';
import {
  buildContractOrdersNotifyBody,
  buildContractReviewerNotifyMessages
} from '../lib/salesOrderNotifyBody.js';
import { applyContractReview } from '../lib/contractReviewApply.js';
import {
  tryNotifyContractReviewerOnSubmit
} from '../lib/wecomNotify.js';
import {
  fillContractTemplate,
  applyCompanySellerNameToFilledContract,
  formatSigningDateZhShanghai,
  releaseShanghaiContractNoLock,
  reserveNextShanghaiContractNo
} from '../lib/contractTemplateFill.js';
import { amountToRmbUppercase } from '../lib/chineseMoney.js';
import { buildContractOrderLinesHtml } from '../lib/contractOrderLines.js';
import { resolveCustomerLegalNameForContract } from '../lib/salesCustomerContractName.js';
import { RECOMMENDED_CONTRACT_BODY_HTML } from '../lib/contractRecommendedBody.js';
import {
  createContractVersion,
  getContractVersions,
  getVersionDiff,
  setupApprovalFlow,
  approveStep
} from '../lib/contractVersion.js';
import { resolveContractUploadFilePath } from '../lib/salesContractUploadPath.js';
import { userDisplayLabel } from '../lib/userDisplayLabel.js';

import { createSalesOrdersRouter } from './sales/ordersRouter.js';
import {
  perm,
  isSuper,
  isOrderCreatedByCurrentUser,
  canViewAllSalesOrders,
  canAccessSalesContractWorkspace,
  fetchSalesContractRow,
  assertSalesContractVisible,
  canMutateSalesContractAsCreator,
  contractStatusAllowsEdit,
  contractStatusAllowsDelete,
  notifyUser,
  departmentSubtreeIds
} from './sales/salesShared.js';

export const router = Router();

const contractDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  /** 默认 latin1 会把 UTF-8 中文标题/文件名解成乱码 */
  defParamCharset: 'utf8'
});

const CONTRACT_DOCUMENT_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

/** 上传的文档合同在 body_html 中的占位说明（列表/详情提示用，正文以文件为准） */
const UPLOAD_CONTRACT_BODY_HTML = `<div style="font-family:SimSun,宋体;font-size:14px;color:#666;padding:16px;line-height:1.7">本合同正文为上传的电子文档（PDF / Word / 图片等），请在预览或详情中查看、下载文件。</div>`;

function contractDocumentMimeOk(mime) {
  const m = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return CONTRACT_DOCUMENT_MIMES.has(m);
}

function safeContractDocumentStoredBaseName(original) {
  const base = path
    .basename(String(original || 'file'))
    .replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]+/g, '_')
    .slice(0, 160);
  return base || 'file';
}

function contentDispositionHeader(downloadName) {
  const name = String(downloadName || 'file');
  const ascii = name.replace(/[^\x20-\x7E]+/g, '_').slice(0, 180) || 'file';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function unlinkSalesContractUploadDocuments(pool, contractIds) {
  const ids = [...new Set(contractIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 1))];
  if (!ids.length) return;
  const ph = ids.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT document_stored_rel_path FROM sales_contracts WHERE id IN (${ph}) AND contract_source = 'upload'`,
    ids
  );
  const root = path.resolve(process.cwd(), 'uploads');
  for (const r of rows) {
    const rel = String(r.document_stored_rel_path || '').replace(/\\/g, '/').replace(/^(\.\.\/)+/, '');
    if (!rel || rel.includes('..')) continue;
    const full = path.resolve(root, rel);
    if (!full.startsWith(root)) continue;
    await fsPromises.unlink(full).catch(() => {});
  }
}

router.use(requireAuth);

router.use(createSalesOrdersRouter());

/** ---------- 合同模板 ---------- */
router.get('/contract-templates', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'template_manage') && !perm(req, 'contract_management', 'contract_generate')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, name, created_at, updated_at FROM sales_contract_templates ORDER BY updated_at DESC'
    );
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/contract-templates/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'template_manage') && !perm(req, 'contract_management', 'contract_generate')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_contract_templates WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ template: rows[0] });
  } catch (e) {
    next(e);
  }
});

router.post('/contract-templates', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'template_manage')) return res.status(403).json({ error: 'FORBIDDEN' });
    const schema = z.object({
      name: z.string().min(1).max(128),
      body_html: z.string().min(1)
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const [r] = await pool.query(
      `INSERT INTO sales_contract_templates (name, body_html, created_by) VALUES (?, ?, ?)`,
      [body.name, body.body_html, req.user.userId]
    );
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '创建合同模板',
      detail: { id: r.insertId }
    });
    res.json({ id: r.insertId });
  } catch (e) {
    next(e);
  }
});

router.patch('/contract-templates/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'template_manage')) return res.status(403).json({ error: 'FORBIDDEN' });
    const schema = z.object({
      name: z.string().min(1).max(128).optional(),
      body_html: z.string().min(1).optional()
    });
    const body = schema.parse(req.body || {});
    const pool = getPool();
    const updates = [];
    const args = [];
    if (body.name != null) {
      updates.push('name = ?');
      args.push(body.name);
    }
    if (body.body_html != null) {
      updates.push('body_html = ?');
      args.push(body.body_html);
    }
    if (!updates.length) return res.json({ ok: true });
    args.push(req.params.id);
    await pool.query(`UPDATE sales_contract_templates SET ${updates.join(', ')} WHERE id = ?`, args);
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '修改合同模板',
      detail: { id: req.params.id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/contract-templates/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'template_manage')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    await pool.query('DELETE FROM sales_contract_templates WHERE id = ?', [req.params.id]);
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '删除合同模板',
      detail: { id: req.params.id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** 兼容 JSON / 表单 / 查询串：'true'、1 等视为 true（避免 z.boolean() 直接拒掉导致误报缺 templateId） */
function isTruthyFromBlank(v) {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  }
  return false;
}

/** 推荐 templateId + orderIds；兼容历史 template_id + order_ids；fromBlank 时不必传模板 id */
const generateContractSchema = z
  .object({
    templateId: z.coerce.number().int().positive().optional(),
    template_id: z.coerce.number().int().positive().optional(),
    fromBlank: z.any().optional(),
    from_blank: z.any().optional(),
    orderIds: z.array(z.coerce.number().int().positive()).min(1).optional(),
    order_ids: z.array(z.coerce.number().int().positive()).min(1).optional(),
    title: z.string().max(256).optional()
  })
  .superRefine((val, ctx) => {
    const fromBlank = isTruthyFromBlank(val.fromBlank) || isTruthyFromBlank(val.from_blank);
    const tid = val.templateId ?? val.template_id;
    const oids = val.orderIds ?? val.order_ids;
    if (fromBlank && tid !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Do not pass templateId when fromBlank is true',
        path: ['templateId']
      });
    }
    if (!fromBlank && tid === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Must provide templateId or template_id, or set fromBlank true',
        path: ['templateId']
      });
    }
    if (!oids?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Must provide orderIds or order_ids',
        path: ['orderIds']
      });
    }
    if (
      val.templateId !== undefined &&
      val.template_id !== undefined &&
      Number(val.templateId) !== Number(val.template_id)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'templateId and template_id conflict',
        path: ['templateId']
      });
    }
    if (val.orderIds && val.order_ids) {
      const a = val.orderIds.join(',');
      const b = val.order_ids.join(',');
      if (a !== b) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'orderIds and order_ids conflict',
          path: ['orderIds']
        });
      }
    }
  })
  .transform((val) => {
    const fromBlank = isTruthyFromBlank(val.fromBlank) || isTruthyFromBlank(val.from_blank);
    return {
      template_id: fromBlank ? null : val.templateId ?? val.template_id,
      from_blank: fromBlank,
      order_ids: val.orderIds ?? val.order_ids,
      title: val.title
    };
  });

router.post('/contracts/generate', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_generate')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = generateContractSchema.parse(req.body || {});
    const pool = getPool();
    const placeholders = body.order_ids.map(() => '?').join(',');
    const [orders] = await pool.query(
      `SELECT o.*, c.customer_name, c.customer_code, c.customer_group,
              c.address AS customer_address, c.contact_name AS customer_contact, c.phone AS customer_phone
       FROM sales_orders o
       INNER JOIN sales_customers c ON c.id = o.customer_id
       WHERE o.id IN (${placeholders})`,
      body.order_ids
    );
    if (orders.length !== body.order_ids.length) return res.status(400).json({ error: 'ORDER_NOT_FOUND' });
    const cid = orders[0].customer_id;
    if (!orders.every((o) => o.customer_id === cid)) return res.status(400).json({ error: 'CUSTOMER_MISMATCH' });
    if (!isSuper(req)) {
      for (const o of orders) {
        if (!isOrderCreatedByCurrentUser(o, req)) return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }
    let tpl;
    let companyNameZh = '';
    if (body.from_blank) {
      tpl = { id: null, body_html: RECOMMENDED_CONTRACT_BODY_HTML };
      const [[companyRows]] = await pool.query('SELECT company_name_zh FROM company_settings WHERE id = 1 LIMIT 1');
      companyNameZh = String(companyRows[0]?.company_name_zh || '').trim();
    } else {
      const [[tplRows], [companyRows]] = await Promise.all([
        pool.query('SELECT * FROM sales_contract_templates WHERE id = ?', [body.template_id]),
        pool.query('SELECT company_name_zh FROM company_settings WHERE id = 1 LIMIT 1')
      ]);
      tpl = tplRows[0];
      if (!tpl) return res.status(404).json({ error: 'TEMPLATE_NOT_FOUND' });
      companyNameZh = String(companyRows[0]?.company_name_zh || '').trim();
    }

    const linesHtml = buildContractOrderLinesHtml(orders);

    /**
     * 兜底：历史模板可能缺少统一外层 div（或字体声明），导致前端无法将正文反解析回可视化表单。
     * 这里不改变模板正文内容，只补一个标准外壳，保证后续可视化识别的基础条件更一致。
     */
    function ensureStandardContractOuterWrap(html) {
      const s = String(html || '').trim();
      if (!s) return s;
      // 已包含常用字体/外层：不重复包裹
      if (s.includes('SimSun') || s.includes('宋体')) return s;
      return `<div style="font-family:SimSun,宋体;line-height:1.8;font-size:14px;color:#000">${s}</div>`;
    }

    const conn = await pool.getConnection();
    let cnLockKey = null;
    try {
      await conn.beginTransaction();
      const { contractNo, lockKey } = await reserveNextShanghaiContractNo(conn);
      cnLockKey = lockKey;
      /** 明细金额由用户在合同内填写；占位总金额用 0 */
      const amountTotal = 0;
      const first = orders[0];
      const customerLegalName = await resolveCustomerLegalNameForContract(conn, first);
      const filled = ensureStandardContractOuterWrap(
        applyCompanySellerNameToFilledContract(
          fillContractTemplate(tpl.body_html, {
            CUSTOMER_NAME: customerLegalName || '',
            ORDER_LINES: linesHtml,
            AMOUNT_TOTAL: amountTotal,
            AMOUNT_TOTAL_CN: amountToRmbUppercase(amountTotal),
            CONTRACT_NO: contractNo,
            SIGN_DATE_ZH: formatSigningDateZhShanghai(),
            COMPANY_NAME_ZH: companyNameZh,
            CUSTOMER_ADDRESS: first.customer_address || '',
            CUSTOMER_CONTACT: first.customer_contact || '',
            CUSTOMER_PHONE: first.customer_phone || ''
          }),
          companyNameZh
        )
      );
      const [ins] = await conn.query(
        `INSERT INTO sales_contracts (contract_no, template_id, customer_id, title, body_html, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
        [
          contractNo,
          tpl.id,
          cid,
          body.title || `销售合同-${customerLegalName || orders[0].customer_name}`,
          filled,
          req.user.userId
        ]
      );
      const contractId = ins.insertId;
      for (const oid of body.order_ids) {
        await conn.query('INSERT INTO sales_contract_orders (contract_id, order_id) VALUES (?, ?)', [contractId, oid]);
      }
      await conn.query(
        `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
         VALUES (?, ?, 'create', NULL, '生成合同草稿')`,
        [contractId, req.user.userId]
      );
      await conn.commit();
      await logOperationFromReq(req, {
        module: '销售合同',
        action: '生成合同草稿',
        detail: { id: contractId }
      });
      res.json({ id: contractId, contract_no: contractNo });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      await releaseShanghaiContractNoLock(conn, cnLockKey);
      conn.release();
    }
  } catch (e) {
    if (e && e.code === 'CONTRACT_NO_DAY_LIMIT') return res.status(400).json({ error: 'CONTRACT_NO_DAY_LIMIT' });
    if (e && e.code === 'CONTRACT_NO_LOCK_FAILED') return res.status(503).json({ error: 'CONTRACT_NO_LOCK_FAILED' });
    next(e);
  }
});

router.post('/contracts/upload-document', contractDocumentUpload.single('file'), async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_generate')) return res.status(403).json({ error: 'FORBIDDEN' });
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'NO_FILE' });
    if (!contractDocumentMimeOk(f.mimetype)) return res.status(400).json({ error: 'UNSUPPORTED_TYPE' });
    const customerId = Number(req.body?.customer_id);
    if (!Number.isFinite(customerId) || customerId < 1) return res.status(400).json({ error: 'BAD_CUSTOMER' });
    const titleRaw = req.body?.title != null ? String(req.body.title).trim() : '';
    const pool = getPool();
    const [cu] = await pool.query('SELECT id FROM sales_customers WHERE id = ? LIMIT 1', [customerId]);
    if (!cu.length) return res.status(400).json({ error: 'CUSTOMER_NOT_FOUND' });
    if (!isSuper(req)) {
      const [chk] = await pool.query(
        'SELECT 1 FROM sales_orders WHERE customer_id = ? AND created_by = ? LIMIT 1',
        [customerId, req.user.userId]
      );
      if (!chk.length) return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const origName = String(f.originalname || 'contract');
    const conn = await pool.getConnection();
    let contractId;
    let contractNo = '';
    let cnLockKey = null;
    try {
      await conn.beginTransaction();
      const reserved = await reserveNextShanghaiContractNo(conn);
      contractNo = reserved.contractNo;
      cnLockKey = reserved.lockKey;
      const title = titleRaw || origName.replace(/\.[^/.]+$/, '') || `文档合同-${contractNo}`;
      const [ins] = await conn.query(
        `INSERT INTO sales_contracts (contract_no, template_id, customer_id, title, body_html, contract_source, status, created_by)
         VALUES (?, NULL, ?, ?, ?, 'upload', 'draft', ?)`,
        [contractNo, customerId, title, UPLOAD_CONTRACT_BODY_HTML, req.user.userId]
      );
      contractId = ins.insertId;
      const relDir = path.join('sales_contract_documents', String(contractId));
      const absDir = path.resolve(process.cwd(), 'uploads', relDir);
      await fsPromises.mkdir(absDir, { recursive: true });
      const stored = `${nanoid(14)}_${safeContractDocumentStoredBaseName(f.originalname)}`;
      const storedRel = path.join(relDir, stored).replace(/\\/g, '/');
      await fsPromises.writeFile(path.join(absDir, stored), f.buffer);
      const mime = String(f.mimetype || '').split(';')[0].trim().toLowerCase();
      await conn.query(
        `UPDATE sales_contracts SET document_stored_rel_path = ?, document_mime_type = ?, document_original_filename = ?, document_size_bytes = ?, updated_at = NOW(3) WHERE id = ?`,
        [storedRel, mime, origName.slice(0, 512), f.size || 0, contractId]
      );
      await conn.query(
        `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
         VALUES (?, ?, 'create', NULL, '上传文档合同草稿')`,
        [contractId, req.user.userId]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      await releaseShanghaiContractNoLock(conn, cnLockKey);
      conn.release();
    }
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '上传文档合同',
      detail: { id: contractId }
    });
    res.json({ id: contractId, contract_no: contractNo });
  } catch (e) {
    if (e && e.code === 'CONTRACT_NO_DAY_LIMIT') return res.status(400).json({ error: 'CONTRACT_NO_DAY_LIMIT' });
    if (e && e.code === 'CONTRACT_NO_LOCK_FAILED') return res.status(503).json({ error: 'CONTRACT_NO_LOCK_FAILED' });
    next(e);
  }
});

router.get('/contracts', async (req, res, next) => {
  try {
    if (!canAccessSalesContractWorkspace(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const seeAll = canViewAllSalesOrders(req);
    const qRaw = req.query.q != null ? String(req.query.q).trim() : '';
    const statusRaw = req.query.status != null ? String(req.query.status).trim() : '';
    const allowedStatus = new Set(['draft', 'pending_review', 'approved', 'rejected']);
    const statusFilter = allowedStatus.has(statusRaw) ? statusRaw : '';
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

    let where = ' WHERE 1=1';
    const args = [];
    if (!seeAll) {
      /** 审批人未录入该客户订单时，仅凭「客户关联订单」会筛掉待审合同；须包含当前审批责任人及待审队列（与 contract_review 权限一致） */
      where += ` AND (
        c.created_by = ?
        OR c.reviewer_user_id = ?
        OR c.customer_id IN (
          SELECT DISTINCT customer_id FROM sales_orders WHERE created_by = ?
        )`;
      args.push(req.user.userId, req.user.userId, req.user.userId);
      if (perm(req, 'contract_management', 'contract_review')) {
        where += ` OR c.status = 'pending_review'`;
      }
      where += ')';
    }
    if (qRaw) {
      where += ` AND (c.contract_no LIKE ? OR cu.customer_name LIKE ? OR IFNULL(c.title,'') LIKE ?)`;
      const p = `%${qRaw}%`;
      args.push(p, p, p);
    }
    if (statusFilter) {
      where += ' AND c.status = ?';
      args.push(statusFilter);
    }
    const customerFilterRaw = req.query.customer_id != null ? String(req.query.customer_id).trim() : '';
    const customerCodeRaw = req.query.customer_code != null ? String(req.query.customer_code).trim() : '';
    if (customerFilterRaw !== '') {
      const cid = Number(customerFilterRaw);
      if (Number.isFinite(cid) && cid >= 1) {
        where += ' AND c.customer_id = ?';
        args.push(cid);
      }
    } else if (customerCodeRaw) {
      where += ' AND cu.customer_code = ?';
      args.push(customerCodeRaw);
    }

    const from = `FROM sales_contracts c
       INNER JOIN sales_customers cu ON cu.id = c.customer_id
       LEFT JOIN users u ON u.id = c.created_by${where}`;

    const [countRows] = await pool.query(`SELECT COUNT(*) AS n ${from}`, args);
    const total = Number(countRows[0]?.n || 0);

    const sql = `SELECT c.*, cu.customer_name, u.username AS created_by_username,
                      (SELECT a.comment_text FROM sales_contract_audit_logs a
                       WHERE a.contract_id = c.id AND a.result = 'rejected'
                       ORDER BY a.id DESC LIMIT 1) AS last_reject_comment
               ${from}
               ORDER BY c.created_at DESC
               LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(sql, [...args, limit, offset]);
    res.json({ items: rows, total });
  } catch (e) {
    next(e);
  }
});

const bulkDeleteContractsSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(100)
});

router.post('/contracts/bulk-delete', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_delete')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = bulkDeleteContractsSchema.parse(req.body || {});
    const uniqueIds = [...new Set(body.ids)];
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const id of uniqueIds) {
        const c = await fetchSalesContractRow(conn, id);
        const vis = await assertSalesContractVisible(req, conn, c);
        if (vis.code === 'NOT_FOUND') {
          await conn.rollback();
          return res.status(400).json({ error: 'NOT_FOUND', id });
        }
        if (!vis.ok) {
          await conn.rollback();
          return res.status(403).json({ error: 'FORBIDDEN', id });
        }
        if (!canMutateSalesContractAsCreator(req, c)) {
          await conn.rollback();
          return res.status(403).json({ error: 'FORBIDDEN', id });
        }
        if (!contractStatusAllowsDelete(c, req)) {
          await conn.rollback();
          return res.status(400).json({ error: 'INVALID_STATUS', id });
        }
      }
      await unlinkSalesContractUploadDocuments(conn, uniqueIds);
      const ph = uniqueIds.map(() => '?').join(',');
      await conn.query(`DELETE FROM sales_contracts WHERE id IN (${ph})`, uniqueIds);
      await conn.commit();
      await logOperationFromReq(req, {
        module: '销售合同',
        action: '批量删除合同',
        detail: { ids: uniqueIds, count: uniqueIds.length },
        success: true
      });
      res.json({ ok: true, deleted: uniqueIds.length });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    next(e);
  }
});

router.get('/contracts/:id', async (req, res, next) => {
  try {
    if (!canAccessSalesContractWorkspace(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT c.*, cu.customer_name,
              cu.address AS customer_address, cu.contact_name AS customer_contact, cu.phone AS customer_phone,
              (SELECT company_name_zh FROM company_settings WHERE id = 1 LIMIT 1) AS company_name_zh
       FROM sales_contracts c
       INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    const c = rows[0];
    const vis = await assertSalesContractVisible(req, pool, c);
    if (!vis.ok) return res.status(vis.code === 'NOT_FOUND' ? 404 : 403).json({ error: vis.code || 'FORBIDDEN' });
    const [orders] = await pool.query(
      `SELECT o.id, o.order_no, o.product_name, o.product_model, o.amount FROM sales_orders o
       INNER JOIN sales_contract_orders sco ON sco.order_id = o.id WHERE sco.contract_id = ?`,
      [req.params.id]
    );
    const [audits] = await pool.query(
      `SELECT a.*, u.username AS actor_username, u.real_name AS actor_real_name
       FROM sales_contract_audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id WHERE a.contract_id = ? ORDER BY a.created_at ASC`,
      [req.params.id]
    );
    res.json({ contract: c, orders, audits });
  } catch (e) {
    next(e);
  }
});

router.get('/contracts/:id/document', async (req, res, next) => {
  try {
    if (!canAccessSalesContractWorkspace(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const cid = Number(req.params.id);
    if (!Number.isFinite(cid) || cid < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, cid);
    if (!c) return res.status(404).json({ error: 'NOT_FOUND' });
    const vis = await assertSalesContractVisible(req, pool, c);
    if (!vis.ok) return res.status(vis.code === 'NOT_FOUND' ? 404 : 403).json({ error: vis.code || 'FORBIDDEN' });
    if (c.contract_source !== 'upload') return res.status(400).json({ error: 'NOT_UPLOAD_CONTRACT' });
    const full = resolveContractUploadFilePath(c);
    if (!full) return res.status(404).json({ error: 'NOT_FOUND' });
    try {
      await fsPromises.access(full);
    } catch {
      return res.status(404).json({ error: 'FILE_MISSING' });
    }
    const mime =
      String(c.document_mime_type || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', contentDispositionHeader(c.document_original_filename || 'contract'));
    const stream = createReadStream(full);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (e) {
    next(e);
  }
});

router.post('/contracts/:id/replace-document', contractDocumentUpload.single('file'), async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_edit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'NO_FILE' });
    if (!contractDocumentMimeOk(f.mimetype)) return res.status(400).json({ error: 'UNSUPPORTED_TYPE' });
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, id);
    const vis = await assertSalesContractVisible(req, pool, c);
    if (vis.code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (!vis.ok) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!canMutateSalesContractAsCreator(req, c)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!contractStatusAllowsEdit(c, req)) return res.status(400).json({ error: 'INVALID_STATUS' });
    if (c.contract_source !== 'upload') return res.status(400).json({ error: 'NOT_UPLOAD_CONTRACT' });
    const oldFull = resolveContractUploadFilePath(c);
    if (oldFull) await fsPromises.unlink(oldFull).catch(() => {});
    const relDir = path.join('sales_contract_documents', String(id));
    const absDir = path.resolve(process.cwd(), 'uploads', relDir);
    await fsPromises.mkdir(absDir, { recursive: true });
    const stored = `${nanoid(14)}_${safeContractDocumentStoredBaseName(f.originalname)}`;
    const storedRel = path.join(relDir, stored).replace(/\\/g, '/');
    await fsPromises.writeFile(path.join(absDir, stored), f.buffer);
    const mime = String(f.mimetype || '').split(';')[0].trim().toLowerCase();
    const origName = String(f.originalname || stored).slice(0, 512);
    await pool.query(
      `UPDATE sales_contracts SET document_stored_rel_path = ?, document_mime_type = ?, document_original_filename = ?, document_size_bytes = ?, updated_at = NOW(3) WHERE id = ?`,
      [storedRel, mime, origName, f.size || 0, id]
    );
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '更换文档合同文件',
      detail: { id },
      success: true
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const patchContractSchema = z
  .object({
    title: z.string().max(256).optional(),
    body_html: z.string().min(1).optional()
  })
  .refine((d) => d.title !== undefined || d.body_html !== undefined, { message: 'EMPTY_PATCH' });

router.patch('/contracts/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_edit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const parsedBody = patchContractSchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      const iss = parsedBody.error.issues[0];
      const p0 = Array.isArray(iss?.path) ? iss.path[0] : null;
      let message = '请检查合同标题与正文';
      if (iss?.code === 'too_big' && p0 === 'title') message = '合同标题不能超过256个字符';
      if (iss?.code === 'too_small' && p0 === 'body_html') message = '合同正文不能为空';
      if (String(iss?.message || '') === 'EMPTY_PATCH') message = '请至少提交标题或正文其中一项';
      return res.status(400).json({ error: 'VALIDATION_FAILED', message });
    }
    const body = parsedBody.data;
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, id);
    const vis = await assertSalesContractVisible(req, pool, c);
    if (vis.code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (!vis.ok) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!canMutateSalesContractAsCreator(req, c)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!contractStatusAllowsEdit(c, req)) return res.status(400).json({ error: 'INVALID_STATUS' });
    if (c.contract_source === 'upload' && body.body_html !== undefined) {
      return res.status(400).json({ error: 'UPLOAD_CONTRACT_NO_BODY_EDIT' });
    }
    const updates = [];
    const args = [];
    if (body.title !== undefined) {
      updates.push('title = ?');
      args.push(String(body.title).trim());
    }
    if (body.body_html !== undefined) {
      updates.push('body_html = ?');
      args.push(body.body_html);
    }
    updates.push('updated_at = NOW(3)');
    args.push(id);
    await pool.query(`UPDATE sales_contracts SET ${updates.join(', ')} WHERE id = ?`, args);
    if (c.contract_source !== 'upload') {
      const nextTitle = body.title !== undefined ? String(body.title).trim() : String(c.title || '');
      const nextBodyHtml = body.body_html !== undefined ? String(body.body_html || '') : String(c.body_html || '');
      const shouldCreateVersion =
        body.body_html !== undefined || (body.title !== undefined && nextTitle !== String(c.title || ''));
      if (shouldCreateVersion) {
        const changedFields = [];
        if (body.title !== undefined && nextTitle !== String(c.title || '')) changedFields.push('标题');
        if (body.body_html !== undefined && nextBodyHtml !== String(c.body_html || '')) changedFields.push('正文');
        const changeNote =
          changedFields.length > 0 ? `修改了${changedFields.join('、')}` : '合同内容更新';
        await createContractVersion(
          pool,
          id,
          nextBodyHtml,
          { title: nextTitle, body_html: nextBodyHtml },
          req.user.userId,
          changeNote
        );
      }
    }
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '修改合同',
      detail: { id },
      success: true
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/contracts/:id', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_delete')) return res.status(403).json({ error: 'FORBIDDEN' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, id);
    const vis = await assertSalesContractVisible(req, pool, c);
    if (vis.code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (!vis.ok) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!canMutateSalesContractAsCreator(req, c)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!contractStatusAllowsDelete(c, req)) return res.status(400).json({ error: 'INVALID_STATUS' });
    await unlinkSalesContractUploadDocuments(pool, [id]);
    await pool.query('DELETE FROM sales_contracts WHERE id = ?', [id]);
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '删除合同',
      detail: { id },
      success: true
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const submitContractSchema = z
  .object({
    reviewer_user_id: z.coerce.number().int().positive().optional(),
    reviewer_user_ids: z.array(z.coerce.number().int().positive()).min(1).max(20).optional()
  })
  .refine((v) => {
    return Number.isFinite(Number(v?.reviewer_user_id)) || (Array.isArray(v?.reviewer_user_ids) && v.reviewer_user_ids.length > 0);
  }, { message: 'reviewer_user_id or reviewer_user_ids required' });

router.post('/contracts/:id/submit', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_submit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = submitContractSchema.parse(req.body || {});
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT c.*, cu.customer_name AS linked_customer_name FROM sales_contracts c
       INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ?`,
      [req.params.id]
    );
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(c, req)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (!['draft', 'rejected'].includes(c.status)) return res.status(400).json({ error: 'INVALID_STATUS' });
    const rawReviewerIds = Array.isArray(body.reviewer_user_ids) && body.reviewer_user_ids.length
      ? body.reviewer_user_ids
      : [body.reviewer_user_id];
    const reviewerIds = [...new Set(rawReviewerIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!reviewerIds.length) return res.status(400).json({ error: 'INVALID_REVIEWER' });
    const [rev] = await pool.query(
      `SELECT u.id FROM users u
       WHERE u.id IN (${reviewerIds.map(() => '?').join(',')})
         AND u.is_active = 1
         AND u.account_type IN ('employee', 'manager')`,
      reviewerIds
    );
    const validIds = new Set((rev || []).map((r) => Number(r.id)));
    if (validIds.size !== reviewerIds.length) return res.status(400).json({ error: 'INVALID_REVIEWER' });
    const firstReviewerId = reviewerIds[0];
    const [reviewerRows] = await pool.query(
      `SELECT id,
              username,
              real_name
       FROM users
       WHERE id IN (${reviewerIds.map(() => '?').join(',')})`,
      reviewerIds
    );
    const reviewerNameById = new Map(
      (reviewerRows || []).map((r) => {
        const realName = r?.real_name != null ? String(r.real_name).trim() : '';
        const username = r?.username != null ? String(r.username).trim() : '';
        const display = realName || username || `用户#${r.id}`;
        return [Number(r.id), username && username !== display ? `${display}(${username})` : display];
      })
    );
    const reviewerChainText = reviewerIds
      .map((id) => reviewerNameById.get(Number(id)) || `用户#${id}`)
      .join(' -> ');
    const approvalFlow = {
      type: 'sequential',
      reviewer_user_ids: reviewerIds,
      current_index: 0
    };
    await pool.query(
      `UPDATE sales_contracts
       SET status = 'pending_review',
           reviewer_user_id = ?,
           approval_flow_json = CAST(? AS JSON),
           updated_at = NOW(3)
       WHERE id = ?`,
      [firstReviewerId, JSON.stringify(approvalFlow), req.params.id]
    );
    await pool.query(
      `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
       VALUES (?, ?, 'submit', NULL, ?)`,
      [req.params.id, req.user.userId, `提交审核，审批链：${reviewerChainText}`]
    );
    /** 顺序审批：仅当前责任人（第一位）收站内信与企业微信；后续节点由 applyContractReview 流转时再通知 */
    const chainStep =
      reviewerIds.length > 1 ? { current: 1, total: reviewerIds.length } : null;
    const { inboxBody } = buildContractReviewerNotifyMessages({
      contractNo: c.contract_no,
      customerName: c.linked_customer_name || '',
      chainStep,
      urge: false,
      actorUsername: ''
    });
    await notifyUser(pool, firstReviewerId, {
      title: reviewerIds.length > 1 ? `合同待审核（第 1/${reviewerIds.length} 位）` : '合同待审核',
      bodyText: inboxBody,
      fromUserId: req.user.userId,
      refType: 'contract',
      refId: Number(req.params.id),
      msgCategory: 'todo'
    });
    await tryNotifyContractReviewerOnSubmit(pool, {
      contractRow: c,
      fromUserId: req.user.userId,
      reviewerUserId: firstReviewerId,
      chainStep
    });
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '提交合同审核',
      detail: { id: req.params.id }
    });
    res.json({
      ok: true,
      totalReviewers: reviewerIds.length,
      currentReviewerUserId: firstReviewerId
    });
  } catch (e) {
    next(e);
  }
});

/** 创建人（或超管）撤回待审合同：退回草稿并通知当前审批人 */
router.post('/contracts/:id/withdraw', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_submit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const [rows] = await pool.query(
      `SELECT c.*, cu.customer_name AS linked_customer_name FROM sales_contracts c
       INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ?`,
      [id]
    );
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(c, req)) return res.status(403).json({ error: 'FORBIDDEN' });
    if (c.status !== 'pending_review') return res.status(400).json({ error: 'INVALID_STATUS' });

    const reviewerId = c.reviewer_user_id != null ? Number(c.reviewer_user_id) : NaN;

    const [withdrawResult] = await pool.query(
      `UPDATE sales_contracts
       SET status = 'draft',
           reviewer_user_id = NULL,
           approval_flow_json = NULL,
           updated_at = NOW(3)
       WHERE id = ? AND status = 'pending_review'`,
      [id]
    );
    if (!withdrawResult.affectedRows) return res.status(409).json({ error: 'CONTRACT_STATE_CHANGED' });

    await pool.query(
      `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
       VALUES (?, ?, 'withdraw_submit', NULL, ?)`,
      [id, req.user.userId, '撤销审核申请，合同退回草稿']
    );

    if (Number.isFinite(reviewerId) && reviewerId >= 1 && Number(reviewerId) !== Number(req.user.userId)) {
      const withdrawBody = await buildContractOrdersNotifyBody(pool, id, {
        intro: `合同 ${c.contract_no} 已由创建人撤销审核申请，已退回草稿，无需再审批。`,
        customerName: c.linked_customer_name || ''
      });
      await notifyUser(pool, reviewerId, {
        title: '合同已撤销审核申请',
        bodyText: withdrawBody,
        fromUserId: req.user.userId,
        refType: 'contract',
        refId: id,
        msgCategory: 'notice'
      });
    }

    await logOperationFromReq(req, {
      module: '销售合同',
      action: '撤销合同审核申请',
      detail: { id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const reviewContractSchema = z.object({
  result: z.enum(['approved', 'rejected']),
  comment: z.string().max(2048).optional()
});

router.post('/contracts/:id/review', async (req, res, next) => {
  try {
    const body = reviewContractSchema.parse(req.body || {});
    if (body.result === 'rejected' && !String(body.comment || '').trim()) {
      return res.status(400).json({ error: 'COMMENT_REQUIRED' });
    }
    const pool = getPool();
    const contractId = Number(req.params.id);
    const [chk] = await pool.query(
      'SELECT reviewer_user_id FROM sales_contracts WHERE id = ? LIMIT 1',
      [contractId]
    );
    const ru = chk?.[0]?.reviewer_user_id;
    /** 多级审批中当前环节的 reviewer_user_id 可能无全局 contract_review（如销售岗）；仍须能审批 */
    if (!isSuper(req)) {
      if (ru == null || Number(ru) !== Number(req.user.userId)) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }
    const r = await applyContractReview(pool, {
      contractId,
      actorUserId: req.user.userId,
      reviewerUserIdForCheck: isSuper(req) && ru != null ? Number(ru) : null,
      result: body.result,
      comment: body.comment || ''
    });
    if (!r.ok) return res.status(r.httpStatus || 400).json({ error: r.code });
    if (r.variant === 'progressed') {
      await logOperationFromReq(req, {
        module: '销售合同',
        action: '审核合同',
        detail: { id: contractId, result: 'approved_step', nextReviewerUserId: r.nextReviewerUserId }
      });
      return res.json({ ok: true, progressed: true, nextReviewerUserId: r.nextReviewerUserId });
    }
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '审核合同',
      detail: { id: contractId, result: body.result }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** 创建人催办当前审批人：站内信 + 企业微信（与提交审核同源模板）；15 分钟内同一合同同一操作人仅一次 */
router.post('/contracts/:id/remind-reviewer', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_submit')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const pool = getPool();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });

    const [rows] = await pool.query(
      `SELECT c.*, cu.customer_name AS linked_customer_name FROM sales_contracts c
       INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ?`,
      [id]
    );
    const c = rows[0];
    if (!c) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isSuper(req) && !isOrderCreatedByCurrentUser(c, req)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (c.status !== 'pending_review') return res.status(400).json({ error: 'INVALID_STATUS' });

    const reviewerId = c.reviewer_user_id != null ? Number(c.reviewer_user_id) : NaN;
    if (!Number.isFinite(reviewerId) || reviewerId < 1) {
      return res.status(400).json({ error: 'NO_REVIEWER' });
    }
    if (Number(reviewerId) === Number(req.user.userId)) {
      return res.status(400).json({ error: 'CANNOT_URGE_SELF' });
    }

    const [recent] = await pool.query(
      `SELECT id FROM sales_contract_audit_logs
       WHERE contract_id = ? AND actor_id = ? AND action = 'urge_review'
         AND created_at > DATE_SUB(NOW(3), INTERVAL 15 MINUTE)
       LIMIT 1`,
      [id, req.user.userId]
    );
    if (recent.length) return res.status(400).json({ error: 'URGE_TOO_FREQUENT' });

    const [au] = await pool.query('SELECT username FROM users WHERE id = ? LIMIT 1', [req.user.userId]);
    const actorUsername = au?.[0]?.username != null ? String(au[0].username) : '';

    const reviewerLabel = await userDisplayLabel(pool, reviewerId);
    await pool.query(
      `INSERT INTO sales_contract_audit_logs (contract_id, actor_id, action, result, comment_text)
       VALUES (?, ?, 'urge_review', NULL, ?)`,
      [id, req.user.userId, `催办当前审批人（${reviewerLabel}）`]
    );

    const { inboxBody } = buildContractReviewerNotifyMessages({
      contractNo: c.contract_no,
      customerName: c.linked_customer_name || '',
      chainStep: null,
      urge: true,
      actorUsername: actorUsername || ''
    });

    await notifyUser(pool, reviewerId, {
      title: '合同审批催办',
      bodyText: inboxBody,
      fromUserId: req.user.userId,
      refType: 'contract',
      refId: id,
      msgCategory: 'todo'
    });

    await tryNotifyContractReviewerOnSubmit(pool, {
      contractRow: c,
      fromUserId: req.user.userId,
      reviewerUserId: reviewerId,
      chainStep: null,
      urge: { actorUsername: actorUsername || '' }
    });

    await logOperationFromReq(req, {
      module: '销售合同',
      action: '催办合同审批',
      detail: { contractId: id, reviewerUserId: reviewerId }
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** 流程追溯：订单状态日志汇总（需流程权限或订单全量查询） */
router.get('/process/order-logs', async (req, res, next) => {
  try {
    if (!perm(req, 'process_management', 'view_flow')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const orderNo = req.query.order_no;
    const seeAll = canViewAllSalesOrders(req);
    let sql = `SELECT l.*, o.order_no, u.username AS actor_username
               FROM sales_order_status_logs l
               INNER JOIN sales_orders o ON o.id = l.order_id
               LEFT JOIN users u ON u.id = l.actor_id
               WHERE 1=1`;
    const args = [];
    if (!seeAll) {
      sql += ' AND o.created_by = ?';
      args.push(req.user.userId);
    }
    if (orderNo && orderNo.trim() !== '') {
      sql += ' AND o.order_no LIKE ?';
      args.push(`%${orderNo}%`);
    }
    const finScopeP = financeOrderListScopeSql(req);
    sql += finScopeP.sql;
    args.push(...finScopeP.args);
    sql += ' ORDER BY l.created_at DESC LIMIT ?';
    args.push(limit);
    const [rows] = await pool.query(sql, args);
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

/** 审批人列表（提交合同时选人）；可选 departmentId= 部门树筛选（含子部门） */
router.get('/finance-reviewers', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_submit')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const rawDept = req.query.departmentId;
    let deptIds = null;
    if (rawDept != null && String(rawDept).trim() !== '') {
      const rootId = Number(rawDept);
      if (!Number.isFinite(rootId) || rootId < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
      const [chk] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [rootId]);
      if (!chk?.[0]) return res.status(400).json({ error: 'BAD_DEPARTMENT' });
      deptIds = await departmentSubtreeIds(pool, rootId);
    }
    let sql = `SELECT u.id,
                      u.username,
                      u.real_name AS realName,
                      CASE
                        WHEN u.real_name IS NOT NULL AND TRIM(u.real_name) <> '' THEN u.real_name
                        ELSE u.username
                      END AS displayName,
                      u.department_id AS departmentId,
                      d.name_zh AS departmentNameZh
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1`;
    const args = [];
    if (deptIds?.length) {
      sql += ` AND u.department_id IN (${deptIds.map(() => '?').join(',')})`;
      args.push(...deptIds);
    }
    sql += ' ORDER BY d.sort_order ASC, d.id ASC, u.username ASC';
    const [rows] = await pool.query(sql, args);
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/sales-users', async (req, res, next) => {
  try {
    if (!perm(req, 'order_management', 'order_query')) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT u.id, u.username FROM users u
       INNER JOIN employee_categories c ON c.id = u.employee_category_id
       WHERE u.account_type IN ('employee', 'manager') AND u.is_active = 1 AND c.code = 'sales'`
    );
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

/** ==================== Step 2: 版本管理 + 多级审批 API ==================== */

/** 获取合同版本历史 */
router.get('/contracts/:id/versions', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_version_view')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const id = Number(req.params.id);
    const pool = getPool();
    let versions = [];
    try {
      versions = await getContractVersions(pool, id);
    } catch (err) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }
    if (!versions.length) {
      const [rows] = await pool.query(
        `SELECT id, current_version, created_by, created_at, updated_at, last_version_created_at
         FROM sales_contracts WHERE id = ? LIMIT 1`,
        [id]
      );
      const c = rows[0];
      if (c) {
        versions = [
          {
            id: 0,
            version_num: Number(c.current_version) > 0 ? Number(c.current_version) : 1,
            change_summary: '当前版本',
            created_by: c.created_by ?? null,
            created_at: c.last_version_created_at || c.updated_at || c.created_at
          }
        ];
      }
    }
    res.json({ items: versions });
  } catch (e) {
    next(e);
  }
});

/** 创建新版本（编辑后自动触发或手动保存版本） */
router.post('/contracts/:id/versions', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_edit')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const id = Number(req.params.id);
    const body = req.body || {};
    const pool = getPool();

    const result = await createContractVersion(
      pool,
      id,
      body.body_html || '',
      body.data_json,
      req.user.userId,
      body.change_note
    );

    await logOperationFromReq(req, {
      module: '销售合同',
      action: '创建新版本',
      detail: { contractId: id, version: result.version, changeSummary: result.changeSummary }
    });

    res.json({ ok: true, version: result.version, changeSummary: result.changeSummary });
  } catch (e) {
    next(e);
  }
});

/** 版本 Diff 对 比 */
router.get('/contracts/:id/versions/:v1/:v2/diff', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_version_view')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const id = Number(req.params.id);
    const v1 = Number(req.params.v1);
    const v2 = Number(req.params.v2);
    const pool = getPool();

    const diff = await getVersionDiff(pool, id, v1, v2);
    res.json(diff);
  } catch (e) {
    next(e);
  }
});

/** 设置多级审批流 */
router.post('/contracts/:id/approval-flow', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_multi_approve')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const id = Number(req.params.id);
    const steps = req.body?.steps || [];
    const pool = getPool();

    const result = await setupApprovalFlow(pool, id, steps, req.user.userId, req);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/** 获取多级审批流（步骤详情） */
router.get('/contracts/:id/approval-flow', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_multi_approve')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const id = Number(req.params.id);
    const pool = getPool();
    let steps = [];
    try {
      const [rows] = await pool.query(
        `SELECT id, step_order, step_type, approvers_json, required_approvals, status, completed_by, comment_text, completed_at
         FROM contract_approval_steps
         WHERE contract_id = ?
         ORDER BY step_order ASC, id ASC`,
        [id]
      );
      steps = rows.map((row) => ({
        ...row,
        approvers_json: (() => {
          try {
            return JSON.parse(row.approvers_json || '[]');
          } catch {
            return [];
          }
        })()
      }));
    } catch (err) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    if (!steps.length) {
      const [contracts] = await pool.query(
        'SELECT approval_flow_json FROM sales_contracts WHERE id = ? LIMIT 1',
        [id]
      );
      const rawFlow = contracts?.[0]?.approval_flow_json;
      let flow = [];
      if (Array.isArray(rawFlow)) {
        flow = rawFlow;
      } else if (typeof rawFlow === 'string' && rawFlow.trim()) {
        try {
          flow = JSON.parse(rawFlow);
        } catch {
          flow = [];
        }
      }
      steps = flow.map((step, idx) => ({
        id: `fallback-${idx + 1}`,
        step_order: idx + 1,
        step_type: step?.type || 'sequential',
        approvers_json: Array.isArray(step?.approvers) ? step.approvers : [],
        required_approvals: Number(step?.required) > 0 ? Number(step.required) : 1,
        status: 'pending',
        completed_by: [],
        comment_text: '',
        completed_at: null
      }));
    }

    res.json({ steps });
  } catch (e) {
    next(e);
  }
});

/** 审批特定步骤（支持多级/会签） */
router.post('/contracts/:id/approve-step/:stepId', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_multi_approve') &&
        !perm(req, 'contract_management', 'contract_review')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const id = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    const body = req.body || {};
    const pool = getPool();

    const result = await approveStep(
      pool,
      id,
      stepId,
      req.user.userId,
      body.result || 'approved',
      body.comment || '',
      req
    );

    res.json(result);
  } catch (e) {
    next(e);
  }
});
