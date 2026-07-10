import { describe, it, expect } from 'vitest';
import { buildFollowUpInterviewPrompt, applyFollowUpGate } from '@/lib/interview';
import { runChatTurn } from '@/lib/chatTurn';
import type { ChatTurnRequest, FollowUpContext } from '@/lib/types';

const followUp: FollowUpContext = {
  parentId: 'abc123',
  parentDate: '2026-07-08',
  caseTypeId: 1,
  parentBody: '7월 8일 4교시 국어 시간, 학생이 교사의 지시를 3회 거부하고 큰 소리로 반발함. 교사는...',
};

function mockLlm(json: object): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(json) }] }), { status: 200 })) as any;
}

describe('buildFollowUpInterviewPrompt', () => {
  it('presents the original case body and follow-up slot keys and ends with the confirmation question', () => {
    const p = buildFollowUpInterviewPrompt({ isSpecialEd: false, disabilities: [] }, followUp);
    expect(p).toContain(followUp.parentBody);
    expect(p).toContain('followUpAction*');
    expect(p).toContain('datetime*');
    expect(p).toContain('outcome*');
    expect(p).toContain('이 내용을 바탕으로 후속 누가기록 초안을 생성할까요?');
    // caseTypeId는 원 사건 값으로 고정된다.
    expect(p).toContain(`caseTypeId 필드는 항상 ${followUp.caseTypeId}로 고정`);
  });
});

describe('applyFollowUpGate', () => {
  it('blocks when required follow-up slots (followUpAction/datetime/outcome) are missing', () => {
    expect(applyFollowUpGate(true, {})).toBe(false);
    expect(applyFollowUpGate(true, { followUpAction: '보호자 통보' })).toBe(false);
  });

  it('allows when all required follow-up slots are present', () => {
    expect(
      applyFollowUpGate(true, {
        followUpAction: '보호자 통보',
        datetime: '2026-07-10 15시',
        outcome: '보호자가 가정 지도를 약속함',
      })
    ).toBe(true);
  });

  it('blocks when modelReady is false even if slots are complete', () => {
    expect(
      applyFollowUpGate(false, {
        followUpAction: '보호자 통보',
        datetime: '2026-07-10 15시',
        outcome: '보호자가 가정 지도를 약속함',
      })
    ).toBe(false);
  });
});

describe('runChatTurn with followUp', () => {
  const base: ChatTurnRequest = {
    messages: [{ role: 'user', content: '보호자에게 어제 오후 3시에 전화로 알렸어요.' }],
    slots: {},
    caseTypeId: null,
    specialEd: { isSpecialEd: false, disabilities: [] },
    ai: { mode: 'byok', provider: 'claude', apiKey: 'k', model: 'claude-haiku-4-5-20251001' },
    followUp,
  };

  it('keeps caseTypeId fixed to the parent case type and applies the follow-up gate', async () => {
    const res = await runChatTurn(
      { ...base },
      {
        fetchImpl: mockLlm({
          assistantMessage: '통보 시 보호자 반응은 어땠나요?',
          caseTypeId: 5, // 모델이 엉뚱한 값을 줘도 무시하고 원 사건 값을 써야 한다.
          slotUpdates: { followUpAction: '보호자 통보', datetime: '2026-07-09 15시' },
          readyToGenerate: true,
        }),
      }
    );
    expect(res.caseTypeId).toBe(followUp.caseTypeId);
    // outcome이 아직 없으므로 게이트가 막는다.
    expect(res.readyToGenerate).toBe(false);
    expect(res.slotUpdates.followUpAction).toBe('보호자 통보');
  });

  it('allows generation once all required follow-up slots are merged in', async () => {
    const res = await runChatTurn(
      { ...base, slots: { followUpAction: '보호자 통보', datetime: '2026-07-09 15시' } },
      {
        fetchImpl: mockLlm({
          assistantMessage: '이 내용을 바탕으로 후속 누가기록 초안을 생성할까요?',
          caseTypeId: 1,
          slotUpdates: { outcome: '보호자가 가정 지도를 약속함' },
          readyToGenerate: true,
        }),
      }
    );
    expect(res.caseTypeId).toBe(followUp.caseTypeId);
    expect(res.readyToGenerate).toBe(true);
  });
});
