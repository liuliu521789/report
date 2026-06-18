import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import mammoth from 'mammoth';

import { getPool } from '../db/pool.js';
import { requireAnyPermissionPairs, requireAuth, requirePermission } from '../middleware/auth.js';

const DOCX_IMPORT_MAX_FILES = Math.min(Number(process.env.TEMPLATE_DOCX_IMPORT_MAX_FILES || 500), 500);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: DOCX_IMPORT_MAX_FILES }
});

export const router = Router();

/** 列表/详情供报告页「套用模板」；增删改仍要 templates.use */
const canReadTemplatesForReports = requireAnyPermissionPairs([
  ['templates', 'use'],
  ['reports', 'view'],
  ['reports', 'edit'],
  ['reports', 'create']
]);

router.use(requireAuth);

const fieldSchema = z.object({
  fieldKey: z.string().min(1).max(64),
  fieldLabel: z.string().min(1).max(128),
  fieldLabelEn: z.string().min(1).max(128).optional(),
  fieldType: z.string().min(1).max(16),
  defaultValue: z.any().optional(),
  sortOrder: z.number().int().optional()
});

const upsertTemplateSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(255).optional().nullable(),
  fields: z.array(fieldSchema).min(1).max(500)
});

router.get('/', canReadTemplatesForReports, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit || 100), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);

  const where = [];
  const params = [];
  if (q) {
    where.push('(t.name LIKE ? OR t.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const pool = getPool();
  const [countRows] = await pool.query(`SELECT COUNT(*) AS cnt FROM report_templates t ${sqlWhere}`, params);
  const total = Number(countRows?.[0]?.cnt || 0);

  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.description, t.created_at AS createdAt, t.updated_at AS updatedAt,
            (SELECT COUNT(*) FROM report_template_fields f WHERE f.template_id = t.id) AS fieldCount
     FROM report_templates t
     ${sqlWhere}
     ORDER BY t.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({
    items: (rows || []).map((r) => ({
      ...r,
      templateId: r.id,
      fieldCount: Number(r.fieldCount || 0)
    })),
    total
  });
});

function parseTemplateFieldDefaultValue(raw) {
  let defaultValue = raw;
  if (typeof defaultValue === 'string') {
    try {
      defaultValue = JSON.parse(defaultValue);
    } catch {
      /* keep string */
    }
  }
  return defaultValue;
}

/** 按产品名称联想报告模板：优先模板名精确，其次双向包含，再查模板内 product_name 默认值 */
async function findTemplateByProductName(pool, productName) {
  const q = String(productName || '').trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  const compact = lower.replace(/[\s\u3000\-－—_/／\\()（）\[\]【】]/g, '');

  let [rows] = await pool.query(
    `SELECT id, name FROM report_templates
     WHERE LOWER(TRIM(name)) = ?
     ORDER BY id DESC LIMIT 1`,
    [lower]
  );
  if (rows?.[0]) return rows[0];

  [rows] = await pool.query(
    `SELECT id, name FROM report_templates
     WHERE LOWER(TRIM(name)) LIKE CONCAT(?, '%') OR ? LIKE CONCAT(LOWER(TRIM(name)), '%')
     ORDER BY
       CASE WHEN LOWER(TRIM(name)) = ? THEN 0 WHEN LOWER(TRIM(name)) LIKE CONCAT(?, '%') THEN 1 ELSE 2 END,
       LENGTH(name) DESC,
       id DESC
     LIMIT 1`,
    [lower, lower, lower, lower]
  );
  if (rows?.[0]) return rows[0];

  [rows] = await pool.query(
    `SELECT id, name FROM report_templates
     WHERE LOWER(TRIM(name)) LIKE CONCAT('%', ?, '%')
     ORDER BY LENGTH(name) ASC, id DESC
     LIMIT 1`,
    [lower]
  );
  if (rows?.[0]) return rows[0];

  if (compact) {
    [rows] = await pool.query(
      `SELECT id, name FROM report_templates
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(name)),
              ' ', ''), '　', ''), '-', ''), '－', ''), '—', ''), '_', ''), '/', ''), '／', ''), '\\\\', ''), '(', ''), ')', '')
             LIKE CONCAT('%', ?, '%')
       ORDER BY LENGTH(name) ASC, id DESC
       LIMIT 1`,
      [compact]
    );
    if (rows?.[0]) return rows[0];
  }

  [rows] = await pool.query(
    `SELECT t.id, t.name FROM report_templates t
     INNER JOIN report_template_fields f ON f.template_id = t.id AND f.field_key = 'product_name'
     WHERE LOWER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(f.default_value_json, '$.zh')), ''))) = ?
     ORDER BY t.id DESC LIMIT 1`,
    [lower]
  );
  if (rows?.[0]) return rows[0];

  return null;
}

import {
  expandModelAliases,
  resolveMappedInternalCodeByOrder
} from '../lib/salesModelMapping.js';

router.get('/suggest-by-product', canReadTemplatesForReports, async (req, res, next) => {
  try {
    const productName = String(req.query.productName || req.query.q || '').trim();
    if (!productName) {
      return res.json({ template: null });
    }
    const pool = getPool();
    const fromOrderId = Number(req.query.fromOrder || req.query.orderId || 0);
    const mappedInternalCode = await resolveMappedInternalCodeByOrder(pool, fromOrderId, productName);
    const candidates = [];
    const pushCandidates = (v) => {
      for (const item of expandModelAliases(v)) {
        const text = String(item || '').trim();
        if (!text || candidates.includes(text)) continue;
        candidates.push(text);
      }
    };
    if (mappedInternalCode) pushCandidates(mappedInternalCode);
    pushCandidates(productName);
    let matched = null;
    for (const candidate of candidates) {
      const c = String(candidate || '').trim();
      if (!c) continue;
      matched = await findTemplateByProductName(pool, c);
      if (matched) break;
    }
    if (!matched) {
      return res.json({ template: null });
    }

    const [fRows] = await pool.query(
      `SELECT field_key AS fieldKey, field_type AS fieldType, default_value_json AS defaultValue
       FROM report_template_fields
       WHERE template_id = ?
         AND (field_key IN ('inspection_table', 'test_conclusion', 'remarks') OR field_type = 'table')
       ORDER BY (field_key = 'inspection_table') DESC, sort_order ASC, id ASC`,
      [matched.id]
    );

    let inspectionTable = null;
    let testConclusion = null;
    let remarks = null;
    for (const f of fRows || []) {
      const val = parseTemplateFieldDefaultValue(f.defaultValue);
      if (f.fieldType === 'table' && !inspectionTable) {
        inspectionTable = val;
      } else if (f.fieldKey === 'test_conclusion') {
        testConclusion = val;
      } else if (f.fieldKey === 'remarks') {
        remarks = val;
      }
    }

    if (!inspectionTable) {
      return res.json({ template: null });
    }

    res.json({
      template: {
        id: matched.id,
        name: matched.name,
        inspectionTable,
        testConclusion,
        remarks
      }
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', canReadTemplatesForReports, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  const [tRows] = await pool.query(
    'SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt FROM report_templates WHERE id=? LIMIT 1',
    [id]
  );
  const tpl = tRows?.[0];
  if (!tpl) return res.status(404).json({ error: 'NOT_FOUND' });

  const [fRows] = await pool.query(
    `SELECT field_key AS fieldKey, field_label AS fieldLabel, field_label_en AS fieldLabelEn, field_type AS fieldType,
            default_value_json AS defaultValue, sort_order AS sortOrder
     FROM report_template_fields WHERE template_id=? ORDER BY sort_order ASC, id ASC`,
    [id]
  );
  
  // Parse JSON defaultValue
  const fields = (fRows || []).map(f => {
    let defaultValue = f.defaultValue;
    if (typeof defaultValue === 'string') {
      try {
        defaultValue = JSON.parse(defaultValue);
      } catch (e) {
        // Keep as string if parsing fails
      }
    }
    return { ...f, defaultValue };
  });
  
  res.json({ template: { ...tpl, templateId: tpl.id, fields } });
});

router.post('/', requirePermission('templates', 'use'), async (req, res) => {
  const parsed = upsertTemplateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { name, description, fields } = parsed.data;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO report_templates (name, description, created_by) VALUES (?, ?, ?)',
      [name, description ?? null, req.user.userId]
    );
    const templateId = result.insertId;
    for (const f of fields) {
      await conn.query(
        `INSERT INTO report_template_fields (template_id, field_key, field_label, field_label_en, field_type, default_value_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          templateId,
          f.fieldKey,
          f.fieldLabel,
          f.fieldLabelEn ?? null,
          f.fieldType,
          f.defaultValue === undefined ? null : JSON.stringify(f.defaultValue),
          f.sortOrder ?? 0
        ]
      );
    }
    await conn.commit();
    res.status(201).json({ id: templateId, templateId });
  } catch (e) {
    await conn.rollback();
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE_FIELD_KEY' });
    throw e;
  } finally {
    conn.release();
  }
});

router.put('/:id', requirePermission('templates', 'use'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const parsed = upsertTemplateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const { name, description, fields } = parsed.data;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [tRows] = await conn.query('SELECT id FROM report_templates WHERE id=? LIMIT 1', [id]);
    if (!tRows?.[0]) {
      await conn.rollback();
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    await conn.query('UPDATE report_templates SET name=?, description=? WHERE id=?', [name, description ?? null, id]);
    await conn.query('DELETE FROM report_template_fields WHERE template_id=?', [id]);
    for (const f of fields) {
      await conn.query(
        `INSERT INTO report_template_fields (template_id, field_key, field_label, field_label_en, field_type, default_value_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          f.fieldKey,
          f.fieldLabel,
          f.fieldLabelEn ?? null,
          f.fieldType,
          f.defaultValue === undefined ? null : JSON.stringify(f.defaultValue),
          f.sortOrder ?? 0
        ]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    if (String(e?.code) === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE_FIELD_KEY' });
    throw e;
  } finally {
    conn.release();
  }
});

const bulkDeleteTemplatesSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200)
});

/** 批量删除（须放在 /:id 之前避免路径冲突） */
router.delete('/', requirePermission('templates', 'use'), async (req, res) => {
  const parsed = bulkDeleteTemplatesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'BAD_REQUEST' });
  const ids = [...new Set(parsed.data.ids)];
  if (!ids.length) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  const [result] = await pool.query(
    `DELETE FROM report_templates WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  res.json({ ok: true, deletedCount: Number(result?.affectedRows || 0) });
});

router.delete('/:id', requirePermission('templates', 'use'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const pool = getPool();
  await pool.query('DELETE FROM report_templates WHERE id=?', [id]);
  res.json({ ok: true });
});

// Common field mappings for quality inspection reports
const FIELD_MAPPINGS = {
  '产品名称': { key: 'product_name', en: 'Product Name' },
  '品名': { key: 'product_name', en: 'Product Name' },
  '产品': { key: 'product_name', en: 'Product Name' },
  '包装规格': { key: 'packing', en: 'Packing' },
  '包装': { key: 'packing', en: 'Packing' },
  '本批数量': { key: 'batch_weight', en: 'Batch Weight' },
  '数量': { key: 'batch_weight', en: 'Batch Weight' },
  '生产批号': { key: 'batch_no', en: 'Batch No.' },
  '批号': { key: 'batch_no', en: 'Batch No.' },
  '检验日期': { key: 'analysis_date', en: 'Analysis Date' },
  '分析日期': { key: 'analysis_date', en: 'Analysis Date' },
  '出厂日期': { key: 'ex_mill_date', en: 'EX-mill Date' },
  '生产日期': { key: 'production_date', en: 'Production Date' },
  '有效期': { key: 'expiry_date', en: 'Expiry Date' },
  '检验结论': { key: 'test_conclusion', en: 'Test conclusion' },
  '结论': { key: 'test_conclusion', en: 'Test conclusion' },
  '备注': { key: 'remarks', en: 'Remarks' },
  '客户': { key: 'customer', en: 'Customer' },
  '客户名称': { key: 'customer', en: 'Customer' },
};

// Chinese to English mapping for common inspection terms
const ZH_EN_MAPPINGS = {
  // Table headers
  '检验项目': 'Test item',
  '检测项目': 'Test item',
  '检验指标': 'Test index',
  '检测指标': 'Test index',
  '单位': 'Unit',
  '单 位': 'Unit',
  '标准值': 'Normal value',
  '标 准 值': 'Normal value',
  '技术指标': 'Technical index',
  '技术要求': 'Technical requirement',
  '标准要求': 'Standard requirement',
  '指标': 'Index',
  '检测值': 'Test value',
  '检 测 值': 'Test value',
  '检 验 值': 'Test value',
  '检验值': 'Test value',
  '检验结果': 'Test result',
  '检测结果': 'Test result',
  '实测值': 'Measured value',
  '实 测 值': 'Measured value',
  '结果': 'Result',
  '单项检验依据': 'Inspection basis',
  '检验依据': 'Inspection basis',
  '检测依据': 'Test basis',
  '试验方法': 'Test method',
  '检验方法': 'Test method',
  '分析方法': 'Analysis method',
  '方法': 'Method',
  '备注': 'Remarks',
  '备 注': 'Remarks',
  '说明': 'Description',
  
  // Common inspection items - Appearance/Color
  '外观': 'Appearance',
  '外 观': 'Appearance',
  '色泽': 'Color',
  '色 泽': 'Color',
  '色度': 'Color',
  '色 度': 'Color',
  '颜色': 'Color',
  '颜 色': 'Color',
  '透明度': 'Transparency',
  '透 明 度': 'Transparency',
  '透明': 'Transparent',
  '清澈': 'Clear',
  '浑浊': 'Turbid',
  
  // Solid content/Composition
  '固体份': 'Solidity',
  '固 体 份': 'Solidity',
  '固体分': 'Solidity',
  '固 体 分': 'Solidity',
  '固含量': 'Solid content',
  '固 含 量': 'Solid content',
  '不挥发份': 'Non-volatile',
  '不 挥 发 份': 'Non-volatile',
  '挥发份': 'Volatile',
  '挥 发 份': 'Volatile',
  '挥发物': 'Volatile matter',
  '灰分': 'Ash content',
  '灰 分': 'Ash content',
  
  // Viscosity
  '粘度': 'Viscosity',
  '粘 度': 'Viscosity',
  '黏度': 'Viscosity',
  '黏 度': 'Viscosity',
  '稠度': 'Consistency',
  '稠 度': 'Consistency',
  
  // Acid/Base value
  '酸值': 'Acid value',
  '酸 值': 'Acid value',
  '酸价': 'Acid value',
  '酸 价': 'Acid value',
  '胺值': 'Amine value',
  '胺 值': 'Amine value',
  '羟值': 'Hydroxyl value',
  '羟 值': 'Hydroxyl value',
  '皂化值': 'Saponification value',
  '皂 化 值': 'Saponification value',
  '碘值': 'Iodine value',
  '碘 值': 'Iodine value',
  '环氧值': 'Epoxy value',
  '环 氧 值': 'Epoxy value',
  '异氰酸值': 'Isocyanate value',
  
  // Moisture
  '水分': 'Moisture',
  '水 分': 'Moisture',
  '含水量': 'Water content',
  '含 水 量': 'Water content',
  '湿度': 'Humidity',
  '湿 度': 'Humidity',
  
  // Density/Specific gravity
  '密度': 'Density',
  '密 度': 'Density',
  '比重': 'Specific gravity',
  '比 重': 'Specific gravity',
  '相对密度': 'Relative density',
  
  // Temperature related
  '闪点': 'Flash point',
  '闪 点': 'Flash point',
  '熔点': 'Melting point',
  '熔 点': 'Melting point',
  '沸点': 'Boiling point',
  '沸 点': 'Boiling point',
  '凝固点': 'Freezing point',
  '凝 固 点': 'Freezing point',
  '软化点': 'Softening point',
  '软 化 点': 'Softening point',
  '滴点': 'Drop point',
  '滴 点': 'Drop point',
  
  // Particle size/Fineness
  '细度': 'Fineness',
  '细 度': 'Fineness',
  '粒径': 'Particle size',
  '粒 径': 'Particle size',
  '粒度': 'Particle size',
  '粒 度': 'Particle size',
  '筛余物': 'Sieve residue',
  '筛 余 物': 'Sieve residue',
  
  // Hardness/Adhesion
  '硬度': 'Hardness',
  '硬 度': 'Hardness',
  '附着力': 'Adhesion',
  '附 着 力': 'Adhesion',
  '柔韧性': 'Flexibility',
  '柔 韧 性': 'Flexibility',
  '冲击强度': 'Impact strength',
  '冲击强度': 'Impact strength',
  
  // Gloss
  '光泽': 'Gloss',
  '光 泽': 'Gloss',
  '光泽度': 'Gloss level',
  '光 泽 度': 'Gloss level',
  
  // Chemical properties
  'PH值': 'PH value',
  'PH': 'PH',
  '电导率': 'Conductivity',
  '电 导 率': 'Conductivity',
  '分子量': 'Molecular weight',
  '分 子 量': 'Molecular weight',
  '纯度': 'Purity',
  '纯 度': 'Purity',
  '含量': 'Content',
  '含 量': 'Content',
  '浓度': 'Concentration',
  '浓 度': 'Concentration',
  
  // Mechanical properties
  '拉伸强度': 'Tensile strength',
  '拉 伸 强 度': 'Tensile strength',
  '断裂伸长率': 'Elongation at break',
  '断 裂 伸 长 率': 'Elongation at break',
  '抗压强度': 'Compressive strength',
  '抗 压 强 度': 'Compressive strength',
  '弯曲强度': 'Flexural strength',
  '弯 曲 强 度': 'Flexural strength',
  
  // Other common items
  '沉淀': 'Sediment',
  '沉 淀': 'Sediment',
  '机械杂质': 'Mechanical impurities',
  '机 械 杂 质': 'Mechanical impurities',
  '残渣': 'Residue',
  '残 渣': 'Residue',
  '氯含量': 'Chlorine content',
  '氯 含 量': 'Chlorine content',
  '硫含量': 'Sulfur content',
  '硫 含 量': 'Sulfur content',
  '氮含量': 'Nitrogen content',
  '氮 含 量': 'Nitrogen content',
  '铁含量': 'Iron content',
  '铁 含 量': 'Iron content',
  '重金属': 'Heavy metals',
  '重 金 属': 'Heavy metals',
  '砷': 'Arsenic',
  '铅': 'Lead',
  '汞': 'Mercury',
  '镉': 'Cadmium',
  '铬': 'Chromium',
  
  // Common units/abbreviations
  '合格': 'Pass',
  '不合格': 'Fail',
  '符合': 'Comply',
  '不符合': 'Non-comply',
  '达标': 'Meet standard',
  '不达标': 'Below standard',
  '一级': 'Grade 1',
  '二级': 'Grade 2',
  '三级': 'Grade 3',
  '优级': 'Premium grade',
  '一级品': 'First grade',
  '合格品': 'Qualified product',
};

function splitBilingual(text) {
  if (!text) return { zh: '', en: '' };
  text = text.trim();
  
  // If text is only symbols, numbers, units (not real Chinese or English)
  if (/^[\d\s\-≤≥±.%#\/()（）℃mgKOH]+$/.test(text) || /^(s|kg|ml|L|mm|cm|m)$/i.test(text)) {
    return { zh: text, en: text };
  }
  
  // GB/T standards or similar patterns - set to both
  if (/^(GB|HG|QB|JC|YB|SH|SN|TB|DL|SY|JB|FZ|YY|GA|CJ|MT|HJ|WS|TD|DZ|CH|CY|WH|LY|SL|CJ|JT|JG|YD|SJ|MH|EJ|WJ|CB|HB|QJ|EJ)\//i.test(text)) {
    return { zh: text, en: text };
  }
  
  // Find the boundary between Chinese and English
  const boundaryMatch = text.match(/^(.*[\u4e00-\u9fa5））])\s+([A-Za-z(].*)$/);
  if (boundaryMatch) {
    let zhPart = boundaryMatch[1].trim();
    let enPart = boundaryMatch[2].trim();
    zhPart = zhPart.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
    zhPart = zhPart.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
    return { zh: zhPart, en: enPart };
  }
  
  // Pure Chinese - try to find English mapping
  if (/[\u4e00-\u9fa5]/.test(text)) {
    let cleaned = text.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
    cleaned = cleaned.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');
    
    // Check mapping table
    const enValue = ZH_EN_MAPPINGS[cleaned] || ZH_EN_MAPPINGS[text] || '';
    return { zh: cleaned, en: enValue };
  }
  
  // Pure English (no Chinese characters)
  if (text.length < 15) {
    return { zh: text, en: text };
  }
  return { zh: '', en: text };
}

function extractFieldValue(line, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`${escaped}[\\s_：:]+([^\\s_](?:.*[^\\s_])?)`),
    new RegExp(`${escaped}$`),
  ];
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) return (match[1] || '').trim();
  }
  return '';
}

// Fix Chinese filename encoding from multer
function fixFileName(originalName) {
  try {
    // Try to decode as UTF-8 buffer
    const buf = Buffer.from(originalName, 'latin1');
    const decoded = buf.toString('utf8');
    // Check if decoded contains valid Chinese characters
    if (/[\u4e00-\u9fa5]/.test(decoded)) return decoded;
  } catch {}
  return originalName;
}

async function parseDocxBuffer(buffer, originalName) {
  const fileName = fixFileName(originalName);
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const { value: text } = await mammoth.extractRawText({ buffer });
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const fields = [];
  const usedKeys = new Set();
  let sortOrder = 10;

  // Detect form fields (handle multi-column layout)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';
    if (line.includes('有限公司') || line.includes('检验报告') || line.includes('Certificate')) continue;

    // Find all Chinese labels in current line
    const foundLabels = [];
    for (const [label, mapping] of Object.entries(FIELD_MAPPINGS)) {
      if (usedKeys.has(mapping.key)) continue;
      if (line.includes(label)) {
        foundLabels.push({ label, mapping, pos: line.indexOf(label) });
      }
    }
    if (foundLabels.length === 0) continue;
    foundLabels.sort((a, b) => a.pos - b.pos);

    // For multi-column layout, extract values from next line
    // Each column's value is under its English label
    for (let j = 0; j < foundLabels.length; j++) {
      const { label, mapping } = foundLabels[j];
      if (usedKeys.has(mapping.key)) continue;
      
      let value = '';
      
      // Find English label position in next line
      const enLabelPos = nextLine.indexOf(mapping.en);
      if (enLabelPos >= 0) {
        // Determine the end position (next English label or end of line)
        let endPos = nextLine.length;
        if (j < foundLabels.length - 1) {
          // Find next English label position
          const nextEnLabel = foundLabels[j + 1].mapping.en;
          const nextEnPos = nextLine.indexOf(nextEnLabel, enLabelPos + mapping.en.length);
          if (nextEnPos > enLabelPos) {
            endPos = nextEnPos;
          }
        }
        
        // Extract value between current English label end and next label
        const afterLabel = nextLine.substring(enLabelPos + mapping.en.length, endPos);
        // Remove underscores and trim
        value = afterLabel.replace(/_+/g, '').trim();
      }
      
      fields.push({
        fieldKey: mapping.key,
        fieldLabel: label,
        fieldLabelEn: mapping.en,
        fieldType: 'text',
        sortOrder,
        defaultValue: value || undefined
      });
      usedKeys.add(mapping.key);
      sortOrder += 10;
    }
  }

  // Table column key mapping (frontend expects specific keys)
  const TABLE_COL_KEYS = ['item', 'unit', 'standard', 'result', 'basis'];

  // Detect tables from HTML - more robust parsing
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  let tableIndex = 0;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const rows = [];

    // Parse rows more carefully
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const cells = [];
      // Match both td and th, handle colspan
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        // Clean HTML tags but preserve line breaks as space
        let cellText = cellMatch[1]
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<p[^>]*>/gi, '')
          .replace(/<\/p>/gi, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(cellText);
      }
      if (cells.length > 0) rows.push(cells);
    }

    // Need at least 1 row (header or data)
    if (rows.length < 1) continue;

    // First row is header
    const headers = rows[0];
    const columnLabels = headers.map((h, idx) => {
      const parts = splitBilingual(h);
      return { key: TABLE_COL_KEYS[idx] || `col_${idx}`, zh: parts.zh, en: parts.en };
    });

    // Data rows
    const dataRows = [];
    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      const firstCell = row[0] || '';

      // Skip conclusion/remark rows (页面固定，不需要识别)
      if (firstCell.includes('结论') || firstCell.includes('备注') || firstCell.includes('Conclusion') || firstCell.includes('Remark')) continue;
      // Also skip empty rows or merged cell rows
      if (row.length <= 2) continue;

      // Build row object using proper keys (item, unit, standard, result, basis)
      const rowObj = {};
      headers.forEach((h, idx) => {
        const cellValue = row[idx] || '';
        const parts = splitBilingual(cellValue);
        const key = TABLE_COL_KEYS[idx] || `col_${idx}`;
        rowObj[key] = { zh: parts.zh, en: parts.en };
      });
      dataRows.push(rowObj);
    }

    // Only add table if it has meaningful data
    if (dataRows.length > 0 || headers.length >= 2) {
      fields.push({
        fieldKey: tableIndex === 0 ? 'inspection_table' : `table_${tableIndex + 1}`,
        fieldLabel: tableIndex === 0 ? '检测项目表' : `表格${tableIndex + 1}`,
        fieldLabelEn: tableIndex === 0 ? 'Inspection items' : `Table ${tableIndex + 1}`,
        fieldType: 'table',
        sortOrder,
        defaultValue: { columnLabels, rows: dataRows }
      });
      sortOrder += 10;
      tableIndex++;
    }
  }

  return {
    name: fileName.replace(/\.docx$/i, ''),
    description: `从 ${fileName} 导入`,
    fields
  };
}

function dedupeTemplateFields(fields) {
  const out = [];
  const seen = new Set();
  for (const f of fields || []) {
    const key = String(f?.fieldKey || '').trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

async function ensureUniqueTemplateName(conn, baseName) {
  const base = String(baseName || '').trim() || '未命名模板';
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : `${base} (${i})`;
    const [rows] = await conn.query('SELECT id FROM report_templates WHERE name=? LIMIT 1', [candidate]);
    if (!rows?.[0]) return candidate;
  }
  return `${base} (${Date.now()})`;
}

async function insertTemplateWithFields(conn, { name, description, fields, createdByUserId }) {
  const deduped = dedupeTemplateFields(fields);
  const parsed = upsertTemplateSchema.safeParse({
    name,
    description: description ?? null,
    fields: deduped
  });
  if (!parsed.success) {
    const err = new Error('BAD_TEMPLATE_PAYLOAD');
    err.code = 'BAD_TEMPLATE_PAYLOAD';
    throw err;
  }

  await conn.beginTransaction();
  try {
    const [result] = await conn.query(
      'INSERT INTO report_templates (name, description, created_by) VALUES (?, ?, ?)',
      [parsed.data.name, parsed.data.description ?? null, createdByUserId ?? null]
    );
    const templateId = result.insertId;

    for (const f of parsed.data.fields) {
      await conn.query(
        `INSERT INTO report_template_fields (template_id, field_key, field_label, field_label_en, field_type, default_value_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          templateId,
          f.fieldKey,
          f.fieldLabel,
          f.fieldLabelEn ?? null,
          f.fieldType,
          f.defaultValue === undefined ? null : JSON.stringify(f.defaultValue),
          f.sortOrder ?? 0
        ]
      );
    }

    await conn.commit();
    return { templateId, name: parsed.data.name, fieldCount: parsed.data.fields.length };
  } catch (e) {
    await conn.rollback();
    throw e;
  }
}

router.post('/import-docx', requirePermission('templates', 'use'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'MISSING_FILE' });
  if (!req.file.originalname.endsWith('.docx')) return res.status(400).json({ error: 'INVALID_FILE_TYPE' });

  try {
    const template = await parseDocxBuffer(req.file.buffer, req.file.originalname);
    if (!template.fields.length) return res.status(422).json({ error: 'NO_FIELDS_FOUND' });
    res.json({ template });
  } catch (e) {
    console.error('DOCX parse error:', e);
    res.status(422).json({ error: 'PARSE_FAILED' });
  }
});

router.post(
  '/import-docx-batch',
  requirePermission('templates', 'use'),
  upload.array('files', DOCX_IMPORT_MAX_FILES),
  async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) return res.status(400).json({ error: 'NO_FILES' });

    const pool = getPool();
    const summary = { total: files.length, success: 0, failed: 0, renamed: 0 };
    const items = [];

    for (const f of files) {
      const originalName = String(f?.originalname || '');
      if (!originalName.toLowerCase().endsWith('.docx')) {
        summary.failed += 1;
        items.push({ ok: false, fileName: originalName || '(unknown)', error: 'INVALID_FILE_TYPE' });
        continue;
      }

      let conn;
      try {
        const parsedTpl = await parseDocxBuffer(f.buffer, f.originalname);
        if (!parsedTpl.fields.length) {
          summary.failed += 1;
          items.push({ ok: false, fileName: originalName, error: 'NO_FIELDS_FOUND' });
          continue;
        }

        conn = await pool.getConnection();
        const baseName = String(parsedTpl.name || '').trim();
        const uniqueName = await ensureUniqueTemplateName(conn, baseName);
        const renamed = Boolean(baseName) && uniqueName !== baseName;
        if (renamed) summary.renamed += 1;

        const created = await insertTemplateWithFields(conn, {
          name: uniqueName,
          description: parsedTpl.description ?? null,
          fields: parsedTpl.fields,
          createdByUserId: req.user.userId
        });

        summary.success += 1;
        items.push({
          ok: true,
          fileName: originalName,
          templateId: created.templateId,
          name: created.name,
          fieldCount: created.fieldCount,
          renamed
        });
      } catch (e) {
        summary.failed += 1;
        let code = 'IMPORT_FAILED';
        if (String(e?.code) === 'ER_DUP_ENTRY') code = 'DUPLICATE_FIELD_KEY';
        else if (e?.message === 'BAD_TEMPLATE_PAYLOAD') code = 'BAD_TEMPLATE_PAYLOAD';
        else if (e instanceof multer.MulterError) {
          if (e.code === 'LIMIT_FILE_SIZE') code = 'FILE_TOO_LARGE';
          else if (e.code === 'LIMIT_FILE_COUNT') code = 'TOO_MANY_FILES';
          else code = 'UPLOAD_ERROR';
        }
        items.push({ ok: false, fileName: originalName, error: code });
      } finally {
        if (conn) conn.release();
      }
    }

    res.json({
      code: 0,
      message: 'OK',
      data: {
        maxFiles: DOCX_IMPORT_MAX_FILES,
        summary,
        items
      }
    });
  }
);

