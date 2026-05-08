/**
 * 列出当前库中的用户（只读），用于确认用户名、是否空库。
 * 用法：在 server 目录执行 npm run list-users
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { getPool } from '../src/db/pool.js';

async function main() {
  const db = process.env.MYSQL_DATABASE || '(未配置 MYSQL_DATABASE)';
  console.log(`当前连接数据库: ${db}`);

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, username, account_type, is_active,
            IFNULL(failed_login_count, 0) AS failed_login_count,
            locked_until
     FROM users ORDER BY id`
  );

  if (!rows?.length) {
    console.log('users 表中没有账号。请先创建首个管理员：');
    console.log('  POST /api/auth/bootstrap-admin  body: {"username":"admin","password":"<符合策略的密码>"}');
    console.log('（可使用 curl / Postman；仅当用户数为 0 时无需登录）');
    await pool.end();
    return;
  }

  console.table(
    rows.map((r) => ({
      id: r.id,
      username: r.username,
      account_type: r.account_type,
      is_active: r.is_active,
      failed_login_count: r.failed_login_count,
      locked_until: r.locked_until || ''
    }))
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
