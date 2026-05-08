import { CONTRACT_ORDER_LINE_HEADERS } from './contractVisualDefaults';

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

/** 跳过空段落（模板生成/富文本常在条款标题与表格之间插入空 p），避免无法识别为可视化版式 */
function indexAfterEmptyParagraphs(kids, start) {
  let j = start;
  while (j < kids.length) {
    const n = kids[j];
    if (n.tagName === 'P' && normText(n.textContent) === '') {
      j++;
      continue;
    }
    break;
  }
  return j;
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
    return { ...d, label: p.label || d.label, value: p.value };
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
  if (ths.length !== CONTRACT_ORDER_LINE_HEADERS.length) return false;
  return CONTRACT_ORDER_LINE_HEADERS.every((h, i) => ths[i] === normHeaderCell(h));
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
  return colspan >= CONTRACT_ORDER_LINE_HEADERS.length;
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
  const colCount = CONTRACT_ORDER_LINE_HEADERS.length;
  const valid = (rows || []).filter((r) => r && r.length === colCount);
  if (valid.length) return valid;
  return [Array(colCount).fill('')];
}

const SELLER_FIELD = {
  单位: 'sellerUnit',
  地址: 'sellerAddress',
  联系人: 'sellerContact',
  电话: 'sellerPhone',
  传真: 'sellerFax',
  开户银行: 'sellerBank',
  账号: 'sellerAccount',
  行号: 'sellerBankNo'
};

const BUYER_FIELD = {
  单位: 'buyerUnit',
  地址: 'buyerAddress',
  联系人: 'buyerContact',
  电话: 'buyerPhone',
  传真: 'buyerFax',
  开户银行: 'buyerBank',
  账号: 'buyerAccount',
  税号: 'buyerTaxNo'
};

function applyPartyTd(td, keyMap, visual) {
  const divs = td.querySelectorAll(':scope > div');
  if (divs.length < 2) return;
  const html = divs[1].innerHTML;
  const parts = html.split(/<br\s*\/?>/i);
  for (const part of parts) {
    const cleaned = normText(part.replace(/<[^>]+>/g, ''));
    if (!cleaned) continue;
    const { label, value } = splitFirstColon(cleaned);
    const vk = keyMap[label];
    if (vk) visual[vk] = value;
  }
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
  const raw = String(html || '').trim();
  if (!raw || !base) return null;

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
        if (rows.some((r) => r.length !== CONTRACT_ORDER_LINE_HEADERS.length)) return null;

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
            visual.tableRows = normalizeOrderLineRows(rows);
            visual.tableTotalText = tableTotalText;
            newClauses.push({ title: titleText, body: '', useTable: true });
            continue;
          }
        }

        visual.tableRows = normalizeOrderLineRows(rows);
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
        if (!rows.some((r) => r.length !== CONTRACT_ORDER_LINE_HEADERS.length)) {
          visual.tableRows = normalizeOrderLineRows(rows);
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

  if (!newClauses.some((c) => c.useTable)) return null;
  visual.clauses = newClauses;

  if (idx < kids.length && isPartyBlockTable(kids[idx])) {
    visual.showPartyBlock = true;
    const partyTable = kids[idx];
    const row = partyTable.querySelector('tr');
    const tds = row ? row.querySelectorAll(':scope > td') : [];
    if (tds.length >= 2) {
      applyPartyTd(tds[0], SELLER_FIELD, visual);
      applyPartyTd(tds[1], BUYER_FIELD, visual);
    }
  } else {
    visual.showPartyBlock = false;
  }

  return visual;
}
