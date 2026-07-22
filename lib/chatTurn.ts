import type { ChatTurnRequest, ChatTurnResponse, FollowUpContext } from '@/lib/types';
import {
  buildInterviewSystemPrompt,
  buildFollowUpInterviewPrompt,
  parseInterviewTurn,
  applyGate,
  applyFollowUpGate,
} from '@/lib/interview';
import { callLlm } from '@/lib/llm';

/** 인터뷰 한 턴을 처리한다. 서버는 상태를 저장하지 않는다. */
export async function runChatTurn(
  req: ChatTurnRequest,
  opts?: { fetchImpl?: typeof fetch }
): Promise<ChatTurnResponse> {
  if (req.followUp) {
    return runFollowUpChatTurn(req, req.followUp, opts);
  }

  const system = buildInterviewSystemPrompt();
  // 대화 전체를 user 프롬프트로 직렬화(무상태). slots 현황도 모델에 제공.
  const convo = req.messages.map((m) => `${m.role === 'user' ? '교사' : '도우미'}: ${m.content}`).join('\n');
  const slotState = Object.entries(req.slots).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '(아직 없음)';
  const user = [
    `현재까지 분류된 유형: ${req.caseTypeId ?? '미정'}`,
    `현재까지 수집된 슬롯:\n${slotState}`,
    '',
    '대화 기록:',
    convo,
    '',
    '위 대화를 바탕으로 다음 턴 JSON 하나만 출력하라.',
  ].join('\n');

  const raw = await callLlm({ system, user, ai: req.ai, fetchImpl: opts?.fetchImpl, retryDelayMs: 0 });
  const turn = parseInterviewTurn(raw);
  const mergedSlots = { ...req.slots, ...turn.slotUpdates };
  const ready = applyGate(turn.readyToGenerate, mergedSlots, turn.caseTypeId ?? req.caseTypeId);
  return {
    assistantMessage: turn.assistantMessage,
    caseTypeId: turn.caseTypeId ?? req.caseTypeId,
    slotUpdates: turn.slotUpdates,
    readyToGenerate: ready,
  };
}

/** 후속 기록 인터뷰 턴. caseTypeId는 항상 원 사건 값(followUp.caseTypeId)으로 고정 반환한다. */
async function runFollowUpChatTurn(
  req: ChatTurnRequest,
  followUp: FollowUpContext,
  opts?: { fetchImpl?: typeof fetch }
): Promise<ChatTurnResponse> {
  const system = buildFollowUpInterviewPrompt(followUp);
  const convo = req.messages.map((m) => `${m.role === 'user' ? '교사' : '도우미'}: ${m.content}`).join('\n');
  const slotState = Object.entries(req.slots).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '(아직 없음)';
  const user = [
    `현재까지 수집된 후속 슬롯:\n${slotState}`,
    '',
    '대화 기록:',
    convo,
    '',
    '위 대화를 바탕으로 다음 턴 JSON 하나만 출력하라.',
  ].join('\n');

  const raw = await callLlm({ system, user, ai: req.ai, fetchImpl: opts?.fetchImpl, retryDelayMs: 0 });
  const turn = parseInterviewTurn(raw);
  const mergedSlots = { ...req.slots, ...turn.slotUpdates };
  const ready = applyFollowUpGate(turn.readyToGenerate, mergedSlots);
  return {
    assistantMessage: turn.assistantMessage,
    caseTypeId: followUp.caseTypeId,
    slotUpdates: turn.slotUpdates,
    readyToGenerate: ready,
  };
}
