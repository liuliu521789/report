import { Router } from 'express';
import puppeteer from 'puppeteer';

import { getPool } from '../db/pool.js';
import {
  getCompanySettings,
  getReportCustomerPayload,
  normalizePublicSummaryAssets
} from '../lib/reportCustomerPayload.js';
import { verifyWecomShipToken } from '../lib/wecomShipToken.js';
import { performWecomQuickShip } from '../lib/wecomOrderQuickShip.js';
import {
  attachCustomerNamesToOrders,
  formatWarehouseWecomOrderDetail,
  loadOrderFieldDefinitions
} from '../lib/salesOrderFields.js';

export const router = Router();

function mapActiveStamps(rows) {
  const out = {
    departmentQc: null,
    inspector: null,
    supervisor: null,
    pass: null,
    recheck: null
  };
  for (const r of rows || []) {
    if (r.sealType === 'department_qc') out.departmentQc = r;
    if (r.sealType === 'inspector') out.inspector = r;
    if (r.sealType === 'supervisor') out.supervisor = r;
    if (r.sealType === 'pass') out.pass = r;
    if (r.sealType === 'recheck') out.recheck = r;
  }
  return out;
}

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

function wecomShipEscapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wecomOrderShipResultHtml(ok, title, message) {
  const accent = ok ? '#16a34a' : '#dc2626';
  const icon = ok ? '✓' : '!';
  const safeTitle = wecomShipEscapeHtml(title);
  const safeMsg = wecomShipEscapeHtml(message);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${safeTitle}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        background: #f1f5f9; color: #0f172a; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .card { background: #fff; border-radius: 12px; padding: 28px 24px; max-width: 400px; width: 100%; box-shadow: 0 4px 24px rgba(15,23,42,0.08); text-align: center; }
      .icon { width: 52px; height: 52px; margin: 0 auto 16px; border-radius: 50%; background: ${accent}; color: #fff; font-size: 28px; line-height: 52px; font-weight: 700; }
      h1 { font-size: 18px; margin: 0 0 10px; }
      p { margin: 0; font-size: 15px; color: #475569; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon" aria-hidden="true">${icon}</div>
      <h1>${safeTitle}</h1>
      <p>${safeMsg}</p>
    </div>
  </body>
</html>`;
}

function escapeHtmlAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** 企业微信卡片整块同 URL：先进此页展示摘要，仅页面底部按钮跳转真正发货接口，避免误点正文即发货 */
function wecomOrderShipConfirmPageHtml({ orderNo, orderDetailText, canShip, shipHref, blockReason }) {
  const detailRaw =
    orderDetailText != null && String(orderDetailText).trim() !== ''
      ? String(orderDetailText)
      : `订单号：${orderNo || '—'}`;
  const detailHtml = `<div class="order-detail">${wecomShipEscapeHtml(detailRaw)}</div>`;
  const reasonHtml = blockReason
    ? `<p class="hint-warn">${wecomShipEscapeHtml(blockReason)}</p>`
    : '';
  const btnHtml = canShip
    ? `<a class="btn-ship" href="${escapeHtmlAttr(shipHref)}">完成发货</a>`
    : '';
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>确认发货</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        background: #f1f5f9; color: #0f172a; display: flex; align-items: center; justify-content: center;
        padding: 24px; padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
      .card { background: #fff; border-radius: 12px; padding: 24px 22px 26px; max-width: 420px; width: 100%;
        box-shadow: 0 4px 24px rgba(15,23,42,0.08); }
      h1 { font-size: 18px; margin: 0 0 14px; text-align: center; }
      .order-detail {
        white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 1.55; color: #334155;
        background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px 14px; border-radius: 10px;
        margin: 0 0 16px; text-align: left;
      }
      p.lead { margin: 0 0 14px; font-size: 15px; color: #334155; line-height: 1.55; }
      .hint-warn { margin: 0 0 12px; font-size: 14px; color: #b45309; line-height: 1.5; }
      .btn-ship {
        display: block; width: 100%; margin-top: 20px; padding: 14px 16px; border-radius: 10px;
        background: #16a34a; color: #fff !important; font-size: 16px; font-weight: 600; text-align: center;
        text-decoration: none; -webkit-tap-highlight-color: transparent;
      }
      .btn-ship:active { opacity: 0.92; }
      .fine { margin: 14px 0 0; font-size: 12px; color: #94a3b8; line-height: 1.45; text-align: center; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>确认发货</h1>
      ${detailHtml}
      <p class="lead">请对照以上信息确认备货无误后，点击下方按钮将本单标记为「已发货」。打开本页不会自动发货。</p>
      ${reasonHtml}
      ${btnHtml}
      <p class="fine">若按钮不可用，请回到电脑端订单管理处理，或联系财务重新推送。</p>
    </div>
  </body>
</html>`;
}

/** 自检：在手机/企业微信中打开，确认能访问到本服务（与「完成发货」同机同域） */
router.get('/api/public/wecom-order-ship-probe', (req, res) => {
  res.type('text').send('wecom-ship-probe-ok');
});

router.get('/api/public/wecom-order-ship-confirm', async (req, res) => {
  try {
    const token = String(req.query.t || '').trim();
    if (!token) {
      return res
        .status(400)
        .type('html')
        .send(
          wecomOrderShipResultHtml(false, '无法打开', '链接无效，请从企业微信订单卡片重新进入。')
        );
    }
    let orderId;
    try {
      ({ orderId } = verifyWecomShipToken(token));
    } catch {
      return res
        .status(400)
        .type('html')
        .send(
          wecomOrderShipResultHtml(
            false,
            '链接无效或已过期',
            '请让财务重新审核通过，或联系管理员检查服务器时间与 JWT 配置。'
          )
        );
    }
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM sales_orders WHERE id = ? LIMIT 1', [orderId]);
    const row = rows?.[0];
    if (!row) {
      return res
        .status(404)
        .type('html')
        .send(wecomOrderShipResultHtml(false, '订单不存在', '该订单可能已删除。'));
    }
    const orderNo = row.order_no != null ? String(row.order_no) : '';
    const status = row.status != null ? String(row.status) : '';
    const definitions = await loadOrderFieldDefinitions(pool, { activeOnly: true });
    const enriched = await attachCustomerNamesToOrders(pool, [row]);
    const orderDetailText = formatWarehouseWecomOrderDetail(enriched[0], definitions);
    const pubBase = String(process.env.PUBLIC_BASE_URL || '')
      .trim()
      .replace(/\/$/, '');
    const origin = pubBase || `${req.protocol}://${req.get('host') || ''}`;
    const shipHref = `${origin}/api/public/wecom-order-ship?t=${encodeURIComponent(token)}`;

    if (status === 'shipped') {
      return res
        .type('html')
        .send(
          wecomOrderShipConfirmPageHtml({
            orderNo,
            orderDetailText,
            canShip: false,
            shipHref,
            blockReason: '该订单已是「已发货」状态，无需重复操作。'
          })
        );
    }
    if (status !== 'approved') {
      return res
        .type('html')
        .send(
          wecomOrderShipConfirmPageHtml({
            orderNo,
            orderDetailText,
            canShip: false,
            shipHref,
            blockReason: '当前订单状态不允许从本页发货（可能已撤回或未在「已审核」状态）。请在电脑端查看订单。'
          })
        );
    }
    return res
      .type('html')
      .send(
        wecomOrderShipConfirmPageHtml({
          orderNo,
          orderDetailText,
          canShip: true,
          shipHref,
          blockReason: ''
        })
      );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[wecom-order-ship-confirm]', e?.message || e);
    return res
      .status(500)
      .type('html')
      .send(
        wecomOrderShipResultHtml(false, '暂时无法打开', '服务器异常，请稍后在电脑端订单管理中发货。')
      );
  }
});

/** 企业微信确认页内「完成发货」：GET 即执行发货（JWT 链接，无需登录） */
router.get('/api/public/wecom-order-ship', async (req, res) => {
  try {
    const token = String(req.query.t || '').trim();
    if (!token) {
      return res
        .status(400)
        .type('html')
        .send(
          wecomOrderShipResultHtml(
            false,
            '无法发货',
            '链接无效，请先打开确认页后点击下方「完成发货」按钮。'
          )
        );
    }
    let orderId;
    try {
      ({ orderId } = verifyWecomShipToken(token));
    } catch {
      return res
        .status(400)
        .type('html')
        .send(
          wecomOrderShipResultHtml(
            false,
            '链接无效或已过期',
            '请让财务重新审核通过，或联系管理员检查服务器时间与 JWT 配置。'
          )
        );
    }
    const pool = getPool();
    const r = await performWecomQuickShip(pool, orderId);
    if (!r.ok) {
      const status = r.code === 'NOT_FOUND' ? 404 : 400;
      return res.status(status).type('html').send(wecomOrderShipResultHtml(false, '无法发货', r.message));
    }
    return res
      .type('html')
      .send(wecomOrderShipResultHtml(true, '发货成功', '订单状态已更新为「已发货」。可关闭本页。'));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[wecom-order-ship]', e?.message || e);
    return res
      .status(500)
      .type('html')
      .send(
        wecomOrderShipResultHtml(
          false,
          '暂时无法处理',
          '服务器异常，请稍后在电脑端订单管理中发货，或联系管理员查看日志。'
        )
      );
  }
});

function sendReportCustomerHtml(req, res) {
  res.type('html').send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>检测报告</title>
    <style>
      body { font-family: "SimSun", "Songti SC", "Microsoft YaHei", serif; margin: 0; background: #e8e8e8; color: #222; }
      .wrap { max-width: 1000px; margin: 0 auto; padding: 16px; box-sizing: border-box; }
      /* A4 竖版：版心固定 210mm×297mm（内容超长时-only 高度增大）；窄屏由 JS 整体 scale，保证等比缩放 */
      .paper {
        background: #fff;
        width: 210mm;
        max-width: 210mm;
        min-width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        padding: 20mm 20mm 16mm;
        box-sizing: border-box;
        box-shadow: 0 0 12px rgba(0,0,0,0.08);
        position: relative;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
      }
      .paper-main {
        flex: 1 1 auto;
        min-height: 0;
      }
      .topbar { display:flex; justify-content: space-between; align-items:center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
      .btn { display: inline-block; padding: 8px 12px; border-radius: 6px; border: 1px solid #ccc; background: #fff; cursor: pointer; text-decoration: none; color: #222; font-family: inherit; font-size: 13px; }
      .muted { color: #666; font-size: 12px; }
      .error { color: #cf1322; white-space: pre-wrap; margin-bottom: 10px; }

      .paper-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
      .paper-top-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        flex: 1;
        min-width: 0;
      }
      .logo-block { display: flex; flex-direction: column; align-items: flex-start; flex-shrink: 0; min-width: 72px; max-width: 55%; }
      .logo-block img { width: 72px; height: 72px; object-fit: contain; display: block; }
      /* 描述语（中文）单行显示，不换行 */
      .slogan-zh-line {
        font-size: 11px;
        color: #333;
        line-height: 1.35;
        margin-top: 6px;
        white-space: nowrap;
      }
      .slogan-en { font-size: 10px; color: #666; margin-top: 3px; }
      .doc-no-line { text-align: right; font-size: 14px; color: #333; padding-top: 4px; flex: 1; }
      .doc-no-line .lbl { margin-right: 6px; }
      .doc-no-line .val { display: inline-block; min-width: 140px; border-bottom: 1px solid #222; text-align: center; padding: 0 4px 2px; font-size: 15px; }

      .center-block { text-align: center; margin-bottom: 28px; }
      .company-name { font-size: 20px; color: #222; margin-bottom: 10px; letter-spacing: 0.5px; line-height: 1.4; }
      .report-title-zh { font-size: 32px; font-weight: bold; color: #111; margin: 0 0 10px; letter-spacing: 2px; line-height: 1.25; }
      .report-title-en { font-size: 18px; color: #333; font-style: italic; line-height: 1.35; }

      .meta-rows { margin-bottom: 22px; }
      .meta-row-2 { display: flex; gap: 32px; margin-bottom: 16px; }
      .meta-pair { flex: 1; min-width: 0; }
      .meta-line { display: flex; align-items: flex-end; gap: 8px; }
      .meta-label-side { flex: 0 0 auto; text-align: right; padding-bottom: 2px; max-width: 42%; }
      .meta-label-side .lab-cn { font-size: 15px; color: #222; line-height: 1.2; }
      .meta-label-side .lab-en { font-size: 11px; color: #666; line-height: 1.2; margin-top: 2px; }
      .meta-value-side {
        flex: 1;
        min-width: 0;
        border-bottom: 1px solid #222;
        min-height: 28px;
        padding: 4px 6px 5px;
        font-size: 15px;
        text-align: left;
        line-height: 1.45;
      }

      .main-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #222;
        margin-top: 12px;
        margin-bottom: 20px;
      }
      .main-table th, .main-table td { border: 1px solid #222; padding: 10px 12px; font-size: 14px; vertical-align: middle; text-align: center; line-height: 1.45; }
      .main-table th { background: #fafafa; font-weight: bold; padding: 12px 12px 14px; }
      .main-table .th-cn { display: block; font-size: 15px; }
      .main-table .th-en { display: block; font-size: 12px; color: #666; font-weight: normal; margin-top: 3px; }
      .main-table tbody td .cell-first-en { font-size: 12px; color: #666; margin-top: 3px; }
      .cell-merged-label { font-weight: 700; text-align: center; }
      .cell-merged-label .en { font-size: 12px; color: #666; font-weight: normal; margin-top: 4px; }
      .val-red { color: #c00; font-weight: bold; font-size: 18px; }

      .section-extra { margin-top: 24px; margin-bottom: 28px; }
      .section-extra-title { font-weight: 700; font-size: 14px; margin-bottom: 10px; color: #222; }
      .extra-table { width: 100%; border-collapse: collapse; border: 1px solid #222; }
      .extra-table th, .extra-table td { border: 1px solid #222; padding: 10px; font-size: 13px; vertical-align: top; line-height: 1.45; }

      .footer-sign {
        margin-top: auto;
        padding-top: 52px;
        flex-shrink: 0;
        display: flex;
        justify-content: space-around;
        padding-left: 8px;
        padding-right: 8px;
      }
      .main-table tbody.main-table-bottom {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .footer-col { flex: 1; max-width: 33%; padding: 0 6px; }
      .footer-stamp-wrap {
        position: relative;
        min-height: 100px;
        padding: 10px 6px 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
      }
      /* 章相对「中文+英文」两行标题居中，避免相对整块区域垂直居中而偏下 */
      .footer-labels {
        position: relative;
        z-index: 1;
        text-align: center;
        pointer-events: none;
        display: inline-block;
        max-width: 100%;
      }
      .footer-stamp-wrap .t-cn { font-size: 16px; margin-bottom: 4px; color: #222; }
      .footer-stamp-wrap .t-en { font-size: 13px; color: #666; margin-bottom: 0; line-height: 1.3; }
      .seal-footer.seal-on-label {
        position: absolute;
        z-index: 2;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: auto;
        height: auto;
        max-width: 80px;
        max-height: 80px;
        object-fit: contain;
        opacity: 0.9;
        pointer-events: none;
      }
      .seal-footer.seal-on-label.seal-dept {
        max-width: 120px;
        max-height: 120px;
        opacity: 0.88;
      }
      .td-seal-wrap { position: relative; min-height: 60px; vertical-align: middle !important; padding-right: 100px !important; }
      /* 合格/复检章：限制最大尺寸，保持原始宽高比，不拉伸变形 */
      .td-seal-wrap img.seal-table {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        left: auto;
        margin: 0;
        opacity: 0.9;
        width: auto;
        height: auto;
        max-width: 96px;
        max-height: 96px;
        object-fit: contain;
        object-position: center center;
      }

      /* 作废报告：印章在编号行正上方、右对齐、水平不倾斜 */
      .void-stamp {
        display: none;
        position: relative;
        margin-bottom: 8px;
        z-index: 2;
        pointer-events: none;
        box-sizing: border-box;
        padding: 8px 14px;
        border: 3px solid #8b9099;
        color: #6d7178;
        background: rgba(255, 255, 255, 0.45);
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.2em;
        text-indent: 0.2em;
        line-height: 1.35;
        border-radius: 2px;
        opacity: 0.9;
        white-space: nowrap;
        text-align: center;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
      }
      .void-stamp.is-visible {
        display: inline-block;
      }

      /* 视口装不下 A4 宽度时，由 JS 对 .paper 做统一 transform: scale()，版面内相对比例不变 */
      .paper-scale-outer {
        width: 100%;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: flex-start;
      }

      @media screen and (max-width: 768px) {
        html { -webkit-text-size-adjust: 100%; }
        .wrap {
          max-width: 100%;
          padding: 8px;
          padding-left: max(8px, env(safe-area-inset-left));
          padding-right: max(8px, env(safe-area-inset-right));
        }
        .topbar { margin-bottom: 8px; }
      }

      /* 微信内：全屏引导（右上角菜单 → 浏览器打开），参考常见 App 遮罩样式 */
      .wx-browser-guide {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
        padding: calc(12px + env(safe-area-inset-top, 0px)) 18px calc(24px + env(safe-area-inset-bottom, 0px));
        box-sizing: border-box;
        background: rgba(0, 0, 0, 0.78);
        -webkit-tap-highlight-color: transparent;
      }
      .wx-browser-guide.is-visible {
        display: flex;
      }
      .wx-browser-guide__arrow-wrap {
        position: relative;
        flex: 0 0 auto;
        height: min(38vh, 220px);
        min-height: 120px;
        margin-bottom: 8px;
      }
      .wx-browser-guide__arrow-svg {
        position: absolute;
        right: max(8px, env(safe-area-inset-right));
        top: env(safe-area-inset-top, 0px);
        width: min(72vw, 280px);
        height: auto;
        max-height: 100%;
        overflow: visible;
      }
      .wx-browser-guide__arrow-svg path.guide-dash {
        fill: none;
        stroke: #fff;
        stroke-width: 2.5;
        stroke-linecap: round;
        stroke-dasharray: 9 7;
        opacity: 0.95;
      }
      .wx-browser-guide__arrow-svg path.guide-head {
        fill: #fff;
        opacity: 0.95;
      }
      .wx-browser-guide__steps {
        list-style: none;
        margin: 0;
        padding: 0;
        flex: 1 1 auto;
        max-width: 100%;
      }
      .wx-browser-guide__steps li {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        margin-bottom: 20px;
        color: #fff;
        font-size: 16px;
        line-height: 1.45;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
      }
      .wx-browser-guide__steps .step-num {
        flex-shrink: 0;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: #fff;
        color: #111;
        font-size: 14px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      .wx-browser-guide__steps .step-text {
        flex: 1;
        min-width: 0;
        padding-top: 2px;
      }
      .wx-browser-guide__steps .muted {
        display: block;
        margin-top: 6px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.72);
        line-height: 1.4;
      }
      .wx-browser-guide__actions {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 8px;
      }
      .wx-browser-guide__btn {
        width: 100%;
        padding: 14px 18px;
        border-radius: 12px;
        border: none;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
      }
      .wx-browser-guide__btn--secondary {
        background: rgba(255, 255, 255, 0.15);
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.35);
      }
      .wx-browser-guide__btn--primary {
        background: #fff;
        color: #111;
      }
      .wx-browser-guide__hint {
        min-height: 22px;
        text-align: center;
        font-size: 14px;
        color: #86efac;
        margin-top: 4px;
      }
      button.btn:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @media print {
        @page {
          size: A4 portrait;
          margin: 7mm;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .wrap {
          padding: 0 !important;
          max-width: none !important;
          margin: 0 !important;
        }
        .topbar { display: none !important; }
        /*
          打印不用 flex 撑满整页高度，避免「主内容 + margin-top:auto 签章」被算到超过一页而拆到第 2 页。
          略缩小整页，使表格末行与签章区尽量落在同一页，底边留空。
        */
        .paper {
          box-shadow: none !important;
          width: 210mm !important;
          max-width: 210mm !important;
          min-height: 0 !important;
          height: auto !important;
          margin: 0 auto !important;
          padding: 7mm 10mm 11mm !important;
          display: block !important;
          page-break-after: auto;
          page-break-inside: auto;
          box-sizing: border-box !important;
          zoom: 0.93;
        }
        .paper-main {
          flex: none !important;
        }
        .center-block { margin-bottom: 18px !important; }
        .meta-rows { margin-bottom: 16px !important; }
        .meta-row-2 { margin-bottom: 12px !important; }
        .main-table th,
        .main-table td {
          padding: 7px 9px !important;
          font-size: 13px !important;
        }
        .main-table th { padding: 9px 9px 10px !important; }
        .footer-sign.print-footer-sign {
          margin-top: 28px !important;
          padding-top: 36px !important;
          padding-bottom: 2mm !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-before: avoid !important;
          break-before: avoid !important;
        }
        .main-table tbody.main-table-bottom {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .section-extra {
          margin-top: 14px !important;
          page-break-inside: avoid !important;
        }
        .void-stamp.is-visible {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .paper-scale-outer {
          height: auto !important;
          overflow: visible !important;
          display: block !important;
        }
        .paper {
          transform: none !important;
        }
        .wx-browser-guide {
          display: none !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="topbar">
        <div class="muted" id="topbarTitle">产品质量检测报告单</div>
        <div style="display:flex; gap:10px">
          <a class="btn" id="back" href="#">返回汇总</a>
          <button class="btn" id="print">打印/导出PDF</button>
          <button class="btn" id="refresh">刷新</button>
        </div>
      </div>

      <div id="paperScaleOuter" class="paper-scale-outer">
      <div class="paper">
        <div id="err" class="error"></div>

        <div class="paper-main">
        <div class="paper-top">
          <div class="logo-block">
            <img id="logo" alt="公司logo" style="display:none" />
            <div id="desc" class="slogan"></div>
          </div>
          <div class="paper-top-right">
            <div id="voidStamp" class="void-stamp" aria-hidden="true">此报告已作废</div>
            <div class="doc-no-line">
              <span class="lbl">报告编号</span><span class="val" id="m_reportNo"></span>
            </div>
          </div>
        </div>

        <div class="center-block">
          <div class="company-name" id="company"></div>
          <h1 class="report-title-zh" id="reportTitleZh"></h1>
          <div class="report-title-en" id="reportTitleEn"></div>
        </div>

        <div class="meta-rows">
          <div class="meta-row-2">
            <div class="meta-pair">
              <div class="meta-line">
                <div class="meta-label-side">
                  <div class="lab-cn">产品名称</div>
                  <div class="lab-en">Product Name</div>
                </div>
                <div class="meta-value-side" id="meta_product"></div>
              </div>
            </div>
            <div class="meta-pair">
              <div class="meta-line">
                <div class="meta-label-side">
                  <div class="lab-cn">包装规格</div>
                  <div class="lab-en">Packing</div>
                </div>
                <div class="meta-value-side" id="meta_packing"></div>
              </div>
            </div>
          </div>
          <div class="meta-row-2">
            <div class="meta-pair">
              <div class="meta-line">
                <div class="meta-label-side">
                  <div class="lab-cn">本批数量</div>
                  <div class="lab-en">Batch Weight</div>
                </div>
                <div class="meta-value-side" id="meta_batch_qty"></div>
              </div>
            </div>
            <div class="meta-pair">
              <div class="meta-line">
                <div class="meta-label-side">
                  <div class="lab-cn">生产批号</div>
                  <div class="lab-en">Batch No.</div>
                </div>
                <div class="meta-value-side" id="meta_batch_no"></div>
              </div>
            </div>
          </div>
          <div class="meta-row-2">
            <div class="meta-pair">
              <div class="meta-line">
                <div class="meta-label-side">
                  <div class="lab-cn">检验日期</div>
                  <div class="lab-en">Analysis Date</div>
                </div>
                <div class="meta-value-side" id="meta_analysis_date"></div>
              </div>
            </div>
            <div class="meta-pair">
              <div class="meta-line">
                <div class="meta-label-side">
                  <div class="lab-cn">出厂日期</div>
                  <div class="lab-en">EX-mill Date</div>
                </div>
                <div class="meta-value-side" id="meta_ex_mill"></div>
              </div>
            </div>
          </div>
        </div>

        <table class="main-table">
          <thead>
            <tr id="itemHead"></tr>
          </thead>
          <tbody id="items"></tbody>
          <tbody class="main-table-bottom">
            <tr>
              <td colspan="3" class="cell-merged-label">
                检验结论
                <div class="en">Test conclusion</div>
              </td>
              <td class="td-seal-wrap">
                <span id="finalConclusionText" class="val-red"></span>
                <img id="sealPass" class="seal seal-pass seal-table" style="display:none" alt="合格章" />
              </td>
            </tr>
            <tr>
              <td colspan="3" class="cell-merged-label">
                备注
                <div class="en">Remarks</div>
              </td>
              <td class="td-seal-wrap">
                <span id="remarksText" class="val-red"></span>
                <img id="sealRecheck" class="seal seal-recheck seal-table" style="display:none" alt="复检章" />
              </td>
            </tr>
          </tbody>
        </table>

        <div id="sectionOthers" class="section-extra" style="display:none">
          <div class="section-extra-title">其他信息</div>
          <table class="extra-table">
            <thead>
              <tr>
                <th style="width: 34%">字段</th>
                <th>值</th>
              </tr>
            </thead>
            <tbody id="others"></tbody>
          </table>
        </div>
        </div>

        <div class="footer-sign print-footer-sign">
          <div class="footer-col">
            <div class="footer-stamp-wrap">
              <div class="footer-labels">
                <div class="t-cn">主检（签字）</div>
                <div class="t-en">Inspector</div>
                <img id="sealInspector" class="seal-footer seal-on-label" style="display:none" alt="主检章" />
              </div>
            </div>
          </div>
          <div class="footer-col">
            <div class="footer-stamp-wrap">
              <div class="footer-labels">
                <div class="t-cn">审核（签字）</div>
                <div class="t-en">Supervisor</div>
                <img id="sealSupervisor" class="seal-footer seal-on-label" style="display:none" alt="审核章" />
              </div>
            </div>
          </div>
          <div class="footer-col">
            <div class="footer-stamp-wrap">
              <div class="footer-labels">
                <div class="t-cn">部门</div>
                <div class="t-en">Department</div>
                <img id="sealDepartment" class="seal-footer seal-on-label seal-dept" style="display:none" alt="质检章" />
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>

    <div
      id="wxBrowserGuide"
      class="wx-browser-guide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wxBrowserGuideTitle"
      aria-hidden="true"
    >
      <div class="wx-browser-guide__arrow-wrap" aria-hidden="true">
        <svg
          class="wx-browser-guide__arrow-svg"
          viewBox="0 0 140 96"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            class="guide-dash"
            d="M 6 90 C 28 52 62 28 118 8"
          />
          <path class="guide-head" d="M 118 8 L 112 14 L 114 6 Z" />
        </svg>
      </div>
      <div id="wxBrowserGuideTitle" class="sr-only">在浏览器中打开以导出 PDF</div>
      <ol class="wx-browser-guide__steps">
        <li>
          <span class="step-num">1</span>
          <span class="step-text">点击右上角「···」按钮</span>
        </li>
        <li>
          <span class="step-num">2</span>
          <span class="step-text">选择「在浏览器中打开」<span class="muted">（或 Safari / Chrome 等图标）</span></span>
        </li>
        <li>
          <span class="step-num">3</span>
          <span class="step-text">在系统浏览器中打开本页后，点击「打印/导出 PDF」，使用「另存为 PDF」保存</span>
        </li>
      </ol>
      <div class="wx-browser-guide__actions">
        <button type="button" class="wx-browser-guide__btn wx-browser-guide__btn--secondary" id="wxGuideCopyUrl">
          复制本页链接
        </button>
        <button type="button" class="wx-browser-guide__btn wx-browser-guide__btn--primary" id="wxGuideClose">
          我知道了
        </button>
        <div id="wxGuideCopyHint" class="wx-browser-guide__hint" aria-live="polite"></div>
      </div>
    </div>

    <script>
      const qs = new URLSearchParams(location.search);
      const token = qs.get('token') || '';
      const id = qs.get('id') || '';
      const adminPreview = qs.get('adminPreview') === '1';
      const accessToken = qs.get('accessToken') || '';
      const autoPrint = qs.get('autoPrint') === '1';
      function isWeChatBrowser() {
        return /micromessenger/i.test(navigator.userAgent || '');
      }
      if (adminPreview) {
        const titleEl = document.getElementById('topbarTitle');
        if (titleEl) titleEl.textContent = '报告详情（管理端预览）';
      } else {
        const titleEl = document.getElementById('topbarTitle');
        if (titleEl) titleEl.textContent = '报告详情';
      }
      if (adminPreview) {
        document.body.style.margin = '0';
      }
      document.getElementById('back').href =
        (location.pathname.indexOf('/api/public/') === 0
          ? '/api/public/scan?token='
          : '/scan.html?token=') + encodeURIComponent(token);

      const wxBrowserGuide = document.getElementById('wxBrowserGuide');
      const wxGuideCopyHint = document.getElementById('wxGuideCopyHint');
      function showWxBrowserGuide() {
        if (!wxBrowserGuide) return;
        if (wxGuideCopyHint) wxGuideCopyHint.textContent = '';
        wxBrowserGuide.classList.add('is-visible');
        wxBrowserGuide.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }
      function hideWxBrowserGuide() {
        if (!wxBrowserGuide) return;
        wxBrowserGuide.classList.remove('is-visible');
        wxBrowserGuide.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
      const wxGuideClose = document.getElementById('wxGuideClose');
      if (wxGuideClose) wxGuideClose.addEventListener('click', hideWxBrowserGuide);
      const wxGuideCopyUrl = document.getElementById('wxGuideCopyUrl');
      if (wxGuideCopyUrl) {
        wxGuideCopyUrl.addEventListener('click', function () {
          const url = location.href;
          function copyWithExecCommand(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.top = '-9999px';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            let ok = false;
            try {
              ok = document.execCommand('copy');
            } catch (e) {
              ok = false;
            }
            document.body.removeChild(ta);
            return ok;
          }
          function setHint(msg) {
            if (wxGuideCopyHint) wxGuideCopyHint.textContent = msg;
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              setHint('复制成功，可直接粘贴打开');
            }).catch(function () {
              if (copyWithExecCommand(url)) {
                setHint('复制成功，可直接粘贴打开');
              } else {
                setHint('复制失败，请长按地址栏手动复制');
              }
            });
          } else if (copyWithExecCommand(url)) {
            setHint('复制成功，可直接粘贴打开');
          } else {
            setHint('复制失败，请长按地址栏手动复制');
          }
        });
      }
      document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape') return;
        if (wxBrowserGuide && wxBrowserGuide.classList.contains('is-visible')) hideWxBrowserGuide();
      });

      function buildPdfDownloadUrl() {
        const base = '/api/public/report/' + encodeURIComponent(id) + '/pdf';
        return base + '?token=' + encodeURIComponent(token);
      }

      document.getElementById('print').addEventListener('click', () => {
        if (isWeChatBrowser()) {
          showWxBrowserGuide();
          return;
        }
        if (!id || !token) {
          window.print();
          return;
        }
        const btn = document.getElementById('print');
        if (btn) {
          btn.disabled = true;
          btn.textContent = '生成PDF中…';
        }
        window.location.href = buildPdfDownloadUrl();
        setTimeout(function () {
          if (!btn) return;
          btn.disabled = false;
          btn.textContent = '打印/导出PDF';
        }, 2400);
      });

      function esc(s) {
        return String(s)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('\"', '&quot;')
          .replaceAll(\"'\", '&#39;');
      }

      function toBi(v) {
        if (v == null) return { zh: '', en: '' };
        if (typeof v === 'object') {
          return {
            zh: v.zh ?? v.cn ?? v.valueZh ?? '',
            en: v.en ?? v.valueEn ?? ''
          };
        }
        return { zh: String(v), en: '' };
      }

      /** 表格第 2～4 列、元数据值等：仅中文 */
      function renderZhOnly(v) {
        const zh = toBi(v).zh || '';
        if (!zh) return '&nbsp;';
        return esc(zh);
      }

      /** 检验项目列：中文 + 英文 */
      function renderItemCol(v) {
        const b = toBi(v);
        const zh = b.zh || '';
        const en = b.en || '';
        if (!zh && !en) return '&nbsp;';
        let html = '<div>' + esc(zh) + '</div>';
        if (en) html += '<div class="cell-first-en">' + esc(en) + '</div>';
        return html;
      }

      /** 检验结论 / 备注：仅中文、红色 */
      function renderRedZhOnly(v) {
        const zh = toBi(v).zh || '';
        if (!zh) return '<span class="val-red">&nbsp;</span>';
        return '<span class="val-red">' + esc(zh) + '</span>';
      }

      function fieldByKey(fields, key) {
        return (fields || []).find((f) => String(f.fieldKey || '') === key);
      }

      function parseMaybeJson(val) {
        if (val == null || typeof val !== 'string') return val;
        const t = val.trim();
        if (!t || (t[0] !== '{' && t[0] !== '[')) return val;
        try {
          return JSON.parse(val);
        } catch (e) {
          return val;
        }
      }

      function fieldBi(fields, key) {
        const f = fieldByKey(fields, key);
        return f ? parseMaybeJson(f.fieldValue) : null;
      }

      const LAYOUT_KEYS = new Set([
        'product_name',
        'batch_no',
        'packing',
        'batch_weight',
        'analysis_date',
        'ex_mill_date',
        'test_conclusion',
        'remarks',
        'inspection_table'
      ]);

      /** A4 版心布局宽度不变；仅当可用宽度小于版心时整体等比缩小（X/Y 同一 scale） */
      function fitMobilePaperScale() {
        const outer = document.getElementById('paperScaleOuter');
        const paper = document.querySelector('.paper');
        if (!outer || !paper) return;
        const wrap = document.querySelector('.wrap');
        const pl = wrap ? parseFloat(getComputedStyle(wrap).paddingLeft) || 0 : 0;
        const pr = wrap ? parseFloat(getComputedStyle(wrap).paddingRight) || 0 : 0;
        const vw = document.documentElement.clientWidth || window.innerWidth || 0;
        const wrapInner = wrap ? wrap.clientWidth - pl - pr : vw - pl - pr;
        const avail = Math.max(200, Math.min(wrapInner, vw - pl - pr) - 6);
        const w = paper.offsetWidth;
        if (!w) return;
        let s = Math.min(1, avail / w);
        if (s >= 0.998) s = 1;
        if (s >= 1) {
          paper.style.transform = '';
          paper.style.transformOrigin = '';
          outer.style.height = '';
          paper.classList.remove('paper--mobile-scale');
          return;
        }
        paper.classList.add('paper--mobile-scale');
        paper.style.transformOrigin = 'top center';
        paper.style.transform = 'scale(' + s + ')';
        const h = paper.offsetHeight;
        outer.style.height = Math.max(0, Math.ceil(h * s)) + 'px';
      }

      function scheduleFitMobilePaperScale() {
        requestAnimationFrame(function () {
          fitMobilePaperScale();
          requestAnimationFrame(fitMobilePaperScale);
        });
        setTimeout(fitMobilePaperScale, 200);
        setTimeout(fitMobilePaperScale, 500);
      }

      let resizeTimer = null;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(scheduleFitMobilePaperScale, 80);
      });
      window.addEventListener('orientationchange', function () {
        setTimeout(scheduleFitMobilePaperScale, 300);
      });

      async function load() {
        window.__REPORT_READY = false;
        try {
        document.getElementById('err').textContent = '';
        document.getElementById('items').innerHTML = '';
        document.getElementById('others').innerHTML = '';
        document.getElementById('itemHead').innerHTML = '';
        const sealDepartment = document.getElementById('sealDepartment');
        const sealInspector = document.getElementById('sealInspector');
        const sealSupervisor = document.getElementById('sealSupervisor');
        const sealPass = document.getElementById('sealPass');
        const sealRecheck = document.getElementById('sealRecheck');
        [sealDepartment, sealInspector, sealSupervisor, sealPass, sealRecheck].forEach((el) => {
          if (el) el.style.display = 'none';
        });
        const voidStampEl = document.getElementById('voidStamp');
        if (voidStampEl) {
          voidStampEl.classList.remove('is-visible');
          voidStampEl.setAttribute('aria-hidden', 'true');
        }

        if (adminPreview) {
          if (!id || !accessToken) {
            document.getElementById('err').textContent = '缺少参数：需要 id 与 accessToken（管理端预览）';
            return;
          }
        } else if (!token || !id) {
          document.getElementById('err').textContent = '缺少参数：需要 token 与 id';
          return;
        }
        try {
          let res;
          if (adminPreview) {
            res = await fetch('/api/reports/' + encodeURIComponent(id) + '/customer-preview', {
              headers: { Authorization: 'Bearer ' + accessToken }
            });
          } else {
            res = await fetch('/api/public/report/' + encodeURIComponent(id) + '?token=' + encodeURIComponent(token));
          }
          const data = await res.json();
          if (!res.ok) throw new Error(JSON.stringify(data));

          const company = data.company || {};
          document.getElementById('company').textContent = company.company_name_zh || '';
          document.getElementById('reportTitleZh').textContent = company.report_title_zh || '';
          document.getElementById('reportTitleEn').textContent = company.report_title_en || '';

          const logoEl = document.getElementById('logo');
          if (company.logo_url) {
            logoEl.onload = function () { scheduleFitMobilePaperScale(); };
            logoEl.src = company.logo_url;
            logoEl.style.display = 'block';
          } else {
            logoEl.style.display = 'none';
          }
          document.getElementById('desc').innerHTML =
            '<div class="slogan-zh-line">' + esc(company.description_zh || '') + '</div>' +
            (company.description_en
              ? '<div class="slogan-en">' + esc(company.description_en) + '</div>'
              : '');

          const r = data.report;
          const fields = r.fields || [];

          if (voidStampEl) {
            if (r.status === 'void') {
              voidStampEl.classList.add('is-visible');
              voidStampEl.setAttribute('aria-hidden', 'false');
            } else {
              voidStampEl.classList.remove('is-visible');
              voidStampEl.setAttribute('aria-hidden', 'true');
            }
          }

          document.getElementById('m_reportNo').textContent = r.reportNo || '';

          const prodBi = fieldBi(fields, 'product_name');
          const prodZh = (toBi(prodBi).zh || r.productName || '').trim();
          document.getElementById('meta_product').textContent = prodZh || '';

          document.getElementById('meta_packing').innerHTML = renderZhOnly(fieldBi(fields, 'packing'));
          document.getElementById('meta_batch_qty').innerHTML = renderZhOnly(fieldBi(fields, 'batch_weight'));

          const batchBi = fieldBi(fields, 'batch_no');
          const bZh = (toBi(batchBi).zh || r.batchNo || '').trim();
          document.getElementById('meta_batch_no').textContent = bZh || '';

          document.getElementById('meta_analysis_date').innerHTML = renderZhOnly(fieldBi(fields, 'analysis_date'));
          document.getElementById('meta_ex_mill').innerHTML = renderZhOnly(fieldBi(fields, 'ex_mill_date'));

          const appliedSeals = data.appliedSeals || {};

          const tableField =
            fields.find((f) => f.fieldKey === 'inspection_table' && f.fieldType === 'table') ||
            fields.find((f) => f.fieldType === 'table');
          let itemRows = [];
          let colLabels = [
            { zh: '检验项目', en: 'Test item' },
            { zh: '单位', en: 'Unit' },
            { zh: '标准值', en: 'Normal value' },
            { zh: '检测值', en: 'Test value' }
          ];
          if (tableField && tableField.fieldValue) {
            try {
              const v = parseMaybeJson(tableField.fieldValue);
              let parsed = v;
              if (typeof v === 'string') {
                try {
                  parsed = JSON.parse(v);
                } catch (e2) {
                  parsed = {};
                }
              }
              if (Array.isArray(parsed)) itemRows = parsed;
              else if (parsed?.rows) itemRows = parsed.rows;
              else if (parsed?.items) itemRows = parsed.items;
              else if (parsed?.tests) itemRows = parsed.tests;
              else itemRows = [];
              if (parsed?.columnLabels && parsed.columnLabels.length === 4) {
                colLabels = parsed.columnLabels.map((c) => ({
                  zh: typeof c === 'object' ? c.zh ?? '' : String(c),
                  en: typeof c === 'object' ? c.en ?? '' : ''
                }));
              }
            } catch (e) {
              itemRows = [];
            }
          }

          const colWidths = ['34%', '12%', '27%', '27%'];
          const headHtml = colLabels
            .map(
              (c, i) =>
                '<th style="width:' +
                (colWidths[i] || '25%') +
                '">' +
                '<span class="th-cn">' +
                esc(c.zh || '') +
                '</span>' +
                '<span class="th-en">' +
                esc(c.en || '') +
                '</span></th>'
            )
            .join('');
          document.getElementById('itemHead').innerHTML = headHtml;

          const itemHtml = (itemRows || [])
            .map((it) => {
              const item = it.item ?? it.name ?? it.project ?? '';
              const unit = it.unit ?? it.unitName ?? it.units ?? '';
              const standard = it.standard ?? it.spec ?? '';
              const result = it.result ?? it.value ?? '';
              return (
                '<tr>' +
                '<td>' +
                renderItemCol(item) +
                '</td>' +
                '<td>' +
                renderZhOnly(unit) +
                '</td>' +
                '<td>' +
                renderZhOnly(standard) +
                '</td>' +
                '<td>' +
                renderZhOnly(result) +
                '</td>' +
                '</tr>'
              );
            })
            .join('');
          document.getElementById('items').innerHTML =
            itemHtml ||
            '<tr><td colspan="4" class="muted" style="text-align:center;padding:16px">（未配置检测项目表，请在后台为该报告添加表格类字段）</td></tr>';

          const tcVal = fieldBi(fields, 'test_conclusion');
          const tcBi = toBi(tcVal);
          const finalEl = document.getElementById('finalConclusionText');
          /* 检验结论格仅保留手填文案 + 合格章图，不展示系统判定里的「合格」等文字 */
          if (tcBi.zh) {
            finalEl.innerHTML = renderRedZhOnly(tcVal);
          } else {
            finalEl.innerHTML = '<span class="val-red">&nbsp;</span>';
          }

          const remVal = fieldBi(fields, 'remarks');
          const remBi = toBi(remVal);
          document.getElementById('remarksText').innerHTML = remBi.zh
            ? renderRedZhOnly(remVal)
            : '<span class="val-red">&nbsp;</span>';

          const otherFields = fields.filter(
            (f) => f !== tableField && !LAYOUT_KEYS.has(String(f.fieldKey || ''))
          );
          const otherHtml = otherFields
            .map((f) => {
              const labelZh = f.fieldLabel || f.fieldKey || '';
              const labelEn = f.fieldLabelEn || '';
              const v = parseMaybeJson(f.fieldValue);
              const valueHtml = renderZhOnly(v);
              const labelHtml =
                '<div>' + esc(labelZh) + '</div>' +
                '<div style="font-size:12px;color:#666;margin-top:2px">' + esc(labelEn) + '</div>';
              return '<tr><td>' + labelHtml + '</td><td>' + valueHtml + '</td></tr>';
            })
            .join('');
          const sec = document.getElementById('sectionOthers');
          if (otherHtml) {
            document.getElementById('others').innerHTML = otherHtml;
            sec.style.display = '';
          } else {
            document.getElementById('others').innerHTML = '';
            sec.style.display = 'none';
          }

          if (appliedSeals.department_qc?.imageUrl && sealDepartment) {
            sealDepartment.src = appliedSeals.department_qc.imageUrl;
            sealDepartment.style.display = 'block';
          }
          if (appliedSeals.inspector?.imageUrl && sealInspector) {
            sealInspector.src = appliedSeals.inspector.imageUrl;
            sealInspector.style.display = 'block';
          }
          if (appliedSeals.supervisor?.imageUrl && sealSupervisor) {
            sealSupervisor.src = appliedSeals.supervisor.imageUrl;
            sealSupervisor.style.display = 'block';
          }
          if (appliedSeals.pass?.imageUrl && sealPass) {
            sealPass.src = appliedSeals.pass.imageUrl;
            sealPass.style.display = 'block';
          }
          if (appliedSeals.recheck?.imageUrl && sealRecheck) {
            sealRecheck.src = appliedSeals.recheck.imageUrl;
            sealRecheck.style.display = 'block';
          }
          if (adminPreview && autoPrint) {
            setTimeout(function () { window.print(); }, 400);
          }
        } catch (e) {
          document.getElementById('err').textContent = '加载失败：' + (e?.message || e);
        }
        } finally {
          scheduleFitMobilePaperScale();
          window.__REPORT_READY = true;
        }
      }

      document.getElementById('refresh').addEventListener('click', load);
      load();
    </script>
  </body>
</html>`);
}

router.get('/miniprogram/report.html', sendReportCustomerHtml);
router.get('/api/public/report.html', sendReportCustomerHtml);

// Public API: summary list by token (for mini program).
router.get('/api/public/summary', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const [qrRows] = await pool.query('SELECT id, token, created_at AS createdAt FROM qrcodes WHERE token=? LIMIT 1', [token]);
  const qr = qrRows?.[0];
  if (!qr) return res.status(404).json({ error: 'NOT_FOUND' });

  const [stampRows] = await pool.query(
    'SELECT id, name, seal_type AS sealType, image_url AS imageUrl FROM company_stamps WHERE is_active=1'
  );
  const stamps = mapActiveStamps(stampRows);

    const [reports] = await pool.query(
    `SELECT r.id, r.report_uid AS reportUid, r.report_no AS reportNo, r.product_name AS productName, r.batch_no AS batchNo, r.conclusion, r.status
     FROM qrcode_reports qr
     JOIN reports r ON r.id = qr.report_id
     WHERE qr.qrcode_id = ?
     ORDER BY r.id DESC`,
    [qr.id]
  );

  const company = await getCompanySettings(pool);
  const { company: companyOut, stamps: stampsOut } = normalizePublicSummaryAssets(company, stamps);
  res.json({ token: qr.token, createdAt: qr.createdAt, company: companyOut, stamps: stampsOut, reports });
});

// Public API: report detail (for mini program).
router.get('/api/public/report/:id', async (req, res) => {
  const id = Number(req.params.id);
  const token = String(req.query.token || '').trim();
  if (!token || !Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const [qrRows] = await pool.query('SELECT id FROM qrcodes WHERE token=? LIMIT 1', [token]);
  const qr = qrRows?.[0];
  if (!qr) return res.status(404).json({ error: 'NOT_FOUND' });

  const [bindRows] = await pool.query(
    'SELECT 1 FROM qrcode_reports WHERE qrcode_id=? AND report_id=? LIMIT 1',
    [qr.id, id]
  );
  if (!bindRows?.[0]) return res.status(403).json({ error: 'FORBIDDEN' });

  const payload = await getReportCustomerPayload(pool, id);
  if (!payload) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(payload);
});

// Public API: server-side generated PDF (stable on mobile/WeChat external browser).
router.get('/api/public/report/:id/pdf', async (req, res) => {
  const id = Number(req.params.id);
  const token = String(req.query.token || '').trim();
  if (!token || !Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });

  const pool = getPool();
  const [qrRows] = await pool.query('SELECT id FROM qrcodes WHERE token=? LIMIT 1', [token]);
  const qr = qrRows?.[0];
  if (!qr) return res.status(404).json({ error: 'NOT_FOUND' });

  const [bindRows] = await pool.query(
    'SELECT 1 FROM qrcode_reports WHERE qrcode_id=? AND report_id=? LIMIT 1',
    [qr.id, id]
  );
  if (!bindRows?.[0]) return res.status(403).json({ error: 'FORBIDDEN' });

  const payload = await getReportCustomerPayload(pool, id);
  if (!payload) return res.status(404).json({ error: 'NOT_FOUND' });

  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  const origin = `${proto}://${host}`;
  const reportUrl =
    `${origin}/miniprogram/report.html?token=${encodeURIComponent(token)}` +
    `&id=${encodeURIComponent(String(id))}&pdfMode=1`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 2000, deviceScaleFactor: 1 });
    await page.goto(reportUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => window.__REPORT_READY === true, { timeout: 15000 });
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true
    });

    const fnameId = String(payload?.report?.reportUid || payload?.report?.reportNo || id).replace(
      /[\\/:*?"<>|\s]+/g,
      '_'
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${fnameId}.pdf"`);
    res.status(200).send(Buffer.from(pdf));
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

