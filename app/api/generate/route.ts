import { NextResponse } from 'next/server';
import type { GenerateRequest } from '@/lib/types';
import { validateSlots } from '@/lib/validation';
import { validateFollowUpSlots } from '@/lib/followUp';
import { runGenerate } from '@/lib/parseResult';
import { LlmError } from '@/lib/llm';
import { messageForStatus } from '@/lib/apiErrors';

export const runtime = 'nodejs';
// 초안+검증 루프가 LLM을 직렬 다회 호출하므로 느린 모델(pro급)에서 60초를 넘길 수 있다.
// Fluid compute의 Hobby 상한(300초)까지 허용해 게이트웨이 504를 방지한다.
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  // 후속 기록 요청은 원 사건 유형의 슬롯이 아니라 고정된 후속 슬롯(FOLLOWUP_SLOTS)으로 검증한다.
  const missing = body.followUp
    ? validateFollowUpSlots(body.slots ?? {})
    : validateSlots(body.caseTypeId, body.slots ?? {});
  if (missing.length > 0) {
    return NextResponse.json({ error: '필수 항목이 비어 있습니다.', missing }, { status: 400 });
  }

  try {
    const result = await runGenerate(body, { geminiKey: process.env.GEMINI_API_KEY });
    return NextResponse.json(result);
  } catch (e) {
    // Do NOT log the request body (contains student personal data) or API keys.
    if (e instanceof LlmError) {
      return NextResponse.json(
        { error: messageForStatus(e.status, e.retryAfterSec), status: e.status, retryAfterSec: e.retryAfterSec },
        { status: e.status }
      );
    }
    const message = e instanceof Error ? e.message : '생성 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
