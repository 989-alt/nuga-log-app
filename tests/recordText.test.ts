import { describe, it, expect } from 'vitest';
import { fullRecordText, recordFilename } from '@/lib/recordText';
import type { GenerateResult } from '@/lib/types';

const r: GenerateResult = {
  body: '2026년 7월 8일 수요일 4교시 교실에서 본인이 큰 소리를 냄. 주의 단계로 지도함.',
  meta: { bases: '교원의 학생생활지도에 관한 고시', caseType: '일반 생활지도', charCount: '약 40자', guidanceStep: '주의', guardianNotice: '당일 통보', followUp: '재관찰' },
  teacherUnderstanding: ['고시: 주의 단계 적용'],
  safeGuidance: ['단계적으로 지도한다'],
  teacherMemo: ['통보 시각 기록'],
  legalProtection: [{ element: '비례성', support: '안내 수준의 최소 개입', caseRefs: ['2021도13926'] }],
  warnings: [],
  actionItems: [{ task: '보호자 통보 실시', how: '통보 완료: 2026-07-08 15:20 전화 통보' }],
};

describe('recordText', () => {
  it('assembles all blocks with the legal-protection section', () => {
    const t = fullRecordText(r);
    expect(t).toContain('[NEIS 누가기록');
    expect(t).toContain(r.body);
    expect(t).toContain('교사 이해용');
    expect(t).toContain('법적 보호 분석');
    expect(t).toContain('2021도13926');
    expect(t).toContain('NEIS에 붙여넣지 말 것');
  });

  it('includes the action-items section after legal protection when present', () => {
    const t = fullRecordText(r);
    expect(t).toContain('[지금 해야 할 일 — NEIS에 붙여넣지 말 것]');
    expect(t).toContain('- 보호자 통보 실시');
    expect(t).toContain('  기록 방법: 통보 완료: 2026-07-08 15:20 전화 통보');
    expect(t.indexOf('법적 보호 분석')).toBeLessThan(t.indexOf('지금 해야 할 일'));
  });

  it('omits the action-items section when actionItems is undefined or empty', () => {
    const noItems = { ...r, actionItems: undefined };
    expect(fullRecordText(noItems)).not.toContain('지금 해야 할 일');

    const emptyItems = { ...r, actionItems: [] };
    expect(fullRecordText(emptyItems)).not.toContain('지금 해야 할 일');
  });

  it('builds a skill-style filename, sanitizing forbidden chars', () => {
    expect(recordFilename(r, '2026-07-08')).toBe('누가기록_2026-07-08_일반_생활지도.txt');
    const bad = { ...r, meta: { ...r.meta, caseType: 'a/b:c d' } };
    expect(recordFilename(bad, '2026-07-08')).toBe('누가기록_2026-07-08_abc_d.txt');
  });

  it('omits empty blocks', () => {
    const empty = { ...r, legalProtection: [], teacherMemo: [] };
    const t = fullRecordText(empty);
    expect(t).not.toContain('법적 보호 분석');
    expect(t).not.toContain('교사 보관 메모');
  });
});
