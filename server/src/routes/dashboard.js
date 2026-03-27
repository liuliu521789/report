import { Router } from 'express';

import { getPool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { purgeExpiredErrorLogs } from '../lib/audit.js';

export const router = Router();

router.use(requireAuth);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toSqlDateTimeUtc(d) {
  // MySQL DATETIME comparisons work well with `YYYY-MM-DD HH:mm:ss`.
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function startOfDayUtc(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

router.get('/summary', async (req, res) => {
  const pool = getPool();
  const isSuperAdminUser = req.user?.accountType === 'super_admin';

  const now = new Date();
  const todayStart = startOfDayUtc(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const month = now.getUTCMonth(); // 0-11
  const year = now.getUTCFullYear();
  const quarterIdx = Math.floor(month / 3); // 0-3
  const quarterStartMonth = quarterIdx * 3;
  const quarterStart = new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0));
  const quarterEnd = new Date(Date.UTC(year, quarterStartMonth + 3, 1, 0, 0, 0));

  // Monday 00:00 to next Monday 00:00 (UTC)
  const dow = now.getUTCDay(); // 0=Sun..6=Sat
  const offsetToMonday = (dow + 6) % 7; // 0 if Monday, 1 if Tuesday, ... 6 if Sunday
  const weekStart = new Date(todayStart.getTime() - offsetToMonday * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const sqlTodayStart = toSqlDateTimeUtc(todayStart);
  const sqlTodayEnd = toSqlDateTimeUtc(todayEnd);
  const sqlQuarterStart = toSqlDateTimeUtc(quarterStart);
  const sqlQuarterEnd = toSqlDateTimeUtc(quarterEnd);
  const sqlWeekStart = toSqlDateTimeUtc(weekStart);
  const sqlWeekEnd = toSqlDateTimeUtc(weekEnd);

  const [todayReportsRows] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM reports
     WHERE status='active' AND created_at >= ? AND created_at < ?`,
    [sqlTodayStart, sqlTodayEnd]
  );
  const todayReports = Number(todayReportsRows?.[0]?.c || 0);

  const [quarterReportsRows] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM reports
     WHERE status='active' AND created_at >= ? AND created_at < ?`,
    [sqlQuarterStart, sqlQuarterEnd]
  );
  const quarterReports = Number(quarterReportsRows?.[0]?.c || 0);

  const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const passSeries = Array(7).fill(0);
  const failSeries = Array(7).fill(0);
  const unknownSeries = Array(7).fill(0);

  const [trendRows] = await pool.query(
    `SELECT conclusion, WEEKDAY(created_at) AS weekday, COUNT(*) AS c
     FROM reports
     WHERE status='active' AND created_at >= ? AND created_at < ?
     GROUP BY conclusion, weekday`,
    [sqlWeekStart, sqlWeekEnd]
  );

  for (const r of trendRows || []) {
    const w = Number(r?.weekday);
    if (!Number.isFinite(w) || w < 0 || w > 6) continue;
    const conclusion = String(r?.conclusion || '').trim();
    const c = Number(r?.c || 0);
    if (conclusion === 'pass') passSeries[w] = c;
    if (conclusion === 'fail') failSeries[w] = c;
    if (conclusion === 'unknown') unknownSeries[w] = c;
  }

  const [activeConclusionRows] = await pool.query(
    `SELECT conclusion, COUNT(*) AS c
     FROM reports
     WHERE status='active' AND conclusion IN ('pass','fail','unknown')
     GROUP BY conclusion`
  );
  const activeConclusion = {};
  for (const r of activeConclusionRows || []) activeConclusion[String(r?.conclusion || '')] = Number(r?.c || 0);
  const unknownTotal = Number(activeConclusion.unknown || 0);
  const validTotal = Number(activeConclusion.pass || 0) + Number(activeConclusion.fail || 0);

  const [voidTotalRows] = await pool.query(`SELECT COUNT(*) AS c FROM reports WHERE status='void'`);
  const voidTotal = Number(voidTotalRows?.[0]?.c || 0);

  let onlineUsers = null;
  let securityIncidents = null;
  if (isSuperAdminUser) {
    // "online" is approximated: distinct users who successfully logged in within the last 1 hour.
    const onlineFrom = new Date(now.getTime() - 60 * 60 * 1000);
    const sqlOnlineFrom = toSqlDateTimeUtc(onlineFrom);
    const sqlNow = toSqlDateTimeUtc(now);
    const [onlineRows] = await pool.query(
      `SELECT COUNT(DISTINCT user_id) AS c
       FROM login_logs
       WHERE success=1 AND created_at >= ? AND created_at < ?`,
      [sqlOnlineFrom, sqlNow]
    );
    onlineUsers = Number(onlineRows?.[0]?.c || 0);

    // Security incidents = error logs within the last 24 hours.
    await purgeExpiredErrorLogs(pool);
    const incidentFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sqlIncidentFrom = toSqlDateTimeUtc(incidentFrom);
    const [incidentRows] = await pool.query(
      `SELECT COUNT(*) AS c
       FROM error_logs
       WHERE created_at >= ? AND created_at < ?`,
      [sqlIncidentFrom, sqlNow]
    );
    securityIncidents = Number(incidentRows?.[0]?.c || 0);
  }

  res.json({
    cards: {
      todayReports,
      quarterReports,
      onlineUsers,
      securityIncidents
    },
    trends: {
      labels: weekdayLabels,
      pass: passSeries,
      fail: failSeries,
      unknown: unknownSeries
    },
    donut: {
      // 状态分布口径：有效(状态active且判定非unknown) / 作废(status=void) / 未知(判定unknown且active)
      validTotal,
      unknownTotal,
      // backward-compatible fields (used by older frontend code paths)
      passActive: activeConclusion.pass || 0,
      unknownActive: activeConclusion.unknown || 0,
      failActive: activeConclusion.fail || 0,
      voidTotal
    }
  });
});

