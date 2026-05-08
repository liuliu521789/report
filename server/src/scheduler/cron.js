import cron from 'node-cron';
import { runBackup, verifyBackupRecoverability } from '../backup/index.js';

let task = null;

function logJson(level, event, payload = {}) {
  const row = {
    ts: new Date().toISOString(),
    level,
    module: 'backup-cron',
    event,
    ...payload
  };
  const text = JSON.stringify(row);
  // eslint-disable-next-line no-console
  if (level === 'error') console.error(text);
  else console.log(text);
}

function isVerifyEnabled() {
  const raw = String(process.env.BACKUP_VERIFY_AFTER_CRON || 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
}

async function sendVerifyFailureAlert(message) {
  const webhook = String(process.env.BACKUP_ALERT_WEBHOOK_URL || '').trim();
  if (!webhook) return;
  const text = [
    '系统数据备份校验失败告警',
    `来源: backup-cron-verify`,
    `时间: ${new Date().toISOString()}`,
    `错误: ${String(message || 'unknown').slice(0, 500)}`
  ].join('\n');
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: text } })
    });
  } catch {
    // ignore alert transport errors
  }
}

export function startCron(cronExpression) {
  if (task) task.stop();
  logJson('info', 'cron_scheduled', { cronExpression, verifyAfterCron: isVerifyEnabled() });
  task = cron.schedule(cronExpression, async () => {
    const startedAt = Date.now();
    try {
      const backup = await runBackup({ triggerType: 'cron' });
      logJson('info', 'backup_ok', {
        backupId: backup?.id || '',
        size: Number(backup?.size || 0)
      });
      if (isVerifyEnabled()) {
        const verify = await verifyBackupRecoverability({ backupId: backup?.id || '' });
        logJson('info', 'verify_ok', {
          backupId: verify?.backupId || backup?.id || '',
          dbSqlBytes: Number(verify?.dbSqlBytes || 0),
          filesArchiveValid: Boolean(verify?.filesArchiveValid),
          elapsedMs: Date.now() - startedAt
        });
      }
    } catch (e) {
      logJson('error', 'backup_or_verify_failed', {
        message: String(e?.message || e || 'unknown'),
        elapsedMs: Date.now() - startedAt
      });
      sendVerifyFailureAlert(e?.message || e).catch(() => {});
    }
  }, {
    scheduled: true
  });
  return task;
}

export function stopCron() {
  if (task) task.stop();
}
