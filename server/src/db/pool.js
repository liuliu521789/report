import mysql from 'mysql2/promise';

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: 'Z',
      /** 与库表 utf8mb4 一致，避免中文标题等入库/读出乱码 */
      charset: 'utf8mb4'
    });
  }
  return pool;
}

export async function pingDb() {
  const p = getPool();
  await p.query('SELECT 1');
}

