import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { logOperationFromReq } from '../lib/audit.js';
import { hasPermission } from '../lib/permissions.js';
import { requireAuth, requireAnyPermissionPairs, requirePermission } from '../middleware/auth.js';
import { encryptSecret, decryptSecret, isSecretEncryptionEnabled } from '../lib/secretCrypto.js';
import { sendWecomTemplateMessage, WECOM_TEMPLATE_CODE_CATALOG } from '../lib/wecomNotify.js';
import { WECOM_TEMPLATE_VARIABLE_SCHEMAS, validateSystemWecomTemplate } from '../lib/wecomTemplateSchemas.js';
import { invalidateReceiveConfigCache } from './wecomCallback.js';

export const router = Router();

router.use(requireAuth);

const canManage = requirePermission('wecom', 'manage');
const canSend = requireAnyPermissionPairs([
  ['wecom', 'send'],
  ['wecom', 'manage']
]);

const templateCodeRe = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

function trimmedUrlTemplate(urlTemplate) {
  if (urlTemplate == null) return '';
  return String(urlTemplate).trim();
}

function apiBaseUrl() {
  const b = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return b || '';
}

/** 仅 wecom.manage（及超管）可在 /send 中传 toUser；否则须使用 recipientId */
function wecomCanDirectToUser(req) {
  if (!req.user) return false;
  if (req.user.accountType === 'super_admin') return true;
  return hasPermission(req.user.permissions, 'wecom', 'manage');
}

function normalizeUserIds(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (raw && typeof raw === 'object') {
    try {
      return Object.values(raw)
        .map((x) => String(x).trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return normalizeUserIds(p);
    } catch {
      return [];
    }
  }
  return [];
}

function buildSnippet(apiBase, templateCode, exampleRecipientId = 1) {
  const base = apiBase || 'https://你的服务器域名';
  const url = `${base}/api/wecom/send`;
  const body = {
    templateCode,
    variables: { title: '示例标题', detail: '示例内容' },
    recipientId: exampleRecipientId
  };
  const bodyEscaped = JSON.stringify(body);
  const fetchJs = `await fetch('${url}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + process.env.QC_REPORT_JWT
  },
  body: ${JSON.stringify(bodyEscaped)}
});`;
  const curl = `curl -sS -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -d ${JSON.stringify(bodyEscaped)}`;
  const nodeEsm = `import 'dotenv/config';

const res = await fetch('${url}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + process.env.QC_REPORT_JWT
  },
  body: ${JSON.stringify(bodyEscaped)}
});
console.log(await res.json());`;

  return { apiBase: apiBase || '', fetchJs, curl, nodeEsm, exampleBody: body };
}

router.get('/meta', canManage, (_req, res) => {
  const base = apiBaseUrl();
  res.json({
    apiBase: base,
    callbackUrl: base ? `${base}/api/wecom/callback` : '',
    placeholderHint: '模板内容、标题、链接中可使用 {{变量名}}，发送时在 variables 中传同名键。',
    receiveHint:
      '接收消息 URL 填：本页下方回调地址（须公网 HTTPS 可达）。Token、EncodingAESKey 需与自建应用后台「设置 API 接收」完全一致。',
    templateCodeCatalog: WECOM_TEMPLATE_CODE_CATALOG,
    templateVariableSchemas: WECOM_TEMPLATE_VARIABLE_SCHEMAS,
    secretEncryptionEnabled: isSecretEncryptionEnabled()
  });
});

router.get('/config', canManage, async (_req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, corp_id AS corpId, agent_id AS agentId, remark, receive_token AS receiveToken,
            encoding_aes_key AS encodingAesKeyRaw, updated_at AS updatedAt
     FROM wecom_config WHERE id=1 LIMIT 1`
  );
  const r = rows?.[0] || {};
  const [sec] = await pool.query(
    'SELECT LENGTH(corp_secret) AS n FROM wecom_config WHERE id=1 LIMIT 1'
  );
  const n = Number(sec?.[0]?.n || 0);
  const rawRecv = r.receiveToken != null ? String(r.receiveToken) : '';
  const rawAes = r.encodingAesKeyRaw != null ? String(r.encodingAesKeyRaw) : '';
  let aesPlainLen = 0;
  try {
    const dec = rawAes ? decryptSecret(rawAes) : '';
    aesPlainLen = dec.length;
  } catch {
    aesPlainLen = rawAes.length === 43 ? 43 : 0;
  }
  res.json({
    corpId: r.corpId || '',
    agentId: r.agentId != null ? Number(r.agentId) : 0,
    secretConfigured: n > 0,
    remark: r.remark || '',
    receiveTokenConfigured: rawRecv.length > 0,
    receiveToken: '',
    encodingAesKeyConfigured: aesPlainLen === 43,
    secretEncryptionEnabled: isSecretEncryptionEnabled()
  });
});

const configPutSchema = z.object({
  corpId: z.string().max(32),
  agentId: z.number().int().min(0).max(2147483647),
  corpSecret: z.string().max(255).optional(),
  remark: z.string().max(255).optional().nullable(),
  receiveToken: z.string().max(128).optional(),
  clearReceiveToken: z.boolean().optional(),
  encodingAesKey: z.string().max(64).optional()
});

router.put('/config', canManage, async (req, res) => {
  const parsed = configPutSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const d = parsed.data;
  if (d.encodingAesKey !== undefined && d.encodingAesKey !== '' && d.encodingAesKey.length !== 43) {
    return res.status(400).json({ error: 'BAD_AES_KEY', message: 'EncodingAESKey 须为 43 位或留空表示不修改' });
  }
  const pool = getPool();
  const [exRows] = await pool.query(
    'SELECT corp_id, agent_id, corp_secret, receive_token, encoding_aes_key FROM wecom_config WHERE id=1 LIMIT 1'
  );
  const ex = exRows?.[0] || {};

  let corpSecretNext = String(ex.corp_secret || '');
  if (d.corpSecret !== undefined && d.corpSecret !== '') {
    corpSecretNext = encryptSecret(d.corpSecret.trim());
  }

  let receiveNext = ex.receive_token != null ? String(ex.receive_token) : '';
  if (d.clearReceiveToken) {
    receiveNext = '';
  } else if (d.receiveToken !== undefined && String(d.receiveToken).trim() !== '') {
    receiveNext = encryptSecret(String(d.receiveToken).trim());
  }

  let aesNext = ex.encoding_aes_key != null ? String(ex.encoding_aes_key) : '';
  if (d.encodingAesKey !== undefined) {
    if (d.encodingAesKey === '') aesNext = '';
    else aesNext = encryptSecret(String(d.encodingAesKey).trim());
  }

  const corpIdChanged = String(ex.corp_id ?? '').trim() !== String(d.corpId ?? '').trim();
  const secretChanged = d.corpSecret !== undefined && d.corpSecret !== '';
  const receiveTokenChanged =
    Boolean(d.clearReceiveToken) ||
    (d.receiveToken !== undefined &&
      String(d.receiveToken).trim() !== '' &&
      receiveNext !== String(ex.receive_token ?? ''));
  const encodingAesKeyChanged =
    d.encodingAesKey !== undefined && aesNext !== String(ex.encoding_aes_key ?? '');

  await pool.query(
    `UPDATE wecom_config SET corp_id=?, agent_id=?, corp_secret=?, remark=?, receive_token=?, encoding_aes_key=?,
      updated_at=CURRENT_TIMESTAMP(3) WHERE id=1`,
    [d.corpId, d.agentId, corpSecretNext, d.remark ?? null, receiveNext, aesNext]
  );
  invalidateReceiveConfigCache();
  await logOperationFromReq(req, {
    module: '企业微信',
    action: '保存企业微信配置',
    detail: {
      corpIdChanged,
      agentId: d.agentId,
      secretChanged,
      receiveTokenChanged,
      encodingAesKeyChanged
    }
  });
  res.json({ ok: true });
});

router.get('/recipients', canManage, async (_req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, name_zh AS nameZh, wecom_userids_json AS wecomUserids, sort_order AS sortOrder, created_at AS createdAt FROM wecom_notify_recipients ORDER BY sort_order ASC, id ASC'
  );
  res.json({
    recipients: (rows || []).map((r) => ({
      ...r,
      wecomUserids: normalizeUserIds(r.wecomUserids)
    }))
  });
});

const recipientSchema = z.object({
  nameZh: z.string().min(1).max(128),
  wecomUserids: z.array(z.string().min(1).max(64)).min(1),
  sortOrder: z.number().int().optional().default(0)
});

router.post('/recipients', canManage, async (req, res) => {
  const parsed = recipientSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  const [r] = await pool.query(
    `INSERT INTO wecom_notify_recipients (name_zh, wecom_userids_json, sort_order) VALUES (?, CAST(? AS JSON), ?)`,
    [parsed.data.nameZh, JSON.stringify(parsed.data.wecomUserids), parsed.data.sortOrder]
  );
  const recipientId = Number(r.insertId);
  await logOperationFromReq(req, {
    module: '企业微信',
    action: '新增企业微信接收人',
    detail: { recipientId, nameZh: parsed.data.nameZh }
  });
  res.json({ id: recipientId });
});

router.put('/recipients/:id', canManage, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
  const parsed = recipientSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  const [r] = await pool.query(
    `UPDATE wecom_notify_recipients SET name_zh=?, wecom_userids_json= CAST(? AS JSON), sort_order=? WHERE id=?`,
    [parsed.data.nameZh, JSON.stringify(parsed.data.wecomUserids), parsed.data.sortOrder, id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'NOT_FOUND' });
  await logOperationFromReq(req, {
    module: '企业微信',
    action: '编辑企业微信接收人',
    detail: { recipientId: id, nameZh: parsed.data.nameZh }
  });
  res.json({ ok: true });
});

router.delete('/recipients/:id', canManage, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  await pool.query('DELETE FROM wecom_notify_recipients WHERE id=?', [id]);
  await logOperationFromReq(req, {
    module: '企业微信',
    action: '删除企业微信接收人',
    detail: { recipientId: id }
  });
  res.json({ ok: true });
});

router.get('/templates', canManage, async (_req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, code, name_zh AS nameZh, msg_type AS msgType, title_template AS titleTemplate,
            body_template AS bodyTemplate, url_template AS urlTemplate, btntxt,
            created_at AS createdAt, updated_at AS updatedAt
     FROM wecom_notify_templates ORDER BY code ASC`
  );
  res.json({ templates: rows || [] });
});

const templateCreateSchema = z.object({
  code: z.string().regex(templateCodeRe),
  nameZh: z.string().min(1).max(128),
  msgType: z.enum(['text', 'textcard', 'markdown']),
  titleTemplate: z.string().max(4000).optional().nullable(),
  bodyTemplate: z.string().min(1).max(8000),
  urlTemplate: z.string().max(2000).optional().nullable(),
  btntxt: z.string().max(16).optional().nullable()
});

router.post('/templates', canManage, async (req, res) => {
  const parsed = templateCreateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  if (parsed.data.msgType === 'textcard' && !trimmedUrlTemplate(parsed.data.urlTemplate)) {
    return res.status(400).json({
      error: 'TEXTCARD_REQUIRES_URL',
      message: '消息形态为「文本卡片」时必须填写链接地址，否则企业微信会报错 41010（missing url）。'
    });
  }
  const sysCheck = validateSystemWecomTemplate(parsed.data.code, {
    msgType: parsed.data.msgType,
    bodyTemplate: parsed.data.bodyTemplate,
    urlTemplate: parsed.data.urlTemplate
  });
  if (!sysCheck.ok) {
    return res.status(400).json({ error: sysCheck.error, message: sysCheck.message });
  }
  const pool = getPool();
  try {
    const [r] = await pool.query(
      `INSERT INTO wecom_notify_templates (code, name_zh, msg_type, title_template, body_template, url_template, btntxt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        parsed.data.code,
        parsed.data.nameZh,
        parsed.data.msgType,
        parsed.data.titleTemplate ?? null,
        parsed.data.bodyTemplate,
        parsed.data.urlTemplate ?? null,
        parsed.data.btntxt ?? '详情'
      ]
    );
    const templateId = Number(r.insertId);
    await logOperationFromReq(req, {
      module: '企业微信',
      action: '新增企业微信模板',
      detail: {
        templateId,
        code: parsed.data.code,
        nameZh: parsed.data.nameZh,
        msgType: parsed.data.msgType
      }
    });
    res.json({ id: templateId });
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE_CODE' });
    throw e;
  }
});

const templateUpdateSchema = templateCreateSchema.omit({ code: true }).partial();

router.put('/templates/:id', canManage, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
  const parsed = templateUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const d = parsed.data;
  if (Object.keys(d).length === 0) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  const [curRows] = await pool.query(
    `SELECT code, msg_type AS msgType, body_template AS bodyTemplate, url_template AS urlTemplate FROM wecom_notify_templates WHERE id=? LIMIT 1`,
    [id]
  );
  const cur = curRows?.[0];
  if (!cur) return res.status(404).json({ error: 'NOT_FOUND' });
  const mergedMsgType = d.msgType !== undefined ? d.msgType : cur.msgType;
  const mergedUrl =
    d.urlTemplate !== undefined ? d.urlTemplate : cur.urlTemplate;
  const mergedBody = d.bodyTemplate !== undefined ? d.bodyTemplate : cur.bodyTemplate;
  if (mergedMsgType === 'textcard' && !trimmedUrlTemplate(mergedUrl)) {
    return res.status(400).json({
      error: 'TEXTCARD_REQUIRES_URL',
      message: '消息形态为「文本卡片」时必须填写链接地址，否则企业微信会报错 41010（missing url）。'
    });
  }
  const sysCheck = validateSystemWecomTemplate(String(cur.code || ''), {
    msgType: mergedMsgType,
    bodyTemplate: mergedBody,
    urlTemplate: mergedUrl
  });
  if (!sysCheck.ok) {
    return res.status(400).json({ error: sysCheck.error, message: sysCheck.message });
  }
  const fields = [];
  const values = [];
  if (d.nameZh !== undefined) {
    fields.push('name_zh=?');
    values.push(d.nameZh);
  }
  if (d.msgType !== undefined) {
    fields.push('msg_type=?');
    values.push(d.msgType);
  }
  if (d.titleTemplate !== undefined) {
    fields.push('title_template=?');
    values.push(d.titleTemplate);
  }
  if (d.bodyTemplate !== undefined) {
    fields.push('body_template=?');
    values.push(d.bodyTemplate);
  }
  if (d.urlTemplate !== undefined) {
    fields.push('url_template=?');
    values.push(d.urlTemplate);
  }
  if (d.btntxt !== undefined) {
    fields.push('btntxt=?');
    values.push(d.btntxt);
  }
  values.push(id);
  const [r] = await pool.query(
    `UPDATE wecom_notify_templates SET ${fields.join(', ')}, updated_at=CURRENT_TIMESTAMP(3) WHERE id=?`,
    values
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'NOT_FOUND' });
  await logOperationFromReq(req, {
    module: '企业微信',
    action: '编辑企业微信模板',
    detail: { templateId: id, updatedFields: Object.keys(d) }
  });
  res.json({ ok: true });
});

router.delete('/templates/:id', canManage, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  const [delRows] = await pool.query('SELECT code FROM wecom_notify_templates WHERE id=? LIMIT 1', [id]);
  const code = delRows?.[0]?.code != null ? String(delRows[0].code) : '';
  const [dr] = await pool.query('DELETE FROM wecom_notify_templates WHERE id=?', [id]);
  if (!dr.affectedRows) return res.status(404).json({ error: 'NOT_FOUND' });
  await logOperationFromReq(req, {
    module: '企业微信',
    action: '删除企业微信模板',
    detail: { templateId: id, code }
  });
  res.json({ ok: true });
});

router.get('/templates/code/:code/snippet', canManage, async (req, res) => {
  const code = req.params.code || '';
  if (!templateCodeRe.test(code)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id FROM wecom_notify_templates WHERE code=? LIMIT 1',
    [code]
  );
  if (!rows?.[0]) return res.status(404).json({ error: 'NOT_FOUND' });
  const [rec] = await pool.query(
    'SELECT id FROM wecom_notify_recipients ORDER BY sort_order ASC, id ASC LIMIT 1'
  );
  const exampleRecipientId = rec?.[0]?.id != null ? Number(rec[0].id) : 1;
  res.json(buildSnippet(apiBaseUrl(), code, exampleRecipientId));
});

const sendSchema = z.object({
  templateCode: z.string().regex(templateCodeRe),
  variables: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
  recipientId: z.number().int().positive().optional(),
  toUser: z.string().max(4096).optional()
});

router.post('/send', canSend, async (req, res) => {
  const parsed = sendSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { templateCode, variables } = parsed.data;
  const toUserTrimmed = parsed.data.toUser != null ? String(parsed.data.toUser).trim() : '';
  let toUserStr = toUserTrimmed;

  if (toUserTrimmed && !wecomCanDirectToUser(req)) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: '仅企业微信管理员可使用 toUser；请使用 recipientId 选择通知对象。'
    });
  }
  if (!wecomCanDirectToUser(req) && !parsed.data.recipientId) {
    return res.status(400).json({
      error: 'MISSING_RECIPIENT',
      message: '请选择通知对象（recipientId）。'
    });
  }

  const pool = getPool();

  if (!toUserStr && parsed.data.recipientId) {
    const [rr] = await pool.query(
      'SELECT wecom_userids_json AS j FROM wecom_notify_recipients WHERE id=? LIMIT 1',
      [parsed.data.recipientId]
    );
    const ids = normalizeUserIds(rr?.[0]?.j);
    toUserStr = ids.join('|');
  }
  if (!toUserStr) {
    return res.status(400).json({ error: 'MISSING_RECIPIENT' });
  }

  try {
    const sendResult = await sendWecomTemplateMessage(pool, {
      templateCode,
      variables,
      toUser: toUserStr
    });
    const recipientCount = toUserStr ? toUserStr.split('|').filter(Boolean).length : 0;
    await logOperationFromReq(req, {
      module: '企业微信',
      action: '手动发送企业微信消息',
      detail: {
        templateCode,
        recipientId: parsed.data.recipientId ?? null,
        directToUser: Boolean(toUserTrimmed),
        recipientCount,
        variableKeys: Object.keys(variables || {})
      }
    });
    res.json({ ok: true, wecom: sendResult });
  } catch (e) {
    if (e.code === 'WECOM_TIMEOUT') {
      return res.status(504).json({
        error: e.code,
        message: e.message,
        wecom: null
      });
    }
    if (e.code === 'WECOM_NETWORK_ERROR') {
      return res.status(502).json({
        error: e.code,
        message: e.message,
        wecom: null
      });
    }
    if (e.code === 'WECOM_TOKEN_ERROR' || e.code === 'WECOM_SEND_ERROR') {
      return res.status(502).json({
        error: e.code,
        message: e.message,
        wecom: e.wecom || null
      });
    }
    if (e.code === 'TEXTCARD_URL_EMPTY') {
      return res.status(400).json({ error: e.code, message: e.message });
    }
    if (e.code === 'WECOM_NOT_CONFIGURED' || e.code === 'TEMPLATE_NOT_FOUND' || e.code === 'MISSING_RECIPIENT') {
      const status = e.code === 'MISSING_RECIPIENT' ? 400 : 404;
      return res.status(status).json({ error: e.code, message: e.message });
    }
    throw e;
  }
});

const JOB_STATUSES = new Set(['pending', 'sending', 'sent', 'failed', 'dead']);

function maskWecomJobToUser(raw) {
  const t = String(raw ?? '');
  if (t.length <= 96) return t;
  return `${t.slice(0, 96)}…`;
}

router.get('/jobs', canManage, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const pool = getPool();
    const where = ['1=1'];
    const params = [];

    const st = req.query.status != null ? String(req.query.status).trim() : '';
    if (st && JOB_STATUSES.has(st)) {
      where.push('status = ?');
      params.push(st);
    }
    const tc = req.query.templateCode != null ? String(req.query.templateCode).trim() : '';
    if (tc) {
      where.push('template_code = ?');
      params.push(tc.slice(0, 64));
    }
    const bt = req.query.bizType != null ? String(req.query.bizType).trim() : '';
    if (bt) {
      where.push('biz_type = ?');
      params.push(bt.slice(0, 64));
    }
    const bidRaw = req.query.bizId;
    if (bidRaw != null && String(bidRaw).trim() !== '') {
      const bid = Number(bidRaw);
      if (Number.isFinite(bid) && bid > 0) {
        where.push('biz_id = ?');
        params.push(Math.floor(bid));
      }
    }
    const createdFrom = req.query.createdFrom != null ? String(req.query.createdFrom).trim() : '';
    if (createdFrom) {
      where.push('created_at >= ?');
      params.push(createdFrom);
    }
    const createdTo = req.query.createdTo != null ? String(req.query.createdTo).trim() : '';
    if (createdTo) {
      where.push('created_at <= ?');
      params.push(createdTo);
    }

    const whereSql = where.join(' AND ');
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM wecom_notify_jobs WHERE ${whereSql}`,
      params
    );
    const total = Number(countRows?.[0]?.c || 0);
    const [rows] = await pool.query(
      `SELECT id, event_type AS eventType, template_code AS templateCode, to_user AS toUserRaw, biz_type AS bizType, biz_id AS bizId,
              status, retry_count AS retryCount, max_retries AS maxRetries, last_error AS lastError,
              created_at AS createdAt, sent_at AS sentAt, updated_at AS updatedAt
       FROM wecom_notify_jobs WHERE ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const items = (rows || []).map((r) => ({
      id: r.id,
      eventType: r.eventType,
      templateCode: r.templateCode,
      toUserPreview: maskWecomJobToUser(r.toUserRaw),
      toUserRecipientCount: String(r.toUserRaw || '')
        .split('|')
        .map((x) => x.trim())
        .filter(Boolean).length,
      bizType: r.bizType,
      bizId: r.bizId,
      status: r.status,
      retryCount: r.retryCount,
      maxRetries: r.maxRetries,
      lastError: r.lastError,
      createdAt: r.createdAt,
      sentAt: r.sentAt,
      updatedAt: r.updatedAt
    }));
    res.json({ items, total, page, pageSize });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'WECOM_JOBS_TABLE_MISSING',
        message: '请执行数据库迁移或重启服务以创建 wecom_notify_jobs 表'
      });
    }
    throw e;
  }
});

router.post('/jobs/:id/retry', canManage, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
  try {
    const pool = getPool();
    const [r] = await pool.query(
      `UPDATE wecom_notify_jobs
       SET status = 'pending', next_retry_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND status IN ('failed','dead')`,
      [id]
    );
    if (!r.affectedRows) return res.status(404).json({ error: 'NOT_FOUND' });
    await logOperationFromReq(req, {
      module: '企业微信',
      action: '重试企业微信通知任务',
      detail: { jobId: id }
    });
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        error: 'WECOM_JOBS_TABLE_MISSING',
        message: '请执行数据库迁移或创建 wecom_notify_jobs 表'
      });
    }
    throw e;
  }
});
