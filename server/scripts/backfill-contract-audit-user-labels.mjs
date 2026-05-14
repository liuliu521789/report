/**
 * 将合同审批日志中的「用户ID n」替换为与用户资料一致的展示名（与线上写入逻辑一致）。
 * 历史记录在改代码前已落库，需跑一次回填才能在界面看到姓名。
 *
 * 用法：在 server 目录执行
 *   npm run backfill-contract-audit-user-labels
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { getPool } from '../src/db/pool.js';
import { userDisplayLabel } from '../src/lib/userDisplayLabel.js';

async function rewriteComment(pool, text) {
  let out = text;
  const flowRe = /流转至用户ID\s+(\d+)/;
  let m = out.match(flowRe);
  if (m) {
    const label = await userDisplayLabel(pool, Number(m[1]));
    out = out.replace(flowRe, `流转至 ${label}`);
  }
  const urgeRe = /催办当前审批人（用户ID\s+(\d+)）/;
  m = out.match(urgeRe);
  if (m) {
    const label = await userDisplayLabel(pool, Number(m[1]));
    out = out.replace(urgeRe, `催办当前审批人（${label}）`);
  }
  return out;
}

async function main() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, comment_text FROM sales_contract_audit_logs
     WHERE comment_text IS NOT NULL AND comment_text != ''
       AND (
         comment_text LIKE '%流转至用户ID %'
         OR comment_text LIKE '%催办当前审批人（用户ID %'
       )`
  );
  let updated = 0;
  for (const row of rows || []) {
    const next = await rewriteComment(pool, row.comment_text);
    if (next !== row.comment_text) {
      await pool.query('UPDATE sales_contract_audit_logs SET comment_text = ? WHERE id = ?', [next, row.id]);
      updated += 1;
    }
  }
  console.log(`扫描 ${rows?.length || 0} 条，已更新 ${updated} 条。`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
