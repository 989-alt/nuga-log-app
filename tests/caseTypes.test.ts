import { describe, it, expect } from 'vitest';
import { CASE_TYPES, getCaseType, HIGH_RISK_IDS } from '@/lib/caseTypes';

describe('caseTypes', () => {
  it('has exactly 7 case types with ids 1..7', () => {
    expect(CASE_TYPES.map((c) => c.id).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('marks ids 3,4,5,6,7 as high risk and 1,2 as not', () => {
    expect([...HIGH_RISK_IDS].sort()).toEqual([3, 4, 5, 6, 7]);
    expect(getCaseType(1).highRisk).toBe(false);
    expect(getCaseType(3).highRisk).toBe(true);
  });

  it('every case type has at least one required slot and a non-empty skeleton', () => {
    for (const c of CASE_TYPES) {
      expect(c.slots.some((s) => s.required)).toBe(true);
      expect(c.skeleton.length).toBeGreaterThan(20);
      expect(c.bases.length).toBeGreaterThan(0);
    }
  });

  it('high-risk types declare at least one law query for live verification', () => {
    for (const c of CASE_TYPES) {
      if (c.highRisk) expect(c.lawQueries.length).toBeGreaterThan(0);
    }
  });

  it('every slot key is unique within its type', () => {
    for (const c of CASE_TYPES) {
      const keys = c.slots.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
