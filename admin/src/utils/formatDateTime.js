/**
 * 将接口返回的 ISO 等时间格式转为本地可读时间，精度到秒（无毫秒、无 Z）。
 * @param {string|number|Date|null|undefined} input
 * @param {{ empty?: string }} [opts]
 * @returns {string}
 */
export function formatDateTime(input, opts = {}) {
  const empty = opts.empty !== undefined ? opts.empty : '—';
  if (input == null || input === '') return empty;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    const s = String(input).trim();
    if (!s) return empty;
    return s;
  }
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
