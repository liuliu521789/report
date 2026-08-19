import express, { Router } from 'express';
import { createReadStream } from 'fs';
import fsPromises from 'fs/promises';

import { getPool } from '../../db/pool.js';
import { clientIp, logOperation } from '../../lib/audit.js';
import { verifyWecomContractReviewToken } from '../../lib/wecomContractReviewToken.js';
import { applyContractReview } from '../../lib/contractReviewApply.js';
import { resolveContractUploadFilePath } from '../../lib/salesContractUploadPath.js';
import { verifyWecomShipToken } from '../../lib/wecomShipToken.js';
import { verifyWecomFinanceReviewToken } from '../../lib/wecomFinanceReviewToken.js';
import { performWecomQuickShip } from '../../lib/wecomOrderQuickShip.js';
import {
  appendWecomContractReviewActorCookie,
  appendWecomShipActorCookie,
  buildWecomShipOAuthAuthorizeUrl,
  clearWecomContractReviewActorCookie,
  clearWecomShipActorCookie,
  exchangeWecomOAuthCodeForMappedUser,
  isWecomContractReviewOAuthDisabled,
  isWecomShipOAuthDisabled,
  loadWecomAppCredentials,
  readWecomContractReviewActorCookie,
  readWecomShipActorCookie,
  signWecomContractReviewActorToken,
  signWecomContractReviewOAuthState,
  signWecomShipActorToken,
  signWecomShipOAuthState,
  verifyWecomContractReviewActorToken,
  verifyWecomContractReviewOAuthState,
  verifyWecomShipActorToken,
  verifyWecomShipOAuthState
} from '../../lib/wecomShipOAuth.js';
import { isWarehouseWecomShipActor, resolveWecomPublicBaseUrl } from '../../lib/wecomNotify.js';
import { formatInvoiceAmountZh, resolveAdminInvoiceCenterHref } from '../../lib/contractInvoiceWecomNotify.js';
import { diagnoseWecomPublicBaseUrl, resolveAdminPublicRoot } from '../../lib/wecomPublicUrl.js';
import {
  attachCustomerNamesToOrders,
  formatWarehouseWecomOrderDetail,
  loadOrderFieldDefinitions
} from '../../lib/salesOrderFields.js';

export const router = Router();

const wecomContractReviewForm = express.urlencoded({ extended: true, limit: '256kb' });
/** 确认页「完成发货」表单 POST，仅字段 t（JWT） */
const wecomOrderShipForm = express.urlencoded({ extended: false });

function escapeHtmlContractReview(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 合同审批页 CSP。
 * 企业微信/X5、部分 iOS WKWebView 对 script nonce 支持不完整，脚本会被静默拦截，表格缩放不生效；
 * 此处仅对本页放开 `unsafe-inline`（正文仍为服务端下发的合同 HTML，本身已需可信来源）。
 */
const WECOM_CONTRACT_REVIEW_CSP = [
  "default-src 'none'",
  "img-src * data: blob: https: http:",
  "font-src * data: https: http:",
  "style-src 'unsafe-inline' https: http:",
  "script-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'self'",
  "connect-src 'none'",
  "frame-src 'self'"
].join('; ');

function contentDispositionInlineFilename(downloadName) {
  const name = String(downloadName || 'file');
  const ascii = name.replace(/[^\x20-\x7E]+/g, '_').slice(0, 180) || 'file';
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function contentDispositionAttachmentFilename(downloadName) {
  const name = String(downloadName || 'file');
  const ascii = name.replace(/[^\x20-\x7E]+/g, '_').slice(0, 180) || 'file';
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function wecomContractReviewIframePreviewableMime(mime) {
  const m = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return m === 'application/pdf' || m.startsWith('image/');
}

/** 仅合同正文区（模板 HTML 或上传预览）；依赖 CSP 抑制脚本 */
function buildWecomContractReviewDetailHtml(row, tokenPlain) {
  const esc = escapeHtmlContractReview;
  const docUrl = `/api/public/wecom-contract-review/document?t=${encodeURIComponent(tokenPlain)}`;
  const docUrlAttr = esc(docUrl);
  const dlUrl = `/api/public/wecom-contract-review/document?t=${encodeURIComponent(tokenPlain)}&dl=1`;
  const dlUrlAttr = esc(dlUrl);

  const src = String(row.contract_source || 'template').toLowerCase();

  let bodyBlock = '';
  if (src === 'upload') {
    const fn = esc(row.document_original_filename || '合同附件');
    const mime = row.document_mime_type || '';
    if (wecomContractReviewIframePreviewableMime(mime)) {
      bodyBlock = `<div class="doc-frame-wrap"><iframe class="doc-frame" title="合同文件" src="${docUrlAttr}"></iframe></div><p class="doc-hint">${fn}</p>`;
    } else {
      bodyBlock = `<p class="doc-fallback">本合同为上传文件（${fn}），手机内置预览可能不支持该格式。</p><a class="btn-dl" href="${dlUrlAttr}">下载查看全文</a>`;
    }
  } else {
    const raw = row.body_html != null ? String(row.body_html) : '';
    bodyBlock = raw.trim()
      ? `<div class="contract-html">${raw}</div>`
      : '<p class="muted">暂无合同正文</p>';
  }

  return `<div class="detail"><div class="contract-panel">${bodyBlock}</div></div>`;
}

async function loadWecomContractReviewDetailPayload(pool, contractId, tokenPlain) {
  const [rows] = await pool.query(
    `SELECT c.*, cu.customer_name
     FROM sales_contracts c
     INNER JOIN sales_customers cu ON cu.id = c.customer_id
     WHERE c.id = ? LIMIT 1`,
    [contractId]
  );
  const row = rows?.[0];
  if (!row) return { row: null, detailHtml: '' };
  const detailHtml = buildWecomContractReviewDetailHtml(row, tokenPlain);
  return { row, detailHtml };
}

function wecomContractReviewResultHtml(ok, title, message) {
  const safeTitle = escapeHtmlContractReview(title);
  const safeMsg = escapeHtmlContractReview(message);
  const icon = ok ? '✓' : '!';
  const iconColor = ok ? '#16a34a' : '#dc2626';
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${safeTitle}</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f1f5f9;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:20px;box-sizing:border-box;}
.card{background:#fff;border-radius:14px;padding:22px 18px 26px;max-width:440px;width:100%;box-shadow:0 4px 24px rgba(15,23,42,.08);}
h1{font-size:17px;margin:0 0 12px;text-align:center;color:#0f172a;}
.ic{text-align:center;font-size:36px;margin-bottom:8px;color:${iconColor};}
p{margin:0;font-size:14px;line-height:1.65;color:#475569;text-align:center;white-space:pre-wrap;word-break:break-word;}
.fine{margin-top:18px;font-size:12px;color:#94a3b8;text-align:center;line-height:1.45;}
</style></head><body><div class="card"><div class="ic">${icon}</div><h1>${safeTitle}</h1><p>${safeMsg}</p><p class="fine">可关闭本页；必要时请在电脑端核对合同列表状态。</p></div></body></html>`;
}

function wecomContractReviewPageHtml({ tokenEsc, blockReason, canAct, detailHtml }) {
  const reason = blockReason
    ? `<p class="warn">${escapeHtmlContractReview(blockReason)}</p>`
    : '';
  const formSection = canAct
    ? `<div class="approve-panel"><form method="post" action="/api/public/wecom-contract-review/submit" class="form">
        <input type="hidden" name="t" value="${tokenEsc}" />
        <label class="lab">驳回时请填写意见</label>
        <textarea name="comment" rows="4" placeholder="通过可不填；驳回必填"></textarea>
        <div class="btns">
          <button type="submit" name="result" value="approved" class="btn btn-ok">通过</button>
          <button type="submit" name="result" value="rejected" class="btn btn-no">驳回</button>
        </div>
      </form></div>`
    : '';
  const detail = detailHtml || '';
  const tableFitScript = `<script>(function(){
function scaleContractTables(){
var wrap=document.querySelector(".contract-html");
if(!wrap)return;
var vw=wrap.clientWidth||wrap.getBoundingClientRect().width;
if(vw<48)return;
var pad=4;
var avail=Math.max(vw-pad,48);
var tables=wrap.querySelectorAll("table");
for(var i=0;i<tables.length;i++){
var tbl=tables[i];
var inner=tbl.closest(".wecom-table-scale-inner");
var holder=inner&&inner.parentElement;
if(!inner){
holder=document.createElement("div");
holder.className="wecom-table-scale";
inner=document.createElement("div");
inner.className="wecom-table-scale-inner";
tbl.parentNode.insertBefore(holder,tbl);
inner.appendChild(tbl);
holder.appendChild(inner);
}
tbl.style.width="max-content";
tbl.style.maxWidth="none";
tbl.style.tableLayout="auto";
inner.style.transform="none";
inner.style.width="max-content";
var tw=Math.max(tbl.scrollWidth,tbl.offsetWidth)||1;
try{tw=Math.max(tw,tbl.getBoundingClientRect().width||0);}catch(e){}
if(tw<1)tw=1;
var s=tw>avail?(avail/tw):1;
if(s>1)s=1;
inner.style.width=tw+"px";
inner.style.transform="scale("+s+")";
var hScaled=0;
try{
var br=inner.getBoundingClientRect();
hScaled=br&&isFinite(br.height)?br.height:0;
}catch(e){}
if(!(hScaled>0)){
hScaled=(tbl.offsetHeight||0)*s;
}
var slack=4;
holder.style.height=(Math.ceil(hScaled)+slack)+"px";
}
}
function schedule(){
scaleContractTables();
requestAnimationFrame(function(){requestAnimationFrame(scaleContractTables);});
setTimeout(scaleContractTables,80);
setTimeout(scaleContractTables,320);
}
function bindImgLoads(){
var wrap=document.querySelector(".contract-html");
if(!wrap)return;
var imgs=wrap.querySelectorAll("img");
for(var k=0;k<imgs.length;k++){
var im=imgs[k];
if(im.complete)continue;
im.addEventListener("load",schedule,{once:true,passive:true});
}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule);
else schedule();
bindImgLoads();
window.addEventListener("resize",scaleContractTables,{passive:true});
window.addEventListener("orientationchange",schedule,{passive:true});
window.addEventListener("load",schedule,{passive:true});
})();</script>`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>合同审批</title>
<style>
*{box-sizing:border-box;} html,body{overflow-x:hidden;}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#e8f0fe;min-height:100vh;padding:12px;padding-bottom:calc(12px + env(safe-area-inset-bottom));} 
.wrap{width:100%;max-width:640px;margin:0 auto;text-align:center;} h1{font-size:17px;margin:0 0 10px;color:#1e293b;font-weight:700;text-align:center;}
.warn{color:#b45309;font-size:14px;line-height:1.5;margin:0 0 12px;padding:10px 12px;background:#fffbeb;border-radius:10px;border:1px solid #fde68a;text-align:center;}
.detail{margin-bottom:12px;width:100%;max-width:100%;text-align:left;}
.detail .contract-html{text-align:left;}
.contract-panel{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 8px;width:100%;max-width:100%;overflow-x:hidden;}
.muted{color:#94a3b8;font-size:13px;margin:0;}
.contract-html{font-size:13px;line-height:1.5;color:#1e293b;width:100%;max-width:100%;overflow-x:hidden;-webkit-text-size-adjust:100%;}
.contract-html img,svg{max-width:100%!important;height:auto!important;}
.contract-html video{max-width:100%!important;height:auto!important;}
.wecom-table-scale{width:100%;overflow:hidden;line-height:0;margin:0 auto;}
.wecom-table-scale-inner{display:inline-block;vertical-align:top;transform-origin:top left;line-height:normal;}
.contract-html table{width:max-content!important;max-width:none!important;table-layout:auto!important;border-collapse:collapse;}
.contract-html colgroup col{width:auto!important;}
.contract-html td,.contract-html th{
  min-width:0;
  word-break:break-word;
  overflow-wrap:anywhere;
  white-space:normal;
  vertical-align:top;
  padding:4px 6px!important;
  font-size:inherit;
}
.contract-html td[style],.contract-html th[style]{min-width:0!important;}
.contract-html div,.contract-html section,.contract-html p{max-width:100%;}
.contract-html pre{white-space:pre-wrap;word-break:break-word;max-width:100%;overflow-x:hidden;}
.doc-frame-wrap{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;width:100%;max-width:100%;}
.doc-frame{width:100%;max-width:100%;height:min(70vh,520px);border:none;display:block;}
.doc-hint{font-size:12px;color:#64748b;margin:8px 0 0;text-align:center;}
.doc-fallback{font-size:14px;color:#475569;line-height:1.55;margin:0 0 12px;}
.btn-dl{display:block;text-align:center;padding:12px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:15px;}
.approve-panel{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 12px;width:100%;max-width:100%;}
.form{margin:0;} .lab{display:block;font-size:13px;color:#64748b;margin-bottom:8px;text-align:center;}
textarea{width:100%;max-width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;resize:vertical;min-height:88px;text-align:left;}
.btns{display:flex;gap:10px;margin-top:14px;} 
.btn{flex:1;padding:13px 12px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;}
.btn-ok{background:#22c55e;color:#fff;} .btn-no{background:#fff;color:#dc2626;border:2px solid #fecaca;}
.fine{font-size:12px;color:#94a3b8;line-height:1.45;margin-top:14px;text-align:center;}
@keyframes shake{0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-6px)}20%,40%,60%,80%{transform:translateX(6px)}}
.error-textarea{border-color:#dc2626!important;background:#fef2f2!important;}
.shake{animation:shake .45s ease-in-out;}
</style></head><body><div class="wrap"><h1>合同审批</h1>
${detail}
${reason}
${formSection}
<p class="fine">链接仅当前审批人可用，请勿转发。打开即代表您确认在企业微信内身份可信。</p>
</div>${tableFitScript}<script>(function(){var f=document.querySelector('.form');if(!f)return;f.addEventListener('submit',function(e){var s=e.submitter,ta=this.querySelector('textarea');if(s&&s.value==='rejected'&&!ta.value.trim()){e.preventDefault();ta.classList.add('error-textarea','shake');setTimeout(function(){ta.classList.remove('shake')},500)}})})();</script></body></html>`;
}


// Public "scan" endpoint for WeChat/browser users.
// Keep a stable HTTP URL and route users to a mobile-friendly landing page.

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

/** 页面/API 绝对地址：优先与发卡片相同的公网根（.env），避免 OAuth redirect_uri 与可信域名不一致 */
function wecomOrderShipPublicOrigin(req) {
  const fromEnv = resolveWecomPublicBaseUrl();
  if (fromEnv) return String(fromEnv).trim().replace(/\/+$/, '');
  const host = req.get('host') || '';
  const proto = req.protocol || 'http';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

/** 企业微信卡片整块同 URL：先进此页展示摘要，仅页面底部表单 POST 真正发货接口，避免误点正文即发货 */
function wecomOrderShipConfirmPageHtml({ orderNo, orderDetailText, canShip, shipPost, blockReason, actorHint }) {
  const detailRaw =
    orderDetailText != null && String(orderDetailText).trim() !== ''
      ? String(orderDetailText)
      : `订单号：${orderNo || '—'}`;
  const detailHtml = `<div class="order-detail">${wecomShipEscapeHtml(detailRaw)}</div>`;
  const actorHtml =
    actorHint && String(actorHint).trim()
      ? `<p class="actor-hint">发货操作人（企业微信已识别）：<strong>${wecomShipEscapeHtml(String(actorHint).trim())}</strong></p>`
      : '';
  const reasonHtml = blockReason
    ? `<p class="hint-warn">${wecomShipEscapeHtml(blockReason)}</p>`
    : '';
  const btnHtml =
    canShip && shipPost?.actionUrl && shipPost?.token
      ? `<form method="post" action="${escapeHtmlAttr(shipPost.actionUrl)}">
  <input type="hidden" name="t" value="${escapeHtmlAttr(shipPost.token)}" />
  <button type="submit" class="btn-ship">完成发货</button>
</form>`
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
        border: none; cursor: pointer; font-family: inherit;
      }
      .btn-ship:active { opacity: 0.92; }
      .fine { margin: 14px 0 0; font-size: 12px; color: #94a3b8; line-height: 1.45; text-align: center; }
      .actor-hint { margin: 0 0 14px; font-size: 13px; color: #475569; line-height: 1.5; text-align: center; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>确认发货</h1>
      ${actorHtml}
      ${detailHtml}
      <p class="lead">请对照以上信息确认备货无误后，点击下方按钮将本单标记为「已发货」。打开本页不会自动发货。</p>
      ${reasonHtml}
      ${btnHtml}
      <p class="fine">若按钮不可用，请回到电脑端订单管理处理，或联系财务重新推送。</p>
    </div>
  </body>
</html>`;
}

/** 企业微信「开票待处理」卡片：引导打开管理后台开票中心 */
function wecomInvoiceCenterLandingHtml({ contractNo, customerName, amount, adminHref }) {
  const safeContract = wecomShipEscapeHtml(contractNo || '—');
  const safeCustomer = wecomShipEscapeHtml(customerName || '—');
  const safeAmount = wecomShipEscapeHtml(amount || '—');
  const safeHref = escapeHtmlAttr(adminHref);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>开票中心</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        background: #f1f5f9; color: #0f172a; display: flex; align-items: center; justify-content: center;
        padding: 24px; padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
      .card { background: #fff; border-radius: 12px; padding: 26px 22px 28px; max-width: 420px; width: 100%;
        box-shadow: 0 4px 24px rgba(15,23,42,0.08); text-align: center; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      .meta { margin: 0 0 18px; font-size: 14px; color: #475569; line-height: 1.55; text-align: left; }
      .meta strong { color: #0f172a; }
      .btn-open {
        display: block; width: 100%; padding: 14px 16px; border-radius: 10px; background: #2563eb; color: #fff !important;
        font-size: 16px; font-weight: 600; text-align: center; text-decoration: none; -webkit-tap-highlight-color: transparent;
      }
      .btn-open:active { opacity: 0.92; }
      .fine { margin: 16px 0 0; font-size: 12px; color: #94a3b8; line-height: 1.45; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>合同开票待处理</h1>
      <p class="meta">合同号：<strong>${safeContract}</strong><br/>客户：<strong>${safeCustomer}</strong><br/>开票金额：<strong>${safeAmount}</strong> 元</p>
      <a class="btn-open" href="${safeHref}">打开开票中心</a>
      <p class="fine">若无法打开，请配置 ADMIN_PUBLIC_URL 指向管理后台 HTTPS 地址，并将该域名加入企业微信应用「可信网页域名」。</p>
    </div>
  </body>
</html>`;
}

/** 企业微信「提交/撤回财务审核」卡片：引导打开管理后台订单页（Hash 路由） */
function wecomFinanceReviewLandingHtml({ orderNo, batchCount, ordersAdminHref }) {
  const safeNo = wecomShipEscapeHtml(orderNo || '—');
  const bc = Number(batchCount) || 1;
  const batchLine =
    bc > 1
      ? `<p class="lead">本次相关订单共 <strong>${wecomShipEscapeHtml(String(bc))}</strong> 笔，以下为其中一笔订单号。</p>`
      : '<p class="lead">请登录管理后台，在订单管理中完成财务审核。</p>';
  const safeHref = escapeHtmlAttr(ordersAdminHref);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>财务审核</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        background: #f1f5f9; color: #0f172a; display: flex; align-items: center; justify-content: center;
        padding: 24px; padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
      .card { background: #fff; border-radius: 12px; padding: 26px 22px 28px; max-width: 420px; width: 100%;
        box-shadow: 0 4px 24px rgba(15,23,42,0.08); text-align: center; }
      h1 { font-size: 18px; margin: 0 0 16px; }
      .ord { font-size: 15px; color: #334155; margin: 0 0 18px; line-height: 1.5; }
      .ord strong { color: #0f172a; }
      .lead { margin: 0 0 18px; font-size: 14px; color: #475569; line-height: 1.55; text-align: left; }
      .btn-open {
        display: block; width: 100%; padding: 14px 16px; border-radius: 10px; background: #2563eb; color: #fff !important;
        font-size: 16px; font-weight: 600; text-align: center; text-decoration: none; -webkit-tap-highlight-color: transparent;
      }
      .btn-open:active { opacity: 0.92; }
      .fine { margin: 16px 0 0; font-size: 12px; color: #94a3b8; line-height: 1.45; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>订单财务审核</h1>
      ${batchLine}
      <p class="ord">订单号：<strong>${safeNo}</strong></p>
      <a class="btn-open" href="${safeHref}">打开订单管理</a>
      <p class="fine">若无法打开，请复制链接到已登录后台的浏览器，或联系管理员核对 PUBLIC_BASE_URL / ADMIN_PUBLIC_URL。</p>
    </div>
  </body>
</html>`;
}

/** 自检：在手机/企业微信中打开，确认能访问到本服务（与「完成发货」同机同域） */
router.get('/api/public/wecom-order-ship-probe', (req, res) => {
  res.type('text').send('wecom-ship-probe-ok');
});

router.get('/api/public/wecom-invoice-center-probe', (req, res) => {
  res.type('text').send('wecom-invoice-center-probe-ok');
});

router.get('/api/public/wecom-contract-review-probe', (req, res) => {
  const diag = diagnoseWecomPublicBaseUrl();
  if (!diag.ok) {
    return res.status(503).type('text').send(`wecom-contract-review-probe-fail: ${diag.message}`);
  }
  res.type('text').send(`wecom-contract-review-probe-ok base=${diag.base}`);
});

/** 企业微信网页授权回调：换取 userid → 映射系统用户 → 写入 HttpOnly Cookie → 回到确认页 */
router.get('/api/public/wecom-order-ship-oauth', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    if (!code || !state) {
      return res
        .status(400)
        .type('html')
        .send(wecomOrderShipResultHtml(false, '授权未完成', '请关闭本页后，从企业微信订单卡片重新进入。'));
    }
    let shipToken;
    try {
      ({ shipToken } = verifyWecomShipOAuthState(state));
    } catch {
      return res
        .status(400)
        .type('html')
        .send(wecomOrderShipResultHtml(false, '授权已过期', '请从订单卡片重新打开发货链接。'));
    }
    const pool = getPool();
    let wxUserId = '';
    let mapped = null;
    try {
      const r = await exchangeWecomOAuthCodeForMappedUser(pool, code);
      wxUserId = r.wxUserId;
      mapped = r.mapped;
    } catch (e) {
      const isWx =
        e?.code === 'WECOM_OAUTH_USERINFO_FAILED' ||
        e?.code === 'WECOM_OAUTH_USERID_EMPTY' ||
        e?.code === 'WECOM_TOKEN_ERROR';
      const msg = isWx
        ? '企业微信授权无效或已过期，请从订单卡片重新进入。'
        : '无法获取企业微信身份，请稍后再试或联系管理员。';
      return res.status(400).type('html').send(wecomOrderShipResultHtml(false, '身份验证失败', msg));
    }
    if (!mapped) {
      const safe = wecomShipEscapeHtml(wxUserId || '未知');
      return res.status(403).type('html').send(
        wecomOrderShipResultHtml(
          false,
          '账号未绑定',
          `当前企业微信账号（${safe}）未在系统中绑定员工。请在管理端「用户管理」中为对应员工填写企业微信 UserID 后再发货。`
        )
      );
    }
    const actorJwt = signWecomShipActorToken(mapped.userId, mapped.displayName);
    appendWecomShipActorCookie(res, actorJwt);
    const backBase = resolveWecomPublicBaseUrl() || wecomOrderShipPublicOrigin(req);
    const back = `${String(backBase).trim().replace(/\/+$/, '')}/api/public/wecom-order-ship-confirm?t=${encodeURIComponent(shipToken)}`;
    return res.redirect(302, back);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[wecom-order-ship-oauth]', e?.message || e);
    return res
      .status(500)
      .type('html')
      .send(wecomOrderShipResultHtml(false, '暂时无法处理', '服务器异常，请稍后再试。'));
  }
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
    const origin = wecomOrderShipPublicOrigin(req);
    const shipPost = {
      actionUrl: `${origin}/api/public/wecom-order-ship`,
      token
    };

    let actorHint = '';
    if (!isWecomShipOAuthDisabled()) {
      const ck = readWecomShipActorCookie(req);
      if (ck) {
        try {
          const a = verifyWecomShipActorToken(ck);
          actorHint = a.displayName || '';
        } catch {
          actorHint = '';
        }
      }
      if (!actorHint) {
        try {
          const oauthBase = resolveWecomPublicBaseUrl();
          if (!oauthBase) {
            return res
              .status(503)
              .type('html')
              .send(
                wecomOrderShipResultHtml(
                  false,
                  '无法完成企业微信授权',
                  '服务器未配置 PUBLIC_BASE_URL（或 WECOM_PUBLIC_BASE_URL）。网页授权的 redirect_uri 必须与自建应用「可信域名」一致，不能使用请求头猜测的地址。请在服务器 .env 中设置为已备案且已在企微后台校验通过的 HTTPS 根地址（勿带末尾斜杠），例如 https://report.example.com ，保存后重启服务。'
                )
              );
          }
          const creds = await loadWecomAppCredentials(pool);
          const redirectUri = `${String(oauthBase).trim().replace(/\/+$/, '')}/api/public/wecom-order-ship-oauth`;
          const state = signWecomShipOAuthState(token);
          const authUrl = buildWecomShipOAuthAuthorizeUrl({
            corpId: creds.corpId,
            agentId: creds.agentId,
            redirectUri,
            state
          });
          return res.redirect(302, authUrl);
        } catch (e) {
          if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'JWT_SECRET_NOT_SET') {
            return res
              .status(503)
              .type('html')
              .send(
                wecomOrderShipResultHtml(
                  false,
                  '无法验证身份',
                  '企业微信未配置或 JWT 未设置。请检查 wecom_config，或在开发环境设置 WECOM_SHIP_OAUTH_DISABLED=true 临时跳过网页授权。'
                )
              );
          }
          throw e;
        }
      }
    }

    let warehouseShipBlocked = '';
    if (!isWecomShipOAuthDisabled() && actorHint) {
      const ck = readWecomShipActorCookie(req);
      if (ck) {
        try {
          const { userId: actorUid } = verifyWecomShipActorToken(ck);
          const okWh = await isWarehouseWecomShipActor(pool, actorUid);
          if (!okWh) {
            warehouseShipBlocked =
              '当前账号不在系统配置的仓库收货人范围内，无法通过本页发货。若您应为仓库人员，请联系管理员核对「快捷仓库」或员工类别（仓库）与企业微信 UserID。';
          }
        } catch {
          warehouseShipBlocked = '';
        }
      }
    }

    if (status === 'shipped') {
      return res
        .type('html')
        .send(
          wecomOrderShipConfirmPageHtml({
            orderNo,
            orderDetailText,
            canShip: false,
            shipPost,
            blockReason: '该订单已是「已发货」状态，无需重复操作。',
            actorHint
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
            shipPost,
            blockReason: '当前订单状态不允许从本页发货（可能已撤回或未在「待备货发货」状态）。请在电脑端查看订单。',
            actorHint
          })
        );
    }
    return res
      .type('html')
      .send(
        wecomOrderShipConfirmPageHtml({
          orderNo,
          orderDetailText,
          canShip: !warehouseShipBlocked,
          shipPost,
          blockReason: warehouseShipBlocked,
          actorHint
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

/** 旧版 GET 兼容：仅提示页，绝不修改订单（发货仅 POST） */
router.get('/api/public/wecom-order-ship', (_req, res) => {
  return res
    .status(405)
    .type('html')
    .send(
      wecomOrderShipResultHtml(false, '提示', '请从确认页点击「完成发货」按钮。')
    );
});

/** 企业微信确认页内「完成发货」：POST；JWT 在表单字段 t（或 JSON body.t / 兼容 query.t），无需登录 */
router.post('/api/public/wecom-order-ship', wecomOrderShipForm, async (req, res) => {
  try {
    const token = String(req.body?.t || req.query?.t || '').trim();
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
    let actorUserId = null;
    if (!isWecomShipOAuthDisabled()) {
      const ck = readWecomShipActorCookie(req);
      if (!ck) {
        return res
          .status(403)
          .type('html')
          .send(
            wecomOrderShipResultHtml(
              false,
              '无法发货',
              '未通过企业微信身份验证。请从订单卡片重新进入确认页，完成授权后再点「完成发货」。'
            )
          );
      }
      try {
        const a = verifyWecomShipActorToken(ck);
        actorUserId = a.userId;
      } catch {
        return res
          .status(403)
          .type('html')
          .send(
            wecomOrderShipResultHtml(
              false,
              '无法发货',
              '身份已过期，请从订单卡片重新进入并完成企业微信授权。'
            )
          );
      }
      const okWh = await isWarehouseWecomShipActor(pool, actorUserId);
      if (!okWh) {
        return res
          .status(403)
          .type('html')
          .send(
            wecomOrderShipResultHtml(
              false,
              '无权限发货',
              '当前账号不在仓库收货人范围内。多人收到通知时，仅配置的仓库同事可点击发货；若身份有误请联系管理员维护「快捷仓库」或员工类别与企业微信 UserID。'
            )
          );
      }
    }
    const r = await performWecomQuickShip(pool, orderId, { actorUserId });
    if (!r.ok) {
      const statusCode = r.code === 'NOT_FOUND' ? 404 : 400;
      return res.status(statusCode).type('html').send(wecomOrderShipResultHtml(false, '无法发货', r.message));
    }
    clearWecomShipActorCookie(res);
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

/** 审批链接内嵌预览：上传类合同 PDF/图片等同源 iframe；dl=1 强制下载 */
router.get('/api/public/wecom-contract-review/document', async (req, res) => {
  try {
    const token = String(req.query.t || '').trim();
    const wantDl = String(req.query.dl || '').trim() === '1';
    if (!token) return res.status(400).type('text').send('bad token');
    let payload;
    try {
      payload = verifyWecomContractReviewToken(token);
    } catch {
      return res.status(403).type('text').send('forbidden');
    }
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT contract_source, document_stored_rel_path, document_mime_type, document_original_filename
       FROM sales_contracts WHERE id = ? LIMIT 1`,
      [payload.contractId]
    );
    const row = rows?.[0];
    if (!row || String(row.contract_source || '').toLowerCase() !== 'upload') {
      return res.status(404).type('text').send('not found');
    }
    const full = resolveContractUploadFilePath(row);
    if (!full) return res.status(404).type('text').send('not found');
    try {
      await fsPromises.access(full);
    } catch {
      return res.status(404).type('text').send('missing');
    }
    const mime =
      String(row.document_mime_type || 'application/octet-stream').split(';')[0].trim() ||
      'application/octet-stream';
    res.setHeader(
      'Content-Disposition',
      wantDl
        ? contentDispositionAttachmentFilename(row.document_original_filename)
        : contentDispositionInlineFilename(row.document_original_filename)
    );
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = createReadStream(full);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[wecom-contract-review-document]', e?.message || e);
    if (!res.headersSent) res.status(500).type('text').send('error');
  }
});

/** 企业微信打开：合同审批页（JWT 绑定合同 + 当前审批人） */
router.get('/api/public/wecom-contract-review-oauth', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    if (!code || !state) {
      return res
        .status(400)
        .type('html')
        .send(wecomContractReviewResultHtml(false, '授权未完成', '请关闭本页后，从企业微信通知重新进入。'));
    }
    let reviewToken;
    try {
      ({ reviewToken } = verifyWecomContractReviewOAuthState(state));
    } catch {
      return res
        .status(400)
        .type('html')
        .send(wecomContractReviewResultHtml(false, '授权已过期', '请从企业微信通知重新进入。'));
    }
    let tokenPayload;
    try {
      tokenPayload = verifyWecomContractReviewToken(reviewToken);
    } catch {
      return res
        .status(400)
        .type('html')
        .send(wecomContractReviewResultHtml(false, '链接无效或已过期', '请从企业微信通知重新进入。'));
    }
    const pool = getPool();
    const { wxUserId, mapped } = await exchangeWecomOAuthCodeForMappedUser(pool, code);
    if (!mapped) {
      const safe = wecomShipEscapeHtml(wxUserId || '未知');
      return res.status(403).type('html').send(
        wecomContractReviewResultHtml(
          false,
          '账号未绑定',
          `当前企业微信账号（${safe}）未在系统中绑定员工。请联系管理员在「用户管理」中维护企业微信 UserID。`
        )
      );
    }
    if (Number(mapped.userId) !== Number(tokenPayload.reviewerUserId)) {
      return res
        .status(403)
        .type('html')
        .send(wecomContractReviewResultHtml(false, '无权审批', '当前登录企业微信账号不是该合同当前审批人。'));
    }
    const actorJwt = signWecomContractReviewActorToken(mapped.userId, mapped.displayName);
    appendWecomContractReviewActorCookie(res, actorJwt);
    const backBase = resolveWecomPublicBaseUrl() || wecomOrderShipPublicOrigin(req);
    const back = `${String(backBase).trim().replace(/\/+$/, '')}/api/public/wecom-contract-review?t=${encodeURIComponent(reviewToken)}`;
    return res.redirect(302, back);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[wecom-contract-review-oauth]', e?.message || e);
    return res
      .status(500)
      .type('html')
      .send(wecomContractReviewResultHtml(false, '暂时无法处理', '服务器异常，请稍后再试。'));
  }
});

/** 企业微信：开票中心引导页（文本卡片入口；再跳转管理后台 Hash 路由） */
router.get('/api/public/wecom-invoice-center', async (req, res) => {
  try {
    const invoiceIdRaw = req.query.invoice_id != null ? Number(req.query.invoice_id) : NaN;
    const invoiceId = Number.isFinite(invoiceIdRaw) && invoiceIdRaw >= 1 ? Math.floor(invoiceIdRaw) : null;

    let contractNo = '';
    let customerName = '';
    let amount = '—';
    if (invoiceId != null) {
      const pool = getPool();
      const [rows] = await pool.query(
        `SELECT iv.amount, c.contract_no, cu.customer_name
         FROM sales_contract_invoices iv
         INNER JOIN sales_contracts c ON c.id = iv.contract_id
         INNER JOIN sales_customers cu ON cu.id = c.customer_id
         WHERE iv.id = ? LIMIT 1`,
        [invoiceId]
      );
      const row = rows?.[0];
      if (row) {
        contractNo = row.contract_no != null ? String(row.contract_no) : '';
        customerName = row.customer_name != null ? String(row.customer_name) : '';
        amount = formatInvoiceAmountZh(row);
      }
    }

    const adminRoot = resolveAdminPublicRoot();
    if (!adminRoot) {
      return res
        .status(503)
        .type('html')
        .send(
          wecomOrderShipResultHtml(
            false,
            '服务器未配置',
            '未设置 PUBLIC_BASE_URL 或 ADMIN_PUBLIC_URL，无法生成管理后台入口。请在 .env 配置 HTTPS 公网地址。'
          )
        );
    }

    const adminHref = resolveAdminInvoiceCenterHref(invoiceId);
    if (!adminHref) {
      return res
        .status(503)
        .type('html')
        .send(wecomOrderShipResultHtml(false, '无法生成链接', '请配置 ADMIN_PUBLIC_URL 为管理后台访问地址。'));
    }

    return res
      .type('html')
      .send(wecomInvoiceCenterLandingHtml({ contractNo, customerName, amount, adminHref }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[wecom-invoice-center]', e?.message || e);
    return res
      .status(500)
      .type('html')
      .send(wecomOrderShipResultHtml(false, '暂时无法处理', '服务器异常，请稍后再试。'));
  }
});

/** 企业微信：财务审核引导页（JWT 绑定首笔订单；跳转后台 Hash 路由「待财务审核」视图） */
router.get('/api/public/wecom-finance-review', async (req, res) => {
  try {
    const token = String(req.query.t || '').trim();
    if (!token) {
      return res
        .status(400)
        .type('html')
        .send(wecomOrderShipResultHtml(false, '无法打开', '链接无效，请从企业微信通知重新进入。'));
    }
    let orderId;
    let batchCount = 1;
    try {
      const v = verifyWecomFinanceReviewToken(token);
      orderId = v.orderId;
      batchCount = v.batchCount;
    } catch {
      return res
        .status(400)
        .type('html')
        .send(
          wecomOrderShipResultHtml(false, '链接无效或已过期', '请从企业微信通知重新进入，或联系管理员核对服务器时间与 JWT 配置。')
        );
    }
    const pool = getPool();
    const [rows] = await pool.query('SELECT id, order_no FROM sales_orders WHERE id = ? LIMIT 1', [orderId]);
    const row = rows?.[0];
    const orderNo = row?.order_no != null ? String(row.order_no) : '';
    const envAdmin = String(process.env.ADMIN_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    const pubBase = String(resolveWecomPublicBaseUrl() || '').trim().replace(/\/+$/, '');
    const adminRoot = envAdmin || pubBase;
    if (!adminRoot) {
      return res
        .status(503)
        .type('html')
        .send(
          wecomOrderShipResultHtml(
            false,
            '服务器未配置',
            '未设置 PUBLIC_BASE_URL（或 WECOM_PUBLIC_BASE_URL），无法生成管理后台入口链接。'
          )
        );
    }
    const ordersAdminHref = `${adminRoot}/#/sales/orders?view=finance&focus_order_id=${orderId}`;
    return res.type('html').send(wecomFinanceReviewLandingHtml({ orderNo, batchCount, ordersAdminHref }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[wecom-finance-review]', e?.message || e);
    return res
      .status(500)
      .type('html')
      .send(wecomOrderShipResultHtml(false, '暂时无法处理', '服务器异常，请稍后再试。'));
  }
});

/** 企业微信打开：合同审批页（JWT 绑定合同 + 当前审批人） */
router.get('/api/public/wecom-contract-review', async (req, res) => {
  try {
    const token = String(req.query.t || '').trim();
    if (!token) {
      return res
        .status(400)
        .type('html')
        .send(wecomContractReviewResultHtml(false, '无法打开', '链接无效。'));
    }
    let payload;
    try {
      payload = verifyWecomContractReviewToken(token);
    } catch {
      return res
        .status(400)
        .type('html')
        .send(
          wecomContractReviewResultHtml(
            false,
            '链接无效或已过期',
            '请从企业微信通知重新进入，或联系同事重新提交审核。'
          )
        );
    }
    if (!isWecomContractReviewOAuthDisabled()) {
      const ck = readWecomContractReviewActorCookie(req);
      if (!ck) {
        const oauthBase = resolveWecomPublicBaseUrl();
        if (!oauthBase) {
          const diag = diagnoseWecomPublicBaseUrl();
          return res
            .status(503)
            .type('html')
            .send(
              wecomContractReviewResultHtml(
                false,
                '无法完成企业微信授权',
                diag.message ||
                  '服务器未配置 PUBLIC_BASE_URL（须为 API 服务根，能访问 /api/public/wecom-contract-review-probe）。管理后台请用 ADMIN_PUBLIC_URL，勿与 PUBLIC_BASE_URL 混用。'
              )
            );
        }
        try {
          const pool = getPool();
          const creds = await loadWecomAppCredentials(pool);
          const redirectUri = `${String(oauthBase).trim().replace(/\/+$/, '')}/api/public/wecom-contract-review-oauth`;
          const state = signWecomContractReviewOAuthState(token);
          const authUrl = buildWecomShipOAuthAuthorizeUrl({
            corpId: creds.corpId,
            agentId: creds.agentId,
            redirectUri,
            state
          });
          return res.redirect(302, authUrl);
        } catch (e) {
          if (e?.code === 'WECOM_NOT_CONFIGURED' || e?.code === 'JWT_SECRET_NOT_SET') {
            return res
              .status(503)
              .type('html')
              .send(
                wecomContractReviewResultHtml(
                  false,
                  '无法验证身份',
                  '企业微信未配置或 JWT 未设置。请检查 wecom_config，或在开发环境设置 WECOM_CONTRACT_REVIEW_OAUTH_DISABLED=true 临时跳过身份校验。'
                )
              );
          }
          throw e;
        }
      }
      try {
        const actor = verifyWecomContractReviewActorToken(ck);
        if (Number(actor.userId) !== Number(payload.reviewerUserId)) {
          return res
            .status(403)
            .type('html')
            .send(wecomContractReviewResultHtml(false, '无权审批', '当前企业微信账号不是该合同当前审批人。'));
        }
      } catch {
        clearWecomContractReviewActorCookie(res);
        return res
          .status(403)
          .type('html')
          .send(wecomContractReviewResultHtml(false, '身份已过期', '请从企业微信通知重新进入并完成身份验证。'));
      }
    }
    const pool = getPool();
    const { row, detailHtml } = await loadWecomContractReviewDetailPayload(pool, payload.contractId, token);
    if (!row) {
      return res
        .status(404)
        .type('html')
        .send(wecomContractReviewResultHtml(false, '合同不存在', '记录可能已删除。'));
    }
    const tokenEsc = escapeHtmlContractReview(token);
    res.setHeader('Content-Security-Policy', WECOM_CONTRACT_REVIEW_CSP);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    if (String(row.status) !== 'pending_review') {
      return res.type('html').send(
        wecomContractReviewPageHtml({
          tokenEsc,
          blockReason: '当前合同不在「待审核」状态，无需在本页操作。',
          canAct: false,
          detailHtml
        })
      );
    }
    if (Number(row.reviewer_user_id) !== Number(payload.reviewerUserId)) {
      return res.type('html').send(
        wecomContractReviewPageHtml({
          tokenEsc,
          blockReason: '您不是当前环节的审批责任人，或审批已流转给他人。',
          canAct: false,
          detailHtml
        })
      );
    }
    return res.type('html').send(
      wecomContractReviewPageHtml({
        tokenEsc,
        blockReason: '',
        canAct: true,
        detailHtml
      })
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[wecom-contract-review]', e?.message || e);
    return res
      .status(500)
      .type('html')
      .send(wecomContractReviewResultHtml(false, '暂时无法打开', '服务器异常，请稍后在电脑端处理。'));
  }
});

router.post('/api/public/wecom-contract-review/submit', wecomContractReviewForm, async (req, res) => {
  try {
    const token = String(req.body?.t || '').trim();
    const result = String(req.body?.result || '').trim();
    const comment = String(req.body?.comment || '');
    if (!token) {
      return res
        .status(400)
        .type('html')
        .send(wecomContractReviewResultHtml(false, '提交失败', '缺少凭证，请从通知链接重新打开。'));
    }
    if (result !== 'approved' && result !== 'rejected') {
      return res
        .status(400)
        .type('html')
        .send(wecomContractReviewResultHtml(false, '提交失败', '请选择通过或驳回。'));
    }
    let payload;
    try {
      payload = verifyWecomContractReviewToken(token);
    } catch {
      return res
        .status(400)
        .type('html')
        .send(wecomContractReviewResultHtml(false, '链接无效或已过期', '请从企业微信通知重新进入。'));
    }
    const pool = getPool();
    let actorUserId = Number(payload.reviewerUserId);
    if (!isWecomContractReviewOAuthDisabled()) {
      const ck = readWecomContractReviewActorCookie(req);
      if (!ck) {
        return res
          .status(403)
          .type('html')
          .send(
            wecomContractReviewResultHtml(
              false,
              '无法审批',
              '未通过企业微信身份验证。请从通知重新进入后再提交。'
            )
          );
      }
      try {
        const actor = verifyWecomContractReviewActorToken(ck);
        actorUserId = Number(actor.userId);
      } catch {
        clearWecomContractReviewActorCookie(res);
        return res
          .status(403)
          .type('html')
          .send(wecomContractReviewResultHtml(false, '身份已过期', '请从企业微信通知重新进入并完成身份验证。'));
      }
      if (actorUserId !== Number(payload.reviewerUserId)) {
        return res
          .status(403)
          .type('html')
          .send(wecomContractReviewResultHtml(false, '无权审批', '当前企业微信账号不是该合同当前审批人。'));
      }
    }
    const applyRes = await applyContractReview(pool, {
      contractId: payload.contractId,
      actorUserId,
      result,
      comment,
      reviewerUserIdForCheck: payload.reviewerUserId
    });
    if (!applyRes.ok) {
      const msg =
        applyRes.code === 'COMMENT_REQUIRED'
          ? '驳回须填写意见，请返回上一页修改后重试。'
          : applyRes.code === 'INVALID_STATUS'
            ? '当前状态不允许审批（可能已处理）。'
            : applyRes.code === 'FORBIDDEN'
              ? '无权操作（审批人或环节已变更）。'
              : '操作失败，请稍后在电脑端处理。';
      return res
        .status(applyRes.httpStatus || 400)
        .type('html')
        .send(wecomContractReviewResultHtml(false, '无法完成', msg));
    }

    let actorUsername = '';
    const [ur] = await pool.query('SELECT username FROM users WHERE id = ? LIMIT 1', [actorUserId]);
    actorUsername = ur?.[0]?.username != null ? String(ur[0].username) : '';

    await logOperation(pool, {
      userId: actorUserId,
      username: actorUsername,
      module: '销售合同',
      action: '审核合同(企业微信)',
      detail: {
        contractId: payload.contractId,
        result,
        variant: applyRes.variant,
        nextReviewerUserId: applyRes.nextReviewerUserId ?? null
      },
      success: true,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || ''
    });

    if (applyRes.variant === 'progressed') {
      clearWecomContractReviewActorCookie(res);
      return res
        .type('html')
        .send(
          wecomContractReviewResultHtml(
            true,
            '已通过',
            '本节点已通过，系统已通知下一审批人（站内信与企业微信）。'
          )
        );
    }
    const okTitle = result === 'approved' ? '审批完成' : '已驳回';
    const okMsg =
      result === 'approved'
        ? '合同已标记为「已通过」。创建人将收到通知。'
        : '合同已驳回，创建人将收到通知与驳回意见。';
    clearWecomContractReviewActorCookie(res);
    return res.type('html').send(wecomContractReviewResultHtml(true, okTitle, okMsg));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[wecom-contract-review-submit]', e?.message || e);
    return res
      .status(500)
      .type('html')
      .send(wecomContractReviewResultHtml(false, '暂时无法处理', '服务器异常，请稍后在电脑端审批。'));
  }
});
