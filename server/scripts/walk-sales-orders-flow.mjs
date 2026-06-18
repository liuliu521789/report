import 'dotenv/config';
import { getPool } from '../src/db/pool.js';
import { loadOrderFieldDefinitions } from '../src/lib/salesOrderFields.js';
import { loadActiveOrderFlowDefinition } from '../src/lib/salesOrderFlowRuntime.js';
import { resolveCurrentReviewStep } from '../src/lib/salesOrderFlowConfig.js';

const pool = getPool();
const issues = [];
const issue = (l, a, m) => issues.push({ l, a, m });

const tables = ['sales_orders', 'sales_order_field_definitions', 'sales_order_status_logs', 'sales_order_edit_logs', 'sales_settings'];
for (const t of tables) {
  try {
    await pool.query(`SELECT 1 FROM ${t} LIMIT 1`);
  } catch {
    issue('error', 'schema', `missing table ${t}`);
  }
}

const fieldDefs = await loadOrderFieldDefinitions(pool, { activeOnly: true });
if (!fieldDefs.length) issue('warn', 'fields', 'no active field definitions');

const { definition } = await loadActiveOrderFlowDefinition(pool);
if (!definition?.steps?.length) issue('error', 'flow', 'empty flow config');

const [rows] = await pool.query(
  `SELECT id, order_no, status, submitted_for_review_at, flow_step_index,
          finance_reviewed_at, qc_reviewed_at
   FROM sales_orders ORDER BY id DESC LIMIT 50`
);
const [counts] = await pool.query(
  `SELECT status, SUM(submitted_for_review_at IS NOT NULL) AS submitted, COUNT(*) AS cnt
   FROM sales_orders GROUP BY status`
);

let financeMismatch = 0;
let qcMismatch = 0;
let orphanQc = 0;
for (const row of rows) {
  const ctx = resolveCurrentReviewStep(row, definition);
  const feFin = row.status === 'pending_review' && !!row.submitted_for_review_at;
  const feQc = row.status === 'pending_qc';
  const beFin = ctx && ctx.step?.node_type === 'finance_review';
  const beQc = ctx && ctx.step?.node_type === 'qc_review';
  if (feFin !== !!beFin) financeMismatch += 1;
  if (feQc !== !!beQc) qcMismatch += 1;
  if (ctx?.orphanedQc) orphanQc += 1;
}

if (financeMismatch) issue('warn', 'ui', `${financeMismatch} rows finance UI/backend mismatch`);
if (qcMismatch) issue('warn', 'ui', `${qcMismatch} rows qc UI/backend mismatch`);
if (orphanQc) issue('warn', 'flow', `${orphanQc} orphan pending_qc orders`);

const [drafts] = await pool.query(
  `SELECT COUNT(*) AS c FROM sales_orders
   WHERE status IN ('pending_review','rejected') AND submitted_for_review_at IS NULL`
);
const [pendingFin] = await pool.query(
  `SELECT COUNT(*) AS c FROM sales_orders
   WHERE status='pending_review' AND submitted_for_review_at IS NOT NULL`
);
const [pendingQc] = await pool.query(`SELECT COUNT(*) AS c FROM sales_orders WHERE status='pending_qc'`);
const [approved] = await pool.query(`SELECT COUNT(*) AS c FROM sales_orders WHERE status='approved'`);

console.log(JSON.stringify({
  counts,
  fieldDefs: fieldDefs.length,
  flow: definition.steps.map((s) => s.label),
  drafts: drafts[0].c,
  pendingFin: pendingFin[0].c,
  pendingQc: pendingQc[0].c,
  approved: approved[0].c,
  issues
}, null, 2));

await pool.end();
