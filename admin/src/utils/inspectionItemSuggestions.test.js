import { describe, expect, it } from 'vitest';
import {
  filterInspectionItemSuggestions,
  lookupInspectionItemEn,
  normalizeInspectionItemZh
} from './inspectionItemSuggestions.js';

describe('inspectionItemSuggestions', () => {
  it('normalizes spaced Chinese item names', () => {
    expect(normalizeInspectionItemZh('固 体 份')).toBe('固体份');
  });

  it('looks up English by Chinese item name', () => {
    expect(lookupInspectionItemEn('外观')).toBe('Appearance');
    expect(lookupInspectionItemEn('粘 度')).toBe('Viscosity');
    expect(lookupInspectionItemEn('')).toBe('');
    expect(lookupInspectionItemEn('未知项目')).toBe('');
  });

  it('filters suggestions by Chinese or English query', () => {
    const byZh = filterInspectionItemSuggestions('固体');
    expect(byZh.some((x) => x.zh === '固体份')).toBe(true);

    const byEn = filterInspectionItemSuggestions('viscosity');
    expect(byEn.some((x) => x.zh === '粘度')).toBe(true);
  });

  it('returns common items when query is empty', () => {
    const list = filterInspectionItemSuggestions('');
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].zh).toBe('外观');
  });
});
