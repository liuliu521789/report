/** 下载标签默认可选字段 */
export const QRCODE_LABEL_FIELD_KEYS = ['qrcodeUid', 'product', 'batch', 'customer'];

export const DEFAULT_QRCODE_LABEL_FIELDS = [...QRCODE_LABEL_FIELD_KEYS];

/** 标签纸预设（宽×高 mm），按 203dpi 合成像素 */
export const QRCODE_LABEL_DPI = 203;

export const QRCODE_LABEL_PRESETS = {
  '50x30': { key: '50x30', label: '50×30 mm', widthMm: 50, heightMm: 30 },
  '60x40': { key: '60x40', label: '60×40 mm', widthMm: 60, heightMm: 40 },
  '40x30': { key: '40x30', label: '40×30 mm', widthMm: 40, heightMm: 30 }
};

export const DEFAULT_QRCODE_LABEL_PRESET = '50x30';

export const QRCODE_LABEL_PRESET_OPTIONS = Object.values(QRCODE_LABEL_PRESETS);
export const QRCODE_LABEL_SCENES = {
  DOWNLOAD: 'download',
  PRINT: 'print'
};

/** 毫米转像素（默认 203dpi，常见标签机分辨率） */
export function mmToPx(mm, dpi = QRCODE_LABEL_DPI) {
  return Math.round((Number(mm) * dpi) / 25.4);
}

export function resolveQrcodeLabelPreset(key) {
  return QRCODE_LABEL_PRESETS[key] || QRCODE_LABEL_PRESETS[DEFAULT_QRCODE_LABEL_PRESET];
}

export function getQrcodeLabelComposeOptions(presetKey = DEFAULT_QRCODE_LABEL_PRESET, dpi = QRCODE_LABEL_DPI) {
  const preset = resolveQrcodeLabelPreset(presetKey);
  return {
    labelPreset: preset.key,
    dpi,
    canvasWidth: mmToPx(preset.widthMm, dpi),
    canvasHeight: mmToPx(preset.heightMm, dpi),
    paddingX: mmToPx(2, dpi),
    paddingTop: mmToPx(1.5, dpi),
    paddingBottom: mmToPx(1, dpi),
    textGap: mmToPx(1, dpi)
  };
}

export function getQrcodeDownloadComposeOptions() {
  return {
    scene: QRCODE_LABEL_SCENES.DOWNLOAD,
    canvasWidth: 920,
    canvasHeight: 1180,
    paddingX: 64,
    paddingTop: 60,
    paddingBottom: 54,
    textGap: 18
  };
}

const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", sans-serif';

export function qrcodeLabelFieldsToOptions(fields) {
  const set = new Set(Array.isArray(fields) ? fields : []);
  return {
    qrcodeUid: set.has('qrcodeUid'),
    product: set.has('product'),
    batch: set.has('batch'),
    customer: set.has('customer')
  };
}

function pickStr(row, ...keys) {
  for (const key of keys) {
    const v = String(row?.[key] ?? '').trim();
    if (v) return v;
  }
  return '';
}

/**
 * 标签客户名：简称优先，无简称时用全称
 * customer_name = 全称，contact_name / customerContact = 简称
 */
export function formatQrcodeLabelCustomer(row, mode = 'short') {
  const full = pickStr(row, 'customerName', 'customer_name');
  const short = pickStr(row, 'customerContact', 'customer_contact', 'contactName', 'contact_name');
  if (mode === 'full') return full || short;
  return short || full;
}

function reportMatchKey(row) {
  return `${pickStr(row, 'productName', 'product_name')}\0${pickStr(row, 'batchNo', 'batch_no')}\0${pickStr(row, 'id')}`;
}

/** 用列表/详情中的报告行补全客户字段 */
export function enrichReportsForQrcodeLabel(detailReports, fallbackReports = []) {
  const details = Array.isArray(detailReports) ? detailReports : [];
  const fallbacks = Array.isArray(fallbackReports) ? fallbackReports : [];
  if (!details.length) return fallbacks;
  if (!fallbacks.length) return details;

  const fallbackByKey = new Map();
  for (const row of fallbacks) {
    const key = reportMatchKey(row);
    if (!fallbackByKey.has(key)) fallbackByKey.set(key, row);
  }

  return details.map((report) => {
    if (formatQrcodeLabelCustomer(report)) return report;
    const match = fallbackByKey.get(reportMatchKey(report));
    if (!match) return report;
    return {
      ...report,
      customerName: pickStr(report, 'customerName', 'customer_name') || pickStr(match, 'customerName', 'customer_name'),
      customerContact:
        pickStr(report, 'customerContact', 'customer_contact', 'contactName', 'contact_name') ||
        pickStr(match, 'customerContact', 'customer_contact', 'contactName', 'contact_name')
    };
  });
}

function reportPairKey(row) {
  return `${pickStr(row, 'productName', 'product_name')}\0${pickStr(row, 'batchNo', 'batch_no')}\0${pickStr(row, 'id')}`;
}

function joinParts(parts) {
  return parts.filter(Boolean).join('/');
}

/** 产品/批号成对一行 */
function formatReportPairLine(row, opts) {
  const parts = [];
  const product = pickStr(row, 'productName', 'product_name');
  const batch = pickStr(row, 'batchNo', 'batch_no');
  if (opts.product && product) parts.push(product);
  if (opts.batch && batch) parts.push(batch);
  return joinParts(parts);
}

function uniqueReportRows(list) {
  const seen = new Set();
  const rows = [];
  for (const row of list) {
    const key = reportPairKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

const PAIR_GROUP_SEP = ' · ';

function collectReportPairs(list, opts) {
  const reports = uniqueReportRows(list);
  const pairSeen = new Set();
  const pairs = [];
  for (const row of reports) {
    const pairLine = formatReportPairLine(row, opts);
    if (pairLine && !pairSeen.has(pairLine)) {
      pairSeen.add(pairLine);
      pairs.push(pairLine);
    }
  }
  return pairs;
}

/**
 * 生成标签多行文案
 * - 首行：编号/客户（参数用 / 连接）
 * - 次行：所有 产品/批号 成对，用 · 拼在同一行（放不下时按对换行）
 */
export function composeQrcodeLabelLines(rows, options = {}, meta = {}) {
  const opts = {
    qrcodeUid: false,
    product: false,
    batch: false,
    customer: false,
    ...options
  };
  if (!opts.qrcodeUid && !opts.product && !opts.batch && !opts.customer) return [];

  const list = Array.isArray(rows) ? rows : [];
  const uid = pickStr(meta, 'qrcodeUid', 'qrcode_uid');
  const lines = [];

  const headerParts = [];
  if (opts.qrcodeUid && uid) headerParts.push(uid);
  if (opts.customer) {
    const customers = [
      ...new Set(list.map((r) => formatQrcodeLabelCustomer(r)).filter(Boolean))
    ];
    headerParts.push(...customers);
  }
  const headerLine = joinParts(headerParts);
  if (headerLine) lines.push(headerLine);

  if (opts.product || opts.batch) {
    const pairs = collectReportPairs(list, opts);
    if (pairs.length === 1) lines.push(pairs[0]);
    else if (pairs.length > 1) lines.push(pairs.join(PAIR_GROUP_SEP));
  }

  return lines;
}

/** @deprecated 单行拼接，仅供兼容 */
export function composeQrcodeLabelText(rows, options = {}, meta = {}) {
  return composeQrcodeLabelLines(rows, options, meta).join('\n');
}

/**
 * 生成标签布局
 * @returns {{ type: 'line', text: string }[]}
 */
export function formatQrcodeLabelLayout(rows, options = {}, meta = {}) {
  return composeQrcodeLabelLines(rows, options, meta).map((text) => ({ type: 'line', text }));
}

/** 兼容旧调用 */
export function formatQrcodeLabelLines(rows, options = {}, meta = {}) {
  return composeQrcodeLabelLines(rows, options, meta);
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('QR_IMAGE_LOAD_FAILED'));
    img.src = src;
  });
}

function setFont(ctx, size, weight, family = FONT_FAMILY) {
  ctx.font = `${weight} ${size}px ${family}`;
}

function wrapLine(ctx, text, maxWidth) {
  const s = String(text).trim();
  if (!s) return [];
  if (ctx.measureText(s).width <= maxWidth) return [s];

  const lines = [];
  let current = '';
  for (const ch of s) {
    const next = current + ch;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [s];
}

function wrapPairGroups(ctx, text, maxWidth, separator = PAIR_GROUP_SEP) {
  const s = String(text).trim();
  if (!s.includes(separator)) return wrapLine(ctx, s, maxWidth);

  const parts = s.split(separator).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return [];
  if (parts.length === 1) return wrapLine(ctx, parts[0], maxWidth);

  const lines = [];
  let current = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const candidate = `${current}${separator}${parts[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = parts[i];
    }
  }
  lines.push(current);
  return lines;
}

/** 测量多行标签并必要时缩小字号 */
function measureMultilineLabel(ctx, logicalLines, maxWidth, fontOpts = {}) {
  const baseSize = fontOpts.baseSize ?? 13;
  const minSize = fontOpts.minSize ?? 9;
  let fontSize = baseSize;

  while (fontSize >= minSize) {
    setFont(ctx, fontSize, '500');
    const rows = [];
    let totalHeight = 0;
    const lineHeight = Math.round(fontSize * 1.45);
    let fits = true;

    for (const logical of logicalLines) {
      const wrapped = wrapPairGroups(ctx, logical, maxWidth);
      if (!wrapped.length) continue;
      if (wrapped.length > 1 && fontSize > minSize) {
        fits = false;
        break;
      }
      for (const text of wrapped) {
        rows.push({ text, fontSize, lineHeight });
        totalHeight += lineHeight;
      }
    }

    if (fits) return { rows, totalHeight, fontSize };
    fontSize -= 1;
  }

  setFont(ctx, minSize, '500');
  const lineHeight = Math.round(minSize * 1.45);
  const rows = [];
  let totalHeight = 0;
  for (const logical of logicalLines) {
    for (const text of wrapPairGroups(ctx, logical, maxWidth)) {
      rows.push({ text, fontSize: minSize, lineHeight });
      totalHeight += lineHeight;
    }
  }
  return { rows, totalHeight, fontSize: minSize };
}

function parseLabelInput(labelInput) {
  if (!Array.isArray(labelInput) || !labelInput.length) return [];
  if (typeof labelInput[0] === 'object') {
    return labelInput
      .map((item) => {
        if (item.type === 'line') return String(item.text || '').trim();
        if (item.type === 'product' || item.type === 'batch' || item.type === 'customer' || item.type === 'uid') {
          return String(item.text || '').trim();
        }
        return '';
      })
      .filter(Boolean);
  }
  return labelInput.map((l) => String(l).trim()).filter(Boolean);
}

function computeFontSizesForWidth(canvasWidth) {
  const baseSize = Math.max(8, Math.round((13 * canvasWidth) / 400));
  const minSize = Math.max(7, baseSize - 4);
  return { baseSize, minSize };
}

/** 横向标签：左侧二维码占满高度，右侧文字 */
function layoutHorizontalLabel(measureCtx, logicalLines, composeOpts) {
  const { canvasWidth, canvasHeight, paddingX, paddingTop, paddingBottom, textGap, dpi } = composeOpts;
  const { baseSize, minSize } = computeFontSizesForWidth(canvasWidth);
  const innerHeight = canvasHeight - paddingTop - paddingBottom;
  const minTextWidth = mmToPx(12, dpi);

  if (!logicalLines.length) {
    const qrSize = Math.min(innerHeight, canvasWidth - 2 * paddingX);
    const qrY = paddingTop + Math.floor((innerHeight - qrSize) / 2);
    return { mode: 'horizontal', qrSize, qrX: paddingX, qrY, rows: [] };
  }

  for (let qrSize = innerHeight; qrSize >= Math.floor(innerHeight * 0.62); qrSize -= 2) {
    const textMaxWidth = canvasWidth - 2 * paddingX - textGap - qrSize;
    if (textMaxWidth < minTextWidth) continue;

    const measured = measureMultilineLabel(measureCtx, logicalLines, textMaxWidth, { baseSize, minSize });
    if (measured.totalHeight <= qrSize) {
      const qrY = paddingTop + Math.floor((innerHeight - qrSize) / 2);
      const textX = paddingX + qrSize + textGap;
      const textY = paddingTop + Math.floor((innerHeight - measured.totalHeight) / 2);
      return { mode: 'horizontal', qrSize, qrX: paddingX, qrY, rows: measured.rows, textX, textY };
    }
  }

  const qrSize = Math.floor(innerHeight * 0.62);
  const textMaxWidth = Math.max(minTextWidth, canvasWidth - 2 * paddingX - textGap - qrSize);
  const measured = measureMultilineLabel(measureCtx, logicalLines, textMaxWidth, { baseSize: minSize, minSize });
  const qrY = paddingTop + Math.floor((innerHeight - qrSize) / 2);
  const textX = paddingX + qrSize + textGap;
  const textY = paddingTop + Math.floor((innerHeight - measured.totalHeight) / 2);
  return { mode: 'horizontal', qrSize, qrX: paddingX, qrY, rows: measured.rows, textX, textY };
}

/** 纵向标签：上方二维码，下方文字 */
function layoutVerticalLabel(measureCtx, logicalLines, composeOpts) {
  const { canvasWidth, canvasHeight, paddingX, paddingTop, paddingBottom, textGap, dpi } = composeOpts;
  const { baseSize, minSize } = computeFontSizesForWidth(canvasWidth);
  const maxQrWidth = canvasWidth - 2 * paddingX;
  const minTextHeight = mmToPx(3, dpi);

  if (!logicalLines.length) {
    const qrSize = Math.min(maxQrWidth, canvasHeight - paddingTop - paddingBottom);
    return { mode: 'vertical', qrSize, qrX: paddingX, qrY: paddingTop, rows: [] };
  }

  for (let qrSize = maxQrWidth; qrSize >= Math.floor(maxQrWidth * 0.6); qrSize -= 2) {
    const textMaxHeight = canvasHeight - paddingTop - paddingBottom - textGap - qrSize;
    if (textMaxHeight < minTextHeight) continue;

    const measured = measureMultilineLabel(measureCtx, logicalLines, qrSize, { baseSize, minSize });
    if (measured.totalHeight <= textMaxHeight) {
      return { mode: 'vertical', qrSize, qrX: paddingX, qrY: paddingTop, rows: measured.rows };
    }
  }

  const qrSize = Math.floor(maxQrWidth * 0.6);
  const measured = measureMultilineLabel(measureCtx, logicalLines, qrSize, { baseSize: minSize, minSize });
  return { mode: 'vertical', qrSize, qrX: paddingX, qrY: paddingTop, rows: measured.rows };
}

function layoutFixedLabel(measureCtx, logicalLines, composeOpts) {
  const { canvasWidth, canvasHeight } = composeOpts;
  if (canvasWidth >= canvasHeight * 1.15) {
    return layoutHorizontalLabel(measureCtx, logicalLines, composeOpts);
  }
  return layoutVerticalLabel(measureCtx, logicalLines, composeOpts);
}

async function drawLabelCanvas(qrDataUrl, logicalLines, canvasWidth, canvasHeight, layout) {
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = await loadImage(qrDataUrl);
  ctx.drawImage(img, layout.qrX, layout.qrY, layout.qrSize, layout.qrSize);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(layout.qrX - 0.5, layout.qrY - 0.5, layout.qrSize + 1, layout.qrSize + 1);

  if (layout.rows.length) {
    const textLeft = layout.textX ?? layout.qrX;
    let cursorY = layout.textY ?? layout.qrY + layout.qrSize + (layout.textGap ?? 0);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#111827';

    for (const row of layout.rows) {
      setFont(ctx, row.fontSize, '500');
      ctx.fillText(row.text, textLeft, cursorY);
      cursorY += row.lineHeight;
    }
  }

  return canvas.toDataURL('image/png');
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function drawDownloadCardCanvas(qrDataUrl, logicalLines, composeOpts, meta = {}) {
  const { canvasWidth, canvasHeight, paddingX, paddingTop, paddingBottom, textGap } = composeOpts;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');

  const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGradient.addColorStop(0, '#f4f7f4');
  bgGradient.addColorStop(1, '#eef2ef');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cardX = 30;
  const cardY = 28;
  const cardW = canvas.width - cardX * 2;
  const cardH = canvas.height - cardY * 2;
  ctx.shadowColor = 'rgba(2, 44, 34, 0.08)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 6;
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.stroke();

  const contentLeft = cardX + paddingX;
  const contentRight = cardX + cardW - paddingX;
  const contentTop = cardY + paddingTop;
  const contentBottom = cardY + cardH - paddingBottom;
  const contentWidth = contentRight - contentLeft;

  const headerH = 168;
  const headerTop = contentTop - 28;
  const headerLeft = cardX + 22;
  const headerW = cardW - 44;
  const headerGradient = ctx.createLinearGradient(headerLeft, headerTop, headerLeft + headerW, headerTop + headerH);
  headerGradient.addColorStop(0, '#14532d');
  headerGradient.addColorStop(1, '#166534');
  drawRoundedRect(ctx, headerLeft, headerTop, headerW, headerH, 20);
  ctx.fillStyle = headerGradient;
  ctx.fill();

  setFont(ctx, 20, '500');
  ctx.fillStyle = 'rgba(236, 253, 245, 0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('QUALITY CONTROL', cardX + Math.floor(cardW / 2), headerTop + 24);

  const uid = pickStr(meta, 'qrcodeUid', 'qrcode_uid');
  setFont(ctx, 44, '700');
  ctx.fillStyle = '#ffffff';
  ctx.fillText('产品质检查询码', cardX + Math.floor(cardW / 2), headerTop + 54);

  setFont(ctx, 22, '500');
  ctx.fillStyle = 'rgba(236, 253, 245, 0.96)';
  ctx.fillText(uid ? `编号：${uid}` : '扫码查看质检报告', cardX + Math.floor(cardW / 2), headerTop + 114);

  const qrAreaTop = headerTop + headerH + 28;
  const qrAreaBottom = contentBottom - 252;
  const qrSize = Math.max(420, Math.min(520, qrAreaBottom - qrAreaTop));
  const qrX = cardX + Math.floor((cardW - qrSize) / 2);
  const qrY = qrAreaTop + Math.max(0, Math.floor((qrAreaBottom - qrAreaTop - qrSize) / 2));
  const qrFramePadding = 18;
  drawRoundedRect(
    ctx,
    qrX - qrFramePadding,
    qrY - qrFramePadding,
    qrSize + qrFramePadding * 2,
    qrSize + qrFramePadding * 2,
    20
  );
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#dcfce7';
  ctx.lineWidth = 2;
  ctx.stroke();

  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  const infoPanelTop = qrY + qrSize + textGap + 20;
  const infoPanelH = 176;
  drawRoundedRect(ctx, contentLeft, infoPanelTop, contentWidth, infoPanelH, 16);
  ctx.fillStyle = '#f7faf8';
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();

  setFont(ctx, 18, '600');
  ctx.fillStyle = '#475569';
  ctx.textAlign = 'left';
  ctx.fillText('标签信息', contentLeft + 16, infoPanelTop + 14);

  const infoTop = infoPanelTop + 20;
  const maxInfoWidth = contentWidth - 28;
  const infoLines = logicalLines.length ? logicalLines : ['扫码查看完整质检报告'];
  const infoFontSize = 24;
  const infoLineHeight = 34;
  setFont(ctx, infoFontSize, '500');
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = infoTop + 26;
  for (const line of infoLines) {
    const wrapped = wrapPairGroups(ctx, line, maxInfoWidth - 20, PAIR_GROUP_SEP);
    for (const text of wrapped) {
      if (y + infoLineHeight > infoPanelTop + infoPanelH - 12) break;
      ctx.fillStyle = '#6b7280';
      ctx.fillText('•', contentLeft + 14, y - 1);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(text, contentLeft + 32, y);
      y += infoLineHeight;
    }
    if (y + infoLineHeight > infoPanelTop + infoPanelH - 12) break;
  }

  setFont(ctx, 23, '500');
  ctx.fillStyle = '#4b5563';
  ctx.textAlign = 'center';
  ctx.fillText('扫码查看质检报告', cardX + Math.floor(cardW / 2), contentBottom - 32);

  return canvas.toDataURL('image/png');
}

/** 在二维码旁/下方绘制标签，返回 PNG data URL */
export async function composeQrcodeLabelImage(qrDataUrl, labelInput = [], options = {}) {
  const logicalLines = parseLabelInput(labelInput);
  const scene = options.scene ?? QRCODE_LABEL_SCENES.PRINT;
  if (scene === QRCODE_LABEL_SCENES.DOWNLOAD) {
    const composeOpts = {
      ...getQrcodeDownloadComposeOptions(),
      ...options
    };
    return drawDownloadCardCanvas(qrDataUrl, logicalLines, composeOpts, options.meta || {});
  }

  const presetKey = options.labelPreset ?? DEFAULT_QRCODE_LABEL_PRESET;
  const composeOpts = {
    ...getQrcodeLabelComposeOptions(presetKey, options.dpi ?? QRCODE_LABEL_DPI),
    ...options
  };

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) throw new Error('CANVAS_UNAVAILABLE');

  const layout = layoutFixedLabel(measureCtx, logicalLines, composeOpts);
  layout.textGap = composeOpts.textGap;

  return drawLabelCanvas(
    qrDataUrl,
    logicalLines,
    composeOpts.canvasWidth,
    composeOpts.canvasHeight,
    layout
  );
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/** 合成带标签的二维码 PNG；无字段或失败时回退纯码 */
export async function buildQrcodeLabelDataUrl(
  qrDataUrl,
  reportRows,
  labelFields,
  meta = {},
  { labelPreset = DEFAULT_QRCODE_LABEL_PRESET, dpi = QRCODE_LABEL_DPI, scene = QRCODE_LABEL_SCENES.PRINT } = {}
) {
  const lines = formatQrcodeLabelLayout(
    reportRows,
    qrcodeLabelFieldsToOptions(labelFields),
    meta
  );
  const composeOptions = { labelPreset, dpi, scene, meta };
  try {
    const dataUrl = await composeQrcodeLabelImage(qrDataUrl, lines, composeOptions);
    return { dataUrl, labelApplied: lines.length > 0, labelPreset };
  } catch {
    try {
      const dataUrl = await composeQrcodeLabelImage(qrDataUrl, [], composeOptions);
      return { dataUrl, labelApplied: false, labelFailed: true, labelPreset };
    } catch {
      return { dataUrl: qrDataUrl, labelApplied: false, labelFailed: true, labelPreset, useRawQr: true };
    }
  }
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 生成单页标签打印 HTML（固定纸张尺寸，禁止分页） */
export function buildQrcodeLabelPrintHtml(dataUrl, labelPresetKey = DEFAULT_QRCODE_LABEL_PRESET, documentTitle = '二维码标签') {
  const preset = resolveQrcodeLabelPreset(labelPresetKey);
  const src = escapeHtml(dataUrl);
  const title = escapeHtml(documentTitle);
  const w = preset.widthMm;
  const h = preset.heightMm;
  const pxW = mmToPx(w, QRCODE_LABEL_DPI);
  const pxH = mmToPx(h, QRCODE_LABEL_DPI);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
*{margin:0;padding:0;box-sizing:border-box;}
@page{size:${w}mm ${h}mm;margin:0;}
html,body{width:${w}mm;height:${h}mm;overflow:hidden;background:#fff;}
.print-hint{
  position:fixed;left:0;right:0;top:0;z-index:9;
  padding:10px 14px;background:#fff7ed;border-bottom:1px solid #fed7aa;
  font:13px/1.5 "Microsoft YaHei","PingFang SC",sans-serif;color:#9a3412;
}
.print-hint strong{display:block;margin-bottom:4px;color:#7c2d12;}
.label-page{
  width:${w}mm;height:${h}mm;overflow:hidden;
  page-break-before:avoid;page-break-after:avoid;break-inside:avoid;
}
.label-page img{
  display:block;width:${w}mm;height:${h}mm;
  max-width:${w}mm;max-height:${h}mm;
}
@media print{
  .print-hint{display:none!important;}
  html,body{width:${w}mm;height:${h}mm;margin:0!important;padding:0!important;overflow:hidden!important;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .label-page,.label-page img{
    width:${w}mm!important;height:${h}mm!important;
    max-width:${w}mm!important;max-height:${h}mm!important;
    page-break-inside:avoid!important;break-inside:avoid!important;
  }
}
@media screen{
  body{padding-top:72px;}
  .label-page{margin:12px auto;box-shadow:0 1px 6px rgba(15,23,42,.12);}
}
</style></head><body>
<div class="print-hint">
  <strong>打印前请检查（否则容易变成 2 页或变形）：</strong>
  ① 关闭「页眉和页脚」&nbsp;&nbsp;② 边距选「无」或「最小值」&nbsp;&nbsp;③ 纸张尺寸选 ${preset.label}
</div>
<div class="label-page"><img src="${src}" width="${pxW}" height="${pxH}" alt="二维码标签" /></div>
</body></html>`;
}

function runPrintDocument(doc, win, { autoPrint = true, onAfterPrint } = {}) {
  const cleanup = () => {
    try {
      onAfterPrint?.();
    } catch {
      /* ignore */
    }
  };

  const triggerPrint = () => {
    if (!autoPrint) return;
    win.addEventListener('afterprint', cleanup, { once: true });
    window.setTimeout(cleanup, 120000);
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  };

  const waitForImage = () => {
    const img = doc.querySelector('.label-page img');
    if (!img) {
      window.setTimeout(triggerPrint, 150);
      return;
    }
    const start = () => window.setTimeout(triggerPrint, 200);
    if (img.complete && img.naturalWidth > 0) {
      start();
    } else {
      img.addEventListener('load', start, { once: true });
      img.addEventListener('error', start, { once: true });
    }
  };

  if (doc.readyState === 'complete') {
    waitForImage();
  } else {
    win.addEventListener('load', waitForImage, { once: true });
  }
}

/** 打开浏览器打印对话框，打印二维码标签图片 */
export function printQrcodeLabelImage(
  dataUrl,
  documentTitle = '二维码标签',
  labelPresetKey = DEFAULT_QRCODE_LABEL_PRESET
) {
  const html = buildQrcodeLabelPrintHtml(dataUrl, labelPresetKey, documentTitle);

  const w = window.open('', '_blank', 'width=720,height=560,left=80,top=80');
  if (!w) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute(
      'style',
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none'
    );
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    const win = doc.defaultView;
    doc.open();
    doc.write(html);
    doc.close();
    runPrintDocument(doc, win, {
      onAfterPrint: () => {
        try {
          iframe.remove();
        } catch {
          /* ignore */
        }
      }
    });
    return;
  }

  w.document.open();
  w.document.write(html);
  w.document.close();
  runPrintDocument(w.document, w, {
    onAfterPrint: () => {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
  });
}
