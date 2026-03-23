/** 与 server/src/lib/reportFieldEdit.js 保持 key 一致 */

export const REPORT_FIELD_EDIT_DEFINITIONS = [
  { key: 'report_no', labelZh: '报告编号' },
  { key: 'conclusion', labelZh: '判定结论' },
  { key: 'product_name', labelZh: '产品名称' },
  { key: 'packing', labelZh: '包装规格' },
  { key: 'batch_weight', labelZh: '本批数量' },
  { key: 'batch_no', labelZh: '生产批号' },
  { key: 'analysis_date', labelZh: '检验日期' },
  { key: 'ex_mill_date', labelZh: '出厂日期' },
  { key: 'inspection_table', labelZh: '检测项目表' },
  { key: 'test_conclusion', labelZh: '检验结论（表内）' },
  { key: 'remarks', labelZh: '备注（表内）' },
  { key: 'custom_fields', labelZh: '自定义表头字段' }
];

const FIXED_META_KEYS = new Set([
  'product_name',
  'packing',
  'batch_weight',
  'batch_no',
  'analysis_date',
  'ex_mill_date',
  'test_conclusion',
  'remarks'
]);

const TABLE_KEY = 'inspection_table';

export function isCustomFieldKey(fieldKey) {
  if (!fieldKey || fieldKey === TABLE_KEY) return false;
  return !FIXED_META_KEYS.has(fieldKey);
}

export function canEditReportFieldKeyFromPermissions(effective, fieldKey) {
  if (!effective || typeof effective !== 'object') return true;
  if (!effective.reports?.edit) return false;
  const fe = effective.reports.fieldEdit;
  if (fe == null || typeof fe !== 'object' || Object.keys(fe).length === 0) return true;
  if (isCustomFieldKey(fieldKey)) {
    return fe.custom_fields !== false;
  }
  return fe[fieldKey] !== false;
}
