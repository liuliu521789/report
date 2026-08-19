import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';

import { createSalesOrdersRouter } from './sales/ordersRouter.js';
import { router as contractsRouter } from './sales/contractsRouter.js';
import { router as orderCalcRulesRouter } from './sales/orderCalcRulesRouter.js';

export const router = Router();

router.use(requireAuth);

router.use(createSalesOrdersRouter());
router.use(contractsRouter);
router.use(orderCalcRulesRouter);
