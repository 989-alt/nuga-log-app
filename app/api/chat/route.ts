import { NextResponse } from 'next/server';
import type { ChatTurnRequest } from '@/lib/types';
import { runChatTurn } from '@/lib/chatTurn';
import { LlmError } from '@/lib/llm';
import { messageForStatus } from '@/lib/apiErrors';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
      return NextResponse.json(
        { error: messageForStatus(e.status, e.retryAfterSec), status: e.status, retryAfterSec: e.retryAfterSec },
        { status: e.status }
      );
    }
    const message = e instanceof Error ? e.message : '대화 처리 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
