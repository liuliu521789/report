import { Router } from 'express';

import { getPool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { purgeExpiredErrorLogs } from '../lib/audit.js';
import { hasPermission } from '../lib/permissions.js';
import { fetchActivityHeatmap } from '../lib/dashboardActivityHeatmap.js';

export const router = Router();

router.use(requireAuth);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toSqlDateTimeUtc(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function startOfDayUtc(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

function isSuperAdminUser(req) {
  return req.user?.accountType === 'super_admin';
}

function perm(req, mod, key) {
  if (isSuperAdminUser(req)) return true;
  return hasPermission(req.user?.permissions, mod, key);
}

function canViewAllSalesOrders(req) {
  if (isSuperAdminUser(req)) return true;
  if (perm(req, 'order_management', 'order_query_all')) return true;
  if (perm(req, 'order_management', 'order_status_finance')) return true;
  if (perm(req, 'order_management', 'order_status_qc')) return true;
  if (perm(req, 'order_management', 'order_status_warehouse')) return true;
  return false;
}

function canAccessSalesContractWorkspace(req) {
  if (isSuperAdminUser(req)) return true;
  return (
    perm(req, 'contract_management', 'contract_view') ||
    perm(req, 'contract_management', 'contract_generate') ||
    perm(req, 'contract_management', 'contract_submit') ||
    perm(req, 'contract_management', 'contract_edit') ||
    perm(req, 'contract_management', 'contract_delete') ||
    perm(req, 'contract_management', 'contract_review')
  );
}

function canManageContractInvoice(req) {
  if (isSuperAdminUser(req)) return true;
  return (
    perm(req, 'contract_management', 'contract_submit') ||
    perm(req, 'contract_management', 'contract_generate')
  );
}

function canFulfillContractInvoice(req) {
  if (isSuperAdminUser(req)) return true;
  return perm(req, 'order_management', 'order_status_finance');
}

function pctChange(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev <= 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

async function countActiveReports(pool, from, to) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM reports WHERE status='active' AND created_at >= ? AND created_at < ?`,
    [toSqlDateTimeUtc(from), toSqlDateTimeUtc(to)]
  );
  return Number(rows?.[0]?.c || 0);
}

router.get('/summary', async (req, res) => {
  const pool = getPool();
  const isSuper = isSuperAdminUser(req);
  const uid = req.user?.userId;

  const now = new Date();
  const todayStart = startOfDayUtc(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  const quarterIdx = Math.floor(month / 3);
  const quarterStartMonth = quarterIdx * 3;
  const quarterStart = new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0));
  const quarterEnd = new Date(Date.UTC(year, quarterStartMonth + 3, 1, 0, 0, 0));
  const prevQuarterStart = new Date(Date.UTC(year, quarterStartMonth - 3, 1, 0, 0, 0));

  const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

  const dow = now.getUTCDay();
  const offsetToMonday = (dow + 6) % 7;
  const weekStart = new Date(todayStart.getTime() - offsetToMonday * 24 * 60 * 60 * 1000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const sqlTodayStart = toSqlDateTimeUtc(todayStart);
  const sqlTodayEnd = toSqlDateTimeUtc(todayEnd);
  const sqlQuarterStart = toSqlDateTimeUtc(quarterStart);
  const sqlQuarterEnd = toSqlDateTimeUtc(quarterEnd);
  const sqlWeekStart = toSqlDateTimeUtc(weekStart);
  const sqlWeekEnd = toSqlDateTimeUtc(weekEnd);

  const canReports = isSuper || perm(req, 'reports', 'list') || perm(req, 'reports', 'create');
  const canSalesOrders =
    isSuper ||
    perm(req, 'order_management', 'order_query') ||
    perm(req, 'order_management', 'order_input') ||
    perm(req, 'order_management', 'order_status_qc');
  const canSalesContracts = canAccessSalesContractWorkspace(req);
  const canSalesInvoices = canManageContractInvoice(req) || canFulfillContractInvoice(req);
  const canAudit =
    isSuper ||
    perm(req, 'audit', 'viewLogin') ||
    perm(req, 'audit', 'viewOperations');

  const todayReports = canReports
    ? await countActiveReports(pool, todayStart, todayEnd)
    : null;
  const yesterdayReports = canReports
    ? await countActiveReports(pool, yesterdayStart, todayStart)
    : null;
  const quarterReports = canReports
    ? await countActiveReports(pool, quarterStart, quarterEnd)
    : null;
  const prevQuarterReports = canReports
    ? await countActiveReports(pool, prevQuarterStart, quarterStart)
    : null;

  const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const passSeries = Array(7).fill(0);
  const failSeries = Array(7).fill(0);
  const unknownSeries = Array(7).fill(0);
  let unknownTotal = 0;
  let validTotal = 0;
  let voidTotal = 0;
  let passActive = 0;
  let failActive = 0;

  if (canReports) {
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
    for (const r of activeConclusionRows || []) {
      activeConclusion[String(r?.conclusion || '')] = Number(r?.c || 0);
    }
    unknownTotal = Number(activeConclusion.unknown || 0);
    passActive = Number(activeConclusion.pass || 0);
    failActive = Number(activeConclusion.fail || 0);
    validTotal = passActive + failActive;

    const [voidTotalRows] = await pool.query(`SELECT COUNT(*) AS c FROM reports WHERE status='void'`);
    voidTotal = Number(voidTotalRows?.[0]?.c || 0);
  }

  let onlineUsers = null;
  let securityIncidents = null;
  let prevSecurityIncidents = null;
  if (isSuper) {
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

    await purgeExpiredErrorLogs(pool);
    const incidentFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const prevIncidentFrom = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const sqlIncidentFrom = toSqlDateTimeUtc(incidentFrom);
    const sqlPrevIncidentFrom = toSqlDateTimeUtc(prevIncidentFrom);
    const [incidentRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM error_logs WHERE created_at >= ? AND created_at < ?`,
      [sqlIncidentFrom, sqlNow]
    );
    securityIncidents = Number(incidentRows?.[0]?.c || 0);
    const [prevIncidentRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM error_logs WHERE created_at >= ? AND created_at < ?`,
      [sqlPrevIncidentFrom, sqlIncidentFrom]
    );
    prevSecurityIncidents = Number(prevIncidentRows?.[0]?.c || 0);
  }

  let sales = null;
  if (canSalesOrders || canSalesContracts || canSalesInvoices) {
    sales = {
      flow: null,
      monthOrders: null,
      pendingContracts: null,
      pendingInvoices: null,
      unreadMessages: null
    };

    if (canSalesOrders && uid != null) {
      const seeAll = canViewAllSalesOrders(req);
      let flowSql = `SELECT
        SUM(CASE WHEN o.status = 'pending_review' AND o.submitted_for_review_at IS NULL THEN 1 ELSE 0 END) AS pending_submit,
        SUM(CASE WHEN o.status = 'pending_review' AND o.submitted_for_review_at IS NOT NULL THEN 1 ELSE 0 END) AS pending_finance,
        SUM(CASE WHEN o.status = 'pending_qc' THEN 1 ELSE 0 END) AS pending_qc,
        SUM(CASE WHEN o.status = 'approved' THEN 1 ELSE 0 END) AS pending_ship,
        SUM(CASE WHEN o.status = 'shipped' THEN 1 ELSE 0 END) AS shipped_open,
        SUM(CASE WHEN o.status = 'rejected' AND o.qc_reviewed_at IS NULL THEN 1 ELSE 0 END) AS finance_rejected,
        SUM(CASE WHEN o.status = 'rejected' AND o.qc_reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS qc_rejected
        FROM sales_orders o
        INNER JOIN sales_customers c ON c.id = o.customer_id
        WHERE o.status <> 'cancelled'`;
      const flowArgs = [];
      if (!seeAll) {
        flowSql += ' AND o.created_by = ?';
        flowArgs.push(uid);
      }
      const [flowRows] = await pool.query(flowSql, flowArgs);
      const fr = flowRows[0] || {};
      sales.flow = {
        pending_submit: Number(fr.pending_submit || 0),
        pending_finance: Number(fr.pending_finance || 0),
        pending_qc: Number(fr.pending_qc || 0),
        pending_ship: Number(fr.pending_ship || 0),
        shipped_open: Number(fr.shipped_open || 0),
        finance_rejected: Number(fr.finance_rejected || 0),
        qc_rejected: Number(fr.qc_rejected || 0)
      };

      let monthSql = `SELECT COUNT(*) AS c FROM sales_orders o WHERE o.status <> 'cancelled' AND o.created_at >= ? AND o.created_at < ?`;
      const monthArgs = [toSqlDateTimeUtc(monthStart), toSqlDateTimeUtc(monthEnd)];
      if (!seeAll) {
        monthSql += ' AND o.created_by = ?';
        monthArgs.push(uid);
      }
      const [monthRows] = await pool.query(monthSql, monthArgs);
      sales.monthOrders = Number(monthRows?.[0]?.c || 0);
    }

    if (canSalesContracts) {
      const [cRows] = await pool.query(
        `SELECT COUNT(*) AS c FROM sales_contracts WHERE status = 'pending_review'`
      );
      sales.pendingContracts = Number(cRows?.[0]?.c || 0);
    }

    if (canSalesInvoices) {
      const [iRows] = await pool.query(
        `SELECT COUNT(*) AS c FROM sales_contract_invoices WHERE status IN ('pending_finance', 'pending_review')`
      );
      sales.pendingInvoices = Number(iRows?.[0]?.c || 0);
    }

    if (uid != null) {
      try {
        const [msgRows] = await pool.query(
          `SELECT COUNT(*) AS c FROM sales_internal_messages WHERE to_user_id = ? AND read_at IS NULL`,
          [uid]
        );
        sales.unreadMessages = Number(msgRows?.[0]?.c || 0);
      } catch {
        sales.unreadMessages = 0;
      }
    }
  }

  const comparisons = {};
  if (canReports) {
    comparisons.todayVsYesterdayPct = pctChange(todayReports, yesterdayReports);
    comparisons.quarterVsPrevPct = pctChange(quarterReports, prevQuarterReports);
  }
  if (isSuper) {
    comparisons.securityDeltaPct = pctChange(securityIncidents, prevSecurityIncidents);
  }

  let employeeCategoryName = null;
  let employeeCategoryCode = req.user?.employeeCategoryCode || null;
  if (!isSuper && uid != null) {
    const [catRows] = await pool.query(
      `SELECT c.name_zh AS nameZh, c.code AS code
       FROM users u
       LEFT JOIN employee_categories c ON c.id = u.employee_category_id
       WHERE u.id = ? LIMIT 1`,
      [uid]
    );
    employeeCategoryName = catRows[0]?.nameZh || null;
    employeeCategoryCode = catRows[0]?.code || employeeCategoryCode;
  }

  res.json({
    user: {
      username: req.user?.username || '',
      realName: req.user?.realName || req.user?.real_name || '',
      employeeCategoryCode,
      employeeCategoryName
    },
    capabilities: {
      reports: canReports,
      salesOrders: canSalesOrders,
      salesContracts: canSalesContracts,
      salesInvoices: canSalesInvoices,
      audit: canAudit,
      adminMetrics: isSuper
    },
    cards: {
      todayReports,
      quarterReports,
      onlineUsers,
      securityIncidents,
      salesMonthOrders: sales?.monthOrders ?? null
    },
    comparisons,
    sales,
    trends: canReports
      ? { labels: weekdayLabels, pass: passSeries, fail: failSeries, unknown: unknownSeries }
      : null,
    donut: canReports
      ? {
          validTotal,
          unknownTotal,
          passActive,
          unknownActive: unknownTotal,
          failActive,
          voidTotal
        }
      : null
  });
});

router.get('/activity-heatmap', async (req, res) => {
  const pool = getPool();
  const isSuper = isSuperAdminUser(req);
  const uid = req.user?.userId;

  const canReports = isSuper || perm(req, 'reports', 'list') || perm(req, 'reports', 'create');
  const canSalesOrders =
    isSuper ||
    perm(req, 'order_management', 'order_query') ||
    perm(req, 'order_management', 'order_input') ||
    perm(req, 'order_management', 'order_status_qc');

  const requestedType = String(req.query?.type || '').trim() || null;

  try {
    const data = await fetchActivityHeatmap(pool, {
      isSuper,
      canReports,
      canSalesOrders,
      seeAllSales: canViewAllSalesOrders(req),
      preferSalesOrders: perm(req, 'order_management', 'order_input'),
      uid,
      requestedType
    });
    res.json(data);
  } catch (err) {
    console.error('[dashboard] activity-heatmap', err);
    res.status(500).json({ error: 'HEATMAP_LOAD_FAILED' });
  }
});
