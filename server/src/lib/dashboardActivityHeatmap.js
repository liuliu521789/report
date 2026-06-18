const HEATMAP_TZ = 'Asia/Shanghai';
/** 返回 YYYY-MM-DD 字符串，避免 CONVERT_TZ 依赖时区表；与 mysql2 Date 解析兼容 */
const DATE_KEY_SQL = `DATE_FORMAT(created_at, '%Y-%m-%d')`;

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatYmdInTz(d, timeZone = HEATMAP_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
}

/** @deprecated use formatYmdInTz */
export function dateKeyUtc(d) {
  return formatYmdInTz(d);
}

function toSqlDateTimeUtc(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

export function shanghaiDayStartUtc(ymd) {
  return new Date(`${ymd}T00:00:00+08:00`);
}

export function addYmdDays(ymd, delta) {
  const t = shanghaiDayStartUtc(ymd).getTime() + delta * 86400000;
  return formatYmdInTz(new Date(t));
}

function weekdayMon0Shanghai(ymd) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: HEATMAP_TZ, weekday: 'short' }).format(
    shanghaiDayStartUtc(ymd)
  );
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[wd] ?? 0;
}

/**
 * Build contiguous calendar day keys (Asia/Shanghai) from start through end inclusive.
 */
export function buildUtcDayRange(startYmd, endYmd) {
  const days = [];
  let cur = startYmd;
  while (cur <= endYmd) {
    days.push(cur);
    cur = addYmdDays(cur, 1);
  }
  return days;
}

/**
 * Last 53 weeks aligned to Monday (Asia/Shanghai), ending today (Shanghai).
 */
export function heatmapUtcRange(now = new Date()) {
  const endYmd = formatYmdInTz(now);
  const weeks = 53;
  let startYmd = endYmd;
  for (let i = 0; i < weeks * 7 - 1; i += 1) startYmd = addYmdDays(startYmd, -1);
  const offset = weekdayMon0Shanghai(startYmd);
  if (offset > 0) startYmd = addYmdDays(startYmd, -offset);
  return {
    startYmd,
    endYmd,
    rangeStart: shanghaiDayStartUtc(startYmd),
    rangeEnd: shanghaiDayStartUtc(endYmd)
  };
}

export function normalizeRowDateKey(val) {
  if (val == null || val === '') return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return formatYmdInTz(val);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

export function rowsToCountMap(rows) {
  const map = {};
  for (const r of rows || []) {
    const key = normalizeRowDateKey(r?.d ?? r?.day);
    if (!key) continue;
    map[key] = Number(r?.c || r?.count || 0);
  }
  return map;
}

export function packHeatmapDays(dayKeys, countMap) {
  let total = 0;
  let max = 0;
  const days = dayKeys.map((date) => {
    const count = Number(countMap[date] || 0);
    total += count;
    if (count > max) max = count;
    return { date, count };
  });
  return { days, total, max };
}

/** @returns {Array<{ type: string, label: string, title: string, subtitle: string, scope: string }>} */
export function listHeatmapOptions(ctx) {
  const options = [];
  const { isSuper, canReports, canSalesOrders, seeAllSales, uid } = ctx;

  if (canReports) {
    options.push({
      type: 'reports',
      label: '报告生成',
      title: isSuper ? '全站报告生成' : '我的报告生成',
      subtitle: isSuper ? '近 52 周 · 有效报告' : '近 52 周 · 本人录入',
      scope: isSuper ? 'all' : 'self'
    });
  }
  if (canSalesOrders && uid != null) {
    const allScope = isSuper || seeAllSales;
    options.push({
      type: 'sales_orders',
      label: '订单录入',
      title: allScope ? '订单业务活跃' : '我的订单录入',
      subtitle: allScope ? '近 52 周 · 全站新建' : '近 52 周 · 本人录入',
      scope: allScope ? 'all' : 'self'
    });
  }
  if (uid != null) {
    options.push({
      type: 'operations',
      label: '系统操作',
      title: '我的系统操作',
      subtitle: '近 52 周 · 操作日志',
      scope: 'self'
    });
  }
  return options;
}

export function pickHeatmapSource(options, requestedType, { preferSalesOrders = false } = {}) {
  if (!options.length) return null;
  const t = String(requestedType || '').trim();
  if (t) {
    const found = options.find((o) => o.type === t);
    if (found) return found;
  }
  if (preferSalesOrders) {
    const sales = options.find((o) => o.type === 'sales_orders');
    if (sales) return sales;
  }
  return options[0];
}

/** @deprecated use pickHeatmapSource(listHeatmapOptions(ctx)) */
export function resolveHeatmapSource(ctx) {
  return pickHeatmapSource(listHeatmapOptions(ctx), null, {
    preferSalesOrders: !!ctx.preferSalesOrders
  });
}

async function queryHeatmapRows(pool, source, uid, sqlFrom, sqlTo) {
  const { type, scope } = source;
  const uidNum = uid != null ? Number(uid) : null;

  if (type === 'reports') {
    let sql = `SELECT ${DATE_KEY_SQL} AS d, COUNT(*) AS c
       FROM reports
       WHERE status = 'active' AND created_at >= ? AND created_at < ?`;
    const args = [sqlFrom, sqlTo];
    if (scope === 'self' && uidNum != null) {
      sql += ' AND created_by = ?';
      args.push(uidNum);
    }
    sql += ` GROUP BY ${DATE_KEY_SQL}`;
    const [rows] = await pool.query(sql, args);
    return rows;
  }
  if (type === 'sales_orders') {
    const dateExpr = `DATE_FORMAT(o.created_at, '%Y-%m-%d')`;
    let sql = `SELECT ${dateExpr} AS d, COUNT(*) AS c
       FROM sales_orders o
       WHERE o.status <> 'cancelled' AND o.created_at >= ? AND o.created_at < ?`;
    const args = [sqlFrom, sqlTo];
    if (scope === 'self' && uidNum != null) {
      sql += ' AND o.created_by = ?';
      args.push(uidNum);
    }
    sql += ` GROUP BY ${dateExpr}`;
    const [rows] = await pool.query(sql, args);
    return rows;
  }
  if (type === 'operations') {
    const [rows] = await pool.query(
      `SELECT ${DATE_KEY_SQL} AS d, COUNT(*) AS c
       FROM operation_logs
       WHERE user_id = ? AND created_at >= ? AND created_at < ?
       GROUP BY ${DATE_KEY_SQL}`,
      [uidNum, sqlFrom, sqlTo]
    );
    return rows;
  }
  return [];
}

export async function fetchActivityHeatmap(pool, ctx) {
  const options = listHeatmapOptions(ctx);
  const source = pickHeatmapSource(options, ctx.requestedType, {
    preferSalesOrders: !!ctx.preferSalesOrders
  });
  if (!source) return null;

  const { startYmd, endYmd, rangeStart } = heatmapUtcRange();
  const dayKeys = buildUtcDayRange(startYmd, endYmd);
  const sqlFrom = toSqlDateTimeUtc(rangeStart);
  const sqlTo = toSqlDateTimeUtc(new Date(shanghaiDayStartUtc(addYmdDays(endYmd, 1)).getTime()));

  const rows = await queryHeatmapRows(pool, source, ctx.uid, sqlFrom, sqlTo);
  const { days, total, max } = packHeatmapDays(dayKeys, rowsToCountMap(rows));

  return {
    type: source.type,
    title: source.title,
    subtitle: source.subtitle,
    scope: source.scope,
    types: options.map((o) => ({ type: o.type, label: o.label })),
    startDate: dayKeys[0] || startYmd,
    endDate: dayKeys[dayKeys.length - 1] || endYmd,
    days,
    total,
    max
  };
}
