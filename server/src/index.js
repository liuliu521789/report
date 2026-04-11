import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

import { router as healthRouter } from './routes/health.js';
import { router as authRouter } from './routes/auth.js';
import { router as reportsRouter } from './routes/reports.js';
import { router as qrcodesRouter } from './routes/qrcodes.js';
import { router as stampsRouter } from './routes/stamps.js';
import { router as templatesRouter } from './routes/templates.js';
import { router as companyRouter } from './routes/company.js';
import { router as employeeCategoriesRouter } from './routes/employeeCategories.js';
import { router as departmentsRouter } from './routes/departments.js';
import { router as usersRouter } from './routes/users.js';
import { router as publicRouter } from './routes/public.js';
import { router as translateRouter } from './routes/translate.js';
import { router as securitySettingsRouter } from './routes/securitySettings.js';
import { router as auditLogsRouter } from './routes/auditLogs.js';
import { router as supportContactRouter } from './routes/supportContact.js';
import { router as dashboardRouter } from './routes/dashboard.js';
import { router as reportImageLibraryRouter } from './routes/reportImageLibrary.js';
import { router as reportStylesRouter } from './routes/reportStyles.js';
import { router as salesRouter } from './routes/sales.js';
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
  ensureSalesInternalMessagesTable,
  ensureDepartmentsTable,
  ensureReportsReportUidColumn,
  ensureWecomNotificationsTables,
  ensureUsersWecomUseridColumn,
  ensureUsersAccountTypeManagerEnum,
  ensureWecomReceiveCallbackColumns,
  ensureSalesContractDocumentColumns
} from './db/ensureSchema.js';
import { apiErrorI18nMiddleware } from './middleware/apiErrorI18n.js';
import { enrichApiErrorBody } from '../../shared/apiErrorZh.js';

const app = express();
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(apiErrorI18nMiddleware());

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
app.use('/api/company', companyRouter);
app.use('/api/employee-categories', employeeCategoriesRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/users', usersRouter);
app.use('/api/translate', translateRouter);
app.use('/api/security', securitySettingsRouter);
app.use('/api/audit', auditLogsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/report-image-library', reportImageLibraryRouter);
app.use('/api/report-styles', reportStylesRouter);
app.use('/api/sales', salesRouter);
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
    console.log('[server] API docs: http://localhost:' + Number(process.env.PORT || 3001) + '/api-docs');
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

const port = Number(process.env.PORT || 3001);

async function start() {
  try {
    await pingDb();
    await ensureUsersAccountTypeManagerEnum();
    await ensureReportsReportUidColumn();
    await ensureReportImageLibraryTable();
    await ensureChairmanAndTotpColumns();
    await ensureReportStylesTable();
    await ensureQuickRoleUserColumns();
    await ensureSalesModuleTables();
    await ensureSalesContractDocumentColumns();
    await ensureDepartmentsTable();
    await ensureWecomNotificationsTables();
    await ensureUsersWecomUseridColumn();
    await ensureWecomReceiveCallbackColumns();
    await purgeExpiredErrorLogs();
    // eslint-disable-next-line no-console
    console.log('[server] db connected');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[server] db connection failed', e?.message || e);
  }
  try {
    await ensureSalesInternalMessagesTable();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[server] ensure sales_internal_messages failed', e?.message || e);
  }
  const host = process.env.LISTEN_HOST || '0.0.0.0';
  app.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on http://${host}:${port}`);
  });
}

start();

