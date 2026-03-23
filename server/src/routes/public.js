import { Router } from 'express';

import { getPool } from '../db/pool.js';
import { getCompanySettings, getReportCustomerPayload } from '../lib/reportCustomerPayload.js';

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

// Public "scan" endpoint for mini program.
// In production: the QR should encode the miniprogram scheme.
// Here we keep a stable HTTP URL for development/testing.
async function handleScan(req, res) {
  const token = String(req.params.token || '').trim();
  if (!token) return res.status(400).type('text').send('bad token');

  const pool = getPool();
  const [qrRows] = await pool.query('SELECT id FROM qrcodes WHERE token=? LIMIT 1', [token]);
  const qr = qrRows?.[0];
  if (!qr) return res.status(404).type('text').send('not found');

  // Redirect to a placeholder. The mini program will use its own route like:
  // pages/summary/index?token=xxx
  res.redirect(302, `/miniprogram/index.html?token=${encodeURIComponent(token)}`);
}

router.get('/qr/:token', handleScan);
// Backward compatible: older QR links used /mp/qr/:token
router.get('/mp/qr/:token', handleScan);

// Dev-only HTML preview page for desktop verification.
// Usage:
// - /miniprogram/index.html?token=xxx  (summary list)
// - /miniprogram/report.html?token=xxx&id=123  (report detail)
router.get('/miniprogram/index.html', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>报告汇总（开发预览）</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; margin: 0; background: #f6f7fb; color: #111; }
      .wrap { max-width: 980px; margin: 0 auto; padding: 18px; }
      .card { background: #fff; border: 1px solid #e9edf5; border-radius: 12px; padding: 16px; }
      .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
      .muted { color: #666; font-size: 12px; }
      h1 { margin: 0 0 10px; font-size: 18px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { padding: 10px 8px; border-bottom: 1px solid #eee; text-align: left; font-size: 14px; }
      a { color: #1677ff; text-decoration: none; }
      .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; border: 1px solid #ddd; }
      .ok { border-color: #b7eb8f; background: #f6ffed; }
      .bad { border-color: #ffa39e; background: #fff1f0; }
      .unk { border-color: #d9d9d9; background: #fafafa; }
      .warn { border-color: #ffe58f; background: #fffbe6; }
      .stamp { width: 120px; height: 120px; object-fit: contain; border: 1px dashed #ddd; border-radius: 8px; background: #fafafa; }
      .error { color: #cf1322; white-space: pre-wrap; }
      .btn { display: inline-block; padding: 8px 12px; border-radius: 10px; border: 1px solid #d9d9d9; background: #fff; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="row" style="justify-content: space-between">
          <div>
            <h1>报告汇总（开发预览页）</h1>
            <div class="muted" id="meta"></div>
          </div>
          <div class="row">
            <button class="btn" id="refresh">刷新</button>
          </div>
        </div>
        <div class="row" style="margin-top: 12px">
          <img id="stamp" class="stamp" alt="公司章" style="display:none" />
          <div>
            <div class="muted">Token</div>
            <div id="token" style="font-weight:600"></div>
          </div>
        </div>
        <div id="err" class="error" style="margin-top:12px"></div>
        <table>
          <thead>
            <tr>
              <th>报告编号</th>
              <th>产品名称</th>
              <th>批次</th>
              <th>判定</th>
              <th>状态</th>
              <th>查看</th>
            </tr>
          </thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>

    <script>
      const qs = new URLSearchParams(location.search);
      const token = qs.get('token') || '';
      document.getElementById('token').textContent = token || '(missing)';

      function tag(html, cls) {
        return '<span class="tag ' + cls + '">' + html + '</span>';
      }

      function conclusionLabel(v) {
        if (v === 'pass') return tag('合格', 'ok');
        if (v === 'fail') return tag('不合格', 'bad');
        return tag('未知', 'unk');
      }

      function statusLabel(v) {
        if (v === 'void') return tag('作废', 'warn');
        return tag('有效', 'ok');
      }

      async function load() {
        document.getElementById('err').textContent = '';
        document.getElementById('tbody').innerHTML = '';
        if (!token) {
          document.getElementById('err').textContent = '缺少 token 参数，例如：/miniprogram/index.html?token=xxx';
          return;
        }
        try {
          const res = await fetch('/api/public/summary?token=' + encodeURIComponent(token));
          const data = await res.json();
          if (!res.ok) throw new Error(JSON.stringify(data));

          document.getElementById('meta').textContent = '报告数：' + (data.reports?.length || 0) + '｜生成时间：' + (data.createdAt || '-');

          const stamp = data.stamps?.departmentQc?.imageUrl;
          const img = document.getElementById('stamp');
          if (stamp) {
            img.src = stamp;
            img.style.display = '';
          } else {
            img.style.display = 'none';
          }

          const rows = (data.reports || []).map(r => {
            const href = '/miniprogram/report.html?token=' + encodeURIComponent(token) + '&id=' + encodeURIComponent(r.id);
            return '<tr>' +
              '<td>' + (r.reportNo || '') + '</td>' +
              '<td>' + (r.productName || '') + '</td>' +
              '<td>' + (r.batchNo || '') + '</td>' +
              '<td>' + conclusionLabel(r.conclusion) + '</td>' +
              '<td>' + statusLabel(r.status) + '</td>' +
              '<td><a href=\"' + href + '\">详情</a></td>' +
            '</tr>';
          }).join('');
          document.getElementById('tbody').innerHTML = rows || '<tr><td colspan="6" class="muted">暂无报告</td></tr>';
        } catch (e) {
          document.getElementById('err').textContent = '加载失败：' + (e?.message || e);
        }
      }

      document.getElementById('refresh').addEventListener('click', load);
      load();
    </script>
  </body>
</html>`);
});

router.get('/miniprogram/report.html', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>检测报告</title>
    <style>
      body { font-family: "SimSun", "Songti SC", "Microsoft YaHei", serif; margin: 0; background: #e8e8e8; color: #222; }
      .wrap { max-width: 1000px; margin: 0 auto; padding: 16px; }
      .paper {
        background: #fff;
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        padding: 20mm 20mm 16mm;
        box-sizing: border-box;
        box-shadow: 0 0 12px rgba(0,0,0,0.08);
        position: relative;
        display: flex;
        flex-direction: column;
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
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="topbar">
        <div class="muted">验证页（电脑端预览）：Token=<span id="token"></span>，ReportID=<span id="rid"></span></div>
        <div style="display:flex; gap:10px">
          <a class="btn" id="back" href="#">返回汇总</a>
          <button class="btn" id="print">打印/导出PDF</button>
          <button class="btn" id="refresh">刷新</button>
        </div>
      </div>

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
              <span class="lbl">编号</span><span class="val" id="m_reportNo"></span>
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

    <script>
      const qs = new URLSearchParams(location.search);
      const token = qs.get('token') || '';
      const id = qs.get('id') || '';
      const adminPreview = qs.get('adminPreview') === '1';
      const accessToken = qs.get('accessToken') || '';
      const autoPrint = qs.get('autoPrint') === '1';
      document.getElementById('token').textContent = adminPreview ? '(admin)' : token || '(missing)';
      document.getElementById('rid').textContent = id || '(missing)';
      if (adminPreview) {
        const tb = document.querySelector('.topbar');
        if (tb) tb.style.display = 'none';
        document.body.style.margin = '0';
      } else {
        document.getElementById('back').href = '/miniprogram/index.html?token=' + encodeURIComponent(token);
      }
      document.getElementById('print').addEventListener('click', () => window.print());

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

      async function load() {
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
      }

      document.getElementById('refresh').addEventListener('click', load);
      load();
    </script>
  </body>
</html>`);
});

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
    `SELECT r.id, r.report_no AS reportNo, r.product_name AS productName, r.batch_no AS batchNo, r.conclusion, r.status
     FROM qrcode_reports qr
     JOIN reports r ON r.id = qr.report_id
     WHERE qr.qrcode_id = ?
     ORDER BY r.id DESC`,
    [qr.id]
  );

  const company = await getCompanySettings(pool);
  res.json({ token: qr.token, createdAt: qr.createdAt, company, stamps, reports });
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

