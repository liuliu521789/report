import { Router } from 'express';

import { router as orderFieldsRouter } from './orderFieldsRouter.js';
import { router as settingsRouter } from './settingsRouter.js';
import { router as customersRouter } from './customersRouter.js';
import { router as internalModelsRouter } from './internalModelsRouter.js';
import { router as messagesRouter } from './messagesRouter.js';
import { router as ordersCrudRouter } from './ordersCrudRouter.js';
import { router as ordersFlowRouter } from './ordersFlowRouter.js';
import { router as ordersExportImportRouter } from './ordersExportImportRouter.js';
import { router as miscRouter } from './miscRouter.js';

export function createSalesOrdersRouter() {
  const router = Router();

  router.use(orderFieldsRouter);
  router.use(settingsRouter);
  router.use(customersRouter);
  router.use(internalModelsRouter);
  router.use(messagesRouter);
  router.use(ordersCrudRouter);
  router.use(ordersFlowRouter);
  router.use(ordersExportImportRouter);
  router.use(miscRouter);

  return router;
}
