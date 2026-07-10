import { describe, it, expect, vi, afterEach } from 'vitest';
import { callLlm, LlmError } from '@/lib/llm';

// Server-side wait cap: fetchWithRetry must not hold a serverless function open
// waiting on a long provider-suggested backoff (Vercel maxDuration=60, and
// /api/generate calls the LLM multiple times serially). If the suggested wait
// exceeds 8000ms, it must throw immediately (carrying retryAfterSec) instead of
// sleeping in-process. At/below 8000ms it keeps the existing single retry.

function geminiResponse(text: string) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

describe('fetchWithRetry wait cap', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws immediately on a long Retry-After header (30s) without retrying', async () => {
    const spy = vi.fn(async () =>
      new Response('rate', { status: 429, headers: { 'retry-after': '30' } })
    ) as unknown as typeof fetch;
    let err: any;
    try {
      await callLlm({ system: 's', user: 'u', ai: { mode: 'free' }, geminiKey: 'K', fetchImpl: spy });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(429);
    expect(err.retryAfterSec).toBe(30);
    expect((spy as any).mock.calls.length).toBe(1);
  });

  it('retries once after a short Retry-After header (3s) then succeeds', async () => {
    vi.useFakeTimers();
    let n = 0;
    const spy = vi.fn(async () => {
      n += 1;
      if (n === 1) return new Response('rate', { status: 429, headers: { 'retry-after': '3' } });
      return geminiResponse('재시도성공');
    }) as unknown as typeof fetch;
    const promise = callLlm({ system: 's', user: 'u', ai: { mode: 'free' }, geminiKey: 'K', fetchImpl: spy });
    await vi.advanceTimersByTimeAsync(3000);
    const out = await promise;
    expect(out).toBe('재시도성공');
    expect((spy as any).mock.calls.length).toBe(2);
  });

  it('caps the in-process wait at 8000ms: 7000ms (no header hint) still retries', async () => {
    vi.useFakeTimers();
    let n = 0;
    const spy = vi.fn(async () => {
      n += 1;
      return n === 1 ? new Response('rate', { status: 503 }) : geminiResponse('복구성공');
    }) as unknown as typeof fetch;
    const promise = callLlm({
      system: 's', user: 'u', ai: { mode: 'free' }, geminiKey: 'K', fetchImpl: spy, retryDelayMs: 7000,
    });
    await vi.advanceTimersByTimeAsync(7000);
    const out = await promise;
    expect(out).toBe('복구성공');
    expect((spy as any).mock.calls.length).toBe(2);
  });

  it('above the 8000ms cap (9000ms, no header hint) throws immediately instead of sleeping', async () => {
    const spy = vi.fn(async () => new Response('rate', { status: 503 })) as unknown as typeof fetch;
    let err: any;
    try {
      await callLlm({
        system: 's', user: 'u', ai: { mode: 'free' }, geminiKey: 'K', fetchImpl: spy, retryDelayMs: 9000,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(503);
    expect((spy as any).mock.calls.length).toBe(1);
  });
});
