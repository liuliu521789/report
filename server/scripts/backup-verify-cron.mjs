/**
 * 定时任务用：备份可恢复性校验（输出单行结果，失败返回非 0）。
 * 用法：
 *   npm run backup-verify-cron
 *   npm run backup-verify-cron -- 2026-04-27
 *
 * 说明：
 * - 若未传 backupId，默认校验最新备份
 * - 也可用环境变量 BACKUP_VERIFY_BACKUP_ID 指定
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { verifyBackupRecoverability } from '../src/backup/index.js';

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const backupIdArg = String(process.argv[2] || '').trim();
  const backupIdEnv = String(process.env.BACKUP_VERIFY_BACKUP_ID || '').trim();
  const backupId = backupIdArg || backupIdEnv;

  const result = await verifyBackupRecoverability({ backupId });
  console.log(
    `[backup-verify-cron] ok ts=${nowIso()} backupId=${result.backupId} ` +
      `dbSqlBytes=${result.dbSqlBytes} filesArchiveValid=${result.filesArchiveValid}`
  );
}

main().catch((e) => {
  console.error(`[backup-verify-cron] fail ts=${nowIso()} message=${e?.message || e}`);
  process.exit(1);
});
