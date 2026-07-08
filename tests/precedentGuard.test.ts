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

  it('does not corrupt an allowed case number that is a substring prefix of an unknown one', () => {
    const s = allowedCaseSet(['2020도9999']);
    const r = stripUnknownCaseNumbers(
      '허용 2020도9999 그리고 미허용 2020도999 참조',
      s
    );
    expect(r.text).toContain('2020도9999');
    expect(r.text.replace('2020도9999', '')).not.toContain('2020도999');
    expect(r.removed).toEqual(['2020도999']);
  });
});
