import { Router } from 'express';
import { createReadStream } from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import multer from 'multer';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { normalizeInvoiceUrl } from '../../../shared/invoiceUrl.js';

import { getPool } from '../db/pool.js';
import { isSalesCustomerNgramFulltextReady, ensureSalesContractInvoiceTables } from '../db/ensureSchema.js';
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
  buildFinanceInvoiceNotifyBody,
  formatInvoiceAmountZh,
  tryNotifyApplicantWecomInvoiceEvent,
  tryNotifyFinanceWecomInvoiceEvent
} from '../lib/contractInvoiceWecomNotify.js';
import {
  fillContractTemplate,
  applyCompanySellerNameToFilledContract,
  formatSigningDateZhShanghai,
  releaseShanghaiContractNoLock,
  reserveNextShanghaiContractNo
} from '../lib/contractTemplateFill.js';
import { amountToRmbUppercase } from '../lib/chineseMoney.js';
import { buildContractOrderLinesHtml } from '../lib/contractOrderLines.js';
import { loadOrderFieldDefinitions, prepareOrderRowForContractHtml, tonsFromQtyAndSpec } from '../lib/salesOrderFields.js';
import { resolveCustomerLegalNameForContract } from '../lib/salesCustomerContractName.js';
import { resolveBuyerFieldsForContract } from '../lib/salesCustomerContractInfo.js';
import { loadContractInvoiceAutoFields } from '../lib/contractInvoiceAutoFields.js';
import { RECOMMENDED_CONTRACT_BODY_HTML } from '../lib/contractRecommendedBody.js';
import {
  createContractVersion,
  getContractVersions,
  getVersionDiff,
  setupApprovalFlow,
  approveStep
} from '../lib/contractVersion.js';
import { resolveContractUploadFilePath } from '../lib/salesContractUploadPath.js';
import { generateContractDocx } from '../lib/contractDocxExport.js';
import { generateContractPdf, renderUploadImageToPdf } from '../lib/contractPdfExport.js';
import { userDisplayLabel } from '../lib/userDisplayLabel.js';

import { createSalesOrdersRouter } from './sales/ordersRouter.js';
import {
  perm,
  isSuper,
  authenticatedNumericUserId,
  isOrderCreatedByCurrentUser,
  canViewAllSalesOrders,
  financeContractListScopeSql,
  canAccessSalesContractWorkspace,
  fetchSalesContractRow,
  assertSalesContractVisible,
  canMutateSalesContractAsCreator,
  contractStatusAllowsEdit,
  contractStatusAllowsDelete,
  notifyUser,
  notifyUsersByCategory,
  departmentSubtreeIds
} from './sales/salesShared.js';

export const router = Router();

const contractDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  /** 默认 latin1 会把 UTF-8 中文标题/文件名解成乱码 */
  defParamCharset: 'utf8'
});

const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
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

/** 开票状态：已通过开票金额合计 vs 合同关联订单金额合计 → none/partial/full */
function computeInvoiceStatus(invoicedAmount, contractTotal) {
  const invoiced = Number(invoicedAmount || 0);
  const total = Number(contractTotal || 0);
  if (!(invoiced > 0)) return 'none';
  if (total > 0 && invoiced + 0.0001 < total) return 'partial';
  return 'full';
}

/** 可发起/管理开票（申请人）：与合同提交审核同源权限 */
function canManageContractInvoice(req) {
  return (
    perm(req, 'contract_management', 'contract_submit') ||
    perm(req, 'contract_management', 'contract_generate')
  );
}

/** 财务回填发票信息（链接、代码、号码） */
function canFulfillContractInvoice(req) {
  return isSuper(req) || perm(req, 'order_management', 'order_status_finance');
}

/** 删除开票申请（草稿） */
function canDeleteContractInvoice(req) {
  return isSuper(req) || perm(req, 'contract_management', 'invoice_delete');
}

/** 测试阶段：有删除权限时可删的状态（含已开票） */
function isInvoiceDeletableStatus(raw) {
  const st = normalizeInvoiceStatus(raw);
  return st === 'draft' || st === 'pending_finance' || st === 'issued' || st === 'cancelled';
}

/** 兼容旧库中的审批态枚举 */
function normalizeInvoiceStatus(raw) {
  const s = String(raw || 'draft');
  if (s === 'pending_review') return 'pending_finance';
  if (s === 'approved') return 'issued';
  if (s === 'rejected') return 'draft';
  return s;
}

const INVOICE_ISSUED_STATUSES = "('issued', 'approved')";
const INVOICE_PENDING_FINANCE_STATUSES = "('pending_finance', 'pending_review')";
const INVOICE_DRAFT_STATUSES = "('draft', 'rejected')";

/** 开票中心列表：状态筛选（含旧库枚举；all/全部 不过滤） */
function resolveInvoiceListStatusFilter(statusRaw) {
  const raw = String(statusRaw ?? '').trim().toLowerCase();
  if (!raw || raw === 'all' || raw === '全部' || raw === '*') {
    return { where: ' WHERE 1=1', args: [] };
  }
  if (raw === 'draft') return { where: ` WHERE iv.status IN ${INVOICE_DRAFT_STATUSES}`, args: [] };
  if (raw === 'pending_finance') {
    return { where: ` WHERE iv.status IN ${INVOICE_PENDING_FINANCE_STATUSES}`, args: [] };
  }
  if (raw === 'issued') return { where: ` WHERE iv.status IN ${INVOICE_ISSUED_STATUSES}`, args: [] };
  if (raw === 'cancelled') return { where: " WHERE iv.status IN ('cancelled')", args: [] };
  return { where: ' WHERE iv.status = ?', args: [String(statusRaw).trim()] };
}

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
      'SELECT id, name, is_system, created_at, updated_at FROM sales_contract_templates ORDER BY is_system DESC, updated_at DESC'
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
    const [[tpl]] = await pool.query('SELECT is_system FROM sales_contract_templates WHERE id = ?', [req.params.id]);
    if (tpl?.is_system) return res.status(403).json({ error: 'CANNOT_DELETE_SYSTEM_TEMPLATE' });
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
    title: z.string().max(256).optional(),
    currentFormulas: z.array(z.object({
      formulaText: z.string().min(1),
      targetColIndex: z.number().int().min(0)
    })).optional(),
    totalAmountTargetColIndex: z.number().int().min(0).optional()
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
      title: val.title,
      totalAmountTargetColIndex: val.totalAmountTargetColIndex ?? 9
    };
  });

router.post('/contracts/generate', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_generate')) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = generateContractSchema.parse(req.body || {});
    const pool = getPool();
    const placeholders = body.order_ids.map(() => '?').join(',');
    const [orders] = await pool.query(
       `SELECT o.*, c.customer_name, c.contact_name, c.customer_code, c.customer_group,
                c.address AS customer_address, c.contact_person AS customer_contact, c.phone AS customer_phone,
                c.fax AS customer_fax, c.bank_name AS customer_bank, c.bank_account AS customer_account, c.tax_id AS customer_tax_id
        FROM sales_orders o
        INNER JOIN sales_customers c ON c.id = o.customer_id
        WHERE o.id IN (${placeholders})`,
      body.order_ids
    );
    if (orders.length !== body.order_ids.length) return res.status(400).json({ error: 'ORDER_NOT_FOUND' });
    const cid = orders[0].customer_id;
    // mysql2 等对 BIGINT 可能返回 string；与前端勾选逻辑一致，按数值比较同一客户
    if (!orders.every((o) => Number(o.customer_id) === Number(cid))) {
      return res.status(400).json({ error: 'CUSTOMER_MISMATCH' });
    }
    if (!isSuper(req)) {
      for (const o of orders) {
        if (!isOrderCreatedByCurrentUser(o, req)) return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }
    const [existingLinks] = await pool.query(
      `SELECT order_id FROM sales_contract_orders WHERE order_id IN (${placeholders})`,
      body.order_ids
    );
    if (existingLinks.length) {
      return res.status(400).json({
        error: 'ORDERS_ALREADY_CONTRACTED',
        orderIds: existingLinks.map(r => r.order_id)
      });
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

    const listFieldDefs = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    // 预规范化订单（合并 data_json），确保 product_model 取自 display_data
    const preparedOrders = (orders || []).map((o) => prepareOrderRowForContractHtml(o, listFieldDefs));
    // 查询内部型号的品名映射：按 internal_code 和 name（客户型号）双匹配，再通过客户型号对照兜底
    const modelCodes = [...new Set(preparedOrders.map((o) => String(o?.product_model || '').trim().toUpperCase()).filter(Boolean))];
    let modelToProductNameMap = {};
    if (modelCodes.length) {
      const ph = modelCodes.map(() => '?').join(',');
      const customerId = orders[0]?.customer_id;
      const [modelRows] = await pool.query(
        `SELECT im.internal_code, im.name, im.product_name
         FROM sales_internal_models im
         WHERE (im.internal_code IN (${ph}) OR im.name IN (${ph})) AND im.product_name IS NOT NULL
         UNION
         SELECT UPPER(cm.customer_model), '', im.product_name
         FROM sales_customer_model_mappings cm
         INNER JOIN sales_internal_models im ON im.internal_code = cm.internal_model AND im.product_name IS NOT NULL
         WHERE cm.customer_id = ? AND UPPER(cm.customer_model) IN (${ph})`,
        [...modelCodes, ...modelCodes, customerId, ...modelCodes]
      );
      for (const mr of modelRows) {
        if (mr.product_name) {
          modelToProductNameMap[mr.internal_code.toUpperCase()] = mr.product_name;
          if (mr.name) {
            modelToProductNameMap[mr.name.toUpperCase()] = mr.product_name;
          }
        }
      }
    }
    const linesHtml = buildContractOrderLinesHtml(preparedOrders, listFieldDefs, modelToProductNameMap);
    function orderAmountForColIndex(o, colIndex) {
      const po = listFieldDefs?.length ? prepareOrderRowForContractHtml(o, listFieldDefs) : o;
      const grossUnit = Number(po?.unit_price);
      const tons = tonsFromQtyAndSpec(po?.quantity, po?.product_name || '');
      if (!Number.isFinite(grossUnit) || grossUnit <= 0 || tons == null || tons <= 0) return 0;
      const DEFAULT_VAT_RATE = 0.13;
      const d = o?.display_data || {};
      const raw = o?.tax_rate ?? o?.vat_rate ?? d?.tax_rate ?? d?.vat_rate ?? o?.data_json?.tax_rate;
      let vatRate = DEFAULT_VAT_RATE;
      if (raw != null && raw !== '') {
        const s = String(raw).replace(/%/g, '').trim();
        const n = Number(s);
        if (Number.isFinite(n) && n >= 0) vatRate = n > 1 && n <= 100 ? n / 100 : n;
      }
      const netUnit = grossUnit / (1 + vatRate);
      const totalWithTax = grossUnit * tons;
      const netAmount = netUnit * tons;
      const taxAmount = totalWithTax - netAmount;
      switch (colIndex) {
        case 6: return netAmount;
        case 8: return taxAmount;
        case 9: return totalWithTax;
        default: return totalWithTax;
      }
    }
    let totalAmount = 0;
    for (const o of orders) {
      totalAmount += orderAmountForColIndex(o, body.totalAmountTargetColIndex);
    }
    totalAmount = Math.round(totalAmount * 100) / 100;

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
      const amountTotal = totalAmount;
      const first = orders[0];
      const customerFullName = await resolveCustomerLegalNameForContract(conn, {
        customer_name: first.customer_name,
        customer_contact: first.contact_name,
        customer_group: first.customer_group
      });
      const buyerFields = await resolveBuyerFieldsForContract(
        conn,
        {
          customer_address: first.customer_address,
          customer_contact: first.customer_contact,
          customer_phone: first.customer_phone,
          customer_fax: first.customer_fax,
          customer_bank: first.customer_bank,
          customer_account: first.customer_account,
          customer_tax_id: first.customer_tax_id
        },
        customerFullName,
        first.customer_name
      );
      const filled = ensureStandardContractOuterWrap(
        applyCompanySellerNameToFilledContract(
          fillContractTemplate(tpl.body_html, {
            CUSTOMER_NAME: customerFullName || '',
            ORDER_LINES: linesHtml,
            AMOUNT_TOTAL: Number(amountTotal).toFixed(2),
            AMOUNT_TOTAL_CN: amountToRmbUppercase(amountTotal),
            CONTRACT_NO: contractNo,
            SIGN_DATE_ZH: formatSigningDateZhShanghai(),
            COMPANY_NAME_ZH: companyNameZh,
            CUSTOMER_ADDRESS: buyerFields.address,
            CUSTOMER_CONTACT: buyerFields.contact,
            CUSTOMER_PHONE: buyerFields.phone,
            CUSTOMER_FAX: buyerFields.fax,
            CUSTOMER_BANK: buyerFields.bank,
            CUSTOMER_ACCOUNT: buyerFields.account,
            CUSTOMER_TAX_ID: buyerFields.taxId
          }),
          companyNameZh
        )
      );
      const contractVisualFormulas = Array.isArray(body.currentFormulas) && body.currentFormulas.length > 0
        ? body.currentFormulas : null;
      const visualPayload = {};
      if (contractVisualFormulas) visualPayload.formulas = contractVisualFormulas;
      visualPayload.totalAmountTargetColIndex = body.totalAmountTargetColIndex;
      visualPayload.showPartyBlock = true;
      visualPayload.partyBuyerItems = [
        { label: '单位', value: customerFullName || '', fallback: '{{CUSTOMER_NAME}}' },
        { label: '地址', value: buyerFields.address, fallback: '{{CUSTOMER_ADDRESS}}' },
        { label: '联系人', value: buyerFields.contact, fallback: '{{CUSTOMER_CONTACT}}' },
        { label: '电话', value: buyerFields.phone, fallback: '{{CUSTOMER_PHONE}}' },
        { label: '传真', value: buyerFields.fax, fallback: '{{CUSTOMER_FAX}}' },
        { label: '开户银行', value: buyerFields.bank, fallback: '{{CUSTOMER_BANK}}' },
        { label: '账号', value: buyerFields.account, fallback: '{{CUSTOMER_ACCOUNT}}' },
        { label: '税号', value: buyerFields.taxId, fallback: '{{CUSTOMER_TAX_ID}}' }
      ];
      const dataJson = Object.keys(visualPayload).length
        ? JSON.stringify({ contract_visual: visualPayload })
        : null;
      const [ins] = await conn.query(
        `INSERT INTO sales_contracts (contract_no, template_id, customer_id, title, body_html, data_json, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [
          contractNo,
          tpl.id,
          cid,
          body.title || `销售合同-${customerFullName || orders[0].customer_name}`,
          filled,
          dataJson,
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
    const finContractScope = financeContractListScopeSql(req);
    where += finContractScope.sql;
    args.push(...finContractScope.args);
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
    const contactNameRaw = req.query.contact_name != null ? String(req.query.contact_name).trim() : '';
    if (customerFilterRaw !== '') {
      const cid = Number(customerFilterRaw);
      if (Number.isFinite(cid) && cid >= 1) {
        where += ' AND c.customer_id = ?';
        args.push(cid);
      }
    } else if (customerCodeRaw) {
      where += ' AND cu.customer_code = ?';
      args.push(customerCodeRaw);
    } else if (contactNameRaw) {
      where += ' AND cu.contact_name LIKE ?';
      args.push(`%${contactNameRaw}%`);
    }

    const from = `FROM sales_contracts c
       INNER JOIN sales_customers cu ON cu.id = c.customer_id
       LEFT JOIN users u ON u.id = c.created_by${where}`;

    const [countRows] = await pool.query(`SELECT COUNT(*) AS n ${from}`, args);
    const total = Number(countRows[0]?.n || 0);

    const sql = `SELECT c.*, cu.customer_name, u.username AS created_by_username,
                      (SELECT a.comment_text FROM sales_contract_audit_logs a
                       WHERE a.contract_id = c.id AND a.result = 'rejected'
                       ORDER BY a.id DESC LIMIT 1) AS last_reject_comment,
                      (SELECT COALESCE(SUM(iv.amount), 0) FROM sales_contract_invoices iv
                       WHERE iv.contract_id = c.id AND iv.status IN ('issued', 'approved')) AS invoiced_amount,
                      (SELECT COUNT(*) FROM sales_contract_invoices iv
                       WHERE iv.contract_id = c.id AND iv.status IN ('pending_finance', 'pending_review')) AS pending_invoice_count,
                      (SELECT COALESCE(SUM(o.amount), 0) FROM sales_contract_orders sco
                       INNER JOIN sales_orders o ON o.id = sco.order_id
                       WHERE sco.contract_id = c.id) AS contract_total
               ${from}
               ORDER BY c.created_at DESC
               LIMIT ? OFFSET ?`;
    const [rows] = await pool.query(sql, [...args, limit, offset]);
    const items = rows.map((r) => ({
      ...r,
      invoice_status: computeInvoiceStatus(r.invoiced_amount, r.contract_total)
    }));
    res.json({ items, total });
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
               cu.address AS customer_address, cu.contact_person AS customer_contact, cu.phone AS customer_phone,
               cu.fax AS customer_fax, cu.bank_name AS customer_bank, cu.bank_account AS customer_account, cu.tax_id AS customer_tax_id,
               (SELECT company_name_zh FROM company_settings WHERE id = 1 LIMIT 1) AS company_name_zh,
               cu.contact_name, cu.customer_group
       FROM sales_contracts c
       INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'NOT_FOUND' });
    const c = rows[0];
    if (!c.customer_address && !c.customer_contact && !c.customer_phone && c.customer_name) {
      const originalName = c.customer_name;
      const resolvedName = await resolveCustomerLegalNameForContract(pool, {
        customer_name: c.customer_name,
        customer_contact: c.contact_name,
        customer_group: c.customer_group
      });
      if (resolvedName && resolvedName !== c.customer_name) {
        c.customer_name = resolvedName;
      }
      const buyerFields = await resolveBuyerFieldsForContract(
        pool,
        {
          customer_address: c.customer_address,
          customer_contact: c.customer_contact,
          customer_phone: c.customer_phone,
          customer_fax: c.customer_fax,
          customer_bank: c.customer_bank,
          customer_account: c.customer_account,
          customer_tax_id: c.customer_tax_id
        },
        resolvedName,
        originalName
      );
      c.customer_address = buyerFields.address || null;
      c.customer_contact = buyerFields.contact || null;
      c.customer_phone = buyerFields.phone || null;
      c.customer_fax = buyerFields.fax || null;
      c.customer_bank = buyerFields.bank || null;
      c.customer_account = buyerFields.account || null;
      c.customer_tax_id = buyerFields.taxId || null;
    }
    const vis = await assertSalesContractVisible(req, pool, c);
    if (!vis.ok) return res.status(vis.code === 'NOT_FOUND' ? 404 : 403).json({ error: vis.code || 'FORBIDDEN' });
    const [orderRows] = await pool.query(
      `SELECT o.* FROM sales_orders o
       INNER JOIN sales_contract_orders sco ON sco.order_id = o.id WHERE sco.contract_id = ?`,
      [req.params.id]
    );
    const listFieldDefs = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    const orders = orderRows.map((r) => prepareOrderRowForContractHtml(r, listFieldDefs));
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

router.get('/contracts/:id/export-docx', async (req, res, next) => {
  try {
    if (!canAccessSalesContractWorkspace(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const cid = Number(req.params.id);
    if (!Number.isFinite(cid) || cid < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, cid);
    if (!c) return res.status(404).json({ error: 'NOT_FOUND' });
    const vis = await assertSalesContractVisible(req, pool, c);
    if (!vis.ok) return res.status(vis.code === 'NOT_FOUND' ? 404 : 403).json({ error: vis.code || 'FORBIDDEN' });
    if (c.contract_source === 'upload') {
      return res.redirect(`/api/sales/contracts/${c.id}/document`);
    }
    const result = await generateContractDocx(pool, cid);
    if (!result) return res.status(500).json({ error: 'DOCX_GEN_FAILED' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', contentDispositionHeader(result.filename));
    const buf = Buffer.from(result.buffer);
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  } catch (e) {
    next(e);
  }
});

router.get('/contracts/:id/export-pdf', async (req, res, next) => {
  try {
    if (!canAccessSalesContractWorkspace(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const cid = Number(req.params.id);
    if (!Number.isFinite(cid) || cid < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, cid);
    if (!c) return res.status(404).json({ error: 'NOT_FOUND' });
    const vis = await assertSalesContractVisible(req, pool, c);
    if (!vis.ok) return res.status(vis.code === 'NOT_FOUND' ? 404 : 403).json({ error: vis.code || 'FORBIDDEN' });

    if (c.contract_source === 'upload') {
      const mime = String(c.document_mime_type || '').toLowerCase();
      const fn = String(c.document_original_filename || '').toLowerCase();
      if (mime.includes('pdf') || fn.endsWith('.pdf')) {
        return res.redirect(`/api/sales/contracts/${c.id}/document`);
      }
      const full = resolveContractUploadFilePath(c);
      if (!full) return res.status(404).json({ error: 'NOT_FOUND' });
      let fileBuf;
      try {
        fileBuf = await fsPromises.readFile(full);
      } catch {
        return res.status(404).json({ error: 'FILE_MISSING' });
      }
      const origName = c.document_original_filename || 'contract';
      const baseName = String(origName).replace(/\.[^.]+$/i, '') || 'contract';

      if (
        mime.includes('wordprocessingml') ||
        fn.endsWith('.docx') ||
        (mime.includes('officedocument') && mime.includes('word'))
      ) {
        const { wordDocxToPdf } = await import('../lib/wordToPdf.js');
        const converted = await wordDocxToPdf(fileBuf, origName);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', contentDispositionHeader(converted.filename || `${baseName}.pdf`));
        res.end(Buffer.from(converted.buffer));
        return;
      }

      if (mime.startsWith('image/')) {
        const converted = await renderUploadImageToPdf(fileBuf, mime, baseName);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', contentDispositionHeader(converted.filename));
        res.end(converted.buffer);
        return;
      }

      return res.status(400).json({ error: 'UNSUPPORTED_PDF_CONVERT' });
    }

    const result = await generateContractPdf(pool, cid);
    if (!result) return res.status(500).json({ error: 'PDF_GEN_FAILED' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDispositionHeader(result.filename));
    const buf = Buffer.from(result.buffer);
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
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

function parseContractDataJson(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function mergeContractDataJson(prev, patch) {
  const next = { ...parseContractDataJson(prev) };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.body_html !== undefined) next.body_html = patch.body_html;
  if (patch.contract_visual !== undefined) next.contract_visual = patch.contract_visual;
  return next;
}

const patchContractSchema = z
  .object({
    title: z.string().max(256).optional(),
    body_html: z.string().min(1).optional(),
    contract_visual: z.record(z.unknown()).optional()
  })
  .refine(
    (d) => d.title !== undefined || d.body_html !== undefined || d.contract_visual !== undefined,
    { message: 'EMPTY_PATCH' }
  );

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
    const nextTitle = body.title !== undefined ? String(body.title).trim() : String(c.title || '');
    const nextBodyHtml = body.body_html !== undefined ? String(body.body_html || '') : String(c.body_html || '');
    if (body.contract_visual !== undefined) {
      const nextDataJson = mergeContractDataJson(c.data_json, {
        title: nextTitle,
        body_html: body.body_html !== undefined ? nextBodyHtml : undefined,
        contract_visual: body.contract_visual
      });
      updates.push('data_json = CAST(? AS JSON)');
      args.push(JSON.stringify(nextDataJson));
    }
    updates.push('updated_at = NOW(3)');
    args.push(id);
    await pool.query(`UPDATE sales_contracts SET ${updates.join(', ')} WHERE id = ?`, args);
    if (c.contract_source !== 'upload') {
      const shouldCreateVersion =
        body.body_html !== undefined ||
        body.contract_visual !== undefined ||
        (body.title !== undefined && nextTitle !== String(c.title || ''));
      if (shouldCreateVersion) {
        const changedFields = [];
        if (body.title !== undefined && nextTitle !== String(c.title || '')) changedFields.push('标题');
        if (body.body_html !== undefined && nextBodyHtml !== String(c.body_html || '')) changedFields.push('正文');
        if (body.contract_visual !== undefined) changedFields.push('订单明细');
        const changeNote =
          changedFields.length > 0 ? `修改了${changedFields.join('、')}` : '合同内容更新';
        const versionDataJson = mergeContractDataJson(c.data_json, {
          title: nextTitle,
          body_html: nextBodyHtml,
          contract_visual:
            body.contract_visual !== undefined
              ? body.contract_visual
              : parseContractDataJson(c.data_json).contract_visual
        });
        await createContractVersion(pool, id, nextBodyHtml, versionDataJson, req.user.userId, changeNote);
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
      current_index: 0,
      submitted_by: req.user.userId
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
    let sql = `SELECT l.*, o.order_no, u.username AS actor_username, u.real_name AS actor_real_name
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

/** ==================== 合同开票 API ==================== */

const invoiceTypeEnum = z.enum(['special', 'normal', 'electronic']);

const invoiceBodySchema = z.object({
  invoice_type: invoiceTypeEnum.optional(),
  amount: z.coerce.number().positive().max(99999999999),
  tax_rate: z.coerce.number().min(0).max(1).optional().nullable(),
  tax_amount: z.coerce.number().min(0).max(99999999999).optional().nullable(),
  buyer_name: z.string().trim().max(256).optional().nullable(),
  buyer_tax_id: z.string().trim().max(64).optional().nullable(),
  buyer_address: z.string().trim().max(512).optional().nullable(),
  buyer_phone: z.string().trim().max(64).optional().nullable(),
  buyer_bank_name: z.string().trim().max(256).optional().nullable(),
  buyer_bank_account: z.string().trim().max(128).optional().nullable(),
  item_name: z.string().trim().max(512).optional().nullable(),
  item_unit: z.string().trim().max(32).optional().nullable(),
  item_quantity: z.coerce.number().positive().max(99999999999).optional().nullable(),
  item_unit_price: z.coerce.number().positive().max(99999999999).optional().nullable(),
  remark: z.string().trim().max(1024).optional().nullable(),
  /** 保存后直接提交财务（无需审批） */
  submit_to_finance: z.boolean().optional()
});

const fulfillInvoiceSchema = z.object({
  invoice_no: z.string().trim().min(1).max(64),
  invoice_code: z.string().trim().min(1).max(64),
  invoice_url: z.preprocess(
    (v) => normalizeInvoiceUrl(v),
    z
      .string()
      .min(1)
      .max(512)
      .refine(
        (s) => {
          try {
            const u = new URL(s);
            return u.protocol === 'http:' || u.protocol === 'https:';
          } catch {
            return false;
          }
        },
        { message: 'INVALID_INVOICE_URL' }
      )
  ),
  buyer_name: z.string().trim().max(256).optional().nullable(),
  buyer_tax_id: z.string().trim().max(64).optional().nullable(),
  buyer_address: z.string().trim().max(512).optional().nullable(),
  buyer_phone: z.string().trim().max(64).optional().nullable(),
  buyer_bank_name: z.string().trim().max(256).optional().nullable(),
  buyer_bank_account: z.string().trim().max(128).optional().nullable(),
  item_name: z.string().trim().max(512).optional().nullable(),
  invoice_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable()
});

/** 单条开票记录 + 所属合同（用于权限校验、审批） */
async function fetchInvoiceWithContract(pool, invoiceId) {
  const id = Number(invoiceId);
  if (!Number.isFinite(id) || id < 1) return null;
  const [rows] = await pool.query(
    `SELECT iv.*, c.contract_no, c.status AS contract_status, c.customer_id, c.created_by AS contract_created_by,
            c.reviewer_user_id AS contract_reviewer_user_id, cu.customer_name
     FROM sales_contract_invoices iv
     INNER JOIN sales_contracts c ON c.id = iv.contract_id
     INNER JOIN sales_customers cu ON cu.id = c.customer_id
     WHERE iv.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

function jsonSafeInvoiceRow(r) {
  const num = (v) => (v == null ? null : Number(v));
  return {
    id: Number(r.id),
    contract_id: Number(r.contract_id),
    contract_no: r.contract_no || null,
    customer_name: r.customer_name || null,
    invoice_no: r.invoice_no,
    invoice_code: r.invoice_code || null,
    invoice_url: r.invoice_url || null,
    invoice_type: r.invoice_type,
    amount: num(r.amount),
    tax_rate: num(r.tax_rate),
    tax_amount: num(r.tax_amount),
    invoice_date: r.invoice_date,
    buyer_name: r.buyer_name,
    buyer_tax_id: r.buyer_tax_id,
    buyer_address: r.buyer_address || null,
    buyer_phone: r.buyer_phone || null,
    buyer_bank_name: r.buyer_bank_name || null,
    buyer_bank_account: r.buyer_bank_account || null,
    item_name: r.item_name || null,
    item_unit: r.item_unit || null,
    item_quantity: num(r.item_quantity),
    item_unit_price: num(r.item_unit_price),
    remark: r.remark,
    status: normalizeInvoiceStatus(r.status),
    issued_at: r.issued_at,
    issued_by: r.issued_by == null ? null : Number(r.issued_by),
    issued_by_username: r.issued_by_username || null,
    issued_by_real_name: r.issued_by_real_name || null,
    created_by: r.created_by == null ? null : Number(r.created_by),
    created_by_username: r.created_by_username || null,
    created_by_real_name: r.created_by_real_name || null,
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}

/** 合同开票汇总：合同金额、已开票、待审开票、可开余额、开票状态 */
async function loadContractInvoiceSummary(pool, contractId) {
  const [[totalRow]] = await pool.query(
    `SELECT COALESCE(SUM(o.amount), 0) AS contract_total
     FROM sales_contract_orders sco
     INNER JOIN sales_orders o ON o.id = sco.order_id
     WHERE sco.contract_id = ?`,
    [contractId]
  );
  const [[sumRow]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN ${INVOICE_ISSUED_STATUSES} THEN amount ELSE 0 END), 0) AS invoiced_amount,
       COALESCE(SUM(CASE WHEN status IN ${INVOICE_PENDING_FINANCE_STATUSES} THEN amount ELSE 0 END), 0) AS pending_amount
     FROM sales_contract_invoices WHERE contract_id = ?`,
    [contractId]
  );
  const contractTotal = Number(totalRow?.contract_total || 0);
  const invoicedAmount = Number(sumRow?.invoiced_amount || 0);
  const pendingAmount = Number(sumRow?.pending_amount || 0);
  return {
    contract_total: contractTotal,
    invoiced_amount: invoicedAmount,
    pending_amount: pendingAmount,
    remaining_amount: Math.max(0, contractTotal - invoicedAmount),
    applicable_remaining_amount: Math.max(0, contractTotal - invoicedAmount - pendingAmount),
    invoice_status: computeInvoiceStatus(invoicedAmount, contractTotal)
  };
}

/** 本次可提交财务的开票余额（合同总额 - 已开票 - 待开票） */
async function loadContractInvoiceApplicableRemaining(pool, contractId) {
  const summary = await loadContractInvoiceSummary(pool, contractId);
  return Number(summary.applicable_remaining_amount || 0);
}

/** 开票记录列表 + 汇总 */
router.get('/contracts/:id/invoices', async (req, res, next) => {
  try {
    await ensureSalesContractInvoiceTables();
    if (!canAccessSalesContractWorkspace(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const cid = Number(req.params.id);
    if (!Number.isFinite(cid) || cid < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, cid);
    const vis = await assertSalesContractVisible(req, pool, c);
    if (!vis.ok) return res.status(vis.code === 'NOT_FOUND' ? 404 : 403).json({ error: vis.code || 'FORBIDDEN' });
    const [rows] = await pool.query(
      `SELECT iv.*,
              cb.username AS created_by_username, cb.real_name AS created_by_real_name,
              ib.username AS issued_by_username, ib.real_name AS issued_by_real_name
       FROM sales_contract_invoices iv
       LEFT JOIN users cb ON cb.id = iv.created_by
       LEFT JOIN users ib ON ib.id = iv.issued_by
       WHERE iv.contract_id = ?
       ORDER BY iv.created_at DESC`,
      [cid]
    );
    const summary = await loadContractInvoiceSummary(pool, cid);
    const defaults = await loadContractInvoiceAutoFields(pool, cid);
    res.json({
      items: rows.map(jsonSafeInvoiceRow),
      summary,
      defaults,
      contract: {
        id: Number(c.id),
        contract_no: c.contract_no,
        status: c.status,
        customer_name: c.customer_name,
        customer_tax_id: c.customer_tax_id || null,
        customer_address: c.customer_address || null,
        customer_phone: c.customer_phone || null,
        customer_bank: c.customer_bank || null,
        customer_account: c.customer_account || null
      },
      can_manage: isSuper(req) || canManageContractInvoice(req),
      can_fulfill: canFulfillContractInvoice(req),
      can_delete: canDeleteContractInvoice(req),
      is_super: isSuper(req)
    });
  } catch (e) {
    next(e);
  }
});

/** 财务开票看板：全局查看开票申请（默认待财务） */
router.get('/invoices', async (req, res, next) => {
  try {
    await ensureSalesContractInvoiceTables();
    if (!canAccessSalesContractWorkspace(req) && !canFulfillContractInvoice(req)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const pool = getPool();
    const qRaw = req.query.q != null ? String(req.query.q).trim() : '';
    const statusRaw = req.query.status != null ? String(req.query.status).trim() : 'pending_finance';
    const { where, args } = resolveInvoiceListStatusFilter(statusRaw);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
    let whereSql = where;
    const argsSql = [...args];
    if (qRaw) {
      whereSql += ' AND (c.contract_no LIKE ? OR cu.customer_name LIKE ? OR IFNULL(iv.invoice_no,\'\') LIKE ?)';
      const p = `%${qRaw}%`;
      argsSql.push(p, p, p);
    }
    const from = `FROM sales_contract_invoices iv
      INNER JOIN sales_contracts c ON c.id = iv.contract_id
      INNER JOIN sales_customers cu ON cu.id = c.customer_id
      LEFT JOIN users cb ON cb.id = iv.created_by
      LEFT JOIN users ib ON ib.id = iv.issued_by${whereSql}`;
    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS n ${from}`, argsSql);
    const [rows] = await pool.query(
      `SELECT iv.*,
              c.contract_no,
              cu.customer_name,
              cb.username AS created_by_username, cb.real_name AS created_by_real_name,
              ib.username AS issued_by_username, ib.real_name AS issued_by_real_name
       ${from}
       ORDER BY iv.updated_at DESC, iv.id DESC
       LIMIT ? OFFSET ?`,
      [...argsSql, limit, offset]
    );
    res.json({
      items: rows.map(jsonSafeInvoiceRow),
      total: Number(countRow?.n || 0),
      can_manage: isSuper(req) || canManageContractInvoice(req),
      can_fulfill: canFulfillContractInvoice(req),
      can_delete: canDeleteContractInvoice(req),
      is_super: isSuper(req)
    });
  } catch (e) {
    next(e);
  }
});

/** 开票审批日志（时间轴用） */
router.get('/invoices/:invId/audits', async (req, res, next) => {
  try {
    if (!canAccessSalesContractWorkspace(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const inv = await fetchInvoiceWithContract(pool, req.params.invId);
    if (!inv) return res.status(404).json({ error: 'NOT_FOUND' });
    const c = await fetchSalesContractRow(pool, inv.contract_id);
    const vis = await assertSalesContractVisible(req, pool, c);
    if (!vis.ok) return res.status(vis.code === 'NOT_FOUND' ? 404 : 403).json({ error: vis.code || 'FORBIDDEN' });
    const [audits] = await pool.query(
      `SELECT a.*, u.username AS actor_username, u.real_name AS actor_real_name
       FROM sales_contract_invoice_audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.invoice_id = ? ORDER BY a.created_at ASC`,
      [Number(inv.id)]
    );
    res.json({ audits });
  } catch (e) {
    next(e);
  }
});

/** 通知财务岗位：有新的开票申请待回填（站内信 + 企业微信） */
async function notifyFinanceInvoiceRequest(pool, req, inv, actionLabel) {
  const fromUserId = authenticatedNumericUserId(req);
  const bodyText = buildFinanceInvoiceNotifyBody(actionLabel, inv);
  await notifyUsersByCategory(pool, 'finance', {
    title: '合同开票待处理',
    bodyText,
    fromUserId,
    refType: 'contract_invoice',
    refId: Number(inv.id),
    msgCategory: 'todo'
  });
  await tryNotifyFinanceWecomInvoiceEvent(pool, {
    event: 'submit',
    inv,
    notifyBody: bodyText,
    fromUserId
  });
}

/** 撤销/删除待开票：通知财务 */
async function notifyFinanceInvoiceWithdrawOrDelete(pool, req, inv, actionLabel) {
  const fromUserId = authenticatedNumericUserId(req);
  const bodyText = buildFinanceInvoiceNotifyBody(actionLabel, inv);
  const isWithdraw = /撤销/.test(actionLabel);
  await notifyUsersByCategory(pool, 'finance', {
    title: isWithdraw ? '开票申请已撤销' : '开票申请已删除',
    bodyText,
    fromUserId,
    refType: 'contract_invoice',
    refId: Number(inv.id),
    msgCategory: 'notice'
  });
  await tryNotifyFinanceWecomInvoiceEvent(pool, {
    event: isWithdraw ? 'withdraw' : 'delete',
    inv,
    notifyBody: bodyText,
    fromUserId
  });
}

/** 新建开票申请（可保存草稿或直接提交财务，无需审批） */
router.post('/contracts/:id/invoices', async (req, res, next) => {
  try {
    await ensureSalesContractInvoiceTables();
    if (!canManageContractInvoice(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const cid = Number(req.params.id);
    if (!Number.isFinite(cid) || cid < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const body = invoiceBodySchema.parse(req.body || {});
    const pool = getPool();
    const c = await fetchSalesContractRow(pool, cid);
    const vis = await assertSalesContractVisible(req, pool, c);
    if (vis.code === 'NOT_FOUND') return res.status(404).json({ error: 'NOT_FOUND' });
    if (!vis.ok) return res.status(403).json({ error: 'FORBIDDEN' });
    if (c.status !== 'approved') return res.status(400).json({ error: 'CONTRACT_NOT_APPROVED' });
    const toFinance = !!body.submit_to_finance;
    const auto = await loadContractInvoiceAutoFields(pool, cid);
    if (toFinance) {
      const room = await loadContractInvoiceApplicableRemaining(pool, cid);
      if (Number(body.amount || 0) > room + 0.0001) {
        return res.status(400).json({ error: 'INVOICE_AMOUNT_EXCEEDS_APPLICABLE' });
      }
    }
    const initialStatus = toFinance ? 'pending_finance' : 'draft';
    const [r] = await pool.query(
      `INSERT INTO sales_contract_invoices
         (contract_id, invoice_type, amount, tax_rate, tax_amount, buyer_name, buyer_tax_id, buyer_address, buyer_phone, buyer_bank_name, buyer_bank_account, item_name, item_unit, item_quantity, item_unit_price, remark, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cid,
        body.invoice_type || 'special',
        body.amount,
        body.tax_rate ?? null,
        body.tax_amount ?? null,
        body.buyer_name || auto.buyer_name || c.customer_name || null,
        body.buyer_tax_id || auto.buyer_tax_id || c.customer_tax_id || null,
        body.buyer_address || auto.buyer_address || null,
        body.buyer_phone || auto.buyer_phone || null,
        body.buyer_bank_name || auto.buyer_bank_name || null,
        body.buyer_bank_account || auto.buyer_bank_account || null,
        body.item_name || auto.item_name || null,
        body.item_unit || auto.item_unit || null,
        body.item_quantity ?? auto.item_quantity ?? null,
        body.item_unit_price ?? auto.item_unit_price ?? null,
        body.remark || null,
        initialStatus,
        authenticatedNumericUserId(req)
      ]
    );
    const invoiceId = Number(r.insertId);
    if (toFinance) {
      const inv = await fetchInvoiceWithContract(pool, invoiceId);
      await pool.query(
        `INSERT INTO sales_contract_invoice_audit_logs (invoice_id, actor_id, action, result, comment_text)
         VALUES (?, ?, 'submit_finance', NULL, '提交财务开票')`,
        [invoiceId, authenticatedNumericUserId(req)]
      );
      if (inv) await notifyFinanceInvoiceRequest(pool, req, inv, '新开票申请');
    }
    await logOperationFromReq(req, {
      module: '销售合同',
      action: toFinance ? '提交开票申请' : '新建开票',
      detail: { contractId: cid, invoiceId, amount: body.amount }
    });
    res.json({ ok: true, id: invoiceId, status: initialStatus });
  } catch (e) {
    next(e);
  }
});

/** 编辑开票：仅草稿、本人或超管 */
router.patch('/invoices/:invId', async (req, res, next) => {
  try {
    await ensureSalesContractInvoiceTables();
    if (!canManageContractInvoice(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = invoiceBodySchema.partial().parse(req.body || {});
    const pool = getPool();
    const inv = await fetchInvoiceWithContract(pool, req.params.invId);
    if (!inv) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isSuper(req) && Number(inv.created_by) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const st = normalizeInvoiceStatus(inv.status);
    if (st !== 'draft') return res.status(400).json({ error: 'INVALID_STATUS' });
    const updates = [];
    const args = [];
    const setField = (col, val) => {
      updates.push(`${col} = ?`);
      args.push(val);
    };
    if (body.invoice_type !== undefined) setField('invoice_type', body.invoice_type || 'special');
    if (body.amount !== undefined) setField('amount', body.amount);
    if (body.tax_rate !== undefined) setField('tax_rate', body.tax_rate ?? null);
    if (body.tax_amount !== undefined) setField('tax_amount', body.tax_amount ?? null);
    if (body.buyer_name !== undefined) setField('buyer_name', body.buyer_name || null);
    if (body.buyer_tax_id !== undefined) setField('buyer_tax_id', body.buyer_tax_id || null);
    if (body.buyer_address !== undefined) setField('buyer_address', body.buyer_address || null);
    if (body.buyer_phone !== undefined) setField('buyer_phone', body.buyer_phone || null);
    if (body.buyer_bank_name !== undefined) setField('buyer_bank_name', body.buyer_bank_name || null);
    if (body.buyer_bank_account !== undefined) setField('buyer_bank_account', body.buyer_bank_account || null);
    if (body.item_name !== undefined) setField('item_name', body.item_name || null);
    if (body.item_unit !== undefined) setField('item_unit', body.item_unit || null);
    if (body.item_quantity !== undefined) setField('item_quantity', body.item_quantity ?? null);
    if (body.item_unit_price !== undefined) setField('item_unit_price', body.item_unit_price ?? null);
    if (body.remark !== undefined) setField('remark', body.remark || null);
    if (!updates.length) return res.json({ ok: true });
    args.push(Number(inv.id));
    await pool.query(
      `UPDATE sales_contract_invoices SET ${updates.join(', ')}, updated_at = NOW(3) WHERE id = ?`,
      args
    );
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '编辑开票',
      detail: { invoiceId: Number(inv.id) }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** 删除开票：需删除权限；测试阶段含已开票；本人或超管 */
router.delete('/invoices/:invId', async (req, res, next) => {
  try {
    if (!canDeleteContractInvoice(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const inv = await fetchInvoiceWithContract(pool, req.params.invId);
    if (!inv) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isSuper(req) && Number(inv.created_by) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (!isInvoiceDeletableStatus(inv.status)) return res.status(400).json({ error: 'INVALID_STATUS' });
    const stBeforeDelete = normalizeInvoiceStatus(inv.status);
    const actorId = authenticatedNumericUserId(req);
    if (stBeforeDelete === 'pending_finance') {
      await notifyFinanceInvoiceWithdrawOrDelete(pool, req, inv, '开票申请已删除（原待开票）');
    } else if (stBeforeDelete === 'issued') {
      const bodyText = `合同 ${inv.contract_no || ''} 的开票记录（${formatInvoiceAmountZh(inv)} 元）已被删除。`;
      const applicantId = inv.created_by != null ? Number(inv.created_by) : NaN;
      if (Number.isFinite(applicantId) && applicantId >= 1) {
        await notifyUser(pool, applicantId, {
          title: '开票记录已删除',
          bodyText,
          fromUserId: actorId,
          refType: 'contract_invoice',
          refId: Number(inv.id),
          msgCategory: 'notice'
        });
      }
      await tryNotifyApplicantWecomInvoiceEvent(pool, {
        event: 'delete',
        inv,
        notifyBody: bodyText,
        fromUserId: actorId
      });
    }
    await pool.query('DELETE FROM sales_contract_invoices WHERE id = ?', [Number(inv.id)]);
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '删除开票',
      detail: { invoiceId: Number(inv.id) }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** 提交财务开票（无审批，通知财务岗位） */
router.post('/invoices/:invId/submit', async (req, res, next) => {
  try {
    await ensureSalesContractInvoiceTables();
    if (!canManageContractInvoice(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const inv = await fetchInvoiceWithContract(pool, req.params.invId);
    if (!inv) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isSuper(req) && Number(inv.created_by) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    if (normalizeInvoiceStatus(inv.status) !== 'draft') return res.status(400).json({ error: 'INVALID_STATUS' });
    const room = await loadContractInvoiceApplicableRemaining(pool, Number(inv.contract_id));
    if (Number(inv.amount || 0) > room + 0.0001) {
      return res.status(400).json({ error: 'INVOICE_AMOUNT_EXCEEDS_APPLICABLE' });
    }
    const [r] = await pool.query(
      `UPDATE sales_contract_invoices
       SET status = 'pending_finance', reviewer_user_id = NULL, approval_flow_json = NULL, updated_at = NOW(3)
       WHERE id = ? AND status IN ('draft', 'rejected')`,
      [Number(inv.id)]
    );
    if (!r.affectedRows) return res.status(409).json({ error: 'INVOICE_STATE_CHANGED' });
    await pool.query(
      `INSERT INTO sales_contract_invoice_audit_logs (invoice_id, actor_id, action, result, comment_text)
       VALUES (?, ?, 'submit_finance', NULL, '提交财务开票')`,
      [Number(inv.id), authenticatedNumericUserId(req)]
    );
    await notifyFinanceInvoiceRequest(pool, req, inv, '开票申请');
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '提交开票申请',
      detail: { invoiceId: Number(inv.id) }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** 撤销提交：待财务处理 → 退回草稿 */
router.post('/invoices/:invId/withdraw', async (req, res, next) => {
  try {
    await ensureSalesContractInvoiceTables();
    if (!canManageContractInvoice(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const pool = getPool();
    const inv = await fetchInvoiceWithContract(pool, req.params.invId);
    if (!inv) return res.status(404).json({ error: 'NOT_FOUND' });
    if (!isSuper(req) && Number(inv.created_by) !== Number(req.user.userId)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const st = normalizeInvoiceStatus(inv.status);
    if (st !== 'pending_finance') return res.status(400).json({ error: 'INVALID_STATUS' });
    const [r] = await pool.query(
      `UPDATE sales_contract_invoices
       SET status = 'draft', updated_at = NOW(3)
       WHERE id = ? AND status IN ('pending_finance', 'pending_review')`,
      [Number(inv.id)]
    );
    if (!r.affectedRows) return res.status(409).json({ error: 'INVOICE_STATE_CHANGED' });
    await pool.query(
      `INSERT INTO sales_contract_invoice_audit_logs (invoice_id, actor_id, action, result, comment_text)
       VALUES (?, ?, 'withdraw_submit', NULL, '撤销开票申请，退回草稿')`,
      [Number(inv.id), authenticatedNumericUserId(req)]
    );
    await notifyFinanceInvoiceWithdrawOrDelete(pool, req, inv, '销售已撤销开票申请，该单不再待开票');
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '撤销开票申请',
      detail: { invoiceId: Number(inv.id) }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** 财务回填发票：号码、代码、链接 → 已开票 */
router.post('/invoices/:invId/fulfill', async (req, res, next) => {
  try {
    await ensureSalesContractInvoiceTables();
    if (!canFulfillContractInvoice(req)) return res.status(403).json({ error: 'FORBIDDEN' });
    const body = fulfillInvoiceSchema.parse(req.body || {});
    const pool = getPool();
    const inv = await fetchInvoiceWithContract(pool, req.params.invId);
    if (!inv) return res.status(404).json({ error: 'NOT_FOUND' });
    const st = normalizeInvoiceStatus(inv.status);
    if (st !== 'pending_finance') return res.status(400).json({ error: 'INVALID_STATUS' });
    const actorId = authenticatedNumericUserId(req);
    const [r] = await pool.query(
      `UPDATE sales_contract_invoices
       SET status = 'issued',
           invoice_no = ?,
           invoice_code = ?,
           invoice_url = ?,
           buyer_name = COALESCE(?, buyer_name),
           buyer_tax_id = COALESCE(?, buyer_tax_id),
           buyer_address = COALESCE(?, buyer_address),
           buyer_phone = COALESCE(?, buyer_phone),
           buyer_bank_name = COALESCE(?, buyer_bank_name),
           buyer_bank_account = COALESCE(?, buyer_bank_account),
           item_name = COALESCE(?, item_name),
           invoice_date = COALESCE(?, invoice_date, CURDATE()),
           issued_at = NOW(3),
           issued_by = ?,
           updated_at = NOW(3)
       WHERE id = ? AND status IN ('pending_finance', 'pending_review')`,
      [
        body.invoice_no,
        body.invoice_code,
        body.invoice_url,
        body.buyer_name || null,
        body.buyer_tax_id || null,
        body.buyer_address || null,
        body.buyer_phone || null,
        body.buyer_bank_name || null,
        body.buyer_bank_account || null,
        body.item_name || null,
        body.invoice_date || null,
        actorId,
        Number(inv.id)
      ]
    );
    if (!r.affectedRows) return res.status(409).json({ error: 'INVOICE_STATE_CHANGED' });
    await pool.query(
      `INSERT INTO sales_contract_invoice_audit_logs (invoice_id, actor_id, action, result, comment_text)
       VALUES (?, ?, 'fulfill', 'issued', ?)`,
      [
        Number(inv.id),
        actorId,
        `财务已开票：号码 ${body.invoice_no}，代码 ${body.invoice_code}`
      ]
    );
    const fulfillBodyText = `合同 ${inv.contract_no || ''} 的开票申请已完成。发票号码：${body.invoice_no}，发票代码：${body.invoice_code}。`;
    const applicantId = inv.created_by != null ? Number(inv.created_by) : NaN;
    if (Number.isFinite(applicantId) && applicantId >= 1 && applicantId !== actorId) {
      await notifyUser(pool, applicantId, {
        title: '发票已开具',
        bodyText: fulfillBodyText,
        fromUserId: actorId,
        refType: 'contract_invoice',
        refId: Number(inv.id),
        msgCategory: 'notice'
      });
    }
    await tryNotifyApplicantWecomInvoiceEvent(pool, {
      event: 'fulfilled',
      inv,
      notifyBody: fulfillBodyText,
      fromUserId: actorId,
      invoiceNo: body.invoice_no,
      invoiceCode: body.invoice_code
    });
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '财务回填发票',
      detail: { invoiceId: Number(inv.id), invoice_no: body.invoice_no }
    });
    res.json({ ok: true });
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

/** 上传签章图片（canvas dataURL → PNG） */
router.post('/contracts/:id/signature', signatureUpload.single('signature'), async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_multi_approve')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });

    const f = req.file;
    if (!f) {
      const dataUrl = req.body?.signature_data;
      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
        return res.status(400).json({ error: 'NO_SIGNATURE' });
      }
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      const buf = Buffer.from(base64Data, 'base64');
      const pool = getPool();
      const [rows] = await pool.query('SELECT id FROM sales_contracts WHERE id=?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND' });

      const dir = path.join(process.cwd(), 'uploads', 'sales_contract_signatures');
      await fsPromises.mkdir(dir, { recursive: true });
      const filename = `sig_${id}_${nanoid(14)}.png`;
      await fsPromises.writeFile(path.join(dir, filename), buf);

      const relPath = `sales_contract_signatures/${filename}`;
      await pool.query('UPDATE sales_contracts SET signature_stored_rel_path=? WHERE id=?', [relPath, id]);
      await logOperationFromReq(req, 'contract_signature_upload', { contractId: id, signaturePath: relPath });
      return res.json({ ok: true, signatureUrl: `/uploads/${relPath}` });
    }

    if (!f.mimetype || !f.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'UNSUPPORTED_TYPE' });
    }
    const pool = getPool();
    const [rows] = await pool.query('SELECT id FROM sales_contracts WHERE id=?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND' });

    const dir = path.join(process.cwd(), 'uploads', 'sales_contract_signatures');
    await fsPromises.mkdir(dir, { recursive: true });
    const ext = path.extname(f.originalname) || '.png';
    const filename = `sig_${id}_${nanoid(14)}${ext}`;
    await fsPromises.writeFile(path.join(dir, filename), f.buffer);

    const relPath = `sales_contract_signatures/${filename}`;
    await pool.query('UPDATE sales_contracts SET signature_stored_rel_path=? WHERE id=?', [relPath, id]);
    await logOperationFromReq(req, 'contract_signature_upload', { contractId: id, signaturePath: relPath });
    res.json({ ok: true, signatureUrl: `/uploads/${relPath}` });
  } catch (e) {
    next(e);
  }
});

/** 获取签章图片 URL */
router.get('/contracts/:id/signature', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT signature_stored_rel_path FROM sales_contracts WHERE id=?', [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND' });
    const rel = rows[0].signature_stored_rel_path;
    if (!rel) return res.json({ signatureUrl: null });
    res.json({ signatureUrl: `/uploads/${rel}` });
  } catch (e) {
    next(e);
  }
});

/** 生成带签章的 PDF */
router.post('/contracts/:id/stamp-pdf', async (req, res, next) => {
  try {
    if (!perm(req, 'contract_management', 'contract_multi_approve')) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });

    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT body_html, signature_stored_rel_path FROM sales_contracts WHERE id=?', [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND' });
    const { body_html, signature_stored_rel_path: sigRel } = rows[0];
    if (!body_html) return res.status(400).json({ error: 'NO_BODY' });

    let sigImageBuffer = null;
    if (sigRel) {
      const sigPath = path.resolve(process.cwd(), 'uploads', sigRel.replace(/\\/g, '/'));
      try {
        sigImageBuffer = await fsPromises.readFile(sigPath);
      } catch { /* signature file not found */ }
    }

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ format: 'a4', unit: 'mm' });

    const CONTRACT_PDF_MARGIN_MM = 12.7; // 1.27cm
    const MARGIN_TOP = CONTRACT_PDF_MARGIN_MM;
    const MARGIN_BOTTOM = CONTRACT_PDF_MARGIN_MM;
    const MARGIN_LEFT = CONTRACT_PDF_MARGIN_MM;
    const MARGIN_RIGHT = CONTRACT_PDF_MARGIN_MM;
    const PAGE_WIDTH = 210;
    const PAGE_HEIGHT = 297;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

    doc.setFont('FangSong', 'normal');
    doc.setFontSize(16);

    const lines = doc.splitTextToSize(
      body_html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
      CONTENT_WIDTH
    );

    let y = MARGIN_TOP;
    const lineHeight = 8;
    for (const line of lines) {
      if (y + lineHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
        doc.addPage();
        y = MARGIN_TOP;
      }
      doc.text(line, MARGIN_LEFT, y);
      y += lineHeight;
    }

    if (sigImageBuffer) {
      const imgFormat = sigImageBuffer[0] === 0x89 ? 'PNG' : 'JPEG';
      try {
        const imgW = 40;
        const imgH = 15;
        doc.addImage(sigImageBuffer, imgFormat, PAGE_WIDTH - MARGIN_RIGHT - imgW, PAGE_HEIGHT - MARGIN_BOTTOM - imgH - 5, imgW, imgH);
      } catch { /* image add failed */ }
    }

    const pdfBuf = Buffer.from(doc.output('arraybuffer'));
    const filename = `contract_${id}_stamped.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuf);
  } catch (e) {
    next(e);
  }
});

function safeParseJson(raw, fallback) {
  if (raw == null) return fallback;
  try { return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)); }
  catch { return fallback; }
}

// ── 订单计算规则 CRUD ──────────────────────────────────────────

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
  } catch (e) { next(e); }
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
  } catch (e) { next(e); }
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
    if (body.name != null) { sets.push('name = ?'); params.push(body.name); }
    if (body.formulas != null) { sets.push('formulas_json = ?'); params.push(JSON.stringify(body.formulas)); }
    if (body.totalAmountTargetColIndex != null) { sets.push('total_amount_target_col_index = ?'); params.push(body.totalAmountTargetColIndex); }
    if (body.decimalPlaces != null) { sets.push('decimal_places = ?'); params.push(body.decimalPlaces); }
    if (body.roundingMode != null) { sets.push('rounding_mode = ?'); params.push(body.roundingMode); }
    if (body.setCurrent != null) { sets.push('is_current = ?'); params.push(body.setCurrent ? 1 : 0); }
    if (sets.length) {
      params.push(req.params.id);
      await pool.query(`UPDATE order_calc_rules SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
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
  } catch (e) { next(e); }
});
