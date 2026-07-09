import { describe, it, expect } from 'vitest';
import { initialChatState, withUserMessage, withTurnResponse } from '@/lib/chatState';

describe('chatState', () => {
  it('appends a user message immutably', () => {
    const s = withUserMessage(initialChatState, '학생이 떠들어요');
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]).toEqual({ role: 'user', content: '학생이 떠들어요' });
    expect(initialChatState.messages).toHaveLength(0);
  });

  it('merges slotUpdates and reflects caseType/ready from a turn response', () => {
    let s = withUserMessage(initialChatState, '수업 중 소란');
    s = withTurnResponse(s, { assistantMessage: '일시는요?', caseTypeId: 1, slotUpdates: { place: '교실' }, readyToGenerate: false });
    expect(s.messages.at(-1)).toEqual({ role: 'assistant', content: '일시는요?' });
    expect(s.slots.place).toBe('교실');
    expect(s.caseTypeId).toBe(1);
    expect(s.readyToGenerate).toBe(false);
    s = withTurnResponse(s, { assistantMessage: '준비됐습니다', caseTypeId: 1, slotUpdates: { datetime: '4교시' }, readyToGenerate: true });
    expect(s.slots).toMatchObject({ place: '교실', datetime: '4교시' });
    expect(s.readyToGenerate).toBe(true);
  });
});
