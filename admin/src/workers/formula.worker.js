import { Parser } from 'hot-formula-parser';

const parser = new Parser();
let currentVars = {};

function parseNum(raw) {
  if (raw == null || raw === '') return NaN;
  const n = Number(String(raw).replace(/,/g, '').replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

function resolveVatRateFractionFromCell(cell, fallback = 0.13) {
  const raw = cell;
  if (raw == null || raw === '') return fallback;
  const s = String(raw).replace(/%/g, '').trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

function columnLabelToIndex(label) {
  if (!label || typeof label !== 'string') return -1;
  let index = 0;
  const upper = label.toUpperCase();
  for (const char of upper) {
    if (char < 'A' || char > 'Z') return -1;
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function rowToVars(row) {
  const values = Array.isArray(row) ? row : [];
  const vars = {
    GROSS_UNIT: parseNum(values[2]) || 0,
    NET_UNIT: parseNum(values[3]) || 0,
    TONS: parseNum(values[4]) || 0,
    QTY: parseNum(values[5]) || 0,
    NET_AMOUNT: parseNum(values[6]) || 0,
    TAX_RATE: resolveVatRateFractionFromCell(values[7]),
    TAX_AMOUNT: parseNum(values[8]) || 0,
    TOTAL: parseNum(values[9]) || 0
  };

  for (let i = 0; i < values.length; i += 1) {
    const label = String.fromCharCode('A'.charCodeAt(0) + i);
    if (i === 7) {
      vars[label] = resolveVatRateFractionFromCell(values[i]);
    } else {
      vars[label] = parseNum(values[i]) || 0;
    }
  }
  return vars;
}

parser.on('callVariable', (name, done) => {
  const key = String(name || '').toUpperCase();
  done(Object.prototype.hasOwnProperty.call(currentVars, key) ? currentVars[key] : 0);
});

parser.on('callCellValue', (cellCoord, done) => {
  done(0);
});

parser.on('callRangeValue', (startCellCoord, endCellCoord, done) => {
  done([]);
});

function evaluateExpression(formula, row, decimalPlaces = 2, roundingMode = 'round') {
  if (!formula || typeof formula !== 'string') return '';
  let expr = formula.trim();
  if (expr.startsWith('=')) expr = expr.slice(1);

  currentVars = rowToVars(row);

  const parsed = parser.parse(expr);
  if (parsed.error) {
    return '';
  }
  const result = parsed.result;
  if (result == null || Number.isNaN(Number(result))) return '';
  if (typeof result === 'number') {
    const p = Math.pow(10, decimalPlaces);
    let rounded;
    switch (roundingMode) {
      case 'ceil': rounded = Math.ceil(result * p) / p; break;
      case 'floor': rounded = Math.floor(result * p) / p; break;
      default: rounded = Math.round(result * p) / p;
    }
    return rounded.toFixed(decimalPlaces);
  }
  return String(result);
}

self.onmessage = (event) => {
  const { id, formula, row, decimalPlaces, roundingMode } = event.data || {};
  try {
    const result = evaluateExpression(formula, row, decimalPlaces, roundingMode);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, result: '', error: String(error) });
  }
};
