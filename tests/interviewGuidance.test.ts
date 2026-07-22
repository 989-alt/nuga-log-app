import { describe, it, expect } from 'vitest';
import { buildInterviewSystemPrompt } from '@/lib/interview';
import { groundingText } from '@/lib/legalKb';

describe('interview prompt guidance extensions', () => {
  it('injects [참고 법령·판례] header and groundingText output before the slot key spec', () => {
    const p = buildInterviewSystemPrompt();
    expect(p).toContain('[참고 법령·판례]');
    const grounding = groundingText();
    expect(p).toContain(grounding);

    const headerIdx = p.indexOf('[참고 법령·판례]');
    const slotSpecIdx = p.indexOf('유형별 슬롯 키:');
    expect(headerIdx).toBeGreaterThan(-1);
    expect(slotSpecIdx).toBeGreaterThan(-1);
    expect(headerIdx).toBeLessThan(slotSpecIdx);
  });

  it('includes the guidance-suggestion rule with statute/decision grounding', () => {
    const p = buildInterviewSystemPrompt();
    expect(p).toContain(
      '- 교사가 지도 방법을 모르겠다고 하거나 어떻게 해야 할지 물으면, 위 법령·판례와 교육학적 원칙(비례성, 단계적 개입, 긍정행동지원)에 근거한 지도 방법을 2~3가지 제안하고 각 방법의 근거(조문·판례 번호)를 assistantMessage 안에 함께 밝힌다.'
    );
    expect(p).toContain('지도 방법');
  });

  it('includes the confirmation-question rule ending exactly with "생성할까요?"', () => {
    const p = buildInterviewSystemPrompt();
    expect(p).toContain(
      '- 필수(*) 슬롯이 모두 모여 readyToGenerate를 true로 낼 때는, assistantMessage를 수집 내용 한 줄 요약 뒤 정확히 "이 내용을 바탕으로 NEIS 누가기록 초안을 생성할까요?" 로 끝맺는다.'
    );
    expect(p).toContain('생성할까요?');
  });

  it('includes the "아니오" follow-up rule that resets readyToGenerate to false', () => {
    const p = buildInterviewSystemPrompt();
    expect(p).toContain(
      '- 교사가 초안 생성 확인에 아니오라고 답하거나 추가·수정할 내용이 있다고 하면, 어떤 내용을 추가·수정할지 구체적으로 되묻는다(readyToGenerate는 다시 false).'
    );
  });

  it('does not remove existing rules or the single-JSON-output constraint', () => {
    const p = buildInterviewSystemPrompt();
    expect(p).toContain('매 턴 아래 JSON 하나만 출력한다. 설명·코드펜스 금지.');
    expect(p).toContain('한 번에');
    expect(p).toContain('유형별 슬롯 키');
    expect(p).toContain('teacherUtterance*');
  });
});
