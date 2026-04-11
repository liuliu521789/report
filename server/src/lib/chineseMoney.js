/** 人民币金额中文大写（合同常见写法，整数以「元整」结尾） */

const CN_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];

function fourDigitToCn(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 0 || v > 9999) return '';
  if (v === 0) return '';
  const d0 = Math.floor(v / 1000);
  const d1 = Math.floor((v % 1000) / 100);
  const d2 = Math.floor((v % 100) / 10);
  const d3 = v % 10;
  const digits = [d0, d1, d2, d3];
  const units = ['仟', '佰', '拾', ''];
  let s = '';
  let zeroPending = false;
  for (let i = 0; i < 4; i++) {
    if (digits[i] === 0) {
      zeroPending = true;
      continue;
    }
    if (zeroPending && s) s += CN_DIGITS[0];
    zeroPending = false;
    s += CN_DIGITS[digits[i]] + units[i];
  }
  return s;
}

function integerPartToCn(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 0) return '';
  if (v === 0) return CN_DIGITS[0];
  const yi = Math.floor(v / 100000000);
  const wan = Math.floor((v % 100000000) / 10000);
  const ge = v % 10000;
  let s = '';
  if (yi > 0) {
    s += fourDigitToCn(yi) + '亿';
    if (wan > 0 && wan < 1000) s += CN_DIGITS[0];
  }
  if (wan > 0) {
    s += fourDigitToCn(wan) + '万';
    if (ge > 0 && ge < 1000) s += CN_DIGITS[0];
  }
  if (yi > 0 && wan === 0 && ge > 0) s += CN_DIGITS[0];
  if (ge > 0) s += fourDigitToCn(ge);
  return s || CN_DIGITS[0];
}

/**
 * @param {number|string} amount 金额（元），最多两位小数
 * @returns {string}
 */
export function amountToRmbUppercase(amount) {
  let n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return '';
  n = Math.round(n * 100) / 100;
  const intPart = Math.floor(n + 1e-9);
  const dec = Math.round((n - intPart) * 100);
  const intStr = integerPartToCn(intPart);
  if (dec === 0) return intStr + '元整';
  const jiao = Math.floor(dec / 10);
  const fen = dec % 10;
  let tail = '元';
  if (jiao === 0 && fen !== 0) tail += '零';
  if (jiao !== 0) tail += CN_DIGITS[jiao] + '角';
  if (fen !== 0) tail += CN_DIGITS[fen] + '分';
  else if (jiao !== 0) tail += '整';
  return intStr + tail;
}
