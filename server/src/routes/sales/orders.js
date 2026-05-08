import { Router } from 'express';

// Placeholder skeleton for Orders domain
const router = Router();
router.all('*', (req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED_ORDER_MODULE' });
});

export { router };
