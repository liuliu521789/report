import { describe, it, expect } from 'vitest';
import {
  detectOrderRowActionProfile,
  splitOrderRowActions
} from './orderRowActionSplit';

const act = (key, priority) => ({ key, label: key, priority });

describe('detectOrderRowActionProfile', () => {
  it('returns single role profiles', () => {
    expect(detectOrderRowActionProfile({ hasFinance: true })).toBe('finance');
    expect(detectOrderRowActionProfile({ hasQc: true })).toBe('qc');
    expect(detectOrderRowActionProfile({ hasShip: true })).toBe('ship');
    expect(detectOrderRowActionProfile({ hasSales: true })).toBe('sales');
  });

  it('returns mixed when multiple roles', () => {
    expect(detectOrderRowActionProfile({ hasFinance: true, hasQc: true })).toBe('mixed');
  });
});

describe('splitOrderRowActions', () => {
  it('surfaces finance review actions for finance profile', () => {
    const all = [
      act('finance_approve', 10),
      act('finance_reject', 11),
      act('edit', 25),
      act('delete', 50)
    ];
    const { primary, secondary } = splitOrderRowActions(all, 'finance');
    expect(primary.map((a) => a.key)).toEqual(['finance_approve', 'finance_reject', 'edit']);
    expect(secondary.map((a) => a.key)).toEqual(['delete']);
  });

  it('surfaces qc review actions for qc profile', () => {
    const all = [
      act('qc_approve', 12),
      act('qc_reject', 13),
      act('report', 40),
      act('delete', 50)
    ];
    const { primary } = splitOrderRowActions(all, 'qc');
    expect(primary.map((a) => a.key)).toEqual(['qc_approve', 'qc_reject', 'report']);
  });

  it('surfaces submit and edit for sales on draft', () => {
    const all = [
      act('submit', 15),
      act('edit', 25),
      act('delete', 50)
    ];
    const { primary, secondary } = splitOrderRowActions(all, 'sales');
    expect(primary.map((a) => a.key)).toEqual(['submit', 'edit']);
    expect(secondary.map((a) => a.key)).toEqual(['delete']);
  });

  it('uses row workflow first for mixed profile', () => {
    const all = [
      act('ship', 20),
      act('edit', 25),
      act('report', 40)
    ];
    const { primary } = splitOrderRowActions(all, 'mixed');
    expect(primary.map((a) => a.key)).toEqual(['ship', 'edit', 'report']);
  });

  it('keeps delete in secondary when primary slots full', () => {
    const all = [
      act('qc_approve', 12),
      act('qc_reject', 13),
      act('edit', 25),
      act('report', 40),
      act('delete', 50)
    ];
    const { primary, secondary } = splitOrderRowActions(all, 'qc');
    expect(primary.map((a) => a.key)).toEqual(['qc_approve', 'qc_reject', 'edit']);
    expect(secondary.map((a) => a.key)).toEqual(['report', 'delete']);
  });
});
