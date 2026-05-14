import { normalizeAdminApiBaseUrl } from './apiBaseNormalize.js';

/**
 * 本地固定端口约定（与 admin/vite.config.js、server/src/index.js 一致）：
 * - 管理端（Vite）：3000
 * - 后端 API（Express 默认）：3001；开发时由 Vite 将 /api、/uploads、/miniprogram 代理到 3001
 *
 * 用于上传 action、新窗口打开预览等「必须写绝对地址」的场景。
 * 部署或本机端口冲突时通过 VITE_APP_API_BASE_URL / server 的 PORT 调整，勿在页面里写散的 localhost。
 */
export function absoluteApiOrigin() {
  const raw = String(import.meta.env.VITE_APP_API_BASE_URL || '').trim();
  if (raw) {
    return normalizeAdminApiBaseUrl(raw);
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:3000';
  }
  return 'http://localhost:3001';
}
