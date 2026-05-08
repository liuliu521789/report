import mammoth from 'mammoth';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = process.argv[2] || path.resolve(__dirname, '../../COA-ER618.docx');

// Common field mappings for quality inspection reports
const FIELD_MAPPINGS = {
  '产品名称': { key: 'product_name', en: 'Product Name' },
  '包装规格': { key: 'packing', en: 'Packing' },
  '本批数量': { key: 'batch_weight', en: 'Batch Weight' },
  '生产批号': { key: 'batch_no', en: 'Batch No.' },
  '检验日期': { key: 'analysis_date', en: 'Analysis Date' },
  '出厂日期': { key: 'ex_mill_date', en: 'EX-mill Date' },
  '检验结论': { key: 'test_conclusion', en: 'Test conclusion' },
  '备注': { key: 'remarks', en: 'Remarks' },
  '客户': { key: 'customer', en: 'Customer' },
  '产品批号': { key: 'batch_no', en: 'Batch No.' },
  '生产日期': { key: 'production_date', en: 'Production Date' },
  '有效期': { key: 'expiry_date', en: 'Expiry Date' },
};

async function parseDocx(filePath) {
  console.log('Parsing:', filePath);
  console.log('='.repeat(60));

  const { value: html } = await mammoth.convertToHtml({ path: filePath });

  // Extract text lines for form field detection
  const { value: text } = await mammoth.extractRawText({ path: filePath });
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  console.log('\n=== DETECTED STRUCTURE ===\n');

  // 1. Detect form fields from text patterns
  const formFields = [];
  const usedKeys = new Set();

  // Pattern: "Label    Value    Label    Value" or "Label___"
  for (const line of lines) {
    // Skip title/header lines
    if (line.includes('有限公司') || line.includes('检验报告') || line.includes('Certificate')) continue;

    // Check each known field
    for (const [label, mapping] of Object.entries(FIELD_MAPPINGS)) {
      if (line.includes(label) && !usedKeys.has(mapping.key)) {
        // Try to extract value after label
        const regex = new RegExp(`${label}[\\s_：:]*([^\\s_]|$)`);
        const match = line.match(regex);
        const value = match?.[1]?.trim() || '';

        formFields.push({
          fieldKey: mapping.key,
          fieldLabel: label,
          fieldLabelEn: mapping.en,
          fieldType: 'text',
          sortOrder: formFields.length * 10 + 10,
          sampleValue: value
        });
        usedKeys.add(mapping.key);
        break;
      }
    }
  }

  // 2. Detect tables from HTML
  const tables = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

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
        // Clean HTML and normalize whitespace
        let cellText = cellMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(cellText);
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }

  // 3. Process tables - separate header, data, and footer rows
  const tableFields = [];

  for (let tIdx = 0; tIdx < tables.length; tIdx++) {
    const table = tables[tIdx];
    if (table.length < 2) continue;

    // First row is header
    const headers = table[0];

    // Detect if header contains bilingual text (Chinese + English)
    const columnLabels = headers.map((h, idx) => {
      // Split "检验项目Test item" into zh/en
      const parts = splitBilingual(h);
      return {
        key: `col_${idx}`,
        zh: parts.zh,
        en: parts.en
      };
    });

    // Data rows (skip last 2 if they are conclusion/remarks)
    const dataRows = [];
    const footerRows = [];

    for (let rIdx = 1; rIdx < table.length; rIdx++) {
      const row = table[rIdx];
      const firstCell = row[0] || '';

      // Check if this is a conclusion/remark row (merged cells, fewer columns)
      if (row.length <= 2 && (firstCell.includes('结论') || firstCell.includes('备注'))) {
        footerRows.push(row);
        continue;
      }

      // This is a data row
      const rowObj = {};
      headers.forEach((h, idx) => {
        const cellValue = row[idx] || '';
        const parts = splitBilingual(cellValue);
        rowObj[`col_${idx}`] = {
          zh: parts.zh,
          en: parts.en
        };
      });
      dataRows.push(rowObj);
    }

    tableFields.push({
      fieldKey: `inspection_table`,
      fieldLabel: '检测项目表',
      fieldLabelEn: 'Inspection items',
      fieldType: 'table',
      sortOrder: 70,
      defaultValue: {
        columnLabels,
        rows: dataRows
      }
    });
  }

  // Output results
  console.log('Form Fields:');
  for (const f of formFields) {
    console.log(`  ${f.fieldLabel} (${f.fieldLabelEn}) -> ${f.fieldKey} [sample: "${f.sampleValue}"]`);
  }

  console.log('\nTable Fields:');
  for (const t of tableFields) {
    console.log(`  ${t.fieldLabel}:`);
    console.log(`    Columns: ${t.defaultValue.columnLabels.map(c => c.zh).join(', ')}`);
    console.log(`    Rows: ${t.defaultValue.rows.length}`);
    for (const row of t.defaultValue.rows) {
      const cells = Object.values(row).map(v => v.zh).join(' | ');
      console.log(`      ${cells}`);
    }
  }

  // Generate final template JSON
  const template = {
    name: path.basename(filePath, '.docx'),
    description: `从 ${path.basename(filePath)} 导入的质检报告模板`,
    fields: [
      ...formFields.map(f => ({
        fieldKey: f.fieldKey,
        fieldLabel: f.fieldLabel,
        fieldLabelEn: f.fieldLabelEn,
        fieldType: f.fieldType,
        sortOrder: f.sortOrder
      })),
      ...tableFields
    ]
  };

  console.log('\n=== FINAL TEMPLATE JSON ===');
  console.log(JSON.stringify(template, null, 2));

  return template;
}

function splitBilingual(text) {
  if (!text) return { zh: '', en: '' };

  // Try to split "ChineseEnglish" pattern
  // Match Chinese characters followed by English
  const match = text.match(/^([\u4e00-\u9fa5\s（）()]+?)\s*([A-Za-z].*)$/);
  if (match) {
    return {
      zh: match[1].trim(),
      en: match[2].trim()
    };
  }

  // Check if primarily English
  if (/^[A-Za-z\s\-()]+$/.test(text)) {
    return { zh: '', en: text.trim() };
  }

  // Default: treat as Chinese
  return { zh: text.trim(), en: '' };
}

parseDocx(filePath).catch(console.error);
