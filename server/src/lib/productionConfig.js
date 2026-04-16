/**
 * 生产环境安全基线校验工具
 * 用于启动时强制拒绝弱配置，符合生产安全要求
 */

export function validateProductionConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production' || nodeEnv === 'prod';

  if (!isProd) {
    if (String(env.ENABLE_API_DOCS || '').toLowerCase() === 'true') {
      console.warn('[server] ENABLE_API_DOCS=true 在生产环境不推荐（建议设为 false 并设置 NODE_ENV=production）');
    }
    return { ok: true, isProd: false };
  }

  const issues = [];

  // JWT_SECRET
  const jwtSecret = env.JWT_SECRET || '';
  const defaultWeakJwt = 'abc123xyz789QwErTyUiOpAsDfGhJkLzXcVbNm9876543210';
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes('abc123') || jwtSecret === defaultWeakJwt) {
    issues.push('JWT_SECRET 必须是强密钥（长度 >=32 字符，非示例默认值）');
  }

  // MYSQL_PASSWORD
  const dbPassword = env.MYSQL_PASSWORD || '';
  const weakPwList = ['admin', 'root', 'password', '123456', 'qwerty', 'abc123'];
  const lowerPw = dbPassword.toLowerCase();
  if (!dbPassword || dbPassword.length < 12 || weakPwList.some(w => lowerPw === w || lowerPw.includes(w))) {
    issues.push('MYSQL_PASSWORD 过于简单（长度需 >=12，非常见弱密码）。生产环境必须使用强随机密码');
  }

  // API Docs
  if (String(env.ENABLE_API_DOCS || '').toLowerCase() === 'true') {
    issues.push('ENABLE_API_DOCS 生产环境必须设为 false，避免暴露 Swagger UI 和 OpenAPI 规范');
  }

  // Public URL
  const publicUrl = env.PUBLIC_BASE_URL || '';
  if (publicUrl && !publicUrl.startsWith('https://') && !publicUrl.includes('localhost') && !publicUrl.includes('127.0.0.1')) {
    issues.push('PUBLIC_BASE_URL 生产环境强烈推荐使用 HTTPS');
  }

  if (issues.length > 0) {
    console.error('[server] ❌ 生产安全基线校验失败！以下配置存在高风险:');
    issues.forEach((issue, i) => console.error(`  ${i + 1}. ${issue}`));
    console.error('\n请更新 .env 文件中的配置，然后重启服务。');
    console.error('参考：TECHNICAL.md “部署注意” 及 “生产安全基线” 章节');
    return { ok: false, issues, isProd: true };
  }

  console.log('[server] ✅ 生产安全基线校验通过');
  return { ok: true, isProd: true };
}

// For backward compatibility in index.js (throws on failure for production)
export function validateProductionConfigOrExit() {
  const result = validateProductionConfig();
  if (result.isProd && !result.ok) {
    process.exit(1);
  }
}
