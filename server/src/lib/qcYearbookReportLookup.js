import { formatBatchWeight } from './reportQtyFields.js';
import {
  buildModelLookupCandidates,
  normalizeBatchKey,
  resolveInternalCodeByProductModel,
  rowModelMatchesCandidates
} from './salesModelMapping.js';

/** 品质管控「成品」列 → 报告检测项目匹配键 */
const QC_FIELD_TO_ITEM_KEYS = [
  { field: 'appearance', keys: ['外观', 'Appearance'] },
  { field: 'color_fe_co', keys: ['色度', 'Color(Fe-Co)', '颜色', 'Color'] },
  { field: 'solid_content_pct', keys: ['固体份', 'Solidity', '固含量', 'Solid content'] },
  { field: 'viscosity_s_25c', keys: ['粘度', 'Viscosity', '黏度'] },
  { field: 'acid_value_mgkoh_g', keys: ['酸值', 'Acid value'] },
  { field: 'tolerance_g_ml', keys: ['容忍度'] },
  { field: 'nco_content_pct', keys: ['NCO', '异氰酸', 'Isocyanate'] }
];

function formatQcCellValue(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return '';
    return String(raw);
  }
  return String(raw).trim();
}

export function mapQcRowToReportFields(qcRow) {
  /** @type {Array<{ matchKeys: string[], result: { zh: string, en: string } }>} */
  const rowResults = [];
  for (const { field, keys } of QC_FIELD_TO_ITEM_KEYS) {
    const val = formatQcCellValue(qcRow?.[field]);
    if (!val) continue;
    rowResults.push({
      matchKeys: keys,
      result: { zh: val, en: val }
    });
  }

  const fields = {};
  if (rowResults.length) {
    fields.inspectionTable = { rowResults };
  }

  const conclusion = formatQcCellValue(qcRow?.inspection_conclusion);
  if (conclusion) {
    fields.test_conclusion = { zh: conclusion, en: conclusion };
  }

  const batchKg = qcRow?.inspection_batch_kg ?? qcRow?.initial_batch_kg;
  if (batchKg != null && batchKg !== '') {
    const bw = formatBatchWeight(batchKg);
    if (bw.zh) fields.batch_weight = bw;
  }

  return fields;
}

/**
 * 按内部型号（及客户型号兜底）+ 批号在品质管控台账中查检验行
 * @returns {Promise<{ found: boolean, internalModel: string, productModel: string, batchNo: string, calendarYear: number|null, inspectionId: string|null, fields: object, message: string }>}
 */
export async function lookupQcYearbookForReport(pool, { orderId, productModel, batchNo }) {
  const customerModel = String(productModel || '').trim();
  const batch = String(batchNo || '').trim();
  const batchKey = normalizeBatchKey(batch);

  const internalModel = await resolveInternalCodeByProductModel(pool, { orderId, customerModel });
  const modelCandidates = buildModelLookupCandidates(internalModel, customerModel);

  const base = {
    found: false,
    internalModel: internalModel || '',
    productModel: '',
    batchNo: batch,
    calendarYear: null,
    inspectionId: null,
    fields: {},
    message: ''
  };

  if (!customerModel) {
    return { ...base, message: '缺少产品型号，无法查询品质管控台账' };
  }
  if (!batchKey) {
    return { ...base, message: '缺少生产批号，无法查询品质管控台账' };
  }

  const [rows] = await pool.query(
    `SELECT fp.product_model, fp.product_batch_no, fp.inspection_id,
            fp.barrel_count, fp.initial_batch_kg, fp.inspection_batch_kg,
            fp.appearance, fp.color_fe_co, fp.solid_content_pct, fp.viscosity_s_25c,
            fp.acid_value_mgkoh_g, fp.tolerance_g_ml, fp.nco_content_pct, fp.inspection_conclusion,
            fp.updated_at, y.year AS calendar_year
     FROM qc_yearbook_finished_product_rows fp
     INNER JOIN qc_yearbook_years y ON y.id = fp.year_id
     WHERE TRIM(fp.product_batch_no) = ?
     ORDER BY y.year DESC, fp.updated_at DESC, fp.id DESC
     LIMIT 80`,
    [batch]
  );

  const matched = (rows || []).find(
    (r) =>
      normalizeBatchKey(r.product_batch_no) === batchKey &&
      rowModelMatchesCandidates(r.product_model, modelCandidates)
  );

  if (!matched) {
    const modelHint = internalModel || customerModel;
    return {
      ...base,
      message: `未在品质管控台账中查到型号「${modelHint}」批号「${batch}」的检验数据，请手动填写`
    };
  }

  const fields = mapQcRowToReportFields(matched);
  return {
    found: true,
    internalModel: internalModel || String(matched.product_model || '').trim(),
    productModel: String(matched.product_model || '').trim(),
    batchNo: batch,
    calendarYear: matched.calendar_year != null ? Number(matched.calendar_year) : null,
    inspectionId: matched.inspection_id != null ? String(matched.inspection_id) : null,
    fields,
    message: ''
  };
}
