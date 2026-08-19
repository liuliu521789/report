/**
 * 立刻把业务常用内置岗位写入当前库（含权限 JSON），无需等服务重启。
 * 用法：node scripts/seed-business-categories.mjs
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import {
  ALL_BUILTIN_CATEGORY_CODES,
  EXTRA_BUILTIN_CATEGORY_SEEDS,
  KNOWN_BUILTIN_CATEGORY_SEEDS,
  defaultPermissionsForRole,
  emptyPermissions
} from '../src/lib/permissionSchema.js';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'qc_report'
});

async function upsertCategory({ nameZh, code, sortOrder, requireTwoFactor = 0, permissions }) {
  const json = JSON.stringify(permissions);
  const [ins] = await pool.query(
    `INSERT IGNORE INTO employee_categories (name_zh, code, sort_order, default_permissions_json, require_two_factor, is_builtin)
     VALUES (?, ?, ?, CAST(? AS JSON), ?, 1)`,
    [nameZh, code, sortOrder, json, requireTwoFactor ? 1 : 0]
  );
  // 已存在（如手工建的总经理）：升级为内置并刷新默认权限
  await pool.query(
    `UPDATE employee_categories
     SET is_builtin = 1,
         default_permissions_json = CAST(? AS JSON),
         require_two_factor = GREATEST(IFNULL(require_two_factor, 0), ?)
     WHERE code = ?`,
    [json, requireTwoFactor ? 1 : 0, code]
  );
  return { code, inserted: Number(ins?.affectedRows || 0) > 0 };
}

const results = [];
for (const seed of KNOWN_BUILTIN_CATEGORY_SEEDS) {
  results.push(
    await upsertCategory({
      nameZh: seed.nameZh,
      code: seed.code,
      sortOrder: seed.sortOrder,
      requireTwoFactor: seed.requireTwoFactor ? 1 : 0,
      permissions: defaultPermissionsForRole(seed.code)
    })
  );
}
for (const seed of EXTRA_BUILTIN_CATEGORY_SEEDS) {
  results.push(
    await upsertCategory({
      nameZh: seed.nameZh,
      code: seed.code,
      sortOrder: seed.sortOrder,
      permissions: emptyPermissions()
    })
  );
}

await pool.query(
  `UPDATE employee_categories SET is_builtin = 1
   WHERE code IN (${ALL_BUILTIN_CATEGORY_CODES.map(() => '?').join(', ')})`,
  ALL_BUILTIN_CATEGORY_CODES
);

const [rows] = await pool.query(
  `SELECT name_zh, code, is_builtin, sort_order
   FROM employee_categories
   ORDER BY sort_order ASC, id ASC`
);
console.log(
  JSON.stringify(
    {
      upserted: results,
      categories: rows
    },
    null,
    2
  )
);
await pool.end();
