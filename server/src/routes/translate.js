import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, requireAnyPermissionPairs } from '../middleware/auth.js';

export const router = Router();
router.use(requireAuth);
router.use(
  requireAnyPermissionPairs([
    ['templates', 'use'],
    ['reports', 'edit']
  ])
);

const reqSchema = z.object({
  q: z.string().min(1).max(2000),
  source: z.string().min(1).max(10).optional().default('zh'),
  target: z.string().min(1).max(10).optional().default('en'),
  format: z.string().max(20).optional().default('text')
});

function getLibreConfig() {
  const enabled = String(process.env.LIBRETRANSLATE_ENABLED || '').toLowerCase() === 'true';
  const baseUrl = String(process.env.LIBRETRANSLATE_URL || '').trim();
  return { enabled, baseUrl };
}

router.post('/', async (req, res) => {
  const parsed = reqSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { q, source, target, format } = parsed.data;

  const { enabled, baseUrl } = getLibreConfig();
  if (!enabled || !baseUrl) {
    // 未配置翻译服务时，直接回退为原文（保证系统可用）
    return res.json({ translatedText: q });
  }

  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${base}/translate`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, source, target, format })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return res.status(502).json({ error: 'TRANSLATE_FAILED', details: text });
  }

  const data = await resp.json();
  // LibreTranslate: { translatedText: '...' }
  return res.json({ translatedText: data.translatedText ?? '' });
});

