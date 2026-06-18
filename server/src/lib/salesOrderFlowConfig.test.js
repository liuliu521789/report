import { describe, expect, it } from 'vitest';
import {
  defaultOrderFlowDefinition,
  normalizeFlowDefinition,
  validateFlowDefinition,
  resolveCurrentReviewStep,
  orderMatchesReviewStep,
  getNextStepAfter,
  flowDefinitionHasQcStep
} from './salesOrderFlowConfig.js';

describe('salesOrderFlowConfig', () => {
  it('normalizes default definition', () => {
    const def = normalizeFlowDefinition(null);
    expect(def.steps).toHaveLength(2);
    expect(def.steps[0].node_type).toBe('finance_review');
  });

  it('rejects empty steps', () => {
    const r = validateFlowDefinition({ version: 1, steps: [] });
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate node types', () => {
    const r = validateFlowDefinition({
      version: 1,
      steps: [
        { node_type: 'finance_review', label: 'A', assignee_type: 'category', assignee_category: 'finance' },
        { node_type: 'finance_review', label: 'B', assignee_type: 'category', assignee_category: 'finance' }
      ]
    });
    expect(r.ok).toBe(false);
  });

  it('resolves finance review step from legacy order', () => {
    const def = defaultOrderFlowDefinition();
    const order = {
      status: 'pending_review',
      submitted_for_review_at: '2026-01-01',
      flow_step_index: null
    };
    const ctx = resolveCurrentReviewStep(order, def);
    expect(ctx?.index).toBe(0);
    expect(ctx?.step.node_type).toBe('finance_review');
  });

  it('matches qc step', () => {
    const step = { node_type: 'qc_review' };
    expect(orderMatchesReviewStep({ status: 'pending_qc' }, step)).toBe(true);
    expect(orderMatchesReviewStep({ status: 'pending_review', submitted_for_review_at: 'x' }, step)).toBe(false);
  });

  it('finance-only flow approves after finance step', () => {
    const def = normalizeFlowDefinition({
      version: 2,
      steps: [
        {
          node_type: 'finance_review',
          label: '财务审核',
          assignee_type: 'category',
          assignee_category: 'finance'
        }
      ]
    });
    expect(def.steps).toHaveLength(1);
    expect(flowDefinitionHasQcStep(def)).toBe(false);
    const financeStep = def.steps[0];
    expect(getNextStepAfter(def, financeStep)).toBeNull();
  });

  it('flags orphan pending_qc when qc step removed', () => {
    const def = normalizeFlowDefinition({
      version: 2,
      steps: [
        {
          node_type: 'finance_review',
          label: '财务审核',
          assignee_type: 'category',
          assignee_category: 'finance'
        }
      ]
    });
    const order = {
      status: 'pending_qc',
      finance_reviewed_at: '2026-01-02',
      flow_step_index: 1
    };
    const ctx = resolveCurrentReviewStep(order, def);
    expect(ctx?.orphanedQc).toBe(true);
  });

  it('getNextStepAfter uses definition not stale index', () => {
    const def = defaultOrderFlowDefinition();
    const financeStep = def.steps[0];
    expect(getNextStepAfter(def, financeStep)?.node_type).toBe('qc_review');
  });
});
