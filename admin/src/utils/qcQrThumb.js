import QRCode from 'qrcode';

const cache = new Map();
const inflight = new Map();

/**
 * 按公开扫码 URL 生成列表用二维码缩略图（带内存缓存）。
 * @param {string} publicUrl
 * @param {{ width?: number }} [opts]
 * @returns {Promise<string|null>} data URL
 */
export async function ensureQcQrThumb(publicUrl, opts = {}) {
  const url = String(publicUrl || '').trim();
  if (!url) return null;
  if (cache.has(url)) return cache.get(url);
  if (inflight.has(url)) return inflight.get(url);

  const width = Number(opts.width) > 0 ? Number(opts.width) : 72;
  const p = QRCode.toDataURL(url, {
    margin: 1,
    width,
    errorCorrectionLevel: 'M'
  })
    .then((dataUrl) => {
      cache.set(url, dataUrl);
      inflight.delete(url);
      return dataUrl;
    })
    .catch(() => {
      inflight.delete(url);
      return null;
    });

  inflight.set(url, p);
  return p;
}

/** 为订单列表行补齐 qc_thumb_data_url（原地修改） */
export async function attachQcThumbsToOrderRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  await Promise.all(
    list.map(async (row) => {
      if (!row || row.qc_thumb_data_url) return;
      if (!row.qc_public_url) return;
      row.qc_thumb_data_url = await ensureQcQrThumb(row.qc_public_url);
    })
  );
  return list;
}
