/** 去重后的正整数 id 列表，限制最大数量避免批量 SQL 过大 */
export function uniquePositiveIds(ids, max = 200) {
  return [...new Set((ids || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, max);
}
