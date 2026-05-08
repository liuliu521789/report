import path from 'path';

/** 解析上传类销售合同在磁盘上的绝对路径；非法或路径穿越时返回 null */
export function resolveContractUploadFilePath(row) {
  if (!row || row.contract_source !== 'upload') return null;
  const root = path.resolve(process.cwd(), 'uploads');
  const rel = String(row.document_stored_rel_path || '')
    .replace(/\\/g, '/')
    .replace(/^(\.\.\/)+/, '');
  if (!rel || rel.includes('..')) return null;
  const full = path.resolve(root, rel);
  if (!full.startsWith(root)) return null;
  return full;
}
