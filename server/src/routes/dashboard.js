import { Router } from 'express';

import { getPool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { purgeExpiredAuditLogs } from '../lib/audit.js';
import { hasPermission } from '../lib/permissions.js';
import { addYmdDays, fetchActivityHeatmap, formatYmdInTz, shanghaiDayStartUtc } from '../lib/dashboardActivityHeatmap.js';

export const router = Router();

router.use(requireAuth);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toSqlDateTimeUtc(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function apiOk(res, data) {
  res.json({ code: 0, message: 'ok', data });
}

function shanghaiMonthStartUtc(year, monthIdx) {
  return new Date(Date.UTC(year, monthIdx, 1, -8, 0, 0));
}

function shanghaiQuarterStartUtc(year, quarterIdx) {
  return shanghaiMonthStartUtc(year, quarterIdx * 3);
}

function scopedSalesWhere(req, alias = 'o') {
  const uid = req.user?.userId;
  if (canViewAllSalesOrders(req) || uid == null) return { sql: '', args: [] };
  return { sql: ` AND ${alias}.created_by = ?`, args: [uid] };
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
  const todayYmd = formatYmdInTz(now);
  const todayStart = shanghaiDayStartUtc(todayYmd);
  const todayEnd = shanghaiDayStartUtc(addYmdDays(todayYmd, 1));
  const yesterdayStart = shanghaiDayStartUtc(addYmdDays(todayYmd, -1));

  const [year, monthNo] = todayYmd.split('-').map((x) => Number(x));
  const month = monthNo - 1;
  const quarterIdx = Math.floor(month / 3);
  const quarterStart = shanghaiQuarterStartUtc(year, quarterIdx);
  const quarterEnd = shanghaiQuarterStartUtc(year, quarterIdx + 1);
  const prevQuarterStart = shanghaiQuarterStartUtc(year, quarterIdx - 1);

  const monthStart = shanghaiMonthStartUtc(year, month);
  const monthEnd = shanghaiMonthStartUtc(year, month + 1);

  const day = new Date(`${todayYmd}T12:00:00+08:00`).getUTCDay();
  const offsetToMonday = (day + 6) % 7;
  const weekStart = shanghaiDayStartUtc(addYmdDays(todayYmd, -offsetToMonday));
  const weekEnd = shanghaiDayStartUtc(addYmdDays(todayYmd, 7 - offsetToMonday));

  const sqlTodayStart = toSqlDateTimeUtc(todayStart);
  const sqlTodayEnd = toSqlDateTimeUtc(todayEnd);
  const sqlQuarterStart = toSqlDateTimeUtc(quarterStart);
  const sqlQuarterEnd = toSqlDateTimeUtc(quarterEnd);
  const sqlWeekStart = toSqlDateTimeUtc(weekStart);
  const sqlWeekEnd = toSqlDateTimeUtc(weekEnd);
  const sqlNow = toSqlDateTimeUtc(now);

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
  const canWecom = isSuper || perm(req, 'wecom', 'manage');
  const canQrcodes = isSuper || perm(req, 'qrcodes', 'list') || perm(req, 'qrcodes', 'create');
  const canQcYearbooks = isSuper || perm(req, 'qc_yearbooks', 'view') || perm(req, 'qc_yearbooks', 'upload');
  const canCustomerManagement = isSuper || perm(req, 'customer_management', 'view');

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
  let reportAlerts = null;

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

    const voidRecentFrom = shanghaiDayStartUtc(addYmdDays(todayYmd, -7));
    const [unboundRows] = await pool.query(
      `SELECT COUNT(*) AS c
       FROM reports r
       LEFT JOIN qrcode_reports qr ON qr.report_id = r.id
       WHERE r.status = 'active' AND qr.report_id IS NULL`
    );
    const [voidRecentRows] = await pool.query(
      `SELECT COUNT(*) AS c
       FROM reports
       WHERE status = 'void' AND updated_at >= ? AND updated_at < ?`,
      [toSqlDateTimeUtc(voidRecentFrom), sqlNow]
    );
    reportAlerts = {
      unknownActive: unknownTotal,
      failActive,
      unboundQrcodeReports: Number(unboundRows?.[0]?.c || 0),
      voided7d: Number(voidRecentRows?.[0]?.c || 0)
    };
  }

  let onlineUsers = null;
  let securityIncidents = null;
  let prevSecurityIncidents = null;
  if (isSuper) {
    const onlineFrom = new Date(now.getTime() - 60 * 60 * 1000);
    const sqlOnlineFrom = toSqlDateTimeUtc(onlineFrom);
    const [onlineRows] = await pool.query(
      `SELECT COUNT(DISTINCT user_id) AS c
       FROM login_logs
       WHERE success=1 AND created_at >= ? AND created_at < ?`,
      [sqlOnlineFrom, sqlNow]
    );
    onlineUsers = Number(onlineRows?.[0]?.c || 0);

    await purgeExpiredAuditLogs(pool);
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
      overdue: null,
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

      const scope = scopedSalesWhere(req, 'o');
      const financeOverdueBefore = toSqlDateTimeUtc(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      const shipOverdueBefore = toSqlDateTimeUtc(new Date(now.getTime() - 48 * 60 * 60 * 1000));
      const [overdueRows] = await pool.query(
        `SELECT
          SUM(CASE WHEN o.status = 'pending_review' AND o.submitted_for_review_at IS NOT NULL AND o.submitted_for_review_at < ? THEN 1 ELSE 0 END) AS pending_finance_overdue,
          SUM(CASE WHEN o.status = 'pending_qc' AND COALESCE(o.finance_reviewed_at, o.updated_at, o.created_at) < ? THEN 1 ELSE 0 END) AS pending_qc_overdue,
          SUM(CASE WHEN o.status = 'approved' AND COALESCE(o.qc_reviewed_at, o.updated_at, o.created_at) < ? THEN 1 ELSE 0 END) AS pending_ship_overdue,
          SUM(CASE WHEN o.status = 'rejected' AND o.updated_at < ? THEN 1 ELSE 0 END) AS rejected_overdue
         FROM sales_orders o
         WHERE o.status <> 'cancelled'${scope.sql}`,
        [
          financeOverdueBefore,
          financeOverdueBefore,
          shipOverdueBefore,
          shipOverdueBefore,
          ...scope.args
        ]
      );
      const orow = overdueRows?.[0] || {};
      sales.overdue = {
        pendingFinance24h: Number(orow.pending_finance_overdue || 0),
        pendingQc24h: Number(orow.pending_qc_overdue || 0),
        pendingShip48h: Number(orow.pending_ship_overdue || 0),
        rejected48h: Number(orow.rejected_overdue || 0)
      };
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

  let notificationHealth = null;
  if (canWecom) {
    try {
      const [jobRows] = await pool.query(
        `SELECT
          SUM(CASE WHEN status IN ('pending','sending') THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
          SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead_count
         FROM wecom_notify_jobs`
      );
      const [lastFailedRows] = await pool.query(
        `SELECT id, event_type, biz_type, biz_id, last_error AS lastError, updated_at AS updatedAt
         FROM wecom_notify_jobs
         WHERE status IN ('failed','dead')
         ORDER BY updated_at DESC
         LIMIT 1`
      );
      const jr = jobRows?.[0] || {};
      notificationHealth = {
        pending: Number(jr.pending_count || 0),
        failed: Number(jr.failed_count || 0),
        dead: Number(jr.dead_count || 0),
        lastFailed: lastFailedRows?.[0] || null
      };
    } catch {
      notificationHealth = {
        pending: 0,
        failed: 0,
        dead: 0,
        lastFailed: null
      };
    }
  }

  let qrcodeAlerts = null;
  if (canQrcodes) {
    const [qrcodeRows] = await pool.query(
      `SELECT
        COUNT(DISTINCT q.id) AS total_count,
        SUM(CASE WHEN qr.qrcode_id IS NULL THEN 1 ELSE 0 END) AS unbound_count,
        COUNT(DISTINCT CASE WHEN q.created_at >= ? AND q.created_at < ? THEN q.id ELSE NULL END) AS month_count
       FROM qrcodes q
       LEFT JOIN qrcode_reports qr ON qr.qrcode_id = q.id`,
      [toSqlDateTimeUtc(monthStart), toSqlDateTimeUtc(monthEnd)]
    );
    const qr = qrcodeRows?.[0] || {};
    qrcodeAlerts = {
      total: Number(qr.total_count || 0),
      generatedThisMonth: Number(qr.month_count || 0),
      unboundQrcodes: Number(qr.unbound_count || 0)
    };
  }

  let qcYearbookHealth = null;
  if (canQcYearbooks) {
    try {
      const [yearRows] = await pool.query(
        `SELECT id FROM qc_yearbook_years WHERE year = ? LIMIT 1`,
        [year]
      );
      const yearId = yearRows?.[0]?.id || null;
      let finishedProductRows = 0;
      let abnormalRows = 0;
      if (yearId) {
        const [fpRows] = await pool.query(
          `SELECT
            COUNT(*) AS total_count,
            SUM(
              CASE
                WHEN inspection_conclusion IS NOT NULL
                  AND TRIM(inspection_conclusion) <> ''
                  AND inspection_conclusion NOT IN ('合格','pass','PASS','Pass')
                THEN 1 ELSE 0
              END
            ) AS abnormal_count
           FROM qc_yearbook_finished_product_rows
           WHERE year_id = ?`,
          [yearId]
        );
        finishedProductRows = Number(fpRows?.[0]?.total_count || 0);
        abnormalRows = Number(fpRows?.[0]?.abnormal_count || 0);
      }
      qcYearbookHealth = {
        year,
        hasCurrentYear: !!yearId,
        finishedProductRows,
        abnormalRows
      };
    } catch {
      qcYearbookHealth = null;
    }
  }

  let customerModelHealth = null;
  if (canCustomerManagement) {
    try {
      const [customerRows] = await pool.query(
        `SELECT
          COUNT(*) AS active_count,
          SUM(CASE WHEN m.id IS NULL THEN 1 ELSE 0 END) AS no_mapping_count
         FROM sales_customers c
         LEFT JOIN (
           SELECT customer_id, MIN(id) AS id
           FROM sales_customer_model_mappings
           WHERE is_hidden = 0
           GROUP BY customer_id
         ) m ON m.customer_id = c.id
         WHERE c.is_active = 1`
      );
      const [orderRows] = await pool.query(
        `SELECT COUNT(*) AS c
         FROM sales_orders o
         WHERE o.status <> 'cancelled'
           AND o.created_at >= ? AND o.created_at < ?
           AND (o.warehouse_model IS NULL OR TRIM(o.warehouse_model) = '')`,
        [toSqlDateTimeUtc(monthStart), toSqlDateTimeUtc(monthEnd)]
      );
      customerModelHealth = {
        activeCustomers: Number(customerRows?.[0]?.active_count || 0),
        customersWithoutModelMapping: Number(customerRows?.[0]?.no_mapping_count || 0),
        monthOrdersMissingWarehouseModel: Number(orderRows?.[0]?.c || 0)
      };
    } catch {
      customerModelHealth = null;
    }
  }

  let backupHealth = null;
  if (isSuper) {
    try {
      const staleRunningBefore = toSqlDateTimeUtc(new Date(now.getTime() - 60 * 60 * 1000));
      const recentSuccessFrom = toSqlDateTimeUtc(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const [backupRows] = await pool.query(
        `SELECT
          SUM(CASE WHEN status = 'failed' AND started_at >= ? THEN 1 ELSE 0 END) AS failed_7d,
          SUM(CASE WHEN status = 'running' AND started_at < ? THEN 1 ELSE 0 END) AS stale_running,
          MAX(CASE WHEN job_type = 'backup' AND status = 'success' THEN finished_at ELSE NULL END) AS last_success_at,
          SUM(CASE WHEN job_type = 'backup' AND status = 'success' AND finished_at >= ? THEN 1 ELSE 0 END) AS success_7d
         FROM backup_jobs`,
        [recentSuccessFrom, staleRunningBefore, recentSuccessFrom]
      );
      const br = backupRows?.[0] || {};
      backupHealth = {
        failed7d: Number(br.failed_7d || 0),
        staleRunning: Number(br.stale_running || 0),
        lastSuccessAt: br.last_success_at || null,
        success7d: Number(br.success_7d || 0)
      };
    } catch {
      backupHealth = null;
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

  apiOk(res, {
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
      wecom: canWecom,
      qrcodes: canQrcodes,
      qcYearbooks: canQcYearbooks,
      customers: canCustomerManagement,
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
    alerts: {
      reports: reportAlerts,
      notificationHealth,
      qrcodes: qrcodeAlerts,
      qcYearbooks: qcYearbookHealth,
      customerModels: customerModelHealth,
      backups: backupHealth
    },
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
    apiOk(res, data);
  } catch (err) {
    console.error('[dashboard] activity-heatmap', err);
    res.status(500).json({ code: 500, message: 'HEATMAP_LOAD_FAILED', error: 'HEATMAP_LOAD_FAILED', data: null });
  }
});
