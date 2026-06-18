/** 客户/产品型号 ↔ 内部型号：别名展开与归一化匹配 */

/** 展开并列型号：如 NL301F/301P => [NL301F, NL301P, 301P] */
export function expandModelAliases(rawModel) {
  const src = String(rawModel || '').trim();
  if (!src) return [];
  const parts = src
    .split(/[\/／]/)
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  if (parts.length <= 1) return [src];

  const out = new Set([src, ...parts]);
  const first = parts[0];
  const alphaPrefix = (first.match(/^[A-Za-z]+/) || [])[0] || '';
  const stemNoTailAlpha = first.replace(/[A-Za-z]+$/, '');

  for (let i = 1; i < parts.length; i += 1) {
    const p = parts[i];
    if (!p) continue;
    if (alphaPrefix && /^\d/.test(p)) out.add(`${alphaPrefix}${p}`);
    if (stemNoTailAlpha && /^[A-Za-z]+$/.test(p)) out.add(`${stemNoTailAlpha}${p}`);
    if (alphaPrefix && /[A-Za-z]/.test(p) && !new RegExp(`^${alphaPrefix}`, 'i').test(p)) {
      out.add(`${alphaPrefix}${p}`);
    }
  }

  return [...out].filter(Boolean);
}

export function normalizeModelKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000\-－—_/／\\()（）\[\]【】]/g, '');
}

export function normalizeBatchKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function buildModelLookupCandidates(...values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    for (const alias of expandModelAliases(v)) {
      const text = String(alias || '').trim();
      const key = normalizeModelKey(text);
      if (!text || !key || seen.has(key)) continue;
      seen.add(key);
      out.push({ text, key });
    }
  }
  return out;
}

function modelKeysMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

export function rowModelMatchesCandidates(rowModel, candidates) {
  const target = normalizeModelKey(rowModel);
  if (!target) return false;
  return candidates.some((c) => modelKeysMatch(c.key, target));
}

async function resolveFromInternalModelsMaster(pool, customerModel) {
  const target = normalizeModelKey(customerModel);
  if (!target) return '';
  const [imRows] = await pool.query(
    `SELECT internal_code, name
     FROM sales_internal_models
     WHERE is_active = 1
     ORDER BY id DESC`,
    []
  );
  for (const row of imRows || []) {
    const code = String(row?.internal_code || '').trim();
    if (code && normalizeModelKey(code) === target) return code;
    const aliases = expandModelAliases(row?.name);
    for (const alias of aliases) {
      if (normalizeModelKey(alias) === target) return code;
    }
  }
  return '';
}

async function resolveFromOrderCustomerMapping(pool, orderId, customerModel) {
  const oid = Number(orderId);
  const model = String(customerModel || '').trim();
  if (!Number.isFinite(oid) || oid <= 0 || !model) return '';
  const [rows] = await pool.query(
    `SELECT cm.customer_model, cm.internal_model
     FROM sales_orders o
     INNER JOIN sales_customer_model_mappings cm ON cm.customer_id = o.customer_id AND cm.is_hidden = 0
     WHERE o.id = ?
     ORDER BY cm.id DESC`,
    [oid]
  );
  const target = normalizeModelKey(model);
  for (const row of rows || []) {
    const internal = String(row?.internal_model || '').trim();
    if (!internal) continue;
    const aliases = expandModelAliases(row?.customer_model);
    for (const alias of aliases) {
      if (normalizeModelKey(alias) === target) return internal;
    }
  }
  return '';
}

async function resolveFromGlobalCustomerMapping(pool, customerModel) {
  const target = normalizeModelKey(customerModel);
  if (!target) return '';
  const [rows] = await pool.query(
    `SELECT customer_model, internal_model
     FROM sales_customer_model_mappings
     WHERE is_hidden = 0 AND TRIM(COALESCE(internal_model, '')) <> ''
     ORDER BY id DESC`,
    []
  );
  for (const row of rows || []) {
    const internal = String(row?.internal_model || '').trim();
    if (!internal) continue;
    const aliases = expandModelAliases(row?.customer_model);
    for (const alias of aliases) {
      if (normalizeModelKey(alias) === target) return internal;
    }
  }
  return '';
}

/**
 * 产品型号 → 内部编码（台账 product_model 多为内部编码，如 PR385）
 * 优先订单客户对照，其次内部型号主数据，最后全局客户型号对照
 */
export async function resolveInternalCodeByProductModel(pool, { orderId, customerModel }) {
  const model = String(customerModel || '').trim();
  if (!model) return '';

  const fromOrder = await resolveFromOrderCustomerMapping(pool, orderId, model);
  if (fromOrder) return fromOrder;

  const fromMaster = await resolveFromInternalModelsMaster(pool, model);
  if (fromMaster) return fromMaster;

  return resolveFromGlobalCustomerMapping(pool, model);
}

/** @deprecated 使用 resolveInternalCodeByProductModel */
export async function resolveMappedInternalCodeByOrder(pool, fromOrderId, rawProductName) {
  return resolveInternalCodeByProductModel(pool, {
    orderId: fromOrderId,
    customerModel: rawProductName
  });
}
