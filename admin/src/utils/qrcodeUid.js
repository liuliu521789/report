/** 展示二维码业务编号（来自 API 字段 qrcodeUid） */
export function displayQrcodeUid(row) {
  if (!row) return '';
  const uid = row.qrcodeUid ?? row.qrcode_uid;
  return uid ? String(uid) : '';
}
