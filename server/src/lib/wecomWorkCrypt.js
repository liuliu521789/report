/**
 * 企业微信/微信开放平台 回调加解密（与「接收消息」文档一致）
 * @see https://developer.work.weixin.qq.com/document/path/90930
 */
import crypto from 'crypto';

/**
 * @param {string} token
 * @param {string} timestamp
 * @param {string} nonce
 * @param {string} encrypt 密文（GET 的 echostr 或 POST 报文中 Encrypt 节点内容）
 */
export function computeMsgSignature(token, timestamp, nonce, encrypt) {
  const arr = [String(token), String(timestamp), String(nonce), String(encrypt)].sort();
  return crypto.createHash('sha1').update(arr.join('')).digest('hex');
}

/**
 * @param {string} encodingAesKey43 管理后台生成的 43 位 EncodingAESKey（无末尾 =）
 * @param {string} encryptBase64 echostr / Encrypt 的 Base64 密文
 * @param {string} expectCorpId 本企业 corpId，用于校验包尾
 * @returns {{ msg: string, corpId: string }}
 */
export function decryptWecomPacket(encodingAesKey43, encryptBase64, expectCorpId) {
  const key = Buffer.from(encodingAesKey43 + '=', 'base64');
  if (key.length !== 32) {
    const e = new Error('INVALID_AES_KEY');
    e.code = 'INVALID_AES_KEY';
    throw e;
  }
  const iv = key.slice(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  const enc = Buffer.from(String(encryptBase64), 'base64');
  let buf = Buffer.concat([decipher.update(enc), decipher.final()]);
  const padLen = buf[buf.length - 1];
  if (padLen < 1 || padLen > 32) {
    const e = new Error('DECRYPT_PAD');
    e.code = 'DECRYPT_PAD';
    throw e;
  }
  buf = buf.slice(0, buf.length - padLen);
  if (buf.length < 20) {
    const e = new Error('DECRYPT_SHORT');
    e.code = 'DECRYPT_SHORT';
    throw e;
  }
  const msgLen = buf.readUInt32BE(16);
  if (msgLen < 0 || 20 + msgLen > buf.length) {
    const e = new Error('DECRYPT_LEN');
    e.code = 'DECRYPT_LEN';
    throw e;
  }
  const msg = buf.slice(20, 20 + msgLen).toString('utf8');
  const corpId = buf.slice(20 + msgLen).toString('utf8');
  if (expectCorpId && corpId !== expectCorpId) {
    const e = new Error(`CORP_MISMATCH: packet tail is "${corpId}", expected "${expectCorpId}"`);
    e.code = 'CORP_MISMATCH';
    e.corpReceived = corpId;
    e.corpExpected = expectCorpId;
    throw e;
  }
  return { msg, corpId };
}

/** URL 验证：解密 echostr，得到 msg 明文字段 */
export function decryptUrlEchoString(encodingAesKey43, echostrBase64, expectCorpId) {
  const { msg } = decryptWecomPacket(encodingAesKey43, echostrBase64, expectCorpId);
  return msg;
}

/**
 * 按文档：响应中不能有 BOM、不能带换行符；解密得到的内容先规范再回写
 * @param {string} msg
 */
export function formatUrlVerifyEchoBody(msg) {
  if (msg == null) return '';
  let s = String(msg);
  s = s.replace(/^\uFEFF/, '');
  s = s.replace(/[\r\n\u2028\u2029]/g, '');
  return s;
}

/**
 * 官方「验证 URL」一步到位：校验 msg_signature + 解密 echostr 得到 msg
 * @param {{ token: string, encodingAesKey43: string, corpId: string, msgSignature: string, timestamp: string, nonce: string, echostr: string }} p
 * @returns {string} 应写入 HTTP 响应体的明文（已去 BOM / 换行）
 */
export function verifyUrlAndDecryptEcho(p) {
  const token = String(p.token || '');
  const encKey = String(p.encodingAesKey43 || '');
  const corpId = String(p.corpId || '');
  const msgSignature = String(p.msgSignature || '');
  const timestamp = String(p.timestamp || '');
  const nonce = String(p.nonce || '');
  const echostr = String(p.echostr || '');
  if (!token || encKey.length !== 43 || !corpId || !msgSignature || !echostr) {
    const e = new Error('MISSING_PARAM');
    e.code = 'MISSING_PARAM';
    throw e;
  }
  const sig = computeMsgSignature(token, timestamp, nonce, echostr);
  if (sig.toLowerCase() !== String(msgSignature).toLowerCase()) {
    const e = new Error('BAD_SIGNATURE');
    e.code = 'BAD_SIGNATURE';
    throw e;
  }
  const msg = decryptUrlEchoString(encKey, echostr, corpId);
  return formatUrlVerifyEchoBody(msg);
}

/** 从 POST XML 取出 Encrypt CDATA */
export function extractEncryptFromXml(xml) {
  if (!xml || typeof xml !== 'string') return null;
  const cdata = xml.match(/<Encrypt\s*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/Encrypt\s*>/i);
  if (cdata) return cdata[1].trim();
  const plain = xml.match(/<Encrypt\s*>([\s\S]*?)<\/Encrypt\s*>/i);
  return plain ? plain[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim() : null;
}
