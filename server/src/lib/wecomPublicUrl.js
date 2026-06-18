/**
 * 企业微信链接用公网根地址（与 wecomNotify 解耦，避免循环依赖）。
 * PUBLIC_BASE_URL = Node API 对外根；ADMIN_PUBLIC_URL = Vue 管理后台根（勿混用）。
 */

/** API / 企微 OAuth、公开页引导（须能访问 /api/public/...） */
export function resolveWecomPublicBaseUrl() {
  const keys = ['PUBLIC_BASE_URL', 'WECOM_PUBLIC_BASE_URL', 'API_PUBLIC_URL'];
  for (const k of keys) {
    const raw = process.env[k];
    const b = String(raw || '')
      .trim()
      .replace(/\/+$/, '');
    if (b) return b;
  }
  return '';
}

/** 管理后台浏览器访问根 */
export function resolveAdminPublicRoot() {
  const envAdmin = String(process.env.ADMIN_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const pubBase = String(resolveWecomPublicBaseUrl() || '').trim().replace(/\/+$/, '');
  return envAdmin || pubBase;
}

/** 启动/排错：PUBLIC_BASE_URL 是否像 API 根（勿填 #/ 管理端地址） */
export function diagnoseWecomPublicBaseUrl() {
  const base = resolveWecomPublicBaseUrl();
  if (!base) {
    return {
      ok: false,
      message:
        '未配置 PUBLIC_BASE_URL（或 WECOM_PUBLIC_BASE_URL）。合同审批、开票引导、发货确认等企微链接均无法生成。'
    };
  }
  if (/#\//.test(base)) {
    return {
      ok: false,
      message:
        `PUBLIC_BASE_URL 含 "#/"，疑似填成了管理后台地址（${base}）。应填 API 服务根地址（能打开 /api/public/wecom-contract-review-probe）。管理后台请单独配置 ADMIN_PUBLIC_URL。`
    };
  }
  const adminOnly = String(process.env.ADMIN_PUBLIC_URL || '').trim();
  if (adminOnly && !String(process.env.PUBLIC_BASE_URL || process.env.WECOM_PUBLIC_BASE_URL || process.env.API_PUBLIC_URL || '').trim()) {
    return {
      ok: false,
      message:
        '仅配置了 ADMIN_PUBLIC_URL，未配置 PUBLIC_BASE_URL。企业微信卡片须先打开 API 域公开页，不能只配管理后台地址。'
    };
  }
  return { ok: true, message: '', base };
}
