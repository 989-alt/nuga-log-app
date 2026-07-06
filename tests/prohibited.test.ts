import { describe, it, expect } from 'vitest';
import { scanProhibited, applyConversions } from '@/lib/prohibited';

describe('scanProhibited', () => {
  it('flags a legal-assertion phrase in the body', () => {
    const hits = scanProhibited('본 행위는 모욕죄 성립으로 볼 수 있음.');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].matched).toContain('모욕죄 성립');
  });

  it('flags 공연성 충족', () => {
    expect(scanProhibited('공연성 충족이 인정됨').length).toBeGreaterThan(0);
  });

  it('returns empty for clean descriptive text', () => {
    expect(scanProhibited('다른 학생들이 있는 교실에서 발언함.')).toEqual([]);
  });
});

describe('applyConversions', () => {
  it('rewrites 모욕죄 성립 to a descriptive phrase and records a note', () => {
    const { text, notes } = applyConversions('보호자 발언은 모욕죄 성립임.');
    expect(text).not.toContain('모욕죄 성립');
    expect(notes.length).toBeGreaterThan(0);
  });

  it('leaves clean text unchanged with no notes', () => {
    const { text, notes } = applyConversions('교육활동 보호 차원에서 지도함.');
    expect(text).toBe('교육활동 보호 차원에서 지도함.');
    expect(notes).toEqual([]);
  });
});
