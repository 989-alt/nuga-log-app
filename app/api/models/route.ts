import { NextResponse } from 'next/server';
import type { AiProvider } from '@/lib/types';
import { listTextModels } from '@/lib/models';
import { LlmError } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 20;

const PROVIDERS: AiProvider[] = ['gemini', 'claude', 'openai'];

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return `API 키가 유효하지 않습니다(${status}). 키를 다시 확인해 주세요.`;
  if (status === 429) return '요청 한도(429)에 도달했습니다. 잠시 후 다시 시도해 주세요.';
  return `모델 목록을 불러오지 못했습니다(${status}).`;
}

export async function POST(request: Request) {
  let body: { provider?: string; apiKey?: string };
  try {
    body = (await request.json()) as { provider?: string; apiKey?: string };
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const provider = body.provider as AiProvider;
  const apiKey = (body.apiKey ?? '').trim();
  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: '지원하지 않는 제공자입니다.' }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: 'API 키를 먼저 입력해 주세요.' }, { status: 400 });
  }

  try {
    const models = await listTextModels(provider, apiKey);
    return NextResponse.json({ models });
  } catch (e) {
    // Never log the API key or response body.
    if (e instanceof LlmError) {
      return NextResponse.json({ error: messageForStatus(e.status) }, { status: e.status });
    }
    return NextResponse.json({ error: '모델 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}
