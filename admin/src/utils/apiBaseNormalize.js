/**
 * 统一「API 根」：环境变量应写协议+主机+端口，勿带 `/api`。
 * 若误配为 `http://host:3001/api`，axios 会与 `/api/...` 拼成 `/api/api/...` 导致 404。
 */
export function normalizeAdminApiBaseUrl(url) {
  let raw = String(url || '').trim();
  if (!raw) return raw;
  raw = raw.replace(/localhost:3003/g, 'localhost:3001');
  try {
    const u = new URL(raw);
    let path = (u.pathname || '').replace(/\/+$/, '') || '/';
    while (path.endsWith('/api')) {
      const next = path.slice(0, -4) || '/';
      if (next === path) break;
      path = next === '' ? '/' : next;
    }
    if (path === '/api') u.pathname = '/';
    else u.pathname = path;
    return u.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
}

/** Vite dev / preview 代理目标：与 normalizeAdminApiBaseUrl 一致，并固定 localhost→127.0.0.1、纠偏端口 */
export function normalizeProxyTargetFromEnv(rawUrl) {
  const fallback = 'http://127.0.0.1:3001';
  const raw = String(rawUrl || '').trim();
  if (!raw) return fallback;
  try {
    const url = new URL(normalizeAdminApiBaseUrl(raw));
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
    if (url.port === '3000' || url.port === '3003') url.port = '3001';
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}
