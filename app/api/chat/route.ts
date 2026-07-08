import { NextResponse } from 'next/server';
import type { ChatTurnRequest, ChatTurnResponse } from '@/lib/types';
import { buildInterviewSystemPrompt, parseInterviewTurn, applyGate } from '@/lib/interview';
import { callLlm, LlmError } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 인터뷰 한 턴을 처리한다. 서버는 상태를 저장하지 않는다. */
export async function runChatTurn(
  req: ChatTurnRequest,
  opts?: { fetchImpl?: typeof fetch }
): Promise<ChatTurnResponse> {
  const system = buildInterviewSystemPrompt(req.specialEd);
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

export async function POST(request: Request) {
  let body: ChatTurnRequest;
  try {
    body = (await request.json()) as ChatTurnRequest;
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  try {
    const res = await runChatTurn(body);
    return NextResponse.json(res);
  } catch (e) {
    // 요청 본문·키 로깅 금지.
    if (e instanceof LlmError) {
      return NextResponse.json({ error: `AI 오류(${e.status})`, status: e.status, retryAfterSec: e.retryAfterSec }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : '대화 처리 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
