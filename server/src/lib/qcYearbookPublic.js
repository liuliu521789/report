import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function defaultPublicDir() {
  return path.resolve(__dirname, '../../../public');
}

/** 仓库根目录 public；可用环境变量覆盖 */
export function resolveQcYearbookPublicDir() {
  const raw = String(process.env.QC_YEARBOOK_PUBLIC_DIR || '').trim();
  return raw ? path.resolve(raw) : defaultPublicDir();
}

/** 与台账 Excel 命名一致 */
export function isYearbookXlsxBasename(name) {
  const base = path.basename(String(name || '').trim());
  if (!base || base.startsWith('~$')) return false;
  return /^物源(\d{4})年度品质管控数据表\s*\.xlsx$/i.test(base);
}
