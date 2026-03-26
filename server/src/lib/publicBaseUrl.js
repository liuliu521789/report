function isLoopbackHost(host) {
  if (!host) return true;
  const h = String(host).split(':')[0].toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

/**
 * 对外可见的站点 origin（二维码、绝对链接用）。
 * - 手机扫码时以请求的 Host 为准，避免 .env 里仍是 localhost 导致外置浏览器打开错误地址甚至空白页。
 * - 本机访问 API（Host 为 localhost）时，可回退到 PUBLIC_BASE_URL（如局域网 IP）。
 */
export function resolvePublicBaseUrl(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');

  if (req) {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
    if (host) {
      const origin = `${proto}://${host}`.replace(/\/+$/, '');
      if (!isLoopbackHost(host)) return origin;
      if (configured) return configured;
      return origin;
    }
  }

  if (configured) return configured;
  return `http://127.0.0.1:${process.env.PORT || 3001}`;
}

/**
 * 公开报告页与 `/uploads` 同域服务。库里常存 `http://localhost:3001/uploads/...`，
 * 手机扫码后无法解析本机 localhost。转为相对路径后由当前页面 origin 加载。
 */
export function normalizePublicAssetUrl(url) {
  if (url == null || url === '') return url;
  const t = String(url).trim();
  if (!t) return url;
  if (t.startsWith('/')) return t;
  try {
    const u = new URL(t);
    if (u.pathname.startsWith('/uploads/')) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    /* 非绝对 URL 则原样返回 */
  }
  return url;
}
