/**
 * 批量导入docx质检单为报告模板
 *
 * 用法：
 *   node scripts/import-docx-templates.mjs [目录路径]
 *
 * 默认扫描 D:\report\ 目录下的所有 .docx 文件
 */

import mammoth from 'mammoth';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(__dirname, '../..');

// Database config - adjust as needed
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'qc_report',
  port: Number(process.env.DB_PORT) || 3306
};

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

// Split bilingual text like "检验项目Test item" into {zh, en}
function splitBilingual(text) {
  if (!text) return { zh: '', en: '' };

  // Remove extra spaces within Chinese
  text = text.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');

  // Try to split "Chinese English" pattern
  const match = text.match(/^([\u4e00-\u9fa5（）()℃，、]+?)\s+([A-Za-z].*)$/);
  if (match) {
    return { zh: match[1].trim(), en: match[2].trim() };
  }

  // Check if primarily English
  if (/^[A-Za-z\s\-()]+$/.test(text)) {
    return { zh: '', en: text.trim() };
  }

  // Default: treat as Chinese
  return { zh: text.trim(), en: '' };
}

// Extract value from line like "产品名称    XXX" or "Product Name___"
function extractFieldValue(line, label) {
  // Pattern: label followed by spaces/underscores/colons then value
  const patterns = [
    new RegExp(`${escapeRegex(label)}[\\s_：:]+([^\\s_](?:.*[^\\s_])?)`),
    new RegExp(`${escapeRegex(label)}$`),
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return (match[1] || '').trim();
    }
  }
  return '';
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function parseDocxFile(filePath) {
  const fileName = path.basename(filePath, '.docx');

  const { value: html } = await mammoth.convertToHtml({ path: filePath });
  const { value: text } = await mammoth.extractRawText({ path: filePath });
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const fields = [];
  const usedKeys = new Set();
  let sortOrder = 10;

  // 1. Detect form fields (handle multi-column layout)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';

    // Skip title/header lines
    if (line.includes('有限公司') || line.includes('检验报告') || line.includes('Certificate')) continue;

    // Find all field labels in this line
    const foundLabels = [];
    for (const [label, mapping] of Object.entries(FIELD_MAPPINGS)) {
      if (usedKeys.has(mapping.key)) continue;
      if (line.includes(label)) {
        foundLabels.push({ label, mapping, pos: line.indexOf(label) });
      }
    }

    // Sort by position to handle left-to-right layout
    foundLabels.sort((a, b) => a.pos - b.pos);

    for (const { label, mapping } of foundLabels) {
      if (usedKeys.has(mapping.key)) continue;

      // Try to extract value from same line or next line
      let value = extractFieldValue(line, label);

      // If no value found, check if next line has the English label with underscores
      if (!value && nextLine.includes(mapping.en)) {
        value = extractFieldValue(nextLine, mapping.en);
      }

      fields.push({
        fieldKey: mapping.key,
        fieldLabel: label,
        fieldLabelEn: mapping.en,
        fieldType: 'text',
        sortOrder,
        defaultValue: value ? JSON.stringify(value) : null
      });
      usedKeys.add(mapping.key);
      sortOrder += 10;
    }
  }

  // 2. Detect tables from HTML
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  let tableIndex = 0;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const rows = [];

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const cells = [];
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        let cellText = cellMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(cellText);
      }
      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length < 2) continue;

    // First row is header
    const headers = rows[0];
    const columnLabels = headers.map((h, idx) => {
      const parts = splitBilingual(h);
      return { key: `col_${idx}`, zh: parts.zh, en: parts.en };
    });

    // Data rows
    const dataRows = [];
    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      const firstCell = row[0] || '';

      // Skip conclusion/remark rows (merged cells)
      if (row.length <= 2 && (firstCell.includes('结论') || firstCell.includes('备注'))) {
        continue;
      }

      const rowObj = {};
      headers.forEach((h, idx) => {
        const cellValue = row[idx] || '';
        const parts = splitBilingual(cellValue);
        rowObj[`col_${idx}`] = { zh: parts.zh, en: parts.en };
      });
      dataRows.push(rowObj);
    }

    // Determine table name
    let tableLabel = '检测项目表';
    let tableLabelEn = 'Inspection items';
    if (tableIndex > 0) {
      tableLabel = `表格${tableIndex + 1}`;
      tableLabelEn = `Table ${tableIndex + 1}`;
    }

    fields.push({
      fieldKey: tableIndex === 0 ? 'inspection_table' : `table_${tableIndex + 1}`,
      fieldLabel: tableLabel,
      fieldLabelEn: tableLabelEn,
      fieldType: 'table',
      sortOrder,
      defaultValue: JSON.stringify({
        columnLabels,
        rows: dataRows
      })
    });

    sortOrder += 10;
    tableIndex++;
  }

  return {
    name: fileName,
    description: `从 ${fileName}.docx 导入`,
    fields
  };
}

async function importTemplates(dirPath) {
  console.log(`Scanning directory: ${dirPath}`);
  console.log('='.repeat(60));

  // Find all .docx files
  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.docx') && !f.startsWith('~$'))
    .map(f => path.join(dirPath, f));

  if (files.length === 0) {
    console.log('No .docx files found.');
    return;
  }

  console.log(`Found ${files.length} docx file(s):`);
  files.forEach(f => console.log(`  - ${path.basename(f)}`));
  console.log('');

  // Connect to database
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('Connected to database.\n');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    console.log('\nParsed templates (not saved to DB):');
    console.log('='.repeat(60));

    // Still parse and show results
    for (const file of files) {
      try {
        const template = await parseDocxFile(file);
        console.log(`\nTemplate: ${template.name}`);
        console.log(`  Fields: ${template.fields.length}`);
        for (const f of template.fields) {
          console.log(`    - ${f.fieldLabel} (${f.fieldKey}): ${f.fieldType}`);
        }
      } catch (err) {
        console.error(`  Error parsing ${path.basename(file)}:`, err.message);
      }
    }
    return;
  }

  // Import each file
  const results = { success: 0, failed: 0, skipped: 0 };

  for (const file of files) {
    const fileName = path.basename(file);
    console.log(`Processing: ${fileName}`);

    try {
      const template = await parseDocxFile(file);

      // Check if template with same name exists
      const [existing] = await connection.query(
        'SELECT id FROM report_templates WHERE name = ? LIMIT 1',
        [template.name]
      );

      if (existing.length > 0) {
        console.log(`  ⚠ Skipped: template "${template.name}" already exists (ID: ${existing[0].id})`);
        results.skipped++;
        continue;
      }

      // Insert template
      const [result] = await connection.query(
        'INSERT INTO report_templates (name, description) VALUES (?, ?)',
        [template.name, template.description]
      );
      const templateId = result.insertId;

      // Insert fields
      for (const field of template.fields) {
        await connection.query(
          `INSERT INTO report_template_fields (template_id, field_key, field_label, field_label_en, field_type, default_value_json, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [templateId, field.fieldKey, field.fieldLabel, field.fieldLabelEn || null, field.fieldType, field.defaultValue, field.sortOrder]
        );
      }

      console.log(`  ✓ Imported as template ID: ${templateId} (${template.fields.length} fields)`);
      results.success++;

    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      results.failed++;
    }
  }

  await connection.end();

  console.log('\n' + '='.repeat(60));
  console.log('Import complete:');
  console.log(`  Success: ${results.success}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log(`  Failed:  ${results.failed}`);
}

// Run
const dirPath = process.argv[2] || DEFAULT_DIR;
importTemplates(dirPath).catch(console.error);
