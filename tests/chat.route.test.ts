import { describe, it, expect } from 'vitest';
import { runChatTurn } from '@/lib/chatTurn';
import type { ChatTurnRequest } from '@/lib/types';

function mockLlm(json: object): typeof fetch {
  // callLlm은 provider별 응답 형태를 파싱한다. claude 형태로 목킹.
  return (async () =>
    new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(json) }] }), { status: 200 })) as any;
}

const base: ChatTurnRequest = {
  messages: [{ role: 'user', content: '학생이 수업 중 계속 떠들어요' }],
  slots: {},
  caseTypeId: null,
  specialEd: { isSpecialEd: false, disabilities: [] },
  ai: { mode: 'byok', provider: 'claude', apiKey: 'k', model: 'claude-haiku-4-5-20251001' },
};

describe('runChatTurn', () => {
  it('returns the next question and does not allow generate when slots are empty', async () => {
    const res = await runChatTurn(
      { ...base },
      { fetchImpl: mockLlm({ assistantMessage: '일시와 장소는요?', caseTypeId: 1, slotUpdates: {}, readyToGenerate: true }) }
    );
    expect(res.assistantMessage).toContain('일시');
    expect(res.caseTypeId).toBe(1);
    // 모델이 readyToGenerate=true를 줬어도 게이트가 막는다.
    expect(res.readyToGenerate).toBe(false);
  });
});
