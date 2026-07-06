import { NextResponse } from 'next/server';
import type { GenerateRequest } from '@/lib/types';
import { validateSlots } from '@/lib/validation';
import { runGenerate } from '@/lib/parseResult';
import { LlmError } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 제공자 오류 상태 코드를 교사가 이해할 수 있는 안내로 바꾼다. */
function messageForStatus(status: number, retryAfterSec?: number): string {
  if (status === 429) {
    const when = retryAfterSec ? `약 ${retryAfterSec}초 뒤` : '잠시 후';
    return `요청 한도(429)에 도달했습니다. 무료 등급 키는 분당 약 20회 제한이 있습니다. ${when} 다시 시도할 수 있습니다. 자주 쓰신다면 "생성 엔진"에서 gemini-2.5-flash-lite처럼 여유 있는 모델을 고르거나, 결제가 설정된 키를 사용해 주세요.`;
  }
  if (status === 401 || status === 403)
    return `API 키가 유효하지 않습니다(${status}). 키를 다시 확인해 주세요.`;
  if (status === 404)
    return '선택한 모델을 찾을 수 없습니다(404). "모델 목록 불러오기"에서 사용 가능한 모델을 골라 주세요.';
  if (status === 400)
    return '요청이 거부되었습니다(400). 모델명이 올바른지 확인해 주세요.';
  return `생성 제공자 오류가 발생했습니다(${status}). 잠시 후 다시 시도해 주세요.`;
}

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const missing = validateSlots(body.caseTypeId, body.slots ?? {});
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
