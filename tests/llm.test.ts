import { describe, it, expect, vi } from 'vitest';
import { callLlm, callLlmLadder, buildLadder, DEFAULT_MODELS, LlmError } from '@/lib/llm';

function geminiResponse(text: string) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

describe('callLlm', () => {
  it('free mode calls Gemini with the server key and returns text', async () => {
    const spy = vi.fn(async () => geminiResponse('결과본문')) as unknown as typeof fetch;
    const out = await callLlm({
      system: 's', user: 'u',
      ai: { mode: 'free' },
      fetchImpl: spy, geminiKey: 'SERVER_KEY',
    });
    expect(out).toBe('결과본문');
    const url = (spy as any).mock.calls[0][0] as string;
    expect(url).toContain(DEFAULT_MODELS.gemini);
    expect(url).toContain('SERVER_KEY');
  });

  it('byok claude calls the anthropic endpoint with the user key', async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: 'text', text: '클로드결과' }] }), { status: 200 })
    ) as unknown as typeof fetch;
    const out = await callLlm({
      system: 's', user: 'u',
      ai: { mode: 'byok', provider: 'claude', apiKey: 'USER_KEY' },
      fetchImpl: spy,
    });
    expect(out).toBe('클로드결과');
    const [url, init] = (spy as any).mock.calls[0];
    expect(url).toContain('api.anthropic.com');
    expect((init.headers as any)['x-api-key']).toBe('USER_KEY');
  });

  it('throws when a byok key is missing', async () => {
    await expect(
      callLlm({ system: 's', user: 'u', ai: { mode: 'byok', provider: 'openai' } })
    ).rejects.toThrow('AI 키가 없습니다');
  });

  it('free mode throws when no server key is configured', async () => {
    await expect(
      callLlm({ system: 's', user: 'u', ai: { mode: 'free' }, geminiKey: '' })
    ).rejects.toThrow('AI 키가 없습니다');
  });

  it('retries once on 429 then succeeds', async () => {
    let n = 0;
    const spy = vi.fn(async () => {
      n += 1;
      return n === 1 ? new Response('rate', { status: 429 }) : geminiResponse('재시도성공');
    }) as unknown as typeof fetch;
    const out = await callLlm({ system: 's', user: 'u', ai: { mode: 'free' }, geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0 });
    expect(out).toBe('재시도성공');
    expect((spy as any).mock.calls.length).toBe(2);
  });

  it('throws LlmError carrying the upstream status on persistent 429', async () => {
    const spy = vi.fn(async () => new Response('rate', { status: 429 })) as unknown as typeof fetch;
    let err: any;
    try {
      await callLlm({ system: 's', user: 'u', ai: { mode: 'free' }, geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0 });
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(429);
    // one initial + one retry, then give up
    expect((spy as any).mock.calls.length).toBe(2);
  });

  it('surfaces retryAfterSec from a long Gemini wait without holding the server open', async () => {
    const spy = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 429, message: 'Quota exceeded. Please retry in 25.9s' } }), { status: 429 })
    ) as unknown as typeof fetch;
    let err: any;
    try {
      await callLlm({ system: 's', user: 'u', ai: { mode: 'free' }, geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0 });
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBe(26); // ceil(25.9)
    expect((spy as any).mock.calls.length).toBe(1); // long wait → handed to client, not retried in-process
  });

  it('maps thinkingLevel off to thinkingBudget 0 in the Gemini request', async () => {
    const spy = vi.fn(async () => geminiResponse('ok')) as unknown as typeof fetch;
    await callLlm({
      system: 's', user: 'u',
      ai: { mode: 'free', thinkingLevel: 'off' },
      geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0,
    });
    const body = JSON.parse((spy as any).mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });

  it('omits thinkingConfig when thinkingLevel is dynamic or unset', async () => {
    const spy = vi.fn(async () => geminiResponse('ok')) as unknown as typeof fetch;
    await callLlm({
      system: 's', user: 'u',
      ai: { mode: 'free', thinkingLevel: 'dynamic' },
      geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0,
    });
    const body = JSON.parse((spy as any).mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });
});

describe('buildLadder', () => {
  it('free mode keeps the safety-net ladder → [flash, flash-lite]', () => {
    expect(buildLadder({ mode: 'free' })).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  // 사용자가 '내 키' 모드에서 모델을 명시적으로 고르면 조용한 강등 없이 그 모델만 사용한다.
  it('byok with an explicit gemini model honors it, no downgrade → [pro] only', () => {
    expect(buildLadder({ mode: 'byok', provider: 'gemini', apiKey: 'K', model: 'gemini-2.5-pro' }))
      .toEqual(['gemini-2.5-pro']);
  });

  it('byok with an explicit flash does not append flash-lite → [flash] only', () => {
    expect(buildLadder({ mode: 'byok', provider: 'gemini', apiKey: 'K', model: 'gemini-2.5-flash' }))
      .toEqual(['gemini-2.5-flash']);
  });

  it('byok claude with an explicit model honors it → [opus] only', () => {
    expect(buildLadder({ mode: 'byok', provider: 'claude', apiKey: 'K', model: 'claude-opus-4-8' }))
      .toEqual(['claude-opus-4-8']);
  });

  it('byok openai with an explicit model honors it → [gpt-4o] only', () => {
    expect(buildLadder({ mode: 'byok', provider: 'openai', apiKey: 'K', model: 'gpt-4o' }))
      .toEqual(['gpt-4o']);
  });

  // 모델을 비워 기본값에 맡긴 경우(명시 선택 아님)는 안전망 사다리를 유지한다.
  it('byok gemini with no explicit model keeps the ladder', () => {
    expect(buildLadder({ mode: 'byok', provider: 'gemini', apiKey: 'K', model: '' }))
      .toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('byok gemini with a whitespace-only model is treated as unset → ladder', () => {
    expect(buildLadder({ mode: 'byok', provider: 'gemini', apiKey: 'K', model: '   ' }))
      .toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('byok openai with no explicit model keeps the ladder', () => {
    expect(buildLadder({ mode: 'byok', provider: 'openai', apiKey: 'K', model: '' }))
      .toEqual(['gpt-4o-mini']);
  });
});

describe('callLlmLadder', () => {
  it('falls back to the next model on 429 and reports usedModel', async () => {
    const spy = vi.fn(async (url: string) => {
      return String(url).includes('gemini-2.5-flash-lite')
        ? geminiResponse('lite결과')
        : new Response('rate', { status: 429 });
    }) as unknown as typeof fetch;
    const out = await callLlmLadder({
      system: 's', user: 'u', ai: { mode: 'free' },
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
      geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0,
    });
    expect(out.text).toBe('lite결과');
    expect(out.usedModel).toBe('gemini-2.5-flash-lite');
  });

  it('returns the first model when it succeeds', async () => {
    const spy = vi.fn(async () => geminiResponse('flash결과')) as unknown as typeof fetch;
    const out = await callLlmLadder({
      system: 's', user: 'u', ai: { mode: 'free' },
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
      geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0,
    });
    expect(out.usedModel).toBe('gemini-2.5-flash');
  });

  it('throws LlmError when every rung is rate-limited', async () => {
    const spy = vi.fn(async () => new Response('rate', { status: 429 })) as unknown as typeof fetch;
    let err: any;
    try {
      await callLlmLadder({
        system: 's', user: 'u', ai: { mode: 'free' },
        models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
        geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0,
      });
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(429);
  });

  // 핵심 회귀: 명시 선택 모델은 429여도 flash-lite로 강등하지 않고 위로 던져
  // 클라이언트가 같은 모델로 대기·재시도하게 한다.
  it('an explicit-model ladder does NOT degrade to flash-lite on 429', async () => {
    const ai = { mode: 'byok', provider: 'gemini', apiKey: 'K', model: 'gemini-2.5-flash' } as const;
    const models = buildLadder(ai);
    expect(models).toEqual(['gemini-2.5-flash']);
    const spy = vi.fn(async () => new Response('rate', { status: 429 })) as unknown as typeof fetch;
    let err: any;
    try {
      await callLlmLadder({ system: 's', user: 'u', ai, models, fetchImpl: spy, retryDelayMs: 0 });
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(429);
    const urls = (spy as any).mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.every((u: string) => u.includes('gemini-2.5-flash') && !u.includes('flash-lite'))).toBe(true);
  });
});
