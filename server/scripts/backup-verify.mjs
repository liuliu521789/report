/**
 * 校验备份包可恢复性（不改业务库）。
 * 用法：
 *   npm run backup-verify
 *   npm run backup-verify -- 2026-04-27
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { verifyBackupRecoverability } from '../src/backup/index.js';

async function main() {
  const backupId = String(process.argv[2] || '').trim();
  const result = await verifyBackupRecoverability({ backupId });
  console.log('备份校验通过:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('备份校验失败:', e?.message || e);
  process.exit(1);
});
