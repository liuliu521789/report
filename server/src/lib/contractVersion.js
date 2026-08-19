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

/** mysql2 可能返回已解析的对象，也可能是 JSON 字符串 */
function parseVersionDataJson(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function stableStringify(val) {
  try {
    return JSON.stringify(val ?? null);
  } catch {
    return String(val);
  }
}

/** Simple diff summary generator (can be enhanced with deep diff library) */
function generateChangeSummary(oldData, newData) {
  const prev = parseVersionDataJson(oldData);
  const next = parseVersionDataJson(newData);
  if (!oldData || !Object.keys(prev).length) return '初始版本或重大更新';
  const changes = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    if (stableStringify(prev[key]) !== stableStringify(next[key])) {
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

const FIELD_LABELS = {
  title: '标题',
  body_html: '正文',
  contract_visual: '订单明细/可视化'
};

/** Compute diff between two versions（字段级 + 正文） */
export async function getVersionDiff(pool, contractId, v1, v2) {
  const fromNum = Math.min(Number(v1), Number(v2));
  const toNum = Math.max(Number(v1), Number(v2));
  if (!Number.isFinite(fromNum) || !Number.isFinite(toNum) || fromNum < 1 || toNum < 1 || fromNum === toNum) {
    return { error: 'VERSIONS_NOT_FOUND' };
  }

  const [rows] = await pool.query(
    `SELECT version_num, body_html, data_json, change_summary 
     FROM contract_versions 
     WHERE contract_id = ? AND version_num IN (?, ?) 
     ORDER BY version_num`,
    [contractId, fromNum, toNum]
  );

  if (rows.length < 2) return { error: 'VERSIONS_NOT_FOUND' };

  const oldV = rows[0];
  const newV = rows[1];
  const diff = [];

  const oldData = parseVersionDataJson(oldV.data_json);
  const newData = parseVersionDataJson(newV.data_json);

  // data_json 未写入时，用 body_html 列兜底，避免「有版本但对比为空」
  if (oldData.body_html == null && oldV.body_html != null) oldData.body_html = oldV.body_html;
  if (newData.body_html == null && newV.body_html != null) newData.body_html = newV.body_html;

  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  for (const key of keys) {
    if (stableStringify(oldData[key]) !== stableStringify(newData[key])) {
      diff.push({
        field: key,
        label: FIELD_LABELS[key] || key,
        old: oldData[key],
        new: newData[key]
      });
    }
  }

  // data_json 完全相同但正文列不同时仍展示正文差异
  if (
    !diff.some((c) => c.field === 'body_html') &&
    String(oldV.body_html || '') !== String(newV.body_html || '')
  ) {
    diff.unshift({
      field: 'body_html',
      label: '正文',
      old: oldV.body_html,
      new: newV.body_html
    });
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
