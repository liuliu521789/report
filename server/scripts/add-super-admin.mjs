/**
 * 插入超级管理员（运维一次性使用）。若用户名已存在则退出。
 * 用法：npm run add-super-admin -- [用户名]
 */
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { getPool } from '../src/db/pool.js';
import { hashPassword } from '../src/services/password.js';
import { getSecuritySettings, validatePasswordPlain } from '../src/lib/securityPolicy.js';

function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789#@$%';
  let s = '';
  const buf = crypto.randomBytes(24);
  for (let i = 0; i < 18; i++) s += chars[buf[i] % chars.length];
  return s;
}

async function main() {
  const username = (process.argv[2] || 'admin').trim();
  if (!username) {
    console.error('用法: npm run add-super-admin -- [用户名]');
    process.exit(1);
  }

  const pool = getPool();
  const settings = await getSecuritySettings(pool);

  let plain = '';
  for (let i = 0; i < 50; i++) {
    plain = generatePassword();
    const v = validatePasswordPlain(plain, settings);
    if (v.ok) break;
  }
  if (!validatePasswordPlain(plain, settings).ok) {
    console.error('生成密码不满足策略，请稍后重试');
    process.exit(1);
  }

  const [exist] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  if (exist?.length) {
    console.error('用户名已存在:', username, '→ 请改用 npm run reset-password');
    process.exit(1);
  }

  const h = hashPassword(plain);
  await pool.query(
    `INSERT INTO users (username, password_hash, account_type, is_active)
     VALUES (?, ?, 'super_admin', 1)`,
    [username, h]
  );

  console.log('已创建超级管理员');
  console.log('用户名:', username);
  console.log('密码:', plain);
  console.log('请登录后立即修改密码。');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
