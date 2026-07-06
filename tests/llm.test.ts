import { describe, it, expect, vi } from 'vitest';
import { callLlm, DEFAULT_MODELS } from '@/lib/llm';

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
});
