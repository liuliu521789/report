import { Router } from 'express';
import { getPool } from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import {
  listBackups,
  runBackup,
  restoreBackup,
  downloadBackup,
  deleteBackup,
  listBackupJobs,
  rotateBackupEncryption,
  verifyBackupRecoverability
} from '../backup/index.js';

const router = Router();

function toSqlDateTime(value) {
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} ${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;
}

function escapeSqlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function serializeSqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) return `'${toSqlDateTime(value)}'`;
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  if (typeof value === 'object') {
    return `'${escapeSqlString(JSON.stringify(value))}'`;
  }
  return `'${escapeSqlString(value)}'`;
}

function normalizeLegacyDateTimeLiterals(sql) {
  return sql.replace(/'([A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4} \([^']+\))'/g, (_, raw) => {
    let parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      parsed = new Date(raw.replace(/\s*\([^)]*\)$/, ''));
    }
    if (Number.isNaN(parsed.getTime())) {
      return `'${raw}'`;
    }
    return `'${toSqlDateTime(parsed)}'`;
  });
}

function normalizeLegacyJsonPlaceholders(sql) {
  return sql
    .replace(/'\[object Object\]'/g, "'{}'")
    .replace(/'\[object Array\]'/g, "'[]'");
}

function stripSqlComments(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .replace(/^\s*--.*$/gm, '')
    .replace(/^\s*#.*$/gm, '');
}

/** 仅备份相关端点要求超管，避免误拦截其它 /api 路由 */
router.use(['/backups', '/sql'], requireAuth, requireSuperAdmin);

// Backups: list, run, restore, download, delete
router.get('/backups', async (req, res, next) => {
  try {
    const backups = await listBackups();
    res.json({ backups });
  } catch (err) {
    next(err);
  }
});

router.post('/backups/run', async (req, res, next) => {
  try {
    const backup = await runBackup({ triggerType: 'manual', actorUserId: req.user?.userId || null });
    res.json({ backup });
  } catch (err) {
    next(err);
  }
});

router.get('/backups/jobs', async (req, res, next) => {
  try {
    const jobs = await listBackupJobs(100);
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
});

router.post('/backups/reencrypt', async (req, res, next) => {
  try {
    const result = await rotateBackupEncryption({ actorUserId: req.user?.userId || null });
    res.json({ result });
  } catch (err) {
    next(err);
  }
});

router.post('/backups/verify', async (req, res, next) => {
  try {
    const id = String(req.body?.backupId || '').trim();
    const result = await verifyBackupRecoverability({
      backupId: id,
      actorUserId: req.user?.userId || null
    });
    res.json({ result });
  } catch (err) {
    next(err);
  }
});

router.post('/backups/restore/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const result = await restoreBackup(id);
    res.json({ result });
  } catch (err) {
    next(err);
  }
});

router.delete('/backups/:id', async (req, res, next) => {
  try {
    await deleteBackup(String(req.params.id || '').trim());
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/backups/download/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const { path: p, filename } = await downloadBackup(id);
    res.download(p, filename || `backup_${id}.tar.gz`);
  } catch (err) {
    next(err);
  }
});

// Fallback legacy endpoint for quick SQL dump backup
router.get('/sql', async (req, res, next) => {
  try {
    const pool = getPool();
    const [tables] = await pool.query('SHOW TABLES');
    const tableList = tables.map(row => Object.values(row)[0]);

    const lines = [];
    lines.push(`-- Backup: ${new Date().toISOString()}`);
    lines.push(`-- Database: ${process.env.MYSQL_DATABASE}`);
    lines.push('SET FOREIGN_KEY_CHECKS=0;\n');

    for (const tableName of tableList) {
      const [createResult] = await pool.query(`SHOW CREATE TABLE \`${tableName}\``);
      lines.push(`\nDROP TABLE IF EXISTS \`${tableName}\`;`);
      lines.push(createResult[0]['Create Table'] + ';');
    }

    for (const tableName of tableList) {
      const [rows] = await pool.query(`SELECT * FROM \`${tableName}\``);
      if (rows.length === 0) continue;
      lines.push(`\n-- Data for \`${tableName}\``);
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = cols.map(c => serializeSqlValue(row[c]));
        lines.push(`INSERT INTO \`${tableName}\` (\`${cols.join('`,`')}\`) VALUES (${vals.join(',')});`);
      }
    }

    lines.push('\nSET FOREIGN_KEY_CHECKS=1;');
    res.setHeader('Content-Disposition', `attachment; filename="backup_${Date.now()}.sql"`);
    res.setHeader('Content-Type', 'application/sql');
    res.send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
});

router.post('/sql', async (req, res, next) => {
  try {
    const pool = getPool();
    const { sql } = req.body;
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ error: '请提供 sql 字段' });
    }
    const stmts = stripSqlComments(sql)
      .split(/;\s*(?:\r?\n|$)/)
      .map(s => s.trim())
      .filter(Boolean);

    await pool.query('SET FOREIGN_KEY_CHECKS=0');
    try {
      for (const stmt of stmts) {
        if (stmt.toUpperCase().startsWith('SET FOREIGN_KEY_CHECKS')) continue;
        const normalizedStmt = normalizeLegacyJsonPlaceholders(normalizeLegacyDateTimeLiterals(stmt));
        try {
          await pool.query(normalizedStmt);
        } catch (e) {
          console.error('[restore] statement error:', normalizedStmt.slice(0, 100), e.message);
          return res.status(400).json({ error: `执行失败: ${e.message}`, statement: normalizedStmt.slice(0, 200) });
        }
      }
    } finally {
      await pool.query('SET FOREIGN_KEY_CHECKS=1');
    }

    res.json({ message: '恢复完成', statements: stmts.length });
  } catch (err) {
    next(err);
  }
});

export { router };
