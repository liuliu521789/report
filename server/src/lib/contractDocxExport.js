import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
         AlignmentType, BorderStyle, WidthType } from 'docx';
import { load } from 'cheerio';
import { tonsFromQtyAndSpec } from './salesOrderFields.js';
import { loadOrderFieldDefinitions, prepareOrderRowForContractHtml } from './salesOrderFields.js';
import { amountToRmbUppercase } from './chineseMoney.js';
import { formatSigningDateZhShanghai } from './contractTemplateFill.js';

const DEFAULT_VAT_RATE = 0.13;
const TITLE_FONT = '方正小标宋简体';
const BODY_FONT = '仿宋_GB2312';

export async function fetchContractData(pool, contractId) {
  const [rows] = await pool.query(
    `SELECT c.*, cu.customer_name,
            cu.address AS customer_address, cu.contact_person AS customer_contact,
            cu.phone AS customer_phone,
            cu.fax AS customer_fax, cu.bank_name AS customer_bank,
            cu.bank_account AS customer_account, cu.tax_id AS customer_tax_id,
            (SELECT company_name_zh FROM company_settings WHERE id = 1 LIMIT 1) AS company_name_zh
     FROM sales_contracts c
     INNER JOIN sales_customers cu ON cu.id = c.customer_id WHERE c.id = ?`,
    [contractId]
  );
  if (!rows[0]) return null;
  const contract = rows[0];
  const [orderRows] = await pool.query(
    `SELECT o.* FROM sales_orders o
     INNER JOIN sales_contract_orders sco ON sco.order_id = o.id WHERE sco.contract_id = ?`,
    [contractId]
  );
  const listFieldDefs = await loadOrderFieldDefinitions(pool, { activeOnly: true });
  const orders = orderRows.map((r) => prepareOrderRowForContractHtml(r, listFieldDefs));
  return { contract, orders, listFieldDefs };
}

function resolveVatRateFraction(order) {
  const raw = order?.tax_rate ?? order?.vat_rate;
  if (raw == null || raw === '') return DEFAULT_VAT_RATE;
  const s = String(raw).replace(/%/g, '').trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_VAT_RATE;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

function fmtMoney2(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return (Math.round(num * 100) / 100).toFixed(2);
}

function lineAmountsFromOrder(o) {
  const grossUnit = Number(o?.unit_price);
  const tons = tonsFromQtyAndSpec(o?.quantity, o?.product_name || '');
  const r = resolveVatRateFraction(o);
  if (!Number.isFinite(grossUnit) || grossUnit <= 0 || tons == null || tons <= 0 || !Number.isFinite(r) || r < 0) {
    return null;
  }
  const netUnit = grossUnit / (1 + r);
  const totalWithTax = grossUnit * tons;
  const netAmount = netUnit * tons;
  const taxAmount = totalWithTax - netAmount;
  const pct = Math.round(r * 10000) / 100;
  return {
    netUnitStr: fmtMoney2(netUnit), netAmountStr: fmtMoney2(netAmount),
    taxAmountStr: fmtMoney2(taxAmount), totalWithTaxStr: fmtMoney2(totalWithTax),
    taxRateCell: `${pct}%`
  };
}

// ── Placeholder filling ────────────────────────────────

function placeholderValues(contract) {
  return {
    CUSTOMER_NAME: contract.customer_name || '',
    COMPANY_NAME_ZH: contract.company_name_zh || '',
    CONTRACT_NO: contract.contract_no || '',
    SIGN_DATE_ZH: contract.created_at ? formatSigningDateZhShanghai(new Date(contract.created_at)) : '',
    CUSTOMER_ADDRESS: contract.customer_address || '',
    CUSTOMER_CONTACT: contract.customer_contact || '',
    CUSTOMER_PHONE: contract.customer_phone || '',
    CUSTOMER_FAX: contract.customer_fax || '',
    CUSTOMER_BANK: contract.customer_bank || '',
    CUSTOMER_ACCOUNT: contract.customer_account || '',
    CUSTOMER_TAX_ID: contract.customer_tax_id || ''
  };
}

function fillText(text, contract) {
  const vals = placeholderValues(contract);
  return String(text ?? '').replace(/\{\{(\w+)\}\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vals, key) ? vals[key] : `{{${key}}}`
  );
}

// ── Inline HTML parsing for clause bodies ──────────────

function parseInlineHtml(html, contract) {
  const filled = fillText(html, contract);
  const jq = load(`<div>${filled}</div>`, { xml: false });
  const runs = [];
  const walk = (nodes) => {
    nodes.each((_, node) => {
      if (node.type === 'text') {
        const t = (node.data || '').replace(/\s+/g, ' ').trim();
        if (t) runs.push({ text: t, bold: false, underline: false });
        return;
      }
      if (node.type !== 'tag') return;
      const tag = node.tagName.toLowerCase();
      const innerText = jq(node).text().replace(/\s+/g, ' ').trim();
      if (!innerText) return;
      if (tag === 'b' || tag === 'strong' || tag === 'u') {
        runs.push({ text: innerText, bold: tag !== 'u', underline: tag === 'u' });
      } else {
        walk(jq(node).contents());
      }
    });
  };
  walk(jq('div').contents());
  return runs.length ? runs : [{ text: jq.text().replace(/\s+/g, ' ').trim(), bold: false, underline: false }];
}

// ── Docx element factories ─────────────────────────────

function centeredPara(text, font, size) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text, font, size })]
  });
}

function bodyPara(html, contract, indent = true) {
  const runs = parseInlineHtml(html, contract);
  if (!runs.length) return null;
  return new Paragraph({
    spacing: { before: 20, after: 20, line: 360 },
    indent: indent ? { firstLine: 480 } : undefined,
    children: runs.map(r => new TextRun({
      text: r.text, bold: r.bold,
      underline: r.underline ? { type: 'single' } : undefined,
      font: BODY_FONT, size: 28
    }))
  });
}

function emptyPara() {
  return new Paragraph({ spacing: { before: 40, after: 40 }, children: [] });
}

function noBorders() {
  return {
    top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 },
    left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 },
    insideHorizontal: { style: BorderStyle.NONE, size: 0 }, insideVertical: { style: BorderStyle.NONE, size: 0 }
  };
}

function allBorders() {
  return {
    top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: '000000' }
  };
}

function cell(children, opts = {}) {
  const tcOpts = {
    children: Array.isArray(children) ? children : [children],
    verticalAlign: 'center',
    margins: { top: 40, bottom: 40, left: 60, right: 60 }
  };
  if (opts.columnSpan != null) tcOpts.columnSpan = opts.columnSpan;
  if (opts.width) tcOpts.width = { size: opts.width, type: opts.widthType || WidthType.PERCENTAGE };
  return new TableCell(tcOpts);
}

function cellPara(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: 0, after: 0 },
    children: [new TextRun({ text: String(text ?? ''), font: opts.font || BODY_FONT, size: opts.size || 28, bold: opts.bold })]
  });
}

// ── HTML structure parser (recursive DOM walk) ─────────

function parseContractStructure(bodyHtml) {
  const jq = load(bodyHtml, { xml: false });
  const parts = [];
  let clauseBuffer = null;

  const flushClause = () => {
    if (clauseBuffer) {
      parts.push({ type: 'clause', title: clauseBuffer.title,
        body: clauseBuffer.body.replace(/\s+/g, ' ').trim() });
      clauseBuffer = null;
    }
  };
  const addPart = (p) => { flushClause(); parts.push(p); };

  const walk = (nodes) => {
    nodes.each((_, el) => {
      if (el.type === 'text') {
        const t = (el.data || '').trim();
        if (!t) return;
        if (t.startsWith('{{ORDER_LINES}}')) addPart({ type: 'orderLinesMarker' });
        else if (clauseBuffer) clauseBuffer.body += ' ' + t;
        return;
      }
      if (el.type !== 'tag') return;
      const tag = el.tagName.toLowerCase();
      const $el = jq(el);
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (!text) return;

      // Recurse into divs to unwrap containers
      if (tag === 'div') {
        walk($el.contents());
        return;
      }

      if (tag === 'table') {
        const cls = ($el.attr('class') || '').toLowerCase();
        if (cls.includes('header-meta')) addPart({ type: 'headerMeta', $el });
        else if (cls.includes('party')) addPart({ type: 'partyTable', $el });
        else {
          const cols = $el.find('tr').first().find('td, th').length;
          addPart({ type: cols >= 5 ? 'orderLinesTable' : 'otherTable', $el });
        }
        return;
      }

      if (tag === 'p' || tag === 'span') {
        const hasStrong = $el.find('strong, b').length > 0;
        const style = ($el.attr('style') || '').toLowerCase();
        const isCentered = style.includes('text-align:center');

        if (hasStrong) {
          const strongText = $el.find('strong, b').first().text().trim();
          const $clone = $el.clone();
          $clone.find('strong, b').remove();
          let bodyHtml = '';
          $clone.contents().each((_, child) => {
            if (child.type === 'text') bodyHtml += (child.data || '');
            else if (child.type === 'tag') bodyHtml += jq.html(child);
          });
          flushClause();
          clauseBuffer = { title: strongText, body: bodyHtml || $clone.text().trim() };
          return;
        }

        if (clauseBuffer) {
          clauseBuffer.body += (clauseBuffer.body ? '\n' : '') + text;
          return;
        }

        if (isCentered) addPart({ type: 'centeredLine', text, $el });
        else if (text.includes('总金额')) addPart({ type: 'totalLine', text });
        else addPart({ type: 'plainPara', html: jq.html($el), text });
        return;
      }

      // Fallback: any other tag with text
      if (clauseBuffer) clauseBuffer.body += ' ' + text;
      else addPart({ type: 'otherText', text });
    });
  };

  const root = jq('body').length ? jq('body') : jq.root();
  walk(root.children());
  flushClause();
  return parts;
}

// ── Section builders ───────────────────────────────────

function buildHeaderMetaFromHtml($el, contract) {
  const jq = load(`<table>${($el.html?.() || '')}</table>`, { xml: false });
  const rows = [];
  jq('tr').each((_, tr) => {
    const cells = [];
    jq(tr).find('td, th').each((_, td) => {
      cells.push(fillText(jq(td).text().replace(/\s+/g, ' ').trim(), contract));
    });
    if (cells.length) rows.push(cells);
  });
  if (!rows.length) return null;
  const colCount = Math.max(...rows.map(r => r.length));
  const docxRows = rows.map(row => {
    const cells = [];
    for (let ci = 0; ci < colCount; ci++) {
      cells.push(cell(cellPara(row[ci] || '', { size: 24 }), { width: ci === 0 ? 55 : 45 }));
    }
    return new TableRow({ children: cells });
  });
  return new Table({ rows: docxRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders() });
}

function buildHeaderMetaFallback(contract) {
  const signDate = contract.created_at ? formatSigningDateZhShanghai(new Date(contract.created_at)) : '';
  return new Table({
    rows: [new TableRow({ children: [
      cell([cellPara(`买方：${contract.customer_name || ''}`, { size: 24 }),
            cellPara(`卖方：${contract.company_name_zh || ''}`, { size: 24 })], { width: 55 }),
      cell([cellPara(`合同编号：${contract.contract_no || ''}`, { size: 24 }),
            cellPara('履约地点：兰考', { size: 24 }),
            cellPara(`签订时间：${signDate}`, { size: 24 })], { width: 45 })
    ]})],
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders()
  });
}

/** 使用合同正文里已保存的订单明细 HTML（与用户编辑一致），避免用关联订单重算导致与预览不一致 */
function buildOrderLinesTableFromHtml($el, contract) {
  const html = typeof $el === 'string' ? $el : $el?.html?.() || '';
  if (!html.trim()) return null;
  const jq = load(`<table>${html}</table>`, { xml: false });
  let headers = [];
  jq('thead th').each((_, th) => {
    const t = jq(th).text().replace(/\s+/g, ' ').trim();
    if (t) headers.push(t);
  });
  if (!headers.length) {
    jq('tr')
      .first()
      .find('th, td')
      .each((_, cell) => {
        const t = jq(cell).text().replace(/\s+/g, ' ').trim();
        if (t) headers.push(t);
      });
  }
  const bodyRows = [];
  let totalText = '';
  jq('tbody tr').each((_, tr) => {
    const rowText = jq(tr).text().replace(/\s+/g, ' ').trim();
    if (!rowText) return;
    if (rowText.includes('总金额')) {
      const tds = jq(tr).find('td');
      if (tds.length >= 2) {
        totalText = fillText(jq(tds.eq(1)).text().replace(/\s+/g, ' ').trim(), contract);
      } else {
        totalText = fillText(rowText.replace(/^总金额[（(]大写[）)]*[：:]\s*/i, '').trim(), contract);
      }
      return;
    }
    const cells = [];
    jq(tr)
      .find('td')
      .each((_, td) => {
        cells.push(fillText(jq(td).text().replace(/\s+/g, ' ').trim(), contract));
      });
    if (cells.length) bodyRows.push(cells);
  });
  if (!headers.length && !bodyRows.length) return null;
  const colCount = Math.max(headers.length, ...bodyRows.map((r) => r.length), 1);
  if (!headers.length) {
    headers = Array.from({ length: colCount }, (_, i) => (i === 0 ? '品名' : ''));
  }
  const baseWidths = [14, 14, 12, 10, 10, 12, 8, 10, 10];
  const colWidths = Array.from({ length: colCount }, (_, i) => baseWidths[i] ?? Math.floor(100 / colCount));

  const hdrRow = new TableRow({
    children: headers.map((h, i) =>
      cell(cellPara(h, { align: AlignmentType.CENTER, bold: true, size: 24 }), { width: colWidths[i] || 10 }))
  });
  const dataRows = bodyRows.map((row) => {
    const values = Array.from({ length: colCount }, (_, i) => row[i] ?? '');
    return new TableRow({
      children: values.map((v, i) =>
        cell(cellPara(v, { align: i >= 2 ? AlignmentType.CENTER : AlignmentType.LEFT, size: 24 }), {
          width: colWidths[i] || 10
        }))
    });
  });
  const totalRow = new TableRow({
    children: [
      cell(cellPara('总金额', { bold: true, size: 24 }), { width: colWidths[0] || 10 }),
      cell(cellPara(totalText || '', { size: 24 }), { columnSpan: Math.max(1, colCount - 1) })
    ]
  });
  return new Table({
    rows: [hdrRow, ...dataRows, totalRow],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: allBorders()
  });
}

function buildOrderLinesTable(orders) {
  const headers = ['品名', '型号', '不含税单价（元）', '单位（吨）', '数量（桶）',
                   '不含税金额（元）', '税率', '税额（元）', '价税合计（元）'];
  const colWidths = [14, 14, 12, 10, 10, 12, 8, 10, 10];

  const hdrRow = new TableRow({
    children: headers.map((h, i) =>
      cell(cellPara(h, { align: AlignmentType.CENTER, bold: true, size: 24 }), { width: colWidths[i] }))
  });

  function fmtDisplay(val) {
    if (val == null || val === '') return '';
    return String(typeof val === 'number' ? (Math.round(val * 100) / 100).toFixed(2) : val);
  }

  let totalGross = 0;
  const dataRows = orders.map(o => {
    const amt = lineAmountsFromOrder(o);
    if (amt) totalGross += Number(amt.totalWithTaxStr) || 0;
    const d = o?.display_data || {};
    const qtyRaw = o?.quantity ?? d?.quantity;
    const qty = qtyRaw != null ? String(qtyRaw) : '';
    const prodName = o?.product_name || d?.product_name || '';
    const tons = tonsFromQtyAndSpec(qtyRaw, prodName);
    const tonsStr = tons != null ? tons.toFixed(2) : '';
    const values = [
      prodName, String(o?.product_model || d?.product_model || ''),
      amt ? amt.netUnitStr : '', tonsStr, qty,
      amt ? amt.netAmountStr : '', amt ? amt.taxRateCell : '',
      amt ? amt.taxAmountStr : '', amt ? amt.totalWithTaxStr : ''
    ];
    return new TableRow({
      children: values.map((v, i) =>
        cell(cellPara(v, { align: i >= 2 ? AlignmentType.CENTER : AlignmentType.LEFT, size: 24 }), { width: colWidths[i] }))
    });
  });

  const totalCn = amountToRmbUppercase(totalGross);
  const totalStr = `${totalCn}（￥${totalGross.toFixed(2)}）`;
  const totalRow = new TableRow({
    children: [
      cell(cellPara('总金额', { bold: true, size: 24 }), { width: colWidths[0] }),
      cell(cellPara(totalStr, { size: 24 }), { columnSpan: 8 })
    ]
  });

  return new Table({
    rows: [hdrRow, ...dataRows, totalRow],
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: allBorders()
  });
}

function buildPartyTableFromHtml($el, contract) {
  const html = typeof $el === 'string' ? $el : ($el.html?.() || '');
  const jq = load(`<table>${html}</table>`, { xml: false });
  const rows = [];
  jq('tr').each((_, tr) => {
    const cells = [];
    jq(tr).find('td, th').each((_, td) => {
      cells.push(jq(td).html() || '');
    });
    if (cells.length) rows.push(cells);
  });
  if (!rows.length) return null;
  const docxRows = rows.map(row => {
    const children = [];
    for (let ci = 0; ci < Math.max(row.length, 2); ci++) {
      const innerHtml = row[ci] || '';
      // 按 <div> <p> 等块级标签切分，兼容自定义模板的各种写法
      const segments = innerHtml.split(/<\/div>|<\/p>|<br\s*\/?>/i);
      const lines = segments
        .map(s => {
          const jq2 = load(`<div>${s}</div>`, { xml: false });
          return fillText(jq2.text().replace(/\s+/g, ' ').trim(), contract);
        })
        .filter(t => t);
      const paras = lines.map(l => {
        const isTitle = l === '卖方' || l === '买方';
        return new Paragraph({
          alignment: isTitle ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { before: 40, after: 40 },
          children: [new TextRun({ text: l, bold: isTitle, font: BODY_FONT, size: 24 })]
        });
      });
      children.push(cell(paras.length ? paras : [cellPara('')], { width: 50 }));
    }
    return new TableRow({ children });
  });
  return new Table({ rows: docxRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: allBorders() });
}

function buildPartyFallback(contract) {
  const makeCol = (lines) => lines.map((l, i) => new Paragraph({
    alignment: i === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text: l, bold: i === 0, font: BODY_FONT, size: 24 })]
  }));
  return new Table({
    rows: [new TableRow({ children: [
      cell(makeCol(['卖方', `单位：${contract.company_name_zh || ''}`, '地址：', '联系人：', '电话：', '传真：', '开户银行：', '账号：', '行号：']), { width: 50 }),
      cell(makeCol(['买方', `单位：${contract.customer_name || ''}`, `地址：${contract.customer_address || ''}`, `联系人：${contract.customer_contact || ''}`, `电话：${contract.customer_phone || ''}`, '传真：', '开户银行：', '账号：', '税号：']), { width: 50 })
    ]})],
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: allBorders()
  });
}

// ── Main docx builder ──────────────────────────────────

function buildContractDocx(contract, orders) {
  const parts = parseContractStructure(contract.body_html || '');

  // Build slot manifest in DOM order
  const slots = [];

  // Company + title always first (from data)
  slots.push({ type: 'companyTitle', companyName: contract.company_name_zh || '' });

  let hasHeaderMeta = false;
  let hasOrderTable = false;
  let hasPartyTable = false;
  let partyTableEl = null;
  /** 正文内嵌的订单明细表（保存时写入），优先于关联订单重算 */
  let orderTableHtmlEl = null;

  for (const part of parts) {
    if (part.type === 'headerMeta') {
      slots.push({ type: 'headerMeta', $el: part.$el });
      hasHeaderMeta = true;
    } else if (part.type === 'orderLinesTable') {
      hasOrderTable = true;
      orderTableHtmlEl = part.$el;
    } else if (part.type === 'orderLinesMarker') {
      hasOrderTable = true;
    } else if (part.type === 'partyTable') {
      hasPartyTable = true;
      partyTableEl = part.$el;
    } else if (part.type === 'clause') {
      slots.push({ type: 'clause', title: part.title, body: part.body });
    } else if (part.type === 'plainPara') {
      slots.push({ type: 'plainPara', html: part.html });
    }
    // totalLine from HTML is skipped — computed one replaces it (see below)
    // centeredLine and otherText are informational (skipped)
  }

  // Insert header meta fallback if not found in HTML
  if (!hasHeaderMeta) {
    slots.splice(1, 0, { type: 'headerMetaFallback' });
  }

  // Insert order table at the position it appeared in HTML
  if (hasOrderTable) {
    let insertIdx = -1;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type === 'orderLinesTable' || parts[i].type === 'orderLinesMarker') {
        insertIdx = 1;
        for (let j = 0; j < i; j++) {
          const pt = parts[j];
          if (pt.type === 'headerMeta' || pt.type === 'clause' || pt.type === 'plainPara') insertIdx++;
        }
        break;
      }
    }
    const orderSlot = orderTableHtmlEl
      ? { type: 'orderTableFromHtml', $el: orderTableHtmlEl }
      : orders.length
        ? { type: 'orderTable', orders }
        : null;
    if (orderSlot) {
      if (insertIdx > 0) {
        slots.splice(insertIdx, 0, orderSlot);
      } else {
        slots.push(orderSlot);
      }
    }
  }

  // Party table at end
  if (hasPartyTable && partyTableEl) {
    slots.push({ type: 'partyTable', $el: partyTableEl });
  } else {
    slots.push({ type: 'partyFallback' });
  }

  // ── Render slots ──────────────────────────────────────
  const children = [];

  for (const slot of slots) {
    switch (slot.type) {
      case 'companyTitle':
        if (slot.companyName) children.push(centeredPara(slot.companyName, TITLE_FONT, 44));
        children.push(centeredPara('销售合同', TITLE_FONT, 44));
        children.push(emptyPara());
        break;

      case 'headerMeta': {
        const tbl = buildHeaderMetaFromHtml(slot.$el, contract);
        if (tbl) { children.push(tbl); children.push(emptyPara()); }
        break;
      }
      case 'headerMetaFallback':
        children.push(buildHeaderMetaFallback(contract));
        children.push(emptyPara());
        break;

      case 'clause':
        children.push(new Paragraph({
          spacing: { before: 100, after: 20 },
          indent: { firstLine: 480 },
          children: [new TextRun({ text: fillText(slot.title, contract), bold: true, font: BODY_FONT, size: 28 })]
        }));
        if (slot.body) {
          const p = bodyPara(slot.body, contract);
          if (p) children.push(p);
        }
        break;

      case 'plainPara': {
        const p = bodyPara(slot.html, contract);
        if (p) children.push(p);
        break;
      }

      case 'orderTableFromHtml': {
        children.push(emptyPara());
        const tblFromHtml = buildOrderLinesTableFromHtml(slot.$el, contract);
        if (tblFromHtml) children.push(tblFromHtml);
        else if (orders.length) children.push(buildOrderLinesTable(orders));
        break;
      }
      case 'orderTable':
        children.push(emptyPara());
        children.push(buildOrderLinesTable(slot.orders));
        break;

      case 'totalLine':
        children.push(new Paragraph({
          spacing: { before: 80, after: 80 },
          children: [new TextRun({ text: slot.text, font: BODY_FONT, size: 28 })]
        }));
        break;

      case 'partyTable': {
        children.push(emptyPara());
        const tbl = buildPartyTableFromHtml(slot.$el, contract);
        if (tbl) children.push(tbl);
        break;
      }
      case 'partyFallback':
        children.push(emptyPara());
        children.push(buildPartyFallback(contract));
        break;
    }
  }

  return new Document({
    styles: { default: { document: { run: { font: BODY_FONT, size: 28 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, bottom: 1134, left: 1417, right: 1417 }
        }
      },
      children
    }]
  });
}

// ── Public entry point ──────────────────────────────────

export async function generateContractDocx(pool, contractId) {
  const data = await fetchContractData(pool, contractId);
  if (!data) return null;
  const { contract, orders } = data;
  const doc = buildContractDocx(contract, orders);
  const buffer = await Packer.toBuffer(doc);
  const safeNo = (contract.contract_no || `contract-${contractId}`).replace(/[/\\?%*:|"<>]/g, '-');
  return { buffer, filename: `${safeNo}.docx` };
}
