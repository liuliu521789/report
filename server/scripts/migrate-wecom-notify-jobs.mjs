/**
 * 执行企业微信通知队列表迁移（幂等，等价于 migrations/041_wecom_notify_jobs.sql）。
 * 用法：在 server 目录执行  npm run migrate:wecom-notify-jobs
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { ensureWecomNotifyJobsTable } from '../src/db/ensureSchema.js';
import { getPool } from '../src/db/pool.js';

async function main() {
  const db = process.env.MYSQL_DATABASE || '';
  console.log(`数据库: ${db || '(未配置 MYSQL_DATABASE)'}`);
  await ensureWecomNotifyJobsTable();
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'wecom_notify_jobs'`
  );
  const ok = Number(rows?.[0]?.c) === 1;
  console.log(ok ? '迁移完成：wecom_notify_jobs 表已存在。' : '警告：未检测到 wecom_notify_jobs 表。');
  await pool.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error('[migrate-wecom-notify-jobs]', e?.message || e);
  process.exit(1);
});
