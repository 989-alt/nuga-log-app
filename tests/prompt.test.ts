import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/prompt';

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
      isSpecialEd: false,
      liveLaw: null,
    });
    expect(p).toContain('일반 생활지도');
    expect(p).toContain('2026.5.13.(수) 3교시');
    expect(p).toContain('필통을 떨어뜨림');
    expect(p).toContain('초·중등교육법 제20조의2');
  });

  it('adds the special-ed clause and live-law block when provided', () => {
    const p = buildUserPrompt({
      caseTypeId: 3,
      slots: { datetime: 'x' },
      isSpecialEd: true,
      liveLaw: '학교폭력예방 및 대책에 관한 법률 [현행] 시행일 20260602',
    });
    expect(p).toContain('제15조');
    expect(p).toContain('실시간 검증');
    expect(p).toContain('20260602');
  });
});
