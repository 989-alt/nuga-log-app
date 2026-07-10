import { NextResponse } from 'next/server';
import type { GenerateRequest } from '@/lib/types';
import { validateSlots } from '@/lib/validation';
import { runGenerate } from '@/lib/parseResult';
import { LlmError } from '@/lib/llm';
import { messageForStatus } from '@/lib/apiErrors';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
