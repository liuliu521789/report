import { getPool } from '../db/pool.js';

/** 与小程序/公开页一致的公司信息（snake_case 字段名） */
export async function getCompanySettings(pool) {
  const [rows] = await pool.query(
    'SELECT company_name_zh, company_name_en, report_title_zh, report_title_en, description_zh, description_en, logo_url FROM company_settings WHERE id=1 LIMIT 1'
  );
  const fallback = {
    company_name_zh: '开封物源化工有限公司',
    company_name_en: 'Kaifeng Wuyuan Chemical Co., Ltd.',
    report_title_zh: '产品质量检验报告单',
    report_title_en: 'Certificate of Analysis',
    description_zh: '',
    description_en: '',
    logo_url: null
  };
  const r = rows?.[0];
  if (!r) return fallback;
  return {
    company_name_zh: r.company_name_zh || fallback.company_name_zh,
    company_name_en: r.company_name_en || fallback.company_name_en,
    report_title_zh: r.report_title_zh || fallback.report_title_zh,
    report_title_en: r.report_title_en || fallback.report_title_en,
    description_zh: r.description_zh ?? fallback.description_zh,
    description_en: r.description_en ?? fallback.description_en,
    logo_url: r.logo_url || fallback.logo_url
  };
}

/**
 * 与 GET /api/public/report/:id 返回体一致（company + report.fields + appliedSeals）。
 * 报告不存在时返回 null。
 */
export async function getReportCustomerPayload(pool, id) {
  const [rRows] = await pool.query(
    `SELECT id,
            report_no AS reportNo,
            batch_no AS batchNo,
            batch_no_en AS batchNoEn,
            product_name AS productName,
            product_name_en AS productNameEn,
            conclusion,
            status,
            created_at AS createdAt,
            updated_at AS updatedAt
     FROM reports WHERE id=? LIMIT 1`,
    [id]
  );
  const report = rRows?.[0];
  if (!report) return null;

  const [fields] = await pool.query(
    `SELECT field_key AS fieldKey,
            field_label AS fieldLabel,
            field_label_en AS fieldLabelEn,
            field_type AS fieldType,
            field_value_json AS fieldValue,
            sort_order AS sortOrder
     FROM report_fields WHERE report_id = ? ORDER BY sort_order ASC, id ASC`,
    [id]
  );

  const [sealRows] = await pool.query(
    `SELECT seal_type AS sealType, seal_image_url AS imageUrl
     FROM report_seals
     WHERE report_id = ?`,
    [id]
  );

  const appliedSeals = {
    department_qc: null,
    inspector: null,
    supervisor: null,
    pass: null,
    recheck: null
  };
  for (const r of sealRows || []) {
    appliedSeals[r.sealType] = { imageUrl: r.imageUrl };
  }

  const company = await getCompanySettings(pool);
  return { company, report: { ...report, fields }, appliedSeals };
}
