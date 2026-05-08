import { Router } from 'express';
// import { router as ordersRouter } from './orders.js';
import { router as customersRouter } from './customers.js';
import { router as contractsRouter } from './contracts.js';
import { router as internalModelsRouter } from './internal-models.js';
const router = Router();
// router.use('/orders', ordersRouter);
router.use('/customers', customersRouter);
router.use('/contracts', contractsRouter);
router.use('/internal-models', internalModelsRouter);

export { router };
