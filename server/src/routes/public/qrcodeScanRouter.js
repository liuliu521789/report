import { Router } from 'express';

import { getPool } from '../../db/pool.js';

export const router = Router();

// Public "scan" endpoint for WeChat/browser users.
// Keep a stable HTTP URL and route users to a mobile-friendly landing page.
async function handleScan(req, res) {
  const token = String(req.params.token || '').trim();
  if (!token) return res.status(400).type('text').send('bad token');

  const pool = getPool();
  const [qrRows] = await pool.query('SELECT id FROM qrcodes WHERE token=? LIMIT 1', [token]);
  const qr = qrRows?.[0];
  if (!qr) return res.status(404).type('text').send('not found');

  // 相对路径跳转：始终留在用户扫码时访问的 Host 上，避免 PUBLIC_BASE_URL 与手机实际域名不一致导致外置浏览器空白/无地址。
  res.redirect(302, `/api/public/scan?token=${encodeURIComponent(token)}`);
}

router.get('/api/public/qr/:token', handleScan);
router.get('/qr/:token', handleScan);
// Backward compatible: older QR links used /mp/qr/:token
router.get('/mp/qr/:token', handleScan);

// Public landing page after scanning QR code from WeChat/browser.
function sendScanLandingHtml(req, res) {
  res.type('html').send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>产品质量检测报告单</title>
    <style>
      :root {
        --title-blue: #1a3a5f;
        --text-sub: #666666;
        --green: #00c06b;
        --green-border: #b7eb8f;
        --card-bg: #ffffff;
        --sep: #e8e8e8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(180deg, #e8f2ff 0%, #f0f6fc 35%, #f7f8fa 100%);
        color: #333;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .page {
        max-width: 480px;
        margin: 0 auto;
        padding: 16px 18px 28px;
        padding-bottom: calc(28px + env(safe-area-inset-bottom, 0px));
      }
      .top-refresh {
        text-align: right;
        margin-bottom: 8px;
      }
      .top-refresh button {
        border: none;
        background: transparent;
        color: #94a3b8;
        font-size: 13px;
        padding: 4px 0;
      }
      .doc-label {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        margin-bottom: 20px;
      }
      .doc-label .deco {
        color: #cbd5e1;
        font-size: 11px;
        letter-spacing: -1px;
        transform: rotate(-12deg);
        opacity: 0.85;
      }
      .doc-label .label-text {
        font-size: 12px;
        color: #94a3b8;
        font-weight: 400;
      }
      .hero {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 22px;
      }
      .hero-text { flex: 1; min-width: 0; }
      .hero-text h1 {
        margin: 0;
        font-size: 26px;
        font-weight: 700;
        color: var(--title-blue);
        letter-spacing: 0.5px;
        line-height: 1.25;
      }
      .hero-text .bind {
        margin: 10px 0 0;
        font-size: 14px;
        color: var(--text-sub);
      }
      .hero-art {
        flex-shrink: 0;
        width: 108px;
        height: 88px;
      }
      .hero-art svg { width: 100%; height: 100%; display: block; }
      .report-list { display: flex; flex-direction: column; gap: 14px; }
      .report-card {
        background: var(--card-bg);
        border: 1px solid var(--green-border);
        border-radius: 12px;
        padding: 16px 14px 14px;
        box-shadow: 0 2px 12px rgba(0, 192, 107, 0.06);
      }
      .report-card .no {
        font-size: 15px;
        font-weight: 600;
        color: #374151;
        margin: 0;
      }
      .report-card .sep {
        height: 1px;
        background: var(--sep);
        margin: 12px 0 12px;
      }
      .report-card .meta {
        font-size: 14px;
        color: var(--text-sub);
        line-height: 1.6;
        margin: 0;
      }
      .report-card .meta + .meta { margin-top: 4px; }
      .report-card .no.meta-sm { font-size: 13px; opacity: 0.9; margin-top: 4px; }
      .btn-detail {
        display: block;
        width: 100%;
        margin-top: 14px;
        padding: 12px 16px;
        border: none;
        border-radius: 10px;
        background: var(--green);
        color: #fff;
        font-size: 15px;
        font-weight: 500;
        text-align: center;
        text-decoration: none;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .btn-detail:active { opacity: 0.92; }
      .error {
        margin: 12px 0;
        color: #cf1322;
        font-size: 14px;
        white-space: pre-wrap;
      }
      .empty {
        text-align: center;
        padding: 40px 16px;
        color: var(--text-sub);
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="top-refresh"><button type="button" id="refresh">刷新</button></div>
      <div class="doc-label">
        <span class="deco">////</span>
        <span class="label-text">产品质量检测报告单</span>
        <span class="deco">////</span>
      </div>
      <div class="hero">
        <div class="hero-text">
          <h1>报告汇总</h1>
          <p class="bind">绑定报告：<span id="count">0</span>条</p>
        </div>
        <div class="hero-art" aria-hidden="true">
          <svg viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="gPaper" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#5b9cf5"/>
                <stop offset="100%" style="stop-color:#3d7dd9"/>
              </linearGradient>
              <linearGradient id="gLens" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#7eb8ff"/>
                <stop offset="100%" style="stop-color:#4a90e2"/>
              </linearGradient>
            </defs>
            <rect x="18" y="12" width="52" height="68" rx="6" fill="url(#gPaper)" opacity="0.95"/>
            <rect x="24" y="22" width="28" height="3" rx="1" fill="#fff" opacity="0.9"/>
            <rect x="24" y="30" width="36" height="3" rx="1" fill="#fff" opacity="0.65"/>
            <rect x="24" y="38" width="32" height="3" rx="1" fill="#fff" opacity="0.65"/>
            <rect x="26" y="48" width="8" height="8" rx="2" fill="none" stroke="#fff" stroke-width="2" opacity="0.85"/>
            <rect x="38" y="48" width="8" height="8" rx="2" fill="#fff" opacity="0.35"/>
            <path d="M62 58 L88 32" stroke="#f5c542" stroke-width="5" stroke-linecap="round"/>
            <path d="M86 30 L94 22 L98 38 Z" fill="#f5c542"/>
            <circle cx="82" cy="58" r="22" fill="none" stroke="url(#gLens)" stroke-width="5"/>
            <circle cx="82" cy="58" r="14" fill="rgba(255,255,255,0.25)"/>
          </svg>
        </div>
      </div>
      <div id="error" class="error"></div>
      <div id="list" class="report-list"></div>
    </div>
    <script>
      const qs = new URLSearchParams(location.search);
      const token = (qs.get('token') || '').trim();

      function esc(s) {
        return String(s)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function renderList(reports) {
        const list = document.getElementById('list');
        if (!reports || reports.length === 0) {
          list.innerHTML = '<div class="empty">暂无绑定报告</div>';
          return;
        }
        list.innerHTML = reports.map((r) => {
          const pubBase = location.pathname.indexOf('/api/public/') === 0 ? '/api/public' : '';
          const reportPath = pubBase ? pubBase + '/report.html' : '/miniprogram/report.html';
          const href = reportPath + '?token=' + encodeURIComponent(token) + '&id=' + encodeURIComponent(r.id);
          return (
            '<div class="report-card">' +
              '<p class="no">报告编号：' + esc(r.reportNo || '-') + '</p>' +
              '<div class="sep"></div>' +
              '<p class="meta">产品：' + esc(r.productName || '-') + '</p>' +
              '<p class="meta">批次：' + esc(r.batchNo || '-') + '</p>' +
              '<a class="btn-detail" href="' + href + '">点击查看详情</a>' +
            '</div>'
          );
        }).join('');
      }

      async function load(forceRefresh) {
        const errEl = document.getElementById('error');
        errEl.textContent = '';
        if (!token) {
          errEl.textContent = '缺少访问参数';
          return;
        }
        try {
          const url =
            '/api/public/summary?token=' +
            encodeURIComponent(token) +
            (forceRefresh ? '&_t=' + Date.now() : '');
          const res = await fetch(url, {
            cache: forceRefresh ? 'no-store' : 'default'
          });
          const data = await res.json();
          if (!res.ok) throw new Error(JSON.stringify(data));
          const reports = data.reports || [];
          document.getElementById('count').textContent = String(reports.length);
          renderList(reports);
        } catch (e) {
          errEl.textContent = '加载失败：' + (e?.message || e);
        }
      }

      document.getElementById('refresh').addEventListener('click', async function () {
        const btn = this;
        const old = btn.textContent;
        btn.disabled = true;
        btn.textContent = '刷新中...';
        try {
          await load(true);
          btn.textContent = '已刷新';
          setTimeout(function () {
            btn.textContent = old;
          }, 900);
        } finally {
          btn.disabled = false;
        }
      });
      load();
    </script>
  </body>
</html>`);
}

router.get('/scan.html', sendScanLandingHtml);
router.get('/api/public/scan', sendScanLandingHtml);
router.get('/miniprogram/index.html', sendScanLandingHtml);
