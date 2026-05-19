import './env.js';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
import jwt from 'jsonwebtoken';

import { router as healthRouter } from './routes/health.js';
import { router as authRouter } from './routes/auth.js';
import { router as reportsRouter } from './routes/reports.js';
import { router as qrcodesRouter } from './routes/qrcodes.js';
import { router as stampsRouter } from './routes/stamps.js';
import { router as templatesRouter } from './routes/templates.js';
import { router as qcYearbooksRouter } from './routes/qcYearbooks.js';
import { router as companyRouter } from './routes/company.js';
import { router as employeeCategoriesRouter } from './routes/employeeCategories.js';
import { router as departmentsRouter } from './routes/departments.js';
import { router as usersRouter } from './routes/users.js';
import { router as permissionsRouter } from './routes/permissions.js';
import { router as publicRouter } from './routes/public.js';
import { router as translateRouter } from './routes/translate.js';
import { router as securitySettingsRouter } from './routes/securitySettings.js';
import { router as auditLogsRouter } from './routes/auditLogs.js';
import { router as backupRouter } from './routes/backup.js';
import { startCron } from './scheduler/cron.js';
import { router as supportContactRouter } from './routes/supportContact.js';
import { router as dashboardRouter } from './routes/dashboard.js';
import { router as reportImageLibraryRouter } from './routes/reportImageLibrary.js';
import { router as reportStylesRouter } from './routes/reportStyles.js';
import { router as salesRouter } from './routes/sales.js';
import { router as salesV2Router } from './routes/sales/v2.js';
import { router as salesDomainRouter } from './routes/sales/index.js';
import { router as wecomRouter } from './routes/wecom.js';
import { router as wecomCallbackRouter } from './routes/wecomCallback.js';
import { logErrorEntry, purgeExpiredErrorLogs } from './lib/audit.js';
import { getPool, pingDb } from './db/pool.js';
import {
  ensureReportImageLibraryTable,
  ensureReportStylesTable,
  ensureChairmanAndTotpColumns,
  ensureQuickRoleUserColumns,
  ensureSalesModuleTables,
  ensureSalesInternalModelsTable,
  ensureDepartmentsTable,
  ensureReportsReportUidColumn,
  ensureWecomNotificationsTables,
  ensureWecomNotifyJobsTable,
  ensureUsersWecomUseridColumn,
  ensureUsersAccountTypeManagerEnum,
  ensureWecomReceiveCallbackColumns,
  ensureWecomSecretsWideAndCallbackEvents,
  ensureSalesContractDocumentColumns,
  ensureSalesContractVersioning,
  ensureSalesCustomerCodesWyFormat,
  ensureBackupJobsTable,
  ensureSalesOrderExportJobsTable,
  ensureSupportContactSettingsTable,
  ensureAccountModuleHardeningColumns,
  ensureCompanySettingsColumns,
  ensureStampsSvgFields,
  ensureQcYearbookDataTables
} from './db/ensureSchema.js';
import { apiErrorI18nMiddleware } from './middleware/apiErrorI18n.js';
import { enrichApiErrorBody } from '../../shared/apiErrorZh.js';
import { validateProductionConfigOrExit } from './lib/productionConfig.js';
import { startWecomNotifyWorker } from './lib/wecomNotifyWorker.js';
import { startSalesOrderExportWorker } from './lib/salesOrderExportWorker.js';

const port = Number(process.env.PORT || 3001);
/** 与 admin Vite 开发服务器默认端口一致；API 不得与其共用 */
const ADMIN_VITE_DEV_PORT = 3000;
if (
  port === ADMIN_VITE_DEV_PORT &&
  String(process.env.ALLOW_API_ON_ADMIN_DEV_PORT || '').toLowerCase() !== 'true'
) {
  // eslint-disable-next-line no-console
  console.error(
    '[server] Refusing PORT=3000: reserved for the admin Vite dev server. Set PORT=3001 in server/.env, or ALLOW_API_ON_ADMIN_DEV_PORT=true to override.'
  );
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '12mb' }));
app.use(apiErrorI18nMiddleware());

/** 订单接口 JWT/403 调试日志：仅开发环境且显式开启，禁止在生产输出 */
const ordersHttpDebugEnabled =
  String(process.env.ENABLE_ORDERS_HTTP_DEBUG || '').toLowerCase() === 'true' &&
  process.env.NODE_ENV !== 'production' &&
  process.env.NODE_ENV !== 'prod';

app.use((req, res, next) => {
  if (!ordersHttpDebugEnabled || !String(req.path || '').startsWith('/api/sales/orders')) return next();
  const startedAt = Date.now();
  const targetUser = String(process.env.DEBUG_AUTH_USERNAME || 'SALES-2604-001').trim();
  const authHeader = String(req.headers.authorization || '');
  const hasBearer = /^Bearer\s+/i.test(authHeader);
  let decoded = null;
  if (hasBearer) {
    try {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const d = jwt.decode(token);
      if (d && typeof d === 'object') {
        decoded = {
          username: d.username ?? null,
          accountType: d.accountType ?? null,
          userId: d.userId ?? d.sub ?? null,
          tv: d.tv ?? null,
          order_query: d?.permissions?.order_management?.order_query ?? null
        };
      }
    } catch {
      decoded = null;
    }
  }
  let responseBody = null;
  let forbiddenStack = null;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    responseBody = body;
    if (body && body.error === 'FORBIDDEN') {
      forbiddenStack = new Error('orders-forbidden-stack').stack;
    }
    return originalJson(body);
  };
  res.on('finish', () => {
    // eslint-disable-next-line no-console
    console.log(
      '[orders-http-debug]',
      JSON.stringify({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        hasBearer,
        error: responseBody?.error || null,
        tokenUser: decoded?.username || null,
        tokenUserId: decoded?.userId || null,
        tokenAccountType: decoded?.accountType || null,
        tokenTv: decoded?.tv ?? null,
        tokenOrderQuery: decoded?.order_query ?? null,
        forbiddenStack,
        durationMs: Date.now() - startedAt,
        targetUserHint: targetUser
      })
    );
  });
  next();
});

/** 企业微信回调：仅 POST 解析 XML；GET 验签不能再套 body 解析器，否则可能影响调试与个别代理 */
const wecomCallbackXmlBody = express.text({
  type: ['text/xml', 'application/xml', 'text/plain'],
  limit: '2mb'
});
app.use('/api/wecom/callback', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return wecomCallbackXmlBody(req, res, next);
});
app.use('/api/wecom/callback', wecomCallbackRouter);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 同域提供 jsPDF / html2canvas UMD，供公开报告页导出（外链 CDN 常被拦截）
try {
  const require = createRequire(import.meta.url);
  const jspdfRoot = path.dirname(require.resolve('jspdf/package.json'));
  app.use('/vendor/jspdf', express.static(path.join(jspdfRoot, 'dist')));
} catch {
  // eslint-disable-next-line no-console
  console.warn('[server] jspdf static mount skipped (npm install jspdf)');
}
try {
  const require = createRequire(import.meta.url);
  const h2cRoot = path.dirname(require.resolve('html2canvas/package.json'));
  app.use('/vendor/html2canvas', express.static(path.join(h2cRoot, 'dist')));
} catch {
  // eslint-disable-next-line no-console
  console.warn('[server] html2canvas static mount skipped (npm install html2canvas)');
}

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/qrcodes', qrcodesRouter);
app.use('/api/stamps', stampsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/qc-yearbooks', qcYearbooksRouter);
/** 部分反代会把 `/api` 前缀去掉再转发到 Node，此处挂载同一路由器以兼容 */
app.use('/qc-yearbooks', qcYearbooksRouter);
app.use('/api/company', companyRouter);
app.use('/api/employee-categories', employeeCategoriesRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/users', usersRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/translate', translateRouter);
app.use('/api/security', securitySettingsRouter);
app.use('/api/audit', auditLogsRouter);
app.use('/api', backupRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/report-image-library', reportImageLibraryRouter);
app.use('/api/report-styles', reportStylesRouter);
app.use('/api/sales', salesRouter);
// New v2 API surface (alpha)
app.use('/api/sales/v2', salesV2Router);
// Temporary: legacy aggregate domain router (optional, can be wired later when needed)
app.use('/api/sales-domain', salesDomainRouter);
app.use('/api/wecom', wecomRouter);
app.use('/api/support-contact', supportContactRouter);
app.use('/', publicRouter);

app.get('/', (req, res) => {
  res.type('text').send('qc-report-server');
});

if (String(process.env.ENABLE_API_DOCS || '').toLowerCase() === 'true') {
  try {
    const { mountApiDocs } = await import('./setupApiDocs.js');
    mountApiDocs(app);
    // eslint-disable-next-line no-console
    console.log('[server] API docs: http://localhost:' + port + '/api-docs');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[server] API docs mount skipped:', e?.message || e);
  }
}

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // eslint-disable-next-line no-console
  console.error(err);
  const status = Number(err.statusCode || err.status) || 500;
  if (err.code === 'ER_NO_SUCH_TABLE') {
    return res.status(500).json(
      enrichApiErrorBody({
        error: 'DB_SCHEMA_OUTDATED',
        message: '数据库结构不匹配，请联系管理员执行迁移或更新服务'
      })
    );
  }
  if (status >= 500) {
    logErrorEntry(getPool(), {
      module: 'server',
      message: err.message || String(err),
      stack: err.stack || null,
      code: String(status),
      meta: { path: req.path, method: req.method }
    }).catch(() => {});
  }
  const httpStatus = status >= 400 && status < 600 ? status : 500;
  const payload =
    httpStatus >= 500
      ? { error: 'INTERNAL_ERROR' }
      : { error: 'BAD_REQUEST' };
  res.status(httpStatus).json(enrichApiErrorBody(payload));
});

async function start() {
  // 生产安全基线强制校验（置于最前，尽早失败）
  validateProductionConfigOrExit();

  try {
    await pingDb();
    await ensureUsersAccountTypeManagerEnum();
    await ensureAccountModuleHardeningColumns();
    await ensureCompanySettingsColumns();
    await ensureReportsReportUidColumn();
    await ensureReportImageLibraryTable();
    await ensureChairmanAndTotpColumns();
    await ensureReportStylesTable();
    await ensureQuickRoleUserColumns();
    await ensureSalesModuleTables();
    await ensureSalesOrderExportJobsTable();
    await ensureSalesCustomerCodesWyFormat();
    await ensureSalesInternalModelsTable();
    await ensureSalesContractDocumentColumns();
    await ensureSalesContractVersioning();
    await ensureDepartmentsTable();
    await ensureWecomNotificationsTables();
    await ensureWecomNotifyJobsTable();
    await ensureUsersWecomUseridColumn();
    await ensureWecomReceiveCallbackColumns();
    await ensureWecomSecretsWideAndCallbackEvents();
    await ensureBackupJobsTable();
    await ensureSupportContactSettingsTable();
    await ensureStampsSvgFields();
    await ensureQcYearbookDataTables();
    await purgeExpiredErrorLogs();
    // eslint-disable-next-line no-console
    console.log('[server] db connected');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[server] db connection failed', e?.message || e);
  }
  // Start backup cron if enabled
  const enable = (process.env.BACKUP_ENABLED || 'false').toLowerCase() === 'true';
  const cronExpr = process.env.BACKUP_CRON || '0 2 * * *';
  if (enable) {
    try { startCron(cronExpr); // eslint-disable-next-line no-console
      console.log('[server] backup cron started', cronExpr); } catch (e) {
      console.error('[server] backup cron start failed', e?.message || e);
    }
  }
  const host = process.env.LISTEN_HOST || '0.0.0.0';
  const server = app.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://${host}:${port}`);
    if (String(process.env.WECOM_NOTIFY_WORKER_DISABLED || '').toLowerCase() !== 'true') {
      const wms = Number(process.env.WECOM_NOTIFY_WORKER_MS || 5000);
      startWecomNotifyWorker(Number.isFinite(wms) && wms >= 2000 ? wms : 5000);
    }
    if (String(process.env.SALES_ORDER_EXPORT_WORKER_DISABLED || '').toLowerCase() !== 'true') {
      const oems = Number(process.env.SALES_ORDER_EXPORT_WORKER_MS || 4000);
      startSalesOrderExportWorker(Number.isFinite(oems) && oems >= 2000 ? oems : 4000);
    }
  });
  server.on('error', (err) => {
    if (err?.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.error(
        `[server] port ${port} is already in use. Close the other node process (e.g. taskkill) or set a different PORT in .env.`
      );
    } else {
      // eslint-disable-next-line no-console
      console.error('[server] listen failed', err?.message || err);
    }
    process.exit(1);
  });
}

start();
