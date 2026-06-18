/** 财务回填发票链接：清理空白、缺协议时补 https:// */
export function normalizeInvoiceUrl(raw) {
  let s = String(raw ?? '')
    .replace(/\s+/g, '')
    .trim();
  if (!s) return '';
  if (/^\/\//.test(s)) return `https:${s}`.slice(0, 512);
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s.replace(/^\/+/, '')}`;
  }
  return s.slice(0, 512);
}

/** 是否为可打开的 http(s) 链接 */
export function isValidInvoiceHttpUrl(raw) {
  const s = typeof raw === 'string' && /^https?:\/\//i.test(raw) ? raw : normalizeInvoiceUrl(raw);
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
