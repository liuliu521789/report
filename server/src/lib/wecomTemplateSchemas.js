/** 系统模板变量约束（自定义模板 code 不在此表则不做强制校验） */

export const WECOM_TEMPLATE_VARIABLE_SCHEMAS = {
  sales_order_submit_finance: {
    allowed: ['detail', 'orderNo', 'count', 'fromUser', 'financeReviewUrl'],
    /** 正文可仅用 {{count}} 等简短提示；系统仍会传入 {{detail}}（订单摘要），按需写入模板即可 */
    requiredInBody: []
  },
  sales_order_withdraw_finance: {
    allowed: ['detail', 'orderNo', 'count', 'fromUser', 'financeReviewUrl'],
    requiredInBody: []
  },
  sales_order_approved_warehouse: {
    allowed: ['detail', 'orderNo', 'count', 'fromUser', 'shipConfirmUrl', 'shipUrl'],
    requiredInBody: ['detail'],
    requiredInUrl: ['shipConfirmUrl']
  },
  sales_order_rejected_sales: {
    allowed: ['detail', 'orderNo', 'count', 'fromUser'],
    requiredInBody: []
  },
  sales_contract_submit_reviewer: {
    allowed: ['detail', 'contractNo', 'customerName', 'fromUser', 'notificationTitle', 'reviewUrl'],
    requiredInBody: ['detail']
  },
  sales_contract_review_result: {
    allowed: [
      'detail',
      'contractNo',
      'customerName',
      'fromUser',
      'statusLabel',
      'contractReviewStatus',
      'reviewComment'
    ],
    /** 与系统种子模板正文一致（正文可另含 {{detail}}，非强制） */
    requiredInBody: ['customerName', 'contractReviewStatus', 'reviewComment']
  }
};

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractTemplateVariableNames(text) {
  const s = text == null ? '' : String(text);
  const out = new Set();
  let m;
  const re = new RegExp(VAR_RE.source, 'g');
  while ((m = re.exec(s)) !== null) {
    out.add(m[1]);
  }
  return [...out];
}

/**
 * @param {string} code
 * @param {{ msgType: string, bodyTemplate: string, urlTemplate?: string|null }} tpl
 * @returns {{ ok: true } | { ok: false, error: string, message: string }}
 */
export function validateSystemWecomTemplate(code, tpl) {
  const schema = WECOM_TEMPLATE_VARIABLE_SCHEMAS[code];
  if (!schema) return { ok: true };

  const body = tpl.bodyTemplate != null ? String(tpl.bodyTemplate) : '';
  const url = tpl.urlTemplate != null ? String(tpl.urlTemplate) : '';
  const msgType = String(tpl.msgType || '').toLowerCase();

  const bodyVars = extractTemplateVariableNames(body);
  const urlVars = extractTemplateVariableNames(url);
  const allowed = new Set(schema.allowed || []);

  for (const v of bodyVars) {
    if (!allowed.has(v)) {
      return {
        ok: false,
        error: 'WECOM_TEMPLATE_UNKNOWN_VARIABLE',
        message: `系统模板 ${code} 的正文含未允许变量 {{${v}}}，允许：${[...allowed].join('、')}`
      };
    }
  }
  for (const v of urlVars) {
    if (!allowed.has(v)) {
      return {
        ok: false,
        error: 'WECOM_TEMPLATE_UNKNOWN_VARIABLE',
        message: `系统模板 ${code} 的链接模板含未允许变量 {{${v}}}`
      };
    }
  }

  for (const req of schema.requiredInBody || []) {
    const reReq = new RegExp(`\\{\\{\\s*${req}\\s*\\}\\}`);
    if (!reReq.test(body)) {
      return {
        ok: false,
        error: 'WECOM_TEMPLATE_MISSING_VARIABLE',
        message: `系统模板 ${code} 正文须包含占位符 {{${req}}}`
      };
    }
  }

  if (msgType === 'textcard') {
    for (const req of schema.requiredInUrl || []) {
      const reReq = new RegExp(`\\{\\{\\s*${req}\\s*\\}\\}`);
      if (!reReq.test(url)) {
        return {
          ok: false,
          error: 'WECOM_TEMPLATE_MISSING_URL_VARIABLE',
          message: `系统模板 ${code} 为文本卡片时，链接地址须包含 {{${req}}}`
        };
      }
    }
  }

  return { ok: true };
}
