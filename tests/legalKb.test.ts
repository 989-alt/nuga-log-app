import { describe, it, expect } from 'vitest';
import { CORE_STATUTES, groundingText } from '@/lib/legalKb';

describe('legalKb', () => {
  it('includes the fixed core statutes and both precedents', () => {
    const ids = CORE_STATUTES.map((s) => s.id);
    expect(ids).toContain('gosi_2026_3');
    expect(ids).toContain('elementary_secondary_20_2');
    expect(ids).toContain('child_welfare_17');
    expect(ids).toContain('child_abuse_punishment_2');
    expect(ids).toContain('supreme_2021do13926');
    expect(ids).toContain('supreme_2015do13488');
  });

  it('groundingText mentions 고시 5단계 and includes 특수교육 제15조 only when specialEd', () => {
    expect(groundingText(false)).toContain('조언');
    expect(groundingText(false)).not.toContain('제15조');
    expect(groundingText(true)).toContain('제15조');
  });
});
