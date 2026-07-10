import type { ChatMessage, ChatTurnResponse, CaseTypeId } from '@/lib/types';

export interface ChatState {
  messages: ChatMessage[];
  slots: Record<string, string>;
  caseTypeId: CaseTypeId | null;
  readyToGenerate: boolean;
}

export const initialChatState: ChatState = {
  messages: [],
  slots: {},
  caseTypeId: null,
  readyToGenerate: false,
};

export function withUserMessage(s: ChatState, text: string): ChatState {
  return { ...s, messages: [...s.messages, { role: 'user', content: text }], readyToGenerate: false };
}

export function withTurnResponse(s: ChatState, r: ChatTurnResponse): ChatState {
  return {
    ...s,
    messages: [...s.messages, { role: 'assistant', content: r.assistantMessage }],
    slots: { ...s.slots, ...r.slotUpdates },
    caseTypeId: r.caseTypeId ?? s.caseTypeId,
    readyToGenerate: r.readyToGenerate,
  };
}
