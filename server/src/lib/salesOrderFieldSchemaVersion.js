/**
 * 订单动态字段「全局 schema 版本」：字段定义变更时递增；新订单写入 field_schema_version。
 */

import { getPool } from '../db/pool.js';

/** @param {import('mysql2/promise').Pool} [pool] */
export async function readOrderFieldSchemaVersion(pool) {
  const p = pool || getPool();
  const [r] = await p.query(
    'SELECT COALESCE(order_field_schema_version, 1) AS v FROM sales_settings WHERE id = 1 LIMIT 1'
  );
  return Number(r[0]?.v || 1);
}

/**
 * 字段定义变更后调用，使后续新订单使用新版本号。
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} conn
 */
export async function bumpOrderFieldSchemaVersion(conn) {
  await conn.query(
    'UPDATE sales_settings SET order_field_schema_version = COALESCE(order_field_schema_version, 1) + 1 WHERE id = 1'
  );
}
