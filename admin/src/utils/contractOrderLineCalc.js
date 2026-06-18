/**

 * 合同编辑页订单明细表：按含税单价（元/吨）及多列反推联动（与生成合同/导出逻辑一致）。单价在订单列表以元/kg 展示，计算时自动 ×1000 换算为元/吨。

 */

import { tonsFromQtyAndSpec } from './salesOrderTonAmount.js';

import { amountToRmbUppercase } from './chineseMoney.js';



const DEFAULT_VAT_RATE = 0.13;

let _decimalPlaces = 2;
let _roundingMode = 'round';

export function setRoundingConfig(decimalPlaces = 2, roundingMode = 'round') {
  _decimalPlaces = decimalPlaces;
  _roundingMode = roundingMode;
}

function roundTo(n, decimals, mode) {
  if (!Number.isFinite(n)) return n;
  const p = Math.pow(10, decimals);
  switch (mode) {
    case 'ceil': return Math.ceil(n * p) / p;
    case 'floor': return Math.floor(n * p) / p;
    default: return Math.round(n * p) / p;
  }
}

const EDITOR_COL_COUNT = 10;



/** 与 CONTRACT_ORDER_LINE_HEADERS_EDITOR 列序一致 */

export const ORDER_LINE_COL = {

  PRODUCT_NAME: 0,

  MODEL: 1,

  GROSS_UNIT: 2,

  NET_UNIT: 3,

  TONS: 4,

  QTY: 5,

  NET_AMOUNT: 6,

  TAX_RATE: 7,

  TAX_AMOUNT: 8,

  TOTAL: 9

};



/** 修改后触发整行联动的列（含金额反推列） */

export const ORDER_LINE_TRIGGER_COLS = new Set([

  ORDER_LINE_COL.PRODUCT_NAME,

  ORDER_LINE_COL.MODEL,

  ORDER_LINE_COL.GROSS_UNIT,

  ORDER_LINE_COL.NET_UNIT,

  ORDER_LINE_COL.TONS,

  ORDER_LINE_COL.QTY,

  ORDER_LINE_COL.NET_AMOUNT,

  ORDER_LINE_COL.TAX_RATE,

  ORDER_LINE_COL.TAX_AMOUNT,

  ORDER_LINE_COL.TOTAL

]);



/** @deprecated 联动列已并入 TRIGGER_COLS */

export const ORDER_LINE_CALC_COLS = new Set([

  ORDER_LINE_COL.NET_UNIT,

  ORDER_LINE_COL.TONS,

  ORDER_LINE_COL.NET_AMOUNT,

  ORDER_LINE_COL.TAX_AMOUNT,

  ORDER_LINE_COL.TOTAL

]);



function parseNum(raw) {

  if (raw == null || raw === '') return NaN;

  const n = Number(String(raw).replace(/,/g, '').replace(/%/g, '').trim());

  return Number.isFinite(n) ? n : NaN;

}



function fmtMoney2(n) {

  if (!Number.isFinite(n)) return '';

  return roundTo(n, _decimalPlaces, _roundingMode).toFixed(_decimalPlaces);

}



function fmtInt(v) {

  if (v == null || v === '') return '';

  const n = Number(v);

  return Number.isFinite(n) ? String(Math.round(n)) : String(v).trim();

}



function normalizeRow(row) {

  return Array.from({ length: EDITOR_COL_COUNT }, (_, i) =>

    row && row[i] != null ? String(row[i]) : ''

  );

}



export function formatTaxRateCell(rate) {

  if (!Number.isFinite(rate) || rate < 0) return '';

  const pct = Math.round(rate * 10000) / 100;

  return `${pct}%`;

}



export function resolveVatRateFractionFromCell(cell, fallback = DEFAULT_VAT_RATE) {

  const raw = cell;

  if (raw == null || raw === '') return fallback;

  const s = String(raw).replace(/%/g, '').trim();

  const n = Number(s);

  if (!Number.isFinite(n) || n < 0) return fallback;

  if (n > 1 && n <= 100) return n / 100;

  return n;

}



export function resolveVatRateFromOrder(order) {

  const d = order?.display_data || {};

  const raw = order?.tax_rate ?? order?.vat_rate ?? d?.tax_rate ?? d?.vat_rate;

  return resolveVatRateFractionFromCell(raw, DEFAULT_VAT_RATE);

}



function resolveSpecTextForCalc(row, orderSpecText) {

  const fromOrder = String(orderSpecText ?? '').trim();

  if (fromOrder) return fromOrder;

  const model = String(row[ORDER_LINE_COL.MODEL] ?? '').trim();

  if (/千克|公斤|kg/i.test(model)) return model;

  const pn = String(row[ORDER_LINE_COL.PRODUCT_NAME] ?? '').trim();

  if (/千克|公斤|kg|\d/.test(pn) && pn.length > 0) return pn;

  return '';

}



/** 优先数量×规格算吨；否则沿用表中「单位（吨）」 */

function resolveTonsForRow(row, orderSpecText) {

  const specText = resolveSpecTextForCalc(row, orderSpecText);

  const qtyRaw = row[ORDER_LINE_COL.QTY];

  const fromQtySpec = tonsFromQtyAndSpec(qtyRaw, specText);

  if (fromQtySpec != null && fromQtySpec > 0) {

    return { tons: fromQtySpec, fromQtySpec: true };

  }

  const fromCell = parseNum(row[ORDER_LINE_COL.TONS]);

  if (Number.isFinite(fromCell) && fromCell > 0) {

    return { tons: fromCell, fromQtySpec: false };

  }

  return { tons: null, fromQtySpec: false };

}



function resolveTonsForRecalc(row, orderSpecText, editedCol) {

  if (editedCol === ORDER_LINE_COL.TONS) {

    const t = parseNum(row[ORDER_LINE_COL.TONS]);

    if (t > 0) return { tons: t, fromQtySpec: false, lockTons: true };

  }

  const base = resolveTonsForRow(row, orderSpecText);

  return { ...base, lockTons: false };

}



/** 含税单价 + 吨数 + 税率 → 其余金额列 */

function applyForwardFromGrossAndTons(r, gross, tons, rate, { lockTons = false } = {}) {

  if (!Number.isFinite(gross) || gross <= 0) return r;

  const netUnit = gross / (1 + rate);

  r[ORDER_LINE_COL.NET_UNIT] = fmtMoney2(netUnit);

  if (Number.isFinite(tons) && tons > 0) {

    if (!lockTons) {

      r[ORDER_LINE_COL.TONS] = tons.toFixed(2);

    }

    const totalWithTax = gross * tons;

    const netAmount = netUnit * tons;

    const taxAmount = totalWithTax - netAmount;

    r[ORDER_LINE_COL.NET_AMOUNT] = fmtMoney2(netAmount);

    r[ORDER_LINE_COL.TAX_AMOUNT] = fmtMoney2(taxAmount);

    r[ORDER_LINE_COL.TOTAL] = fmtMoney2(totalWithTax);

  }

  return r;

}



/**

 * 按用户编辑的列联动重算整行（保留正在编辑单元格的原文，避免输入中被覆盖）。

 * @param {string[]} row

 * @param {{ orderSpecText?: string, editedCol?: number|null }} [options]

 */

export function recalcEditorOrderLineRow(row, options = {}) {

  const { orderSpecText, editedCol = null } = options;

  const r = normalizeRow(row);

  const preserveCol = editedCol;

  const preserveVal = preserveCol != null ? r[preserveCol] : null;



  let rate = resolveVatRateFractionFromCell(r[ORDER_LINE_COL.TAX_RATE]);

  if (!r[ORDER_LINE_COL.TAX_RATE]) {

    r[ORDER_LINE_COL.TAX_RATE] = formatTaxRateCell(rate);

  } else if (editedCol === ORDER_LINE_COL.TAX_RATE) {

    rate = resolveVatRateFractionFromCell(preserveVal, rate);

    r[ORDER_LINE_COL.TAX_RATE] = formatTaxRateCell(rate);

  }



  let { tons, fromQtySpec, lockTons } = resolveTonsForRecalc(r, orderSpecText, editedCol);



  const setTonsFromQtySpec = () => {

    if (fromQtySpec && tons != null && tons > 0 && !lockTons) {

      r[ORDER_LINE_COL.TONS] = tons.toFixed(2);

    }

  };



  const finish = () => {

    if (preserveCol != null && preserveVal != null) r[preserveCol] = preserveVal;

    return r;

  };



  const grossFromCell = () => parseNum(r[ORDER_LINE_COL.GROSS_UNIT]);



  switch (editedCol) {

    case ORDER_LINE_COL.NET_UNIT: {

      const net = parseNum(r[ORDER_LINE_COL.NET_UNIT]);

      if (net > 0) {

        const gross = net * (1 + rate);

        r[ORDER_LINE_COL.GROSS_UNIT] = fmtMoney2(gross);

        applyForwardFromGrossAndTons(r, gross, tons, rate, { lockTons });

      }

      return finish();

    }

    case ORDER_LINE_COL.TONS: {

      tons = parseNum(r[ORDER_LINE_COL.TONS]);

      lockTons = true;

      const gross = grossFromCell();

      if (gross > 0 && tons > 0) {

        applyForwardFromGrossAndTons(r, gross, tons, rate, { lockTons: true });

      }

      return finish();

    }

    case ORDER_LINE_COL.TOTAL: {

      const total = parseNum(r[ORDER_LINE_COL.TOTAL]);

      if (total > 0 && tons > 0) {

        const gross = total / tons;

        r[ORDER_LINE_COL.GROSS_UNIT] = fmtMoney2(gross);

        applyForwardFromGrossAndTons(r, gross, tons, rate, { lockTons });

      } else {

        const gross = grossFromCell();

        if (gross > 0) applyForwardFromGrossAndTons(r, gross, tons, rate, { lockTons });

      }

      return finish();

    }

    case ORDER_LINE_COL.NET_AMOUNT: {

      const netAmt = parseNum(r[ORDER_LINE_COL.NET_AMOUNT]);

      if (netAmt > 0 && tons > 0) {

        const netU = netAmt / tons;

        const gross = netU * (1 + rate);

        r[ORDER_LINE_COL.NET_UNIT] = fmtMoney2(netU);

        r[ORDER_LINE_COL.GROSS_UNIT] = fmtMoney2(gross);

        applyForwardFromGrossAndTons(r, gross, tons, rate, { lockTons });

      }

      return finish();

    }

    case ORDER_LINE_COL.TAX_AMOUNT: {

      const tax = parseNum(r[ORDER_LINE_COL.TAX_AMOUNT]);

      let total = parseNum(r[ORDER_LINE_COL.TOTAL]);

      if (tons > 0) {

        if (total > 0 && Number.isFinite(tax) && tax >= 0) {

          const netAmt = total - tax;

          if (netAmt >= 0) {

            const netU = netAmt / tons;

            const gross = netU * (1 + rate);

            r[ORDER_LINE_COL.NET_AMOUNT] = fmtMoney2(netAmt);

            r[ORDER_LINE_COL.NET_UNIT] = fmtMoney2(netU);

            r[ORDER_LINE_COL.GROSS_UNIT] = fmtMoney2(gross);

          }

        } else if (Number.isFinite(tax) && tax >= 0) {

          const gross = grossFromCell();

          if (gross > 0) {

            total = gross * tons;

            const netAmt = total - tax;

            const netU = netAmt / tons;

            r[ORDER_LINE_COL.TOTAL] = fmtMoney2(total);

            r[ORDER_LINE_COL.NET_AMOUNT] = fmtMoney2(netAmt);

            r[ORDER_LINE_COL.NET_UNIT] = fmtMoney2(netU);

            r[ORDER_LINE_COL.TAX_AMOUNT] = fmtMoney2(tax);

          }

        }

      }

      return finish();

    }

    case ORDER_LINE_COL.TAX_RATE:

    case ORDER_LINE_COL.GROSS_UNIT:

    case ORDER_LINE_COL.QTY:

    case ORDER_LINE_COL.MODEL:

    case ORDER_LINE_COL.PRODUCT_NAME: {

      if (

        editedCol === ORDER_LINE_COL.QTY ||

        editedCol === ORDER_LINE_COL.MODEL ||

        editedCol === ORDER_LINE_COL.PRODUCT_NAME

      ) {

        const refreshed = resolveTonsForRecalc(r, orderSpecText, null);

        tons = refreshed.tons;

        fromQtySpec = refreshed.fromQtySpec;

        lockTons = false;

        setTonsFromQtySpec();

      }

      const gross = grossFromCell();

      if (gross > 0) applyForwardFromGrossAndTons(r, gross, tons, rate, { lockTons });

      return finish();

    }

    default: {

      setTonsFromQtySpec();

      const gross = grossFromCell();

      if (gross > 0) applyForwardFromGrossAndTons(r, gross, tons, rate, { lockTons });

      return finish();

    }

  }

}



/** @deprecated 使用 recalcEditorOrderLineRow */

export function calcEditorOrderLineRow(row, options = {}) {

  return recalcEditorOrderLineRow(row, {

    ...options,

    editedCol: options.editedCol ?? ORDER_LINE_COL.GROSS_UNIT

  });

}



export function patchEditorOrderLineCalcColumns(row, options = {}) {

  return recalcEditorOrderLineRow(row, options);

}



/** 表格内总金额（大写） */

export function buildTableTotalTextFromEditorRows(rows, totalTargetColIndex = ORDER_LINE_COL.TOTAL) {

  let sum = 0;

  for (const row of rows || []) {

    const t = parseNum(row?.[totalTargetColIndex]);

    if (Number.isFinite(t)) sum += t;

  }

  sum = roundTo(sum, _decimalPlaces, _roundingMode);

  if (sum <= 0) return '';

  const cn = amountToRmbUppercase(sum);

  return `${cn}（￥${sum.toFixed(_decimalPlaces)}）`;

}



export function editorRowFromPreparedOrder(order, modelProductMap = {}) {

  const d = order?.display_data || {};
  const model = String(order?.product_model ?? d?.product_model ?? '').trim().toUpperCase();

  const row = Array(EDITOR_COL_COUNT).fill('');

  row[ORDER_LINE_COL.PRODUCT_NAME] = modelProductMap[model] || '';

  row[ORDER_LINE_COL.MODEL] = model;

  const up = order?.unit_price ?? d?.unit_price;

  if (up != null && up !== '') row[ORDER_LINE_COL.GROSS_UNIT] = fmtMoney2(Number(up));

  row[ORDER_LINE_COL.QTY] = fmtInt(order?.quantity ?? d?.quantity);

  row[ORDER_LINE_COL.TAX_RATE] = formatTaxRateCell(resolveVatRateFromOrder(order));

  const orderSpecText = String(order?.product_name ?? d?.product_name ?? '').trim();

  return {

    row: recalcEditorOrderLineRow(row, { orderSpecText, editedCol: ORDER_LINE_COL.GROSS_UNIT }),

    orderSpecText

  };

}



export function grossUnitFromNetAndTaxRate(netUnitRaw, taxRateRaw) {

  const net = parseNum(netUnitRaw);

  if (!Number.isFinite(net) || net <= 0) return '';

  const rate = resolveVatRateFractionFromCell(taxRateRaw);

  return fmtMoney2(net * (1 + rate));

}



export function enrichVisualOrderLinesFromContractOrders(visual, orders = [], totalTargetColIndex = ORDER_LINE_COL.TOTAL, modelProductMap = {}) {

  if (!visual || !orders?.length) return false;

  const rows = visual.tableRows || [];

  const specs = Array.isArray(visual.tableRowSpecs) ? [...visual.tableRowSpecs] : [];

  const { rows: fromOrders, orderSpecs } = editorRowsFromContractOrders(orders, modelProductMap);

  if (!fromOrders.length) return false;

  const anyGross = rows.some((r) => parseNum(r?.[ORDER_LINE_COL.GROSS_UNIT]) > 0);

  if (!anyGross) {

    visual.tableRows = fromOrders;

    visual.tableRowSpecs = orderSpecs;

    visual.tableTotalText = buildTableTotalTextFromEditorRows(fromOrders, totalTargetColIndex);

    return true;

  }

  let changed = false;

  const nextRows = rows.map((row, i) => {

    const hasGross = parseNum(row?.[ORDER_LINE_COL.GROSS_UNIT]) > 0;

    if (hasGross) return row;

    const src = fromOrders[i] ?? fromOrders[0];

    if (!src || parseNum(src[ORDER_LINE_COL.GROSS_UNIT]) <= 0) return row;

    changed = true;

    if (!String(specs[i] ?? '').trim() && orderSpecs[i]) specs[i] = orderSpecs[i];

    return recalcEditorOrderLineRow(

      [

        row[ORDER_LINE_COL.PRODUCT_NAME] || src[ORDER_LINE_COL.PRODUCT_NAME],

        row[ORDER_LINE_COL.MODEL] || src[ORDER_LINE_COL.MODEL],

        src[ORDER_LINE_COL.GROSS_UNIT],

        row[ORDER_LINE_COL.NET_UNIT] || src[ORDER_LINE_COL.NET_UNIT],

        row[ORDER_LINE_COL.TONS] || src[ORDER_LINE_COL.TONS],

        row[ORDER_LINE_COL.QTY] || src[ORDER_LINE_COL.QTY],

        row[ORDER_LINE_COL.NET_AMOUNT] || src[ORDER_LINE_COL.NET_AMOUNT],

        row[ORDER_LINE_COL.TAX_RATE] || src[ORDER_LINE_COL.TAX_RATE],

        row[ORDER_LINE_COL.TAX_AMOUNT] || src[ORDER_LINE_COL.TAX_AMOUNT],

        row[ORDER_LINE_COL.TOTAL] || src[ORDER_LINE_COL.TOTAL]

      ],

      { orderSpecText: specs[i] || orderSpecs[i], editedCol: ORDER_LINE_COL.GROSS_UNIT }

    );

  });

  if (!changed) return false;

  visual.tableRows = nextRows;

  visual.tableRowSpecs = specs;

    visual.tableTotalText = buildTableTotalTextFromEditorRows(nextRows, totalTargetColIndex);

    return true;

}



export function editorRowsFromContractOrders(orders = [], modelProductMap = {}) {

  const rows = [];

  const orderSpecs = [];

  for (const o of orders || []) {

    const { row, orderSpecText } = editorRowFromPreparedOrder(o, modelProductMap);

    const hasUnit = parseNum(row[ORDER_LINE_COL.GROSS_UNIT]) > 0;

    const hasQty = String(row[ORDER_LINE_COL.QTY] ?? '').trim() !== '';

    if (!hasUnit && !hasQty) continue;

    rows.push(row);

    orderSpecs.push(orderSpecText);

  }

  return { rows, orderSpecs };

}



export function isOrderLineCalcColumn(colIndex) {

  return ORDER_LINE_CALC_COLS.has(colIndex);

}



export function isOrderLineTriggerColumn(colIndex) {

  return ORDER_LINE_TRIGGER_COLS.has(colIndex);

}

/**
 * 轻量公式执行器（POC）
 * 支持以 `=` 开头的表达式，允许使用列常量：GROSS_UNIT, NET_UNIT, TONS, QTY, NET_AMOUNT, TAX_RATE, TAX_AMOUNT, TOTAL
 * 例如: "=ROUND((GROSS_UNIT/(1+TAX_RATE))*TONS,2)" 或 "=IF(QTY>100, GROSS_UNIT*0.95, GROSS_UNIT)"
 */
export function evaluateFormulaOnRow(formula, row) {
  if (!formula || typeof formula !== 'string') return '';
  let expr = formula.trim();
  if (expr.startsWith('=')) expr = expr.slice(1);

  // 简单替换百分号数值（如 13% -> 0.13）在 row 中读取时处理
  const colGet = (key) => {
    switch ((key || '').toString().toUpperCase()) {
      case 'GROSS_UNIT': return parseNum(row[ORDER_LINE_COL.GROSS_UNIT]) || 0;
      case 'NET_UNIT': return parseNum(row[ORDER_LINE_COL.NET_UNIT]) || 0;
      case 'TONS': return parseNum(row[ORDER_LINE_COL.TONS]) || 0;
      case 'QTY': return parseNum(row[ORDER_LINE_COL.QTY]) || 0;
      case 'NET_AMOUNT': return parseNum(row[ORDER_LINE_COL.NET_AMOUNT]) || 0;
      case 'TAX_RATE': {
        const v = resolveVatRateFractionFromCell(row[ORDER_LINE_COL.TAX_RATE]);
        return Number.isFinite(v) ? v : DEFAULT_VAT_RATE;
      }
      case 'TAX_AMOUNT': return parseNum(row[ORDER_LINE_COL.TAX_AMOUNT]) || 0;
      case 'TOTAL': return parseNum(row[ORDER_LINE_COL.TOTAL]) || 0;
      default: return undefined;
    }
  };

  // 将标识符替换为变量访问，例如 GROSS_UNIT -> __v.GROSS_UNIT
  // 只允许字母、数字、下划线及括号、逗号、点号和运算符
  // 为了简单实现，我们构建一个安全的执行函数，将列值作为参数传入
  try {
    const vars = {
      GROSS_UNIT: colGet('GROSS_UNIT'),
      NET_UNIT: colGet('NET_UNIT'),
      TONS: colGet('TONS'),
      QTY: colGet('QTY'),
      NET_AMOUNT: colGet('NET_AMOUNT'),
      TAX_RATE: colGet('TAX_RATE'),
      TAX_AMOUNT: colGet('TAX_AMOUNT'),
      TOTAL: colGet('TOTAL')
    };

    // 提供常用 Math 函数和 IF、ROUND 的简单实现
    const IF = (cond, a, b) => (cond ? a : b);
    const ROUND = (v, d) => {
      if (d === undefined || d === null) d = _decimalPlaces;
      const p = Math.pow(10, d);
      return roundTo(v, d, 'round');
    };

    // 允许表达式中使用 Math, IF, ROUND 和变量名
    const fnArgs = ['Math', 'IF', 'ROUND', ...Object.keys(vars)];
    const fnVals = [Math, IF, ROUND, ...Object.values(vars)];

    // 禁止分号，尽量降低注入风险
    if (/[;\n]/.test(expr)) return '';

    const func = new Function(...fnArgs, `return (${expr});`);
    const res = func(...fnVals);
    if (res == null || Number.isNaN(Number(res))) return '';
    if (typeof res === 'number') {
      return roundTo(res, _decimalPlaces, _roundingMode).toFixed(_decimalPlaces);
    }
    return String(res);
  } catch (e) {
    // 任何错误返回空字符串
    return '';
  }

}


