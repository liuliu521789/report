import {
  CONTRACT_ORDER_LINE_HEADERS,
  CONTRACT_ORDER_LINE_HEADERS_FINAL
} from './contractVisualDefaults';
import { grossUnitFromNetAndTaxRate } from './contractOrderLineCalc.js';
import {
  ensurePartyItemsOnVisual,
  PARTY_FALLBACK_COMPANY,
  PARTY_FALLBACK_CUSTOMER
} from './contractPartyItems.js';
import {
  ORDER_LINES_CELL_NOWRAP,
  ORDER_LINES_CELL_STYLE,
  orderLinesTableOpenTag
} from './contractOrderLinesTableStyle.js';

function normText(s) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 表头比对：半角括号与全角统一，避免生成/手改后无法识别订单表 */
function normHeaderCell(s) {
  return normText(s).replace(/\(/g, '（').replace(/\)/g, '）');
}

/**
 * 模板正文里订单明细是 `{{ORDER_LINES}}` 文本占位符；DOM 子节点只有元素，`children` 会跳过该文本，
 * 解析器永远找不到「订单表」而返回 null。解析前换成与 `isOrderLinesTable` 一致的空表；保存时
 * `visualToBodyHtml` 仍会写回 `{{ORDER_LINES}}`。
 */
function stubOrderLinesTableHtmlForParse() {
  const ths = CONTRACT_ORDER_LINE_HEADERS.map((h, i) =>
    `<th style="${i < 2 ? ORDER_LINES_CELL_NOWRAP : ORDER_LINES_CELL_STYLE}">${h}</th>`
  ).join('');
  const tds = CONTRACT_ORDER_LINE_HEADERS.map((_, i) =>
    `<td style="${i < 2 ? ORDER_LINES_CELL_NOWRAP : ORDER_LINES_CELL_STYLE}"></td>`
  ).join('');
  const colspan = CONTRACT_ORDER_LINE_HEADERS.length - 1;
  const totalRow = `<tr><td style="${ORDER_LINES_CELL_STYLE}">总金额</td><td colspan="${colspan}" style="${ORDER_LINES_CELL_STYLE};text-align:left">{{AMOUNT_TOTAL_CN}}（￥{{AMOUNT_TOTAL}}）</td></tr>`;
  return `${orderLinesTableOpenTag()}<thead><tr>${ths}</tr></thead><tbody><tr>${tds}</tr>${totalRow}</tbody></table>`;
}

/** 跳过空段落与纯空白文本节点，避免标题与订单表之间的换行导致解析失败 */
function indexAfterEmptyParagraphs(kids, start) {
  let j = start;
  while (j < kids.length) {
    const n = kids[j];
    if (n.nodeType === 3) {
      if (!normText(n.textContent)) {
        j++;
        continue;
      }
      break;
    }
    if (n.tagName === 'P' && normText(n.textContent) === '') {
      j++;
      continue;
    }
    break;
  }
  return j;
}

function padOrderLineRow(row) {
  const editorN = CONTRACT_ORDER_LINE_HEADERS.length;
  const finalN = CONTRACT_ORDER_LINE_HEADERS_FINAL.length;
  const r = [...(row || [])];
  if (r.length === editorN || r.length === finalN) return normalizeOrderLineRows([r])[0];
  if (r.length === finalN - 1) return normalizeOrderLineRows([r])[0];
  const out = Array.from({ length: editorN }, (_, i) => r[i] ?? '');
  return out;
}

function normalizeParsedOrderRows(rows) {
  const editorN = CONTRACT_ORDER_LINE_HEADERS.length;
  const finalN = CONTRACT_ORDER_LINE_HEADERS_FINAL.length;
  const valid = (rows || []).filter((r) => r && r.length > 0);
  if (!valid.length) return [Array(editorN).fill('')];
  return valid.map((r) => padOrderLineRow(r));
}

function contractHeaderTableFromKid(el) {
  if (!el) return null;
  if (el.tagName === 'TABLE') return el;
  if (el.tagName === 'DIV') {
    return el.querySelector('table.contract-header-meta') || el.querySelector('table');
  }
  return null;
}

/** 文首空段落、标题样式等与「紧挨着的」假设不一致时，仍尝试按标题+抬头表识别 */
function kidsLookLikeContractLayout(kids, outerDivStyle, rawHasKnownBodyFont) {
  if (rawHasKnownBodyFont) return true;
  const st = String(outerDivStyle || '');
  if (st.includes('SimSun') || st.includes('宋体') || st.includes('FangSong') || st.includes('仿宋')) return true;
  const ti = indexAfterEmptyParagraphs(kids, 0);
  const hi = indexAfterEmptyParagraphs(kids, ti + 1);
  const titleNode = kids[ti];
  const titleLooksLikeClassic =
    titleNode?.tagName === 'P' && !!titleNode?.querySelector('strong');
  const titleLooksLikeLegacyRecommended =
    titleNode?.tagName === 'DIV' &&
    ((titleNode?.querySelectorAll?.(':scope > div')?.length || 0) >= 1 ||
      KNOWN_CONTRACT_TITLES.some((w) => normText(titleNode?.textContent).includes(w)));
  const headerTable = contractHeaderTableFromKid(kids[hi]);
  return (
    kids.length >= 3 &&
    (titleLooksLikeClassic || titleLooksLikeLegacyRecommended) &&
    !!headerTable
  );
}

function splitFirstColon(s) {
  const m = String(s).match(/^([^：:]+)[：:]\s*(.*)$/s);
  if (!m) return { label: '', value: normText(s) };
  return { label: normText(m[1]), value: normText(m[2]) };
}

function mergeHeaderSide(parsedList, defaults) {
  const def = defaults || [];
  return parsedList.map((p, i) => {
    const d = def[i] || { label: p.label, value: '', placeholder: '', fallback: '' };
    let value = p.value;
    let fallback = d.fallback ?? '';
    if (/^\{\{.+?\}\}$/.test(value)) {
      fallback = value;
      value = d.value || '';
    }
    return { ...d, label: p.label || d.label, value, fallback };
  });
}

function isTitleOnlyClauseP(el) {
  if (!el || el.tagName !== 'P') return false;
  const strong = el.querySelector('strong');
  if (!strong) return false;
  const clone = el.cloneNode(true);
  const rm = clone.querySelector('strong');
  if (rm) rm.remove();
  const after = normText(clone.textContent);
  return !after;
}

function isOrderLinesTable(el) {
  if (!el || el.tagName !== 'TABLE') return false;
  let ths = [...el.querySelectorAll('thead th')].map((th) => normHeaderCell(th.textContent));
  if (!ths.length) {
    const firstRow = el.querySelector('tr');
    if (!firstRow) return false;
    ths = [...firstRow.querySelectorAll('th, td')].map((cell) => normHeaderCell(cell.textContent));
  }
  const finalH = CONTRACT_ORDER_LINE_HEADERS_FINAL.map((h) => normHeaderCell(h));
  const editorH = CONTRACT_ORDER_LINE_HEADERS.map((h) => normHeaderCell(h));
  if (ths.length === finalH.length && finalH.every((h, i) => ths[i] === h)) return true;
  if (ths.length === editorH.length && editorH.every((h, i) => ths[i] === h)) return true;
  return false;
}

function isPartyBlockTable(el) {
  if (!el || el.tagName !== 'TABLE') return false;
  const t = normText(el.textContent);
  return t.includes('卖方') && t.includes('买方') && t.includes('单位');
}

function isTotalSummaryRow(tr) {
  const tds = [...tr.querySelectorAll('td')];
  if (!tds.length) return false;
  const t = normText(tr.textContent);
  if (!t.includes('总金额')) return false;
  if (tds.length === 2) {
    const c1 = normText(tds[0].textContent);
    return c1 === '总金额' || /^总金额/.test(c1);
  }
  if (tds.length === 1) return true;
  const colspan = parseInt(tds[0]?.getAttribute('colspan') || '1', 10);
  return colspan >= CONTRACT_ORDER_LINE_HEADERS_FINAL.length - 1;
}

/** 拆出数据行与表内总金额行（新结构）；旧表无总金额行时 totalFromTable 为空 */
function parseOrderTableWithTotal(table) {
  const trs = [...table.querySelectorAll('tbody tr')];
  if (!trs.length) {
    return {
      rows: [Array(CONTRACT_ORDER_LINE_HEADERS.length).fill('')],
      totalFromTable: ''
    };
  }
  let dataTrs = trs;
  let totalFromTable = '';
  const last = trs[trs.length - 1];
  if (isTotalSummaryRow(last)) {
    const sumTds = [...last.querySelectorAll('td')];
    if (sumTds.length === 2) {
      let c2 = normText(sumTds[1].textContent);
      totalFromTable = c2.replace(/^（大写）[:：]\s*/, '').trim();
    } else {
      const text = normText(last.textContent);
      const m = text.match(/总金额[（(]大写[）)]*[：:]\s*(.+)$/);
      totalFromTable = m ? m[1].trim() : text.replace(/^.*?[：:]\s*/, '').trim();
    }
    dataTrs = trs.slice(0, -1);
  }
  const rows = dataTrs.map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => normText(td.textContent))
  );
  return { rows, totalFromTable };
}

function normalizeOrderLineRows(rows) {
  const editorN = CONTRACT_ORDER_LINE_HEADERS.length;
  const finalN = CONTRACT_ORDER_LINE_HEADERS_FINAL.length;
  const valid = (rows || []).filter((r) => r && (r.length === editorN || r.length === finalN));
  if (!valid.length) return [Array(editorN).fill('')];
  return valid.map((r) => {
    if (r.length === editorN) return [...r];
    const grossCell = grossUnitFromNetAndTaxRate(r[2], r[6]);
    const out = [...r];
    out.splice(2, 0, grossCell);
    return out;
  });
}

function parsePartyTdToItems(td, side) {
  const items = [];
  const divs = td?.querySelectorAll?.(':scope > div');
  if (!divs || divs.length < 2) return items;
  // 支持两种结构：
  //   1) 标题 + 单 div（内含 <br> 分隔的多行）
  //   2) 标题 + 每行一个 div
  if (divs.length === 2) {
    const html = divs[1].innerHTML;
    const parts = html.split(/<br\s*\/?>/i);
    for (const part of parts) {
      const cleaned = normText(part.replace(/<[^>]+>/g, ''));
      if (!cleaned) continue;
      const { label, value } = splitFirstColon(cleaned);
      if (!label) continue;
      const item = { label, value };
      if (label === '单位') {
        if (value === '{{COMPANY_NAME_ZH}}') {
          item.value = '';
          item.fallback = PARTY_FALLBACK_COMPANY;
        } else if (value === '{{CUSTOMER_NAME}}') {
          item.value = '';
          item.fallback = PARTY_FALLBACK_CUSTOMER;
        } else if (side === 'seller' && !value) {
          item.fallback = PARTY_FALLBACK_COMPANY;
        } else if (side === 'buyer' && !value) {
          item.fallback = PARTY_FALLBACK_CUSTOMER;
        }
      }
      if (!item.fallback && /^\{\{.+?\}\}$/.test(item.value)) {
        item.fallback = item.value;
        item.value = '';
      }
      items.push(item);
    }
  } else {
    for (let i = 1; i < divs.length; i++) {
      const cleaned = normText(divs[i].textContent);
      if (!cleaned) continue;
      const { label, value } = splitFirstColon(cleaned);
      if (!label) continue;
      const item = { label, value };
      if (label === '单位') {
        if (value === '{{COMPANY_NAME_ZH}}') {
          item.value = '';
          item.fallback = PARTY_FALLBACK_COMPANY;
        } else if (value === '{{CUSTOMER_NAME}}') {
          item.value = '';
          item.fallback = PARTY_FALLBACK_CUSTOMER;
        } else if (side === 'seller' && !value) {
          item.fallback = PARTY_FALLBACK_COMPANY;
        } else if (side === 'buyer' && !value) {
          item.fallback = PARTY_FALLBACK_CUSTOMER;
        }
      }
      if (!item.fallback && /^\{\{.+?\}\}$/.test(item.value)) {
        item.fallback = item.value;
        item.value = '';
      }
      items.push(item);
    }
  }
  return items;
}

const KNOWN_CONTRACT_TITLES = [
  '产品购销合同',
  '购销合同',
  '采购合同',
  '供货合同',
  '买卖合同',
  '订货合同',
  '销售合同'
];

const DEFAULT_ORDER_CLAUSE_TITLE = '一、产品名称、单价、数量、金额：';

function splitHeaderTitleLine(line) {
  const t = normText(line);
  let headerCompanyZh = t;
  let headerTitleZh = '销售合同';
  for (const suf of [...KNOWN_CONTRACT_TITLES].sort((a, b) => b.length - a.length)) {
    if (t.endsWith(suf)) {
      headerCompanyZh = t.slice(0, t.length - suf.length).trim();
      headerTitleZh = suf;
      break;
    }
  }
  return { headerCompanyZh, headerTitleZh };
}

/**
 * 将「合同模板 · 可视化」生成的正文 HTML（占位符已替换）解析回 visual 模型。
 * 若版式不匹配（例如旧版推荐模板）返回 null。
 */
export function parseContractHtmlToVisual(html, base) {
  const rawTrim = String(html || '').trim();
  if (!rawTrim || !base) return null;
  const raw = rawTrim.replace(/\{\{\s*ORDER_LINES\s*\}\}/g, stubOrderLinesTableHtmlForParse());

  let doc;
  try {
    doc = new DOMParser().parseFromString(`<div id="parse-root">${raw}</div>`, 'text/html');
  } catch {
    return null;
  }
  const wrap = doc.getElementById('parse-root');
  if (!wrap || wrap.children.length === 0) return null;

  const first = wrap.firstElementChild;
  const rawHasKnownBodyFont =
    raw.includes('SimSun') ||
    raw.includes('宋体') ||
    raw.includes('FangSong') ||
    raw.includes('仿宋');
  let kids;
  if (first.tagName === 'DIV') {
    const st = first.getAttribute('style') || '';
    kids = [...first.children];
    // 外层可能被 ensureStandardContractOuterWrap 套了一层 SimSun 包裹 div
    // 如果只有一个子元素且是 div，则解一层，让可视化解析看到真实的合同结构
    if (kids.length === 1 && kids[0].tagName === 'DIV') {
      kids = [...kids[0].children];
    }
    if (!kidsLookLikeContractLayout(kids, st, rawHasKnownBodyFont)) return null;
  } else {
    /* 正文无单一外包 div（顶层多为 p + table…），与带外层 div 时子节点序列一致 */
    kids = [...wrap.children];
    if (!kidsLookLikeContractLayout(kids, '', rawHasKnownBodyFont)) return null;
  }
  if (kids.length < 3) return null;

  /* 允许文首、标题与抬头表之间的空段落，避免稍经编辑后无法还原可视化 */
  const titleIdx = indexAfterEmptyParagraphs(kids, 0);
  const titleNode = kids[titleIdx];
  if (!titleNode) return null;

  const visual = JSON.parse(JSON.stringify(base));
  if (titleNode.tagName === 'P') {
    const titleStrong = titleNode.querySelector('strong');
    if (!titleStrong) return null;
    const ht = splitHeaderTitleLine(titleStrong.textContent);
    visual.headerCompanyZh = ht.headerCompanyZh;
    visual.headerTitleZh = ht.headerTitleZh;
  } else if (titleNode.tagName === 'DIV') {
    const titleLines = [...titleNode.querySelectorAll(':scope > div')]
      .map((d) => normText(d.textContent))
      .filter(Boolean);
    if (titleLines.length >= 2) {
      visual.headerCompanyZh = titleLines[0];
      visual.headerTitleZh = titleLines[1];
    } else {
      const ht = splitHeaderTitleLine(titleNode.textContent);
      visual.headerCompanyZh = ht.headerCompanyZh;
      visual.headerTitleZh = ht.headerTitleZh;
    }
  } else {
    return null;
  }

  if (/^\{\{.+?\}\}$/.test(visual.headerCompanyZh)) {
    visual.headerCompanyZh = '';
  }

  let headerIdx = indexAfterEmptyParagraphs(kids, titleIdx + 1);
  const headerKid = kids[headerIdx];
  const headerTable = contractHeaderTableFromKid(headerKid);
  if (!headerTable || headerTable.tagName !== 'TABLE') return null;

  const leftParsed = [];
  const rightParsed = [];
  for (const tr of headerTable.querySelectorAll('tr')) {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 2) continue;
    const leftDivs = [...tds[0].querySelectorAll(':scope > div')];
    const rightDivs = [...tds[1].querySelectorAll(':scope > div')];
    for (const d of leftDivs) {
      const tx = normText(d.textContent);
      if (tx && tx !== '—') leftParsed.push(splitFirstColon(tx));
    }
    for (const d of rightDivs) {
      const tx = normText(d.textContent);
      if (tx && tx !== '—') rightParsed.push(splitFirstColon(tx));
    }
  }
  if (leftParsed.length) visual.headerItemsLeft = mergeHeaderSide(leftParsed, base.headerItemsLeft);
  if (rightParsed.length) visual.headerItemsRight = mergeHeaderSide(rightParsed, base.headerItemsRight);

  const newClauses = [];
  let idx = headerIdx + 1;

  while (idx < kids.length) {
    const el = kids[idx];
    if (isPartyBlockTable(el)) break;

    if (el.tagName === 'P') {
      const stEl = el.querySelector('strong');
      if (!stEl) {
        idx++;
        continue;
      }
      const titleText = normText(stEl.textContent);
      const tableIdx = indexAfterEmptyParagraphs(kids, idx + 1);
      const next = kids[tableIdx];

      if (isTitleOnlyClauseP(el) && next && isOrderLinesTable(next)) {
        const { rows, totalFromTable } = parseOrderTableWithTotal(next);

        let tableTotalText = visual.tableTotalText;
        if (totalFromTable) {
          tableTotalText = totalFromTable;
        } else {
          const afterIdx = indexAfterEmptyParagraphs(kids, tableIdx + 1);
          const afterTable = kids[afterIdx];
          if (afterTable && afterTable.tagName === 'P' && afterTable.textContent.includes('总金额')) {
            const tx = normText(afterTable.textContent);
            const m = tx.match(/总金额[（(]大写[）)]*[：:]\s*(.+)$/);
            tableTotalText = m ? m[1].trim() : tx.replace(/^.*?[：:]\s*/, '').trim();
            idx = afterIdx + 1;
            visual.tableRows = normalizeParsedOrderRows(rows);
            visual.tableTotalText = tableTotalText;
            newClauses.push({ title: titleText, body: '', useTable: true });
            continue;
          }
        }

        visual.tableRows = normalizeParsedOrderRows(rows);
        visual.tableTotalText = tableTotalText;
        newClauses.push({ title: titleText, body: '', useTable: true });
        idx = tableIdx + 1;
        continue;
      }

      const fullText = normText(el.textContent);
      let bodyPart = '';
      if (fullText.startsWith(titleText)) {
        bodyPart = fullText.slice(titleText.length).trim().replace(/^[：:]\s*/, '');
      }
      newClauses.push({ title: titleText, body: bodyPart, useTable: false });
      idx++;
      continue;
    }

    if (isOrderLinesTable(el)) {
      /* 正文经手改后，条款标题行可能不成「仅 strong」结构，订单表会被误跳过；在此补一条明细条款 */
      if (!newClauses.some((c) => c.useTable)) {
        const { rows, totalFromTable } = parseOrderTableWithTotal(el);
        if (rows.length) {
          visual.tableRows = normalizeParsedOrderRows(rows);
          let advance = 1;
          if (totalFromTable) {
            visual.tableTotalText = totalFromTable;
          } else {
            const afterIdx = indexAfterEmptyParagraphs(kids, idx + 1);
            const afterTable = kids[afterIdx];
            if (afterTable && afterTable.tagName === 'P' && afterTable.textContent.includes('总金额')) {
              const tx = normText(afterTable.textContent);
              const m = tx.match(/总金额[（(]大写[）)]*[：:]\s*(.+)$/);
              visual.tableTotalText = m ? m[1].trim() : tx.replace(/^.*?[：:]\s*/, '').trim();
              advance = afterIdx - idx + 1;
            }
          }
          const last = newClauses.length ? newClauses[newClauses.length - 1] : null;
          if (last && !last.useTable && normText(last.title) === normText(DEFAULT_ORDER_CLAUSE_TITLE)) {
            newClauses[newClauses.length - 1] = { title: last.title, body: '', useTable: true };
          } else {
            newClauses.push({ title: DEFAULT_ORDER_CLAUSE_TITLE, body: '', useTable: true });
          }
          idx += advance;
          continue;
        }
      }
      idx++;
      continue;
    }

    idx++;
  }

  const hasTableData = (visual.tableRows || []).some((r) => r && r.some((c) => normText(c)));
  if (!newClauses.some((c) => c.useTable)) {
    if (!hasTableData) return null;
    newClauses.unshift({ title: DEFAULT_ORDER_CLAUSE_TITLE, body: '', useTable: true });
  }
  visual.clauses = newClauses;

  if (idx < kids.length && isPartyBlockTable(kids[idx])) {
    visual.showPartyBlock = true;
    const partyTable = kids[idx];
    const row = partyTable.querySelector('tr');
    const tds = row ? row.querySelectorAll(':scope > td') : [];
    if (tds.length >= 2) {
      const sellerItems = parsePartyTdToItems(tds[0], 'seller');
      const buyerItems = parsePartyTdToItems(tds[1], 'buyer');
      if (sellerItems.length) visual.partySellerItems = sellerItems;
      if (buyerItems.length) visual.partyBuyerItems = buyerItems;
    }
  } else {
    visual.showPartyBlock = false;
  }

  return ensurePartyItemsOnVisual(visual);
}
