/**
 * 执行 migrations/042：加宽 wecom_config 密文字段 + wecom_callback_events 表。
 * 用法：在 server 目录执行  npm run migrate:wecom-042
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { ensureWecomSecretsWideAndCallbackEvents } from '../src/db/ensureSchema.js';
import { getPool } from '../src/db/pool.js';

async function main() {
  console.log(`数据库: ${process.env.MYSQL_DATABASE || '(未配置)'}`);
  await ensureWecomSecretsWideAndCallbackEvents();
  const pool = getPool();
  const [a] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'wecom_callback_events'`
  );
  const [b] = await pool.query(`SHOW COLUMNS FROM wecom_config LIKE 'corp_secret'`);
  const len = b?.[0]?.Type || '';
  console.log('wecom_callback_events 表:', Number(a?.[0]?.c) === 1 ? '已存在' : '缺失');
  console.log('wecom_config.corp_secret 列类型:', len || '未知');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
