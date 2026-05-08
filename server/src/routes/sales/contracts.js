import { Router } from 'express';
const router = Router();
router.all('*', (req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED_CONTRACT_MODULE' });
});
export { router };
