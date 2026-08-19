import { Router } from 'express';
import puppeteer from 'puppeteer';

import { getPool } from '../../db/pool.js';
import {
  getCompanySettings,
  getReportCustomerPayload,
  normalizePublicSummaryAssets
} from '../../lib/reportCustomerPayload.js';

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

function sendReportCustomerHtml(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.type('html').send(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>检测报告</title>
    <style>
      :root {
        --report-ink: #1a2332;
        --report-muted: #64748b;
        --report-accent: #1a3a5f;
        --report-accent-light: #2d5a8e;
        --report-border: #334155;
        --report-border-light: #cbd5e1;
        --report-table-head: #f1f5f9;
        --report-table-stripe: #f8fafc;
      }
      body {
        font-family: "PingFang SC", "Microsoft YaHei", "SimSun", "Songti SC", serif;
        margin: 0;
        background: linear-gradient(165deg, #e8edf3 0%, #eef1f6 45%, #f4f6f9 100%);
        color: var(--report-ink);
        -webkit-font-smoothing: antialiased;
      }
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
        border: 1px solid var(--report-border-light);
        box-shadow:
          0 1px 2px rgba(26, 58, 95, 0.04),
          0 8px 32px rgba(26, 58, 95, 0.08);
        position: relative;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
      }
      .paper::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, var(--report-accent) 0%, var(--report-accent-light) 50%, var(--report-accent) 100%);
        border-radius: 1px 1px 0 0;
      }
      .paper-main {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .paper-main-body {
        flex: 1 1 auto;
        min-height: 0;
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
        flex-wrap: wrap;
        gap: 10px;
        padding: 10px 14px;
        background: #fff;
        border: 1px solid var(--report-border-light);
        border-radius: 10px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      }
      .btn {
        display: inline-block;
        padding: 8px 14px;
        border-radius: 8px;
        border: 1px solid var(--report-border-light);
        background: #fff;
        cursor: pointer;
        text-decoration: none;
        color: var(--report-ink);
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        transition: border-color 0.15s, color 0.15s, background 0.15s;
      }
      .btn:hover { border-color: var(--report-accent-light); color: var(--report-accent); background: #f8fafc; }
      .muted { color: var(--report-muted); font-size: 13px; font-weight: 500; letter-spacing: 0.02em; }
      .topbar.topbar--admin-preview {
        justify-content: flex-end;
        margin-bottom: 4px;
        padding: 4px 8px 0;
        border: none;
        box-shadow: none;
        background: transparent;
      }
      .error { color: #cf1322; white-space: pre-wrap; margin-bottom: 10px; }

      .paper-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e2e8f0;
      }
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
        color: var(--report-muted);
        line-height: 1.35;
        margin-top: 6px;
        white-space: nowrap;
        letter-spacing: 0.04em;
      }
      .slogan-en { font-size: 10px; color: #94a3b8; margin-top: 3px; }
      .doc-no-line { text-align: right; font-size: 14px; color: var(--report-ink); padding-top: 4px; flex: 1; }
      .doc-no-line .lbl {
        margin-right: 8px;
        font-size: 13px;
        color: var(--report-muted);
        font-weight: 500;
      }
      .doc-no-line .val {
        display: inline-block;
        min-width: 140px;
        border-bottom: 1.5px solid var(--report-border);
        text-align: center;
        padding: 0 6px 3px;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: var(--report-accent);
      }

      .center-block { text-align: center; margin-bottom: 28px; }
      .company-name {
        font-size: 19px;
        color: var(--report-ink);
        margin-bottom: 12px;
        letter-spacing: 0.08em;
        line-height: 1.45;
        font-weight: 600;
      }
      .title-divider {
        width: 72px;
        height: 3px;
        margin: 0 auto 14px;
        background: linear-gradient(90deg, var(--report-accent), var(--report-accent-light));
        border-radius: 2px;
      }
      .title-divider-bottom {
        width: 120px;
        height: 1px;
        margin: 14px auto 0;
        background: linear-gradient(90deg, transparent, var(--report-border-light), transparent);
      }
      .report-title-zh {
        font-size: 30px;
        font-weight: 700;
        color: var(--report-accent);
        margin: 0 0 8px;
        letter-spacing: 0.18em;
        line-height: 1.3;
      }
      .report-title-en {
        font-size: 16px;
        color: var(--report-muted);
        font-style: italic;
        line-height: 1.35;
        letter-spacing: 0.02em;
      }

      .meta-rows { margin-bottom: 22px; }
      .meta-row-2 { display: flex; gap: 32px; margin-bottom: 16px; }
      .meta-pair { flex: 1; min-width: 0; }
      .meta-line { display: flex; align-items: flex-end; gap: 8px; }
      .meta-label-side { flex: 0 0 110px; text-align: right; padding-bottom: 2px; }
      .meta-label-side .lab-cn { font-size: 14px; color: var(--report-ink); line-height: 1.2; font-weight: 500; }
      .meta-label-side .lab-en { font-size: 11px; color: var(--report-muted); line-height: 1.2; margin-top: 2px; }
      .meta-value-side {
        flex: 1;
        min-width: 0;
        border-bottom: 1px solid #94a3b8;
        min-height: 28px;
        padding: 4px 8px 5px;
        font-size: 15px;
        text-align: left;
        line-height: 1.45;
        color: var(--report-ink);
      }

      .main-table {
        width: 100%;
        border-collapse: collapse;
        border: 1px solid #475569;
        margin-top: 12px;
        margin-bottom: 28px;
      }
      .main-table th,
      .main-table td {
        border: 1px solid #475569;
        padding: 10px 12px;
        font-size: 14px;
        vertical-align: middle;
        text-align: center;
        line-height: 1.45;
      }
      .main-table th {
        background: linear-gradient(180deg, #f8fafc 0%, var(--report-table-head) 100%);
        font-weight: 700;
        padding: 11px 12px 13px;
        color: var(--report-accent);
      }
      .main-table tbody tr:nth-child(even) { background: var(--report-table-stripe); }
      .main-table .th-cn { display: block; font-size: 14px; letter-spacing: 0.04em; }
      .main-table .th-en { display: block; font-size: 11px; color: var(--report-muted); font-weight: normal; margin-top: 3px; }
      .main-table tbody td .cell-first-en { font-size: 11px; color: var(--report-muted); margin-top: 3px; }
      .cell-merged-label {
        font-weight: 700;
        text-align: center;
        background: #f8fafc;
        color: var(--report-accent);
      }
      .main-table tr.main-table-bottom-row {
        height: 60px;
      }
      .main-table tr.main-table-bottom-row td {
        height: 60px;
        padding: 0;
        font-size: 12px;
        vertical-align: middle;
      }
      .main-table tr.main-table-bottom-row .cell-merged-label {
        font-size: 12px;
        line-height: 1.35;
      }
      .main-table tr.main-table-bottom-row .cell-merged-label .en {
        display: block;
        margin-top: 1px;
        font-size: 9px;
        color: var(--report-muted);
        font-weight: normal;
        line-height: 1.25;
      }
      .main-table tr.main-table-bottom-row .val-red { color: #b91c1c; font-weight: 700; font-size: 12px; letter-spacing: 0.02em; line-height: 1.3; }

      .section-extra { margin-top: 24px; margin-bottom: 28px; }
      .section-extra-title { font-weight: 700; font-size: 14px; margin-bottom: 10px; color: var(--report-accent); letter-spacing: 0.04em; }
      .extra-table { width: 100%; border-collapse: collapse; border: 1px solid #475569; }
      .extra-table th, .extra-table td { border: 1px solid #475569; padding: 10px; font-size: 13px; vertical-align: top; line-height: 1.45; }
      .extra-table th { background: var(--report-table-head); color: var(--report-accent); font-weight: 600; }

      .footer-sign {
        margin-top: auto;
        padding-top: 48px;
        flex-shrink: 0;
        display: flex;
        justify-content: space-around;
        padding-left: 8px;
        padding-right: 8px;
        border-top: 1px solid #e2e8f0;
      }
      .main-table tr.main-table-bottom-row {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .footer-col { flex: 1; max-width: 33%; padding: 0 6px; }
      .footer-seal-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        min-height: 100px;
        padding: 10px 6px 12px;
      }
      .footer-labels {
        text-align: center;
        pointer-events: none;
        display: inline-block;
        max-width: 100%;
      }
      .footer-seal-slot {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 80px;
        height: 80px;
      }
      .footer-stamp-wrap .t-cn { font-size: 15px; margin-bottom: 4px; color: var(--report-ink); font-weight: 500; }
      .footer-stamp-wrap .t-en { font-size: 12px; color: var(--report-muted); margin-bottom: 0; line-height: 1.3; }
      .seal-footer {
        width: 80px;
        height: 80px;
        max-width: 80px;
        max-height: 80px;
        object-fit: contain;
        opacity: 0.9;
        pointer-events: none;
        display: block;
      }
      .seal-footer[src$=".svg"] {
        object-fit: fill;
      }
      /* 底部三章位置：below 默认（文字上、章下） */
      .footer-sign.footer-seal-pos--below .footer-seal-item {
        flex-direction: column;
      }
      .footer-sign.footer-seal-pos--below .footer-labels { order: 1; }
      .footer-sign.footer-seal-pos--below .footer-seal-slot { order: 2; margin-top: 10px; }
      .footer-sign.footer-seal-pos--above {
        align-items: flex-end;
      }
      .footer-sign.footer-seal-pos--above .footer-seal-item {
        flex-direction: column;
        justify-content: flex-end;
        min-height: 0;
      }
      .footer-sign.footer-seal-pos--above .footer-seal-slot { order: 1; margin-bottom: 10px; flex-shrink: 0; }
      .footer-sign.footer-seal-pos--above .footer-labels { order: 2; flex-shrink: 0; }
      .footer-sign.footer-seal-pos--right .footer-seal-item {
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: 12px;
        text-align: left;
      }
      .footer-sign.footer-seal-pos--right .footer-labels { text-align: left; }
      .footer-sign.footer-seal-pos--right .footer-seal-slot { margin: 0; }
      /* 结论/备注行高固定 60px；合格/复检章保持 80px */
      .td-seal-wrap {
        position: relative;
        vertical-align: middle !important;
        padding: 0 !important;
        box-sizing: border-box;
        overflow: visible;
      }
      .td-seal-wrap.has-table-seal {
        padding: 0 !important;
      }
      .td-seal-inner {
        position: relative;
        box-sizing: border-box;
        min-height: 0;
        height: 60px;
        overflow: visible;
      }
      .td-seal-inner > span {
        position: relative;
        z-index: 1;
      }
      /* 合格/复检章：在单元格内居中，不缩小章图 */
      .td-seal-wrap img.seal-table {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 2;
        opacity: 0.9;
        width: auto;
        height: auto;
        max-width: 80px;
        max-height: 80px;
        object-fit: contain;
        object-position: center center;
        pointer-events: none;
      }
      .td-seal-wrap img.seal-table[src$=".svg"] {
        width: 80px;
        height: 80px;
        object-fit: fill;
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
          margin: 5mm;
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
          打印不用 flex 撑满整页高度，避免签章区被挤到第 2 页。
          签章紧跟表格后、压缩间距，尽量与正文落在同一页。
        */
        .paper {
          box-shadow: none !important;
          border: none !important;
          width: 210mm !important;
          max-width: 210mm !important;
          min-height: 0 !important;
          height: auto !important;
          margin: 0 auto !important;
          padding: 5mm 8mm 6mm !important;
          display: block !important;
          page-break-after: auto;
          page-break-inside: auto;
          box-sizing: border-box !important;
          zoom: 0.9;
        }
        .paper::before {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .main-table th,
        .main-table tbody tr:nth-child(even),
        .cell-merged-label {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .paper-main,
        .paper-main-body {
          display: block !important;
          flex: none !important;
          min-height: 0 !important;
        }
        .center-block { margin-bottom: 14px !important; }
        .meta-rows { margin-bottom: 12px !important; }
        .meta-row-2 { margin-bottom: 8px !important; }
        .main-table {
          margin-bottom: 14px !important;
          page-break-inside: auto !important;
          break-inside: auto !important;
          border-collapse: collapse !important;
          border: 1px solid #475569 !important;
        }
        .main-table thead {
          display: table-header-group;
        }
        .main-table th,
        .main-table td {
          padding: 6px 8px !important;
          font-size: 12px !important;
          border: 1px solid #475569 !important;
        }
        .main-table tr.main-table-bottom-row {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-before: avoid !important;
          break-before: avoid !important;
        }
        .main-table th { padding: 7px 8px 8px !important; }
        .main-table tr.main-table-bottom-row {
          height: 60px !important;
        }
        .main-table tr.main-table-bottom-row td {
          height: 60px !important;
          padding: 0 !important;
        }
        .td-seal-wrap {
          padding: 0 !important;
          overflow: visible !important;
        }
        .td-seal-wrap.has-table-seal {
          padding: 0 !important;
        }
        .td-seal-inner {
          height: 60px !important;
          min-height: 0 !important;
          overflow: visible !important;
        }
        .td-seal-wrap img.seal-table {
          max-width: 80px !important;
          max-height: 80px !important;
        }
        .td-seal-wrap img.seal-table[src$=".svg"] {
          width: 80px !important;
          height: 80px !important;
        }
        .footer-sign.print-footer-sign {
          margin-top: 18px !important;
          padding-top: 16px !important;
          padding-bottom: 0 !important;
          border-top: 1px solid #d0d7e2 !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-before: avoid !important;
          break-before: avoid !important;
        }
        .footer-seal-item {
          min-height: 0 !important;
          padding: 2px 4px 4px !important;
        }
        .footer-sign.footer-seal-pos--below .footer-seal-slot {
          margin-top: 4px !important;
        }
        .footer-sign.footer-seal-pos--above .footer-seal-slot {
          margin-bottom: 4px !important;
        }
        .seal-footer {
          width: 72px !important;
          height: 72px !important;
          max-width: 72px !important;
          max-height: 72px !important;
        }
        .footer-seal-slot {
          width: 72px !important;
          height: 72px !important;
        }
        .section-extra {
          margin-top: 10px !important;
          margin-bottom: 10px !important;
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
        .td-seal-wrap img.seal-table {
          position: absolute !important;
          left: 50% !important;
          top: 50% !important;
          transform: translate(-50%, -50%) !important;
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
        <div class="paper-main-body">
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
          <div class="title-divider" aria-hidden="true"></div>
          <h1 class="report-title-zh" id="reportTitleZh"></h1>
          <div class="report-title-en" id="reportTitleEn"></div>
          <div class="title-divider title-divider-bottom" aria-hidden="true"></div>
        </div>

        <div class="meta-rows" id="metaRows"></div>

        <table class="main-table">
          <thead>
            <tr id="itemHead"></tr>
          </thead>
          <tbody id="items"></tbody>
          <tbody id="mainTableBottom" class="main-table-bottom" hidden aria-hidden="true">
            <tr class="main-table-bottom-row">
              <td id="finalConclusionLabelCell" colspan="3" class="cell-merged-label">
                检验结论
                <div class="en">Test conclusion</div>
              </td>
              <td class="td-seal-wrap">
                <div class="td-seal-inner">
                  <span id="finalConclusionText" class="val-red"></span>
                  <img id="sealPass" class="seal seal-pass seal-table" style="display:none" alt="合格章" />
                </div>
              </td>
            </tr>
            <tr class="main-table-bottom-row">
              <td id="remarksLabelCell" colspan="3" class="cell-merged-label">
                备注
                <div class="en">Remarks</div>
              </td>
              <td class="td-seal-wrap">
                <div class="td-seal-inner">
                  <span id="remarksText" class="val-red"></span>
                  <img id="sealRecheck" class="seal seal-recheck seal-table" style="display:none" alt="复检章" />
                </div>
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

        <div id="footerSign" class="footer-sign print-footer-sign footer-seal-pos--below">
          <div class="footer-col">
            <div class="footer-stamp-wrap footer-seal-item">
              <div class="footer-labels">
                <div class="t-cn">主检</div>
                <div class="t-en">Inspector</div>
              </div>
              <div class="footer-seal-slot">
                <img id="sealInspector" class="seal-footer" style="display:none" alt="主检章" />
              </div>
            </div>
          </div>
          <div class="footer-col">
            <div class="footer-stamp-wrap footer-seal-item">
              <div class="footer-labels">
                <div class="t-cn">审核</div>
                <div class="t-en">Supervisor</div>
              </div>
              <div class="footer-seal-slot">
                <img id="sealSupervisor" class="seal-footer" style="display:none" alt="审核章" />
              </div>
            </div>
          </div>
          <div class="footer-col">
            <div class="footer-stamp-wrap footer-seal-item">
              <div class="footer-labels">
                <div class="t-cn">部门</div>
                <div class="t-en">Department</div>
              </div>
              <div class="footer-seal-slot">
                <img id="sealDepartment" class="seal-footer" style="display:none" alt="质检章" />
              </div>
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
        if (titleEl) titleEl.style.display = 'none';
        const topbar = document.querySelector('.topbar');
        if (topbar) topbar.classList.add('topbar--admin-preview');
        const backBtn = document.getElementById('back');
        const printBtn = document.getElementById('print');
        if (backBtn) backBtn.style.display = 'none';
        if (printBtn) printBtn.style.display = 'none';
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
        if (!zh) return '';
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

      function applyFooterSealPosition(pos) {
        const el = document.getElementById('footerSign');
        if (!el) return;
        const allowed = ['below', 'above', 'right'];
        const p = allowed.includes(String(pos || '').trim()) ? String(pos).trim() : 'below';
        el.classList.remove('footer-seal-pos--below', 'footer-seal-pos--above', 'footer-seal-pos--right');
        el.classList.add('footer-seal-pos--' + p);
      }

      let mainTableBottomRowsHtml = null;
      function captureMainTableBottomRows() {
        if (mainTableBottomRowsHtml != null) return;
        const bottom = document.getElementById('mainTableBottom');
        if (!bottom) return;
        mainTableBottomRowsHtml = bottom.innerHTML;
        bottom.remove();
      }
      function appendMainTableBottomRows(itemsEl) {
        captureMainTableBottomRows();
        if (!mainTableBottomRowsHtml || !itemsEl) return;
        itemsEl.insertAdjacentHTML('beforeend', mainTableBottomRowsHtml);
      }
      captureMainTableBottomRows();

      async function load() {
        window.__REPORT_READY = false;
        try {
        document.getElementById('err').textContent = '';
        document.getElementById('items').innerHTML = '';
        document.getElementById('others').innerHTML = '';
        document.getElementById('itemHead').innerHTML = '';
        const metaRowsEl = document.getElementById('metaRows');
        if (metaRowsEl) metaRowsEl.innerHTML = '';
        const sealDepartment = document.getElementById('sealDepartment');
        const sealInspector = document.getElementById('sealInspector');
        const sealSupervisor = document.getElementById('sealSupervisor');
        [sealDepartment, sealInspector, sealSupervisor].forEach((el) => {
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
          if (!res.ok) {
            const code = data && data.error ? String(data.error) : '';
            const msg =
              (data && data.message) ||
              (code === 'FORBIDDEN'
                ? '无权查看该报告'
                : code === 'NOT_FOUND'
                  ? '报告不存在或二维码已失效'
                  : code === 'INTERNAL_ERROR'
                    ? '服务器处理报告数据失败'
                    : code || res.status);
            throw new Error(msg);
          }

          const company = data.company || {};
          applyFooterSealPosition(company.footer_seal_position || company.footerSealPosition);
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

          const appliedSeals = data.appliedSeals || {};

          const tableField =
            fields.find((f) => f.fieldKey === 'inspection_table' && f.fieldType === 'table') ||
            fields.find((f) => f.fieldType === 'table');

          const metaRows = document.getElementById('metaRows');
          if (metaRows) {
            const FIXED_FIELD_CONFIG = [
              { key: 'product_name', labelZh: '产品名称', labelEn: 'Product Name', fallback: function(r) { return r.productName; } },
              { key: 'packing', labelZh: '包装规格', labelEn: 'Packing', fallback: null },
              { key: 'batch_weight', labelZh: '本批数量', labelEn: 'Batch Weight', fallback: null },
              { key: 'batch_no', labelZh: '生产批号', labelEn: 'Batch No.', fallback: function(r) { return r.batchNo; } },
              { key: 'analysis_date', labelZh: '检验日期', labelEn: 'Analysis Date', fallback: null },
              { key: 'ex_mill_date', labelZh: '出厂日期', labelEn: 'EX-mill Date', fallback: null }
            ];

            var allDisplayFields = [];
            FIXED_FIELD_CONFIG.forEach(function(config) {
              var f = fields.find(function(field) { return field.fieldKey === config.key; });
              if (f) {
                var bi = toBi(parseMaybeJson(f.fieldValue));
                var val = (bi.zh || bi.en || '').trim();
                if (config.fallback && !val) {
                  val = String(config.fallback(r) || '').trim();
                  if (val) bi = { zh: val, en: bi.en || val };
                }
                allDisplayFields.push({ labelZh: config.labelZh, labelEn: config.labelEn, value: val, bi: bi });
              }
            });

            var customFields = fields.filter(
              function(f) { return f !== tableField && !LAYOUT_KEYS.has(String(f.fieldKey || '')); }
            );
            customFields.forEach(function(cf) {
              var cv = parseMaybeJson(cf.fieldValue);
              var cbi = toBi(cv);
              allDisplayFields.push({ labelZh: cf.fieldLabel || cf.fieldKey || '', labelEn: cf.fieldLabelEn || '', value: cbi.zh || '', bi: cbi });
            });

            for (var i = 0; i < allDisplayFields.length; i += 2) {
              var crow = document.createElement('div');
              crow.className = 'meta-row-2';
              for (var j = i; j < Math.min(i + 2, allDisplayFields.length); j++) {
                var ff = allDisplayFields[j];
                var pair = document.createElement('div');
                pair.className = 'meta-pair';
                pair.innerHTML =
                  '<div class="meta-line">' +
                    '<div class="meta-label-side">' +
                      '<div class="lab-cn">' + esc(ff.labelZh) + '</div>' +
                      (ff.labelEn ? '<div class="lab-en">' + esc(ff.labelEn) + '</div>' : '') +
                    '</div>' +
                    '<div class="meta-value-side">' + (ff.value ? esc(ff.value) : '&nbsp;') + '</div>' +
                  '</div>';
                crow.appendChild(pair);
              }
              if (Math.min(i + 2, allDisplayFields.length) - i < 2) {
                var placeholder = document.createElement('div');
                placeholder.className = 'meta-pair';
                placeholder.style.visibility = 'hidden';
                crow.appendChild(placeholder);
              }
              metaRows.appendChild(crow);
            }
          }
          let itemRows = [];
          let colLabels = [
            { key: 'item', zh: '检验项目', en: 'Test item' },
            { key: 'unit', zh: '单位', en: 'Unit' },
            { key: 'standard', zh: '标准值', en: 'Normal value' },
            { key: 'result', zh: '检测值', en: 'Test value' }
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
              if (parsed?.columnLabels && parsed.columnLabels.length >= 4) {
                const legacyKeys = ['item', 'unit', 'standard', 'result', 'basis'];
                colLabels = parsed.columnLabels.map((c, idx) => ({
                  key: typeof c === 'object' && c?.key ? String(c.key) : legacyKeys[idx] || ('col_' + idx),
                  zh: typeof c === 'object' ? c.zh ?? '' : String(c),
                  en: typeof c === 'object' ? c.en ?? '' : ''
                }));
              }
              const hasBasisByLabel = colLabels.some((c) => {
                const zh = String(c?.zh || '');
                const en = String(c?.en || '');
                const key = String(c?.key || '');
                return key === 'basis' || zh.includes('检验依据') || /basis|reference/i.test(en);
              });
              function basisHasText(v) {
                if (v == null) return false;
                if (typeof v === 'string') return v.trim() !== '';
                if (typeof v === 'object') return !!(String(v.zh || '').trim() || String(v.en || '').trim() || String(v.cn || '').trim());
                return false;
              }
              const hasBasisByRows = (itemRows || []).some((it) => it && (basisHasText(it.basis) || basisHasText(it.reference)));
              const hasBasisByFlag = parsed?.hasBasisColumn === true;
              if (!hasBasisByLabel && (hasBasisByRows || hasBasisByFlag)) {
                colLabels.push({ key: 'basis', zh: '单项检验依据', en: 'Inspection basis' });
              }
            } catch (e) {
              itemRows = [];
            }
          }

          const colWidths = colLabels.length >= 5 ? ['28%', '10%', '20%', '20%', '22%'] : ['34%', '12%', '27%', '27%'];
          const mergedColspan = Math.max(1, colLabels.length - 1);
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
              const valueByKey = (key, colIndex) => {
                const fallbackByIndex = [
                  it.item ?? it.name ?? it.project ?? '',
                  it.unit ?? it.unitName ?? it.units ?? '',
                  it.standard ?? it.spec ?? '',
                  it.result ?? it.value ?? '',
                  it.basis ?? it.reference ?? ''
                ];
                if (key && it[key] != null) return it[key];
                return fallbackByIndex[colIndex] ?? '';
              };
              const cellHtml = colLabels
                .map((c, idx) => {
                  const val = valueByKey(c.key, idx);
                  if (c.key === 'item') return '<td>' + renderItemCol(val) + '</td>';
                  return '<td>' + renderZhOnly(val) + '</td>';
                })
                .join('');
              return (
                '<tr>' +
                cellHtml +
                '</tr>'
              );
            })
            .join('');
          const itemsEl = document.getElementById('items');
          itemsEl.innerHTML =
            itemHtml ||
            '<tr><td colspan="' + colLabels.length + '" class="muted" style="text-align:center;padding:16px">（未配置检测项目表，请在后台为该报告添加表格类字段）</td></tr>';
          appendMainTableBottomRows(itemsEl);
          const finalConclusionLabelCell = document.getElementById('finalConclusionLabelCell');
          const remarksLabelCell = document.getElementById('remarksLabelCell');
          if (finalConclusionLabelCell) finalConclusionLabelCell.colSpan = mergedColspan;
          if (remarksLabelCell) remarksLabelCell.colSpan = mergedColspan;
          const sealPass = document.getElementById('sealPass');
          const sealRecheck = document.getElementById('sealRecheck');
          [sealPass, sealRecheck].forEach((el) => {
            if (el) el.style.display = 'none';
          });
          document.querySelectorAll('.td-seal-wrap').forEach((el) => {
            el.classList.remove('has-table-seal');
          });

          const tcVal = fieldBi(fields, 'test_conclusion');
          const tcBi = toBi(tcVal);
          const finalEl = document.getElementById('finalConclusionText');
          if (finalEl) {
            if (tcBi.zh) finalEl.innerHTML = renderRedZhOnly(tcVal);
            else finalEl.innerHTML = '';
          }

          const remVal = fieldBi(fields, 'remarks');
          const remBi = toBi(remVal);
          const remarksEl = document.getElementById('remarksText');
          if (remarksEl) {
            remarksEl.innerHTML = remBi.zh ? renderRedZhOnly(remVal) : '';
          }

          const secOthers = document.getElementById('sectionOthers');
          if (secOthers) secOthers.style.display = 'none';

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
            const passWrap = sealPass.closest('.td-seal-wrap');
            if (passWrap) passWrap.classList.add('has-table-seal');
          }
          if (appliedSeals.recheck?.imageUrl && sealRecheck) {
            sealRecheck.src = appliedSeals.recheck.imageUrl;
            sealRecheck.style.display = 'block';
            const recheckWrap = sealRecheck.closest('.td-seal-wrap');
            if (recheckWrap) recheckWrap.classList.add('has-table-seal');
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

      document.getElementById('refresh').addEventListener('click', function () {
        const btn = this;
        btn.disabled = true;
        btn.textContent = '刷新中...';
        const url = new URL(location.href);
        url.searchParams.set('_t', String(Date.now()));
        location.replace(url.toString());
      });
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
  try {
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
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[public/report]', e?.message || e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: '报告加载失败' });
  }
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
