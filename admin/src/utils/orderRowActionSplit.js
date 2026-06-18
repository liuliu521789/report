/** 行操作主区最多外露按钮数 */
export const ORDER_ROW_PRIMARY_LIMIT = 3;

/** 当前流程节点待办（优先外露） */
export const WORKFLOW_ACTION_KEYS = new Set([
  'finance_approve',
  'finance_reject',
  'qc_approve',
  'qc_reject',
  'submit',
  'withdraw',
  'ship',
  'complete'
]);

/** 按账号主角色补充外露的操作键 */
export const ROLE_BOOST_KEYS = {
  finance: ['edit', 'cancel'],
  qc: ['edit', 'report'],
  ship: ['edit'],
  sales: ['edit', 'report'],
  mixed: ['edit', 'report'],
  default: ['edit']
};

/** 尽量收进「更多」的低频操作 */
export const LOW_PRIORITY_KEYS = new Set(['delete']);

/**
 * @param {{ hasFinance?: boolean, hasQc?: boolean, hasShip?: boolean, hasSales?: boolean }} flags
 * @returns {'finance'|'qc'|'ship'|'sales'|'mixed'|'default'}
 */
export function detectOrderRowActionProfile(flags = {}) {
  const hasFinance = !!flags.hasFinance;
  const hasQc = !!flags.hasQc;
  const hasShip = !!flags.hasShip;
  const hasSales = !!flags.hasSales;
  const count = [hasFinance, hasQc, hasShip, hasSales].filter(Boolean).length;
  if (count === 0) return 'default';
  if (count !== 1) return 'mixed';
  if (hasFinance) return 'finance';
  if (hasQc) return 'qc';
  if (hasShip) return 'ship';
  return 'sales';
}

/**
 * @param {Array<{ key: string, priority?: number }>} allActions 已按 priority 排序
 * @param {string} profile
 * @param {number} [limit]
 */
export function splitOrderRowActions(allActions, profile, limit = ORDER_ROW_PRIMARY_LIMIT) {
  const primary = [];
  const used = new Set();

  const pick = (key) => {
    if (primary.length >= limit || used.has(key)) return;
    const act = allActions.find((a) => a.key === key);
    if (!act) return;
    primary.push(act);
    used.add(key);
  };

  for (const act of allActions) {
    if (primary.length >= limit) break;
    if (WORKFLOW_ACTION_KEYS.has(act.key)) pick(act.key);
  }

  const boost = ROLE_BOOST_KEYS[profile] || ROLE_BOOST_KEYS.default;
  for (const key of boost) pick(key);

  const rest = allActions.filter((a) => !used.has(a.key));
  const normal = rest.filter((a) => !LOW_PRIORITY_KEYS.has(a.key));
  for (const act of normal) {
    if (primary.length >= limit) break;
    pick(act.key);
  }

  const secondary = allActions.filter((a) => !used.has(a.key));
  return { primary, secondary };
}
