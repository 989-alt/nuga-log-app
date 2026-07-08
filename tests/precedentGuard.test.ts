import { describe, it, expect } from 'vitest';
import { allowedCaseSet, stripUnknownCaseNumbers } from '@/lib/precedentGuard';

describe('precedentGuard', () => {
  it('always allows the two core precedents', () => {
    const s = allowedCaseSet([]);
    expect(s.has('2021도13926')).toBe(true);
    expect(s.has('2015도13488')).toBe(true);
  });

  it('allows retrieved case numbers too', () => {
    const s = allowedCaseSet(['2020도9999']);
    expect(s.has('2020도9999')).toBe(true);
  });

  it('removes hallucinated case numbers not in the allowed set', () => {
    const s = allowedCaseSet([]);
    const r = stripUnknownCaseNumbers('근거 2099도0001 과 2021도13926 참조', s);
    expect(r.text).not.toContain('2099도0001');
    expect(r.text).toContain('2021도13926');
    expect(r.removed).toEqual(['2099도0001']);
  });
});
