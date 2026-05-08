/**
 * 重置指定用户登录密码（运维/忘记密码时使用）。
 * 用法（在 server 目录）：npm run reset-password -- admin YourNewStrongPwd
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { getPool } from '../src/db/pool.js';
import { hashPassword } from '../src/services/password.js';
import { getSecuritySettings, validatePasswordPlain } from '../src/lib/securityPolicy.js';

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];
  if (!username || !password) {
    console.error('用法: npm run reset-password -- <用户名> <新密码>');
    process.exit(1);
  }
  const pool = getPool();
  const settings = await getSecuritySettings(pool);
  const v = validatePasswordPlain(password, settings);
  if (!v.ok) {
    console.error(v.message || v.code);
    process.exit(1);
  }
  const h = hashPassword(password);
  const [r] = await pool.query(
    'UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL WHERE username = ?',
    [h, username]
  );
  if (Number(r.affectedRows) === 0) {
    console.error('未找到用户:', username);
    console.error('请确认用户名与当前 .env 中的 MYSQL_DATABASE 一致。可执行: npm run list-users');
    process.exit(1);
  }
  console.log('已更新用户密码:', username);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
