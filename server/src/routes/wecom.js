import { Router } from 'express';
import { z } from 'zod';

import { getPool } from '../db/pool.js';
import { requireAuth, requireAnyPermissionPairs, requirePermission } from '../middleware/auth.js';
import { sendWecomTemplateMessage, WECOM_TEMPLATE_CODE_CATALOG } from '../lib/wecomNotify.js';
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
    templateCodeCatalog: WECOM_TEMPLATE_CODE_CATALOG
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
  const aes = r.encodingAesKeyRaw != null ? String(r.encodingAesKeyRaw) : '';
  res.json({
    corpId: r.corpId || '',
    agentId: r.agentId != null ? Number(r.agentId) : 0,
    secretConfigured: n > 0,
    remark: r.remark || '',
    receiveToken: r.receiveToken || '',
    encodingAesKeyConfigured: aes.length === 43
  });
});

const configPutSchema = z.object({
  corpId: z.string().max(32),
  agentId: z.number().int().min(0).max(2147483647),
  corpSecret: z.string().max(255).optional(),
  remark: z.string().max(255).optional().nullable(),
  receiveToken: z.string().max(64).optional(),
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
    'SELECT corp_secret, receive_token, encoding_aes_key FROM wecom_config WHERE id=1 LIMIT 1'
  );
  const ex = exRows?.[0] || {};

  let corpSecretNext = String(ex.corp_secret || '');
  if (d.corpSecret !== undefined && d.corpSecret !== '') {
    corpSecretNext = d.corpSecret;
  }

  let receiveNext = ex.receive_token != null ? String(ex.receive_token) : '';
  if (d.receiveToken !== undefined) receiveNext = d.receiveToken;

  let aesNext = ex.encoding_aes_key != null ? String(ex.encoding_aes_key) : '';
  if (d.encodingAesKey !== undefined) {
    if (d.encodingAesKey === '') aesNext = '';
    else aesNext = d.encodingAesKey;
  }

  await pool.query(
    `UPDATE wecom_config SET corp_id=?, agent_id=?, corp_secret=?, remark=?, receive_token=?, encoding_aes_key=?,
      updated_at=CURRENT_TIMESTAMP(3) WHERE id=1`,
    [d.corpId, d.agentId, corpSecretNext, d.remark ?? null, receiveNext, aesNext]
  );
  invalidateReceiveConfigCache();
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
  res.json({ id: Number(r.insertId) });
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
  res.json({ ok: true });
});

router.delete('/recipients/:id', canManage, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  await pool.query('DELETE FROM wecom_notify_recipients WHERE id=?', [id]);
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
    res.json({ id: Number(r.insertId) });
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
    `SELECT msg_type AS msgType, url_template AS urlTemplate FROM wecom_notify_templates WHERE id=? LIMIT 1`,
    [id]
  );
  const cur = curRows?.[0];
  if (!cur) return res.status(404).json({ error: 'NOT_FOUND' });
  const mergedMsgType = d.msgType !== undefined ? d.msgType : cur.msgType;
  const mergedUrl =
    d.urlTemplate !== undefined ? d.urlTemplate : cur.urlTemplate;
  if (mergedMsgType === 'textcard' && !trimmedUrlTemplate(mergedUrl)) {
    return res.status(400).json({
      error: 'TEXTCARD_REQUIRES_URL',
      message: '消息形态为「文本卡片」时必须填写链接地址，否则企业微信会报错 41010（missing url）。'
    });
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
  res.json({ ok: true });
});

router.delete('/templates/:id', canManage, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  await pool.query('DELETE FROM wecom_notify_templates WHERE id=?', [id]);
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
  let toUserStr = parsed.data.toUser?.trim() || '';

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
    res.json({ ok: true, wecom: sendResult });
  } catch (e) {
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
