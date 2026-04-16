import { Router } from 'express';
import { pingDb } from '../db/pool.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let appVersion = '0.1.0';
(async () => {
  try {
    const pkgPath = path.join(__dirname, '../../package.json');
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    appVersion = pkg.version;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[health] could not read version', e.message);
  }
})();

export const router = Router();

/**
 * 增强健康检查：包含 DB 状态、版本、配置摘要（不含敏感信息）
 * 用于监控、告警阈值（如响应时间 > 500ms、DB 连接失败）、Prometheus 兼容等
 * 建议配置监控系统对 /api/health 进行定期探测，设置告警阈值（latency>300ms, db error 等）
 */
router.get('/', async (req, res) => {
  const start = Date.now();
  const health = {
    ok: true,
    ts: Date.now(),
    version: appVersion,
    uptime: Math.round(process.uptime()),
    env: process.env.NODE_ENV || 'development',
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB'
    }
  };

  try {
    await pingDb();
    health.db = { status: 'connected', latencyMs: Date.now() - start };
  } catch (err) {
    health.ok = false;
    health.db = { status: 'error', message: err.message?.slice(0, 100) };
  }

  // 可扩展告警逻辑：生产环境中可在此处或单独监控服务中实现阈值判断
  if (health.db?.latencyMs > 500) {
    health.warnings = ['high_db_latency'];
  }

  res.json(health);
});

