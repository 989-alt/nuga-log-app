import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/prompt';
import type { RetrievedBasis } from '@/lib/lawRetrieval';

const emptyBasis: RetrievedBasis = { grounding: '', precedents: [] };

describe('buildSystemPrompt', () => {
  it('includes the core rules: 평어 종결, 단정 금지, JSON-only', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('평어 종결');
    expect(p).toContain('작은따옴표');
    expect(p).toMatch(/JSON/);
    expect(p).toContain('교사 이해용');
    expect(p).toContain('신고 의무');
  });
});

describe('buildUserPrompt', () => {
  it('embeds case type name, slot values, and static bases', () => {
    const p = buildUserPrompt({
      caseTypeId: 1,
      slots: { datetime: '2026.5.13.(수) 3교시', behavior: '필통을 떨어뜨림' },
      basis: emptyBasis,
    });
    expect(p).toContain('일반 생활지도');
    expect(p).toContain('2026.5.13.(수) 3교시');
    expect(p).toContain('필통을 떨어뜨림');
    expect(p).toContain('초·중등교육법 제20조의2');
  });

  it('adds the grounding and precedent block when provided', () => {
    const basis: RetrievedBasis = {
      grounding: 'GROUNDING_MARKER 현행 법령 근거 요약',
      precedents: [{ caseNo: '2021도13926', gist: '교사의 객관적으로 타당한 지도' }],
    };
    const p = buildUserPrompt({
      caseTypeId: 3,
      slots: { datetime: 'x' },
      basis,
    });
    expect(p).toContain('GROUNDING_MARKER');
    expect(p).toContain('검색된 판례');
    expect(p).toContain('2021도13926');
  });
});
