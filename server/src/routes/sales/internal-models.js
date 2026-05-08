import { Router } from 'express';
const router = Router();
router.all('*', (req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED_INTERNAL_MODELS_MODULE' });
});
export { router };
