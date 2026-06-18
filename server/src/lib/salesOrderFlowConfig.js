/**
 * 销售订单审核流程：表单配置定义 + 运行时解析（节点顺序、审核人、状态映射）
 */

import { notifyUser, notifyUsersByCategory } from './salesInternalInbox.js';

export const FLOW_NODE_TYPES = {
  finance_review: {
    status: 'pending_review',
    requiresSubmitted: true,
    permKey: 'order_status_finance',
    reviewKind: 'finance'
  },
  qc_review: {
    status: 'pending_qc',
    requiresSubmitted: false,
    permKey: 'order_status_qc',
    reviewKind: 'qc'
  }
};

/** 流程节点可选的员工类别（审核人按类别时） */
export const FLOW_ASSIGNEE_CATEGORIES = ['finance', 'qc', 'warehouse', 'sales', 'documentary'];

const CATEGORY_LABELS = {
  finance: '财务',
  qc: '品管',
  warehouse: '仓库',
  sales: '销售',
  documentary: '跟单'
};

export function defaultOrderFlowDefinition() {
  return {
    version: 1,
    steps: [
      {
        id: 'finance',
        node_type: 'finance_review',
        label: '财务审核',
        assignee_type: 'category',
        assignee_category: 'finance',
        assignee_user_ids: []
      },
      {
        id: 'qc',
        node_type: 'qc_review',
        label: '品管审核',
        assignee_type: 'category',
        assignee_category: 'qc',
        assignee_user_ids: []
      }
    ]
  };
}

function parseJsonMaybe(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

function uniquePositiveIds(ids) {
  const out = [];
  const seen = new Set();
  for (const raw of ids || []) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function categoryLabelZh(code) {
  return CATEGORY_LABELS[String(code || '').trim()] || String(code || '');
}

export function nodeTypeLabelZh(nodeType) {
  if (nodeType === 'finance_review') return '财务审核';
  if (nodeType === 'qc_review') return '品管审核';
  return String(nodeType || '');
}

/** @param {unknown} raw */
export function normalizeFlowDefinition(raw) {
  const base = defaultOrderFlowDefinition();
  const src = parseJsonMaybe(raw);
  if (!src || typeof src !== 'object') return { ...base, steps: base.steps.map((s) => ({ ...s })) };

  const steps = Array.isArray(src.steps) ? src.steps : base.steps;
  const normalizedSteps = steps
    .map((step, idx) => normalizeFlowStep(step, idx))
    .filter(Boolean);

  return {
    version: Math.max(1, Number(src.version) || 1),
    steps: normalizedSteps.length ? normalizedSteps : []
  };
}

/** 根据订单状态推断当前应处于的审核节点类型 */
export function inferExpectedNodeTypeFromOrder(order) {
  const status = String(order?.status || '').trim();
  if (status === 'pending_qc') return 'qc_review';
  if (status === 'pending_review' && order?.submitted_for_review_at) return 'finance_review';
  return null;
}

/** 当前节点在流程定义中的下一节点（以最新配置为准） */
export function getNextStepAfter(definition, currentStep) {
  const def = normalizeFlowDefinition(definition);
  if (!currentStep || !def.steps.length) return null;
  const idx = def.steps.findIndex(
    (s) => s.node_type === currentStep.node_type || (currentStep.id && s.id === currentStep.id)
  );
  if (idx < 0) return null;
  return def.steps[idx + 1] || null;
}

/** 最新流程配置中是否包含品管审核节点 */
export function flowDefinitionHasQcStep(definition) {
  return normalizeFlowDefinition(definition).steps.some((s) => s.node_type === 'qc_review');
}

function normalizeFlowStep(step, idx) {
  if (!step || typeof step !== 'object') return null;
  const nodeType = String(step.node_type || '').trim();
  if (!FLOW_NODE_TYPES[nodeType]) return null;

  const assigneeType = step.assignee_type === 'users' ? 'users' : 'category';
  let assigneeCategory = String(step.assignee_category || '').trim();
  const assigneeUserIds = uniquePositiveIds(
    Array.isArray(step.assignee_user_ids) ? step.assignee_user_ids : []
  );

  if (assigneeType === 'category') {
    if (!FLOW_ASSIGNEE_CATEGORIES.includes(assigneeCategory)) {
      assigneeCategory = nodeType === 'qc_review' ? 'qc' : 'finance';
    }
  } else if (!assigneeUserIds.length) {
    return null;
  }

  const defaultLabel = nodeTypeLabelZh(nodeType);
  const label = String(step.label || defaultLabel).trim() || defaultLabel;
  const id = String(step.id || `${nodeType}_${idx + 1}`).trim() || `${nodeType}_${idx + 1}`;

  return {
    id,
    node_type: nodeType,
    label,
    assignee_type: assigneeType,
    assignee_category: assigneeType === 'category' ? assigneeCategory : '',
    assignee_user_ids: assigneeType === 'users' ? assigneeUserIds : []
  };
}

/** @returns {{ ok: true, definition: ReturnType<typeof normalizeFlowDefinition> } | { ok: false, errors: string[] }} */
export function validateFlowDefinition(raw) {
  const src = parseJsonMaybe(raw);
  const rawSteps = Array.isArray(src?.steps) ? src.steps : null;
  if (!rawSteps || !rawSteps.length) {
    return { ok: false, errors: ['至少配置一个审核节点'] };
  }

  const definition = normalizeFlowDefinition(raw);
  const errors = [];
  if (definition.steps.length > 8) errors.push('审核节点最多 8 个');

  const seenTypes = new Set();
  for (const step of definition.steps) {
    if (seenTypes.has(step.node_type)) {
      errors.push(`节点类型「${nodeTypeLabelZh(step.node_type)}」重复，每种类型仅可配置一次`);
    }
    seenTypes.add(step.node_type);
    if (step.assignee_type === 'users' && !step.assignee_user_ids.length) {
      errors.push(`节点「${step.label}」须指定至少一名审核人`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, definition };
}

export function statusForStep(step) {
  const meta = FLOW_NODE_TYPES[step?.node_type];
  return meta?.status || 'pending_review';
}

export function stepRequiresSubmitted(step) {
  const meta = FLOW_NODE_TYPES[step?.node_type];
  return !!meta?.requiresSubmitted;
}

export function reviewKindForStep(step) {
  const meta = FLOW_NODE_TYPES[step?.node_type];
  return meta?.reviewKind || null;
}

export function permKeyForStep(step) {
  const meta = FLOW_NODE_TYPES[step?.node_type];
  return meta?.permKey || null;
}

/** 订单是否处于某审核节点的可审状态 */
export function orderMatchesReviewStep(order, step) {
  if (!order || !step) return false;
  const status = String(order.status || '').trim();
  const target = statusForStep(step);
  if (status !== target) return false;
  if (stepRequiresSubmitted(step)) {
    return !!order.submitted_for_review_at;
  }
  return true;
}

/**
 * 解析订单当前审核节点（优先按订单状态匹配，避免 flow_step_index 与最新流程配置不一致）
 * @returns {{ index: number, step: object, definition: object, orphanedQc?: boolean } | null}
 */
export function resolveCurrentReviewStep(order, definition) {
  const def = normalizeFlowDefinition(definition);
  if (!def.steps.length) return null;

  const expectedType = inferExpectedNodeTypeFromOrder(order);
  if (expectedType) {
    const index = def.steps.findIndex((s) => s.node_type === expectedType);
    if (index >= 0) {
      const step = def.steps[index];
      if (orderMatchesReviewStep(order, step)) {
        return { index, step, definition: def };
      }
    } else if (expectedType === 'qc_review' && String(order?.status || '') === 'pending_qc') {
      return { index: -1, step: null, definition: def, orphanedQc: true };
    }
  }

  const idxRaw = order?.flow_step_index;
  if (idxRaw != null && Number.isFinite(Number(idxRaw))) {
    const index = Number(idxRaw);
    const step = def.steps[index];
    if (step && orderMatchesReviewStep(order, step)) {
      return { index, step, definition: def };
    }
  }

  for (let i = 0; i < def.steps.length; i += 1) {
    const step = def.steps[i];
    if (orderMatchesReviewStep(order, step)) {
      return { index: i, step, definition: def };
    }
  }

  return null;
}

export function resolveRejectStepKind(order) {
  if (String(order?.status || '') !== 'rejected') return null;
  if (order?.qc_reviewed_at != null) return 'qc';
  if (order?.finance_reviewed_at != null) return 'finance';
  return 'finance';
}

export async function loadActiveOrderFlowDefinition(pool) {
  const [rows] = await pool.query(
    'SELECT order_flow_json, order_flow_version FROM sales_settings WHERE id = 1 LIMIT 1'
  );
  const row = rows?.[0] || {};
  let definition = normalizeFlowDefinition(row.order_flow_json);
  if (!definition.steps.length) {
    definition = defaultOrderFlowDefinition();
  }
  const version = Math.max(1, Number(row.order_flow_version) || definition.version || 1);
  return { definition, version };
}

export async function saveOrderFlowDefinition(pool, definition, { bumpVersion = true } = {}) {
  const validated = validateFlowDefinition(definition);
  if (!validated.ok) {
    const err = new Error(validated.errors.join('；'));
    err.code = 'VALIDATION_FAILED';
    err.details = validated.errors;
    throw err;
  }
  const nextVersion = bumpVersion
    ? Math.max(1, Number(validated.definition.version || 0) + 1)
    : Math.max(1, Number(validated.definition.version || 1));
  const payload = { ...validated.definition, version: nextVersion };
  await pool.query(
    'UPDATE sales_settings SET order_flow_json = CAST(? AS JSON), order_flow_version = ? WHERE id = 1',
    [JSON.stringify(payload), nextVersion]
  );
  return { definition: payload, version: nextVersion };
}

export async function resolveStepAssigneeUserIds(pool, step) {
  if (!step) return [];
  if (step.assignee_type === 'users') {
    return uniquePositiveIds(step.assignee_user_ids);
  }
  const code = String(step.assignee_category || '').trim();
  if (!code) return [];
  const [rows] = await pool.query(
    `SELECT u.id FROM users u
     INNER JOIN employee_categories c ON c.id = u.employee_category_id
     WHERE u.is_active = 1 AND u.account_type IN ('employee', 'manager') AND c.code = ?`,
    [code]
  );
  return rows.map((r) => Number(r.id)).filter((n) => n > 0);
}

/** @param {import('mysql2/promise').Pool} pool */
export async function notifyStepAssignees(pool, step, opts) {
  const {
    title,
    bodyText,
    fromUserId,
    refType,
    refId,
    msgCategory = 'todo'
  } = opts;

  if (step.assignee_type === 'category') {
    const code = String(step.assignee_category || '').trim();
    if (code) {
      await notifyUsersByCategory(pool, code, {
        title,
        bodyText,
        fromUserId,
        refType,
        refId,
        msgCategory
      });
      return;
    }
  }

  const userIds = await resolveStepAssigneeUserIds(pool, step);
  for (const uid of userIds) {
    await notifyUser(pool, uid, {
      title,
      bodyText,
      fromUserId,
      refType,
      refId,
      msgCategory
    });
  }
}

export function buildSubmitLogRemark(firstStep) {
  return `提交审核：${firstStep?.label || '审核'}`;
}

export function buildApproveLogRemark(step, comment, hasNext) {
  const base = comment || `${step?.label || '审核'}通过`;
  return hasNext ? base : `${base}，进入待备货发货`;
}

export function buildRejectLogRemark(step, comment) {
  return comment || `${step?.label || '审核'}驳回`;
}

export function terminalFlowNodes() {
  return [
    { key: 'warehouse', label: '待备货发货', fixed: true },
    { key: 'ship', label: '发货', fixed: true },
    { key: 'complete', label: '完结', fixed: true }
  ];
}
