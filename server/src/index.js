import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { router as healthRouter } from './routes/health.js';
import { router as authRouter } from './routes/auth.js';
import { router as reportsRouter } from './routes/reports.js';
import { router as qrcodesRouter } from './routes/qrcodes.js';
import { router as stampsRouter } from './routes/stamps.js';
import { router as templatesRouter } from './routes/templates.js';
import { router as companyRouter } from './routes/company.js';
import { router as employeeCategoriesRouter } from './routes/employeeCategories.js';
import { router as usersRouter } from './routes/users.js';
import { router as publicRouter } from './routes/public.js';
import { router as translateRouter } from './routes/translate.js';
import { router as securitySettingsRouter } from './routes/securitySettings.js';
import { router as auditLogsRouter } from './routes/auditLogs.js';
import { logErrorEntry, purgeExpiredErrorLogs } from './lib/audit.js';
import { getPool, pingDb } from './db/pool.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/qrcodes', qrcodesRouter);
app.use('/api/stamps', stampsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/company', companyRouter);
app.use('/api/employee-categories', employeeCategoriesRouter);
app.use('/api/users', usersRouter);
app.use('/api/translate', translateRouter);
app.use('/api/security', securitySettingsRouter);
app.use('/api/audit', auditLogsRouter);
app.use('/', publicRouter);

app.get('/', (req, res) => {
  res.type('text').send('qc-report-server');
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // eslint-disable-next-line no-console
  console.error(err);
  const status = Number(err.statusCode || err.status) || 500;
  if (status >= 500) {
    logErrorEntry(getPool(), {
      module: 'server',
      message: err.message || String(err),
      stack: err.stack || null,
      code: String(status),
      meta: { path: req.path, method: req.method }
    }).catch(() => {});
  }
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: err.code || err.message || 'INTERNAL_ERROR'
  });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, async () => {
  try {
    await pingDb();
    await purgeExpiredErrorLogs();
    // eslint-disable-next-line no-console
    console.log('[server] db connected');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[server] db connection failed', e?.message || e);
  }
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}`);
});

