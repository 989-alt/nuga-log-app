import { describe, it, expect, vi } from 'vitest';
import { verifyLaws } from '@/lib/lawVerify';

function mockFetchOnce(text: string): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify({ result: { content: [{ type: 'text', text }] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  ) as unknown as typeof fetch;
}

describe('verifyLaws', () => {
  it('returns null for a non-high-risk type without calling fetch', async () => {
    const spy = vi.fn();
    const out = await verifyLaws(1, spy as unknown as typeof fetch);
    expect(out).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns a summary string for a high-risk type on success', async () => {
    const out = await verifyLaws(3, mockFetchOnce('학교폭력예방 및 대책에 관한 법률 [현행] 시행일 20260602'));
    expect(out).toContain('학교폭력예방');
    expect(out).toContain('20260602');
  });

  it('returns null (silent fallback) when fetch rejects', async () => {
    const failing = vi.fn(async () => { throw new Error('network'); }) as unknown as typeof fetch;
    const out = await verifyLaws(3, failing);
    expect(out).toBeNull();
  });

  it('returns null when the server responds non-OK', async () => {
    const bad = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const out = await verifyLaws(4, bad);
    expect(out).toBeNull();
  });
});
