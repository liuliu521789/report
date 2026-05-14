import XLSX from 'xlsx';
import {
  buildFinishedProductColumnIndexes,
  findFinishedProductHeaderRowIndex,
  isFpRowEmpty,
  isLikelyFpMetricHeaderRow,
  matrixRowToFinishedProduct,
  mergeFinishedProductHeaderRows
} from './qcYearbookFinishedProduct.js';

/** 与工作表标签比对：去零宽、trim、NFKC，减少「看似成品却不匹配」的 400 */
function normalizeWorksheetLabel(s) {
  return String(s || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .normalize('NFKC');
}

async function bulkInsertFinishedProductRows(conn, { yearId, rows, userId }) {
  if (!rows.length) return;
  const CHUNK = 120;
  const uid = userId;
  for (let off = 0; off < rows.length; off += CHUNK) {
    const slice = rows.slice(off, off + CHUNK);
    const placeholders = slice.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const vals = [];
    for (const r of slice) {
      vals.push(
        yearId,
        r.sort_order,
        r.inspection_num,
        r.inspection_id,
        r.product_model,
        r.product_batch_no,
        r.barrel_count,
        r.initial_batch_kg,
        r.inspection_batch_kg,
        r.appearance,
        r.color_fe_co,
        r.solid_content_pct,
        r.viscosity_s_25c,
        r.acid_value_mgkoh_g,
        r.tolerance_g_ml,
        r.nco_content_pct,
        r.inspection_conclusion,
        uid,
        uid
      );
    }
    await conn.query(
      `INSERT INTO qc_yearbook_finished_product_rows (
        year_id, sort_order, inspection_num, inspection_id, product_model, product_batch_no, barrel_count, initial_batch_kg, inspection_batch_kg,
        appearance, color_fe_co, solid_content_pct, viscosity_s_25c, acid_value_mgkoh_g, tolerance_g_ml, nco_content_pct,
        inspection_conclusion, created_by, updated_by
      ) VALUES ${placeholders}`,
      vals
    );
  }
}

/**
 * 将 xlsx 中「成品」工作表导入到 qc_yearbook_finished_product_rows（不再写入其它表的 JSON 台账）。
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ year: number, buffer: Buffer, replaceExisting: boolean, userId: number|null }} opts
 * @returns {Promise<{ yearId: number, sheetsImported: number, recordsInserted: number, finishedProductRowsInserted: number }>}
 */
export async function importYearbookXlsxIntoDb(pool, opts) {
  const year = Number(opts.year);
  const buffer = opts.buffer;
  const replaceExisting = !!opts.replaceExisting;
  const userId = Number.isFinite(Number(opts.userId)) && Number(opts.userId) > 0 ? Number(opts.userId) : null;

  const sheetAllowList = ['成品'];
  const allowNormSet = new Set(sheetAllowList.map((a) => normalizeWorksheetLabel(a)));

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    const err = new Error('目标年份无效');
    err.statusCode = 400;
    err.code = 'VALIDATION_FAILED';
    throw err;
  }
  if (!buffer || buffer.length < 10) {
    const err = new Error('文件为空或无法读取');
    err.statusCode = 400;
    err.code = 'EMPTY_FILE';
    throw err;
  }

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: false });

  const namesInBook = wb.SheetNames.map((s) => String(s || '').trim()).filter(Boolean);
  const matched = namesInBook.filter((n) => allowNormSet.has(normalizeWorksheetLabel(n)));
  if (!matched.length) {
    const hint = namesInBook.length ? namesInBook.slice(0, 15).join('、') + (namesInBook.length > 15 ? '…' : '') : '（无）';
    const err = new Error(`工作簿中未找到「成品」工作表。当前工作表：${hint}`);
    err.statusCode = 400;
    err.code = 'SHEET_NOT_FOUND';
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      'INSERT INTO qc_yearbook_years (year, remark) VALUES (?, ?) ON DUPLICATE KEY UPDATE remark = remark',
      [year, `自 Excel 导入`]
    );
    const [[yRow]] = await conn.query('SELECT id FROM qc_yearbook_years WHERE year = ? LIMIT 1', [year]);
    const yearId = Number(yRow?.id);
    if (!yearId) {
      const err = new Error('无法解析年份记录');
      err.statusCode = 500;
      err.code = 'INTERNAL_ERROR';
      throw err;
    }

    if (replaceExisting) {
      await conn.query('DELETE FROM qc_yearbook_finished_product_rows WHERE year_id = ?', [yearId]);
      await conn.query('DELETE FROM qc_yearbook_records WHERE year_id = ?', [yearId]);
    }

    let sheetsImported = 0;
    const recordsInserted = 0;
    let finishedProductRowsInserted = 0;

    for (const sheetName of wb.SheetNames) {
      const name = String(sheetName || '').trim();
      if (!name) continue;
      if (!allowNormSet.has(normalizeWorksheetLabel(name))) continue;

      const ws = wb.Sheets[sheetName];
      if (!ws || !ws['!ref']) continue;

      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
      if (!Array.isArray(matrix) || matrix.length === 0) {
        sheetsImported += 1;
        continue;
      }
      const headerIdx = findFinishedProductHeaderRowIndex(matrix);
      if (headerIdx < 0) {
        const err = new Error(
          '工作表「成品」前 50 行内未找到包含「产品型号」与「产品批号」的表头行，请检查 Excel 版式。'
        );
        err.statusCode = 400;
        err.code = 'FP_HEADER_MISMATCH';
        throw err;
      }
      const headerRow0 = (matrix[headerIdx] || []).map((c) => String(c ?? '').trim());
      let headerCells = headerRow0;
      let dataStart = headerIdx + 1;
      const nextRow = matrix[headerIdx + 1];
      if (isLikelyFpMetricHeaderRow(nextRow)) {
        headerCells = mergeFinishedProductHeaderRows(matrix[headerIdx], nextRow);
        dataStart = headerIdx + 2;
      }
      const built = buildFinishedProductColumnIndexes(headerCells);
      if (!built.ok) {
        const hint = built.headerCells?.filter(Boolean).slice(0, 20).join('、') || '（无）';
        const err = new Error(
          `工作表「成品」表头与模板不一致，缺少：${built.missingRequired.join('、')}。识别到的表头片段：${hint}`
        );
        err.statusCode = 400;
        err.code = 'FP_HEADER_MISMATCH';
        throw err;
      }
      const [[maxInspRow]] = await conn.query(
        'SELECT COALESCE(MAX(inspection_num), 0) AS m FROM qc_yearbook_finished_product_rows WHERE year_id = ? FOR UPDATE',
        [yearId]
      );
      let nextInspectionNum = Number(maxInspRow?.m || 0);

      const fpRows = [];
      let ord = 0;
      for (let r = dataStart; r < matrix.length; r++) {
        const rowArr = matrix[r];
        if (!Array.isArray(rowArr)) continue;
        const p = matrixRowToFinishedProduct(rowArr, built.indexes);
        if (isFpRowEmpty(p)) continue;
        nextInspectionNum += 1;
        fpRows.push({
          ...p,
          sort_order: ord++,
          inspection_num: nextInspectionNum,
          inspection_id: `${year}-${String(nextInspectionNum).padStart(5, '0')}`
        });
      }
      await bulkInsertFinishedProductRows(conn, { yearId, rows: fpRows, userId });
      finishedProductRowsInserted += fpRows.length;
      sheetsImported += 1;
    }

    await conn.commit();
    return { yearId, sheetsImported, recordsInserted, finishedProductRowsInserted };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
