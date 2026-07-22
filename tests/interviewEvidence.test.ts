import { describe, it, expect } from 'vitest';
import { buildInterviewSystemPrompt } from '@/lib/interview';

describe('interview prompt evidence-completeness collection rules', () => {
  it('asks for repeat-count/response/resolution when behavior repeated', () => {
    const p = buildInterviewSystemPrompt();
    expect(p).toContain(
      '- 행동이 반복된 사안이면 정확한 횟수(불확실하면 최소 횟수)와 각 반복 시 교사의 대응, 상황이 어떻게 종결되었는지를 반드시 묻는다.'
    );
  });

  it('asks to distinguish completed vs pending procedures and collect "미완(예정: ...)" form', () => {
    const p = buildInterviewSystemPrompt();
    expect(p).toContain(
      '- 보호자 통보·관리자 보고·신고 같은 절차는 완료했는지 아직인지 구분해 묻고, 완료면 일시·수단·상대 반응까지, 미완이면 슬롯 값에 "미완(예정: ...)" 형태로 수집한다.'
    );
  });

  it('asks about protective measures taken for other students when witnessed/involved', () => {
    const p = buildInterviewSystemPrompt();
    expect(p).toContain('- 다른 학생이 목격하거나 연루된 사안이면 다른 학생 보호를 위해 취한 조치를 묻는다.');
  });
});
