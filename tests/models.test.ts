import { describe, it, expect, vi } from 'vitest';
import { listTextModels } from '@/lib/models';
import { LlmError } from '@/lib/llm';

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

describe('listTextModels', () => {
  it('gemini: keeps only generateContent models, strips the models/ prefix, drops embeddings', async () => {
    const spy = vi.fn(async () => jsonResponse({
      models: [
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/gemini-1.5-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        // generateContent 을 지원하지만 텍스트 산출물이 아닌 것들 → 제외돼야 함
        { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
      ],
    })) as unknown as typeof fetch;
    const out = await listTextModels('gemini', 'AIzaKEY', spy);
    expect(out).toEqual(['gemini-1.5-pro', 'gemini-2.5-flash']);
    // key goes in the query string, not logged anywhere
    expect((spy as any).mock.calls[0][0]).toContain('AIzaKEY');
  });

  it('openai: keeps chat models only (drops embeddings, audio, image, instruct)', async () => {
    const spy = vi.fn(async () => jsonResponse({
      data: [
        { id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'o3-mini' },
        { id: 'text-embedding-3-small' }, { id: 'whisper-1' }, { id: 'dall-e-3' },
        { id: 'gpt-3.5-turbo-instruct' }, { id: 'tts-1' },
      ],
    })) as unknown as typeof fetch;
    const out = await listTextModels('openai', 'sk-KEY', spy);
    expect(out).toEqual(['gpt-4o', 'gpt-4o-mini', 'o3-mini']);
  });

  it('claude: keeps claude-* ids in order', async () => {
    const spy = vi.fn(async () => jsonResponse({
      data: [
        { id: 'claude-sonnet-4-5', type: 'model' },
        { id: 'claude-haiku-4-5-20251001', type: 'model' },
        { id: 'not-a-model' },
      ],
    })) as unknown as typeof fetch;
    const out = await listTextModels('claude', 'sk-ant-KEY', spy);
    expect(out).toEqual(['claude-sonnet-4-5', 'claude-haiku-4-5-20251001']);
    const [, init] = (spy as any).mock.calls[0];
    expect((init.headers as any)['x-api-key']).toBe('sk-ant-KEY');
    expect((init.headers as any)['anthropic-version']).toBe('2023-06-01');
  });

  it('throws LlmError with the upstream status on an invalid key', async () => {
    const spy = vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401)) as unknown as typeof fetch;
    let err: any;
    try { await listTextModels('gemini', 'bad', spy); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(401);
  });
});
