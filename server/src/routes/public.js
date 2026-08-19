import { Router } from 'express';

import { router as qrcodeScanRouter } from './public/qrcodeScanRouter.js';
import { router as wecomPublicRouter } from './public/wecomPublicRouter.js';
import { router as reportPublicRouter } from './public/reportPublicRouter.js';

export const router = Router();

router.use(qrcodeScanRouter);
router.use(wecomPublicRouter);
router.use(reportPublicRouter);
