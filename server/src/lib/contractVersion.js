import { getPool } from '../db/pool.js';
import { logOperationFromReq } from './audit.js';
import { hasPermission } from './permissions.js';

/**
 * Contract Versioning and Multi-level Approval Helpers
 * Step 2 of contract collaboration enhancement
 */

/** Create a new version for a contract and compute change summary */
export async function createContractVersion(pool, contractId, newBodyHtml, newDataJson, userId, changeNote = '') {
  const [current] = await pool.query(
    'SELECT current_version, body_html, data_json FROM sales_contracts WHERE id = ?',
    [contractId]
  );
  const currentVersion = current[0]?.current_version || 0;
  const nextVersion = currentVersion + 1;

  const changeSummary = changeNote || generateChangeSummary(current[0]?.data_json, newDataJson);

  await pool.query(
    `INSERT INTO contract_versions (contract_id, version_num, body_html, data_json, change_summary, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [contractId, nextVersion, newBodyHtml, JSON.stringify(newDataJson || {}), changeSummary, userId]
  );

  await pool.query(
    'UPDATE sales_contracts SET current_version = ?, body_html = ?, data_json = ? WHERE id = ?',
    [nextVersion, newBodyHtml, JSON.stringify(newDataJson || {}), contractId]
  );

  return { version: nextVersion, changeSummary };
}

/** Simple diff summary generator (can be enhanced with deep diff library) */
function generateChangeSummary(oldData, newData) {
  if (!oldData || !newData) return '初始版本或重大更新';
  const changes = [];
  for (const key in newData) {
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      changes.push(key);
    }
  }
  if (changes.length > 0) {
    return `修改了 ${changes.slice(0, 3).join(', ')}${changes.length > 3 ? ' 等' : ''}`;
  }
  return '内容更新';
}

/** Get version history for a contract */
export async function getContractVersions(pool, contractId) {
  const [rows] = await pool.query(
    `SELECT id, version_num, change_summary, created_by, created_at 
     FROM contract_versions 
     WHERE contract_id = ? 
     ORDER BY version_num DESC`,
    [contractId]
  );
  return rows;
}

/** Compute diff between two versions (basic field-level for now) */
export async function getVersionDiff(pool, contractId, v1, v2) {
  const [rows] = await pool.query(
    `SELECT version_num, data_json, change_summary 
     FROM contract_versions 
     WHERE contract_id = ? AND version_num IN (?, ?) 
     ORDER BY version_num`,
    [contractId, Math.min(v1, v2), Math.max(v1, v2)]
  );

  if (rows.length < 2) return { error: 'VERSIONS_NOT_FOUND' };

  const oldV = rows[0];
  const newV = rows[1];
  const diff = [];

  const oldData = oldV.data_json ? JSON.parse(oldV.data_json) : {};
  const newData = newV.data_json ? JSON.parse(newV.data_json) : {};

  for (const key in newData) {
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      diff.push({
        field: key,
        old: oldData[key],
        new: newData[key]
      });
    }
  }

  return {
    fromVersion: oldV.version_num,
    toVersion: newV.version_num,
    changeSummary: newV.change_summary,
    changes: diff
  };
}

/** Setup or update multi-level approval flow for a contract */
export async function setupApprovalFlow(pool, contractId, steps, userId, req = null) {
  // Clear existing steps
  await pool.query('DELETE FROM contract_approval_steps WHERE contract_id = ?', [contractId]);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    await pool.query(
      `INSERT INTO contract_approval_steps 
       (contract_id, step_order, step_type, approvers_json, required_approvals, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [
        contractId,
        i + 1,
        step.type || 'sequential',
        JSON.stringify(step.approvers || []),
        step.required || 1
      ]
    );
  }

  await pool.query(
    'UPDATE sales_contracts SET approval_flow_json = ? WHERE id = ?',
    [JSON.stringify(steps), contractId]
  );

  if (req) {
    await logOperationFromReq(req, {
      module: '销售合同',
      action: '设置多级审批流',
      detail: { contractId, stepCount: steps.length }
    });
  }

  return { ok: true, stepCount: steps.length };
}

/** Approve a specific step in the multi-level flow */
export async function approveStep(pool, contractId, stepId, userId, result, comment = '', req = null) {
  const [stepRow] = await pool.query('SELECT * FROM contract_approval_steps WHERE id = ? AND contract_id = ?', [stepId, contractId]);
  const step = stepRow[0];
  if (!step) return { ok: false, error: 'STEP_NOT_FOUND' };

  const approvers = JSON.parse(step.approvers_json || '[]');
  if (!approvers.includes(Number(userId)) && !isSuperUser(userId)) {
    return { ok: false, error: 'NOT_AUTHORIZED' };
  }

  const completed = JSON.parse(step.completed_by || '[]');
  if (!completed.includes(Number(userId))) {
    completed.push(Number(userId));
  }

  const isComplete = completed.length >= step.required_approvals;

  await pool.query(
    `UPDATE contract_approval_steps 
     SET status = ?, completed_by = ?, comment_text = ?, completed_at = NOW(3)
     WHERE id = ?`,
    [result, JSON.stringify(completed), comment, stepId]
  );

  if (req) {
    await logOperationFromReq(req, {
      module: '销售合同',
      action: result === 'approved' ? '审批通过' : '审批驳回',
      detail: { contractId, stepId, result, comment }
    });
  }

  return { ok: true, complete: isComplete };
}

// isSuper is available in routes via req. For lib, we pass req or check via permissions.
// For now, super admin check is handled in route middleware.
