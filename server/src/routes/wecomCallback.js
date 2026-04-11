/**
 * 企业微信「接收消息」回调：无 JWT，仅校验 msg_signature + 加解密
 * 挂载路径：/api/wecom/callback
 */
import { Router } from 'express';

import { getPool } from '../db/pool.js';
import {
  computeMsgSignature,
  decryptWecomPacket,
  extractEncryptFromXml,
  verifyUrlAndDecryptEcho
} from '../lib/wecomWorkCrypt.js';

export const router = Router();

let recvCfgCache = { at: 0, data: null };
const RECV_CFG_TTL_MS = 3000;

/**
 * 从原始 URL 取查询参数并做 Urldecode（文档要求）。
 * 不用 req.query：qs 会把 echostr 里 Base64 的「+」当成空格，导致验签/解密失败。
 */
function queryParamFromOriginalUrl(originalUrl, name) {
  const url = String(originalUrl || '');
  const qm = url.indexOf('?');
  if (qm < 0) return '';
  const hash = url.indexOf('#', qm);
  const qs = hash >= 0 ? url.slice(qm + 1, hash) : url.slice(qm + 1);
  const parts = qs.split('&');
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const rawKey = part.slice(0, eq);
    const rawVal = eq + 1 <= part.length ? part.slice(eq + 1) : '';
    let key;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, '%20'));
    } catch {
      key = rawKey;
    }
    if (key !== name) continue;
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return '';
}

async function loadReceiveConfigFromDb(pool) {
  const [rows] = await pool.query(
    `SELECT corp_id AS corpId, receive_token AS receiveToken, encoding_aes_key AS encodingAesKey
     FROM wecom_config WHERE id=1 LIMIT 1`
  );
  const r = rows?.[0] || {};
  return {
    corpId: String(r.corpId || '').trim(),
    receiveToken: String(r.receiveToken || '').trim(),
    encodingAesKey: String(r.encodingAesKey || '').trim()
  };
}

async function loadReceiveConfig(pool) {
  const now = Date.now();
  if (recvCfgCache.data && now - recvCfgCache.at < RECV_CFG_TTL_MS) {
    return recvCfgCache.data;
  }
  const data = await loadReceiveConfigFromDb(pool);
  recvCfgCache = { at: now, data };
  return data;
}

/** 保存回调 Token / AESKey / corpId 后调用，避免短时间内仍用旧配置验签 */
export function invalidateReceiveConfigCache() {
  recvCfgCache = { at: 0, data: null };
}

/** 穿透/运维自检：企业微信若访问此地址应返回纯文本 wecom-callback-probe-ok（200） */
router.get('/probe', (_req, res) => {
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8').send('wecom-callback-probe-ok');
});

/**
 * GET：URL 有效性验证
 * 1）Urldecode 查询参数；2）校验 msg_signature；3）解密 echostr 得到 msg；4）1s 内原样返回明文（无引号、无 BOM、无换行）
 */
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const cfg = await loadReceiveConfig(pool);
    if (!cfg.receiveToken || !cfg.encodingAesKey || !cfg.corpId) {
      return res.status(503).setHeader('Content-Type', 'text/plain; charset=utf-8').send('wecom receive not configured');
    }
    if (cfg.encodingAesKey.length !== 43) {
      return res.status(503).setHeader('Content-Type', 'text/plain; charset=utf-8').send('invalid EncodingAESKey length');
    }

    const originalUrl = req.originalUrl || req.url || '';
    const msgSignature = queryParamFromOriginalUrl(originalUrl, 'msg_signature');
    const timestamp = queryParamFromOriginalUrl(originalUrl, 'timestamp');
    const nonce = queryParamFromOriginalUrl(originalUrl, 'nonce');
    const echostr = queryParamFromOriginalUrl(originalUrl, 'echostr');

    if (String(process.env.WECOM_CALLBACK_DEBUG || '') === '1') {
      // eslint-disable-next-line no-console
      console.log('[wecom callback GET] meta', {
        ua: req.headers['user-agent'],
        originalUrl: originalUrl.slice(0, 220),
        echostrLen: echostr.length,
        hasSig: !!msgSignature
      });
    }

    if (!msgSignature || !echostr) {
      return res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8').send('missing params');
    }

    /** Base64 不应含空格；若反代/解析把「+」变成空格，再尝试还原为「+」后验签 */
    const echostrCandidates = [echostr];
    if (echostr.includes(' ')) {
      const fixed = echostr.replace(/ /g, '+');
      if (fixed !== echostr) echostrCandidates.push(fixed);
    }

    let plain = '';
    let lastErr = null;
    for (const ech of echostrCandidates) {
      try {
        plain = verifyUrlAndDecryptEcho({
          token: cfg.receiveToken,
          encodingAesKey43: cfg.encodingAesKey,
          corpId: cfg.corpId,
          msgSignature,
          timestamp,
          nonce,
          echostr: ech
        });
        if (String(process.env.WECOM_CALLBACK_DEBUG || '') === '1' && ech !== echostr) {
          // eslint-disable-next-line no-console
          console.log('[wecom callback GET] used echostr variant (space→+ fix)');
        }
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) throw lastErr;

    res.status(200);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(plain, 'utf8'));
    return res.end(plain, 'utf8');
  } catch (e) {
    if (e?.code === 'BAD_SIGNATURE') {
      if (String(process.env.WECOM_CALLBACK_DEBUG || '') === '1') {
        try {
          const pool = getPool();
          const cfg = await loadReceiveConfig(pool);
          const originalUrl = req.originalUrl || req.url || '';
          const echostr = queryParamFromOriginalUrl(originalUrl, 'echostr');
          const timestamp = queryParamFromOriginalUrl(originalUrl, 'timestamp');
          const nonce = queryParamFromOriginalUrl(originalUrl, 'nonce');
          const msgSignature = queryParamFromOriginalUrl(originalUrl, 'msg_signature');
          const calc = computeMsgSignature(cfg.receiveToken, timestamp, nonce, echostr);
          // eslint-disable-next-line no-console
          console.warn('[wecom callback GET] BAD_SIGNATURE', { calc, got: msgSignature, tokenLen: cfg.receiveToken.length });
        } catch (_) {
          /* ignore */
        }
      }
      return res.status(403).setHeader('Content-Type', 'text/plain; charset=utf-8').send('invalid signature');
    }
    if (e?.code === 'CORP_MISMATCH') {
      // eslint-disable-next-line no-console
      console.warn('[wecom callback GET] 请核对后台「企业 ID」与 my-企业 中 CorpID 是否一致', {
        expected: e.corpExpected,
        inPacket: e.corpReceived
      });
      return res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8').send('corp id mismatch');
    }
    // eslint-disable-next-line no-console
    console.warn('[wecom callback GET]', e?.message || e);
    return res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8').send('verify failed');
  }
});

/**
 * POST：推送消息/事件加密包
 * 五秒内应返回 200；暂不被动回复时返回空串即可
 */
router.post('/', async (req, res) => {
  try {
    const pool = getPool();
    const cfg = await loadReceiveConfig(pool);
    if (!cfg.receiveToken || !cfg.encodingAesKey || !cfg.corpId) {
      return res.status(503).type('text/plain').send('');
    }

    const originalUrl = req.originalUrl || req.url || '';
    const msgSignature = queryParamFromOriginalUrl(originalUrl, 'msg_signature') || String(req.query.msg_signature || '');
    const timestamp =
      queryParamFromOriginalUrl(originalUrl, 'timestamp') || String(req.query.timestamp || '');
    const nonce = queryParamFromOriginalUrl(originalUrl, 'nonce') || String(req.query.nonce || '');
    const xml = typeof req.body === 'string' ? req.body : '';

    const encrypt = extractEncryptFromXml(xml);
    if (!msgSignature || !encrypt) {
      return res.status(400).type('text/plain').send('');
    }

    const sig = computeMsgSignature(cfg.receiveToken, timestamp, nonce, encrypt);
    if (sig.toLowerCase() !== String(msgSignature).toLowerCase()) {
      return res.status(403).type('text/plain').send('');
    }

    const { msg: innerXml } = decryptWecomPacket(cfg.encodingAesKey, encrypt, cfg.corpId);
    // eslint-disable-next-line no-console
    if (process.env.WECOM_CALLBACK_DEBUG === '1') {
      // eslint-disable-next-line no-console
      console.log('[wecom callback POST xml]', innerXml?.slice?.(0, 2000));
    }

    return res.status(200).type('text/plain').send('');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[wecom callback POST]', e?.message || e);
    return res.status(200).type('text/plain').send('');
  }
});
