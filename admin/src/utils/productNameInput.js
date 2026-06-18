/** 产品名称（标签型号）：拉丁字母小写转大写 */
export function normalizeProductNameCase(val) {
  return String(val ?? '').toUpperCase();
}
