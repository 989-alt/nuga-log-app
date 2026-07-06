import { describe, it, expect, vi } from 'vitest';
import { callLlm, buildLadder, DEFAULT_MODELS, LlmError } from '@/lib/llm';

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
  it('free mode → [flash, flash-lite]', () => {
    expect(buildLadder({ mode: 'free' })).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('byok gemini with pro preferred → [pro, flash, flash-lite], deduped', () => {
    expect(buildLadder({ mode: 'byok', provider: 'gemini', apiKey: 'K', model: 'gemini-2.5-pro' }))
      .toEqual(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('byok gemini preferring flash does not duplicate flash', () => {
    expect(buildLadder({ mode: 'byok', provider: 'gemini', apiKey: 'K', model: 'gemini-2.5-flash' }))
      .toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('claude falls back to haiku', () => {
    expect(buildLadder({ mode: 'byok', provider: 'claude', apiKey: 'K', model: 'claude-opus-4-8' }))
      .toEqual(['claude-opus-4-8', 'claude-haiku-4-5-20251001']);
  });

  it('openai falls back to gpt-4o-mini', () => {
    expect(buildLadder({ mode: 'byok', provider: 'openai', apiKey: 'K', model: 'gpt-4o' }))
      .toEqual(['gpt-4o', 'gpt-4o-mini']);
  });
});
