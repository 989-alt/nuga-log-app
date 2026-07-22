import { describe, it, expect } from 'vitest';
import { parseInterviewTurn, applyGate, buildInterviewSystemPrompt } from '@/lib/interview';

describe('interview', () => {
  it('system prompt states the 1~3 question rule and gate', () => {
    const p = buildInterviewSystemPrompt();
    expect(p).toContain('한 번에');
    expect(p).toContain('필수');
  });

  it('parses a well-formed turn JSON', () => {
    const raw = JSON.stringify({
      assistantMessage: '일시와 장소를 알려주세요.',
      caseTypeId: 1,
      slotUpdates: { datetime: '2026-07-08 4교시' },
      readyToGenerate: false,
    });
    const t = parseInterviewTurn(raw);
    expect(t.caseTypeId).toBe(1);
    expect(t.slotUpdates.datetime).toBe('2026-07-08 4교시');
    expect(t.readyToGenerate).toBe(false);
  });

  it('gate forces readyToGenerate=false when required slots missing', () => {
    // caseType 1의 필수슬롯이 비어 있으면 게이트가 생성을 막는다.
    const ok = applyGate(true, {}, 1);
    expect(ok).toBe(false);
  });

  it('system prompt enumerates per-type slot keys so the model can fill them', () => {
    const p = buildInterviewSystemPrompt();
    expect(p).toContain('teacherUtterance*');   // 유형1 필수 슬롯 키
    expect(p).toContain('restraintForm*');      // 유형6 필수 슬롯 키
    expect(p).toContain('guardianNotice(');     // 유형1에서 optional 표기
    expect(p).toContain('유형별 슬롯 키');
  });
});
