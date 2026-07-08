import { describe, it, expect } from 'vitest';
import { retrieveBasis, extractCaseNumbers } from '@/lib/lawRetrieval';

function mockFetch(text: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ result: { content: [{ text }] } }), { status: 200 })) as unknown as typeof fetch;
}

describe('extractCaseNumbers', () => {
  it('finds supreme court style case numbers', () => {
    expect(extractCaseNumbers('대법원 2021도13926 및 2015도13488 참조')).toEqual(['2021도13926', '2015도13488']);
  });
  it('returns [] when none', () => {
    expect(extractCaseNumbers('판례 없음')).toEqual([]);
  });
});

describe('retrieveBasis', () => {
  it('always returns local grounding even when MCP fails', async () => {
    const failing: typeof fetch = (async () => new Response('x', { status: 500 })) as any;
    const r = await retrieveBasis({ caseTypeId: 6, keywords: ['제지'], specialEd: false, fetchImpl: failing, timeoutMs: 50 });
    expect(r.grounding).toContain('핵심 근거');
    expect(r.precedents).toEqual([]);
  });

  it('parses precedents from MCP search results', async () => {
    const r = await retrieveBasis({
      caseTypeId: 6,
      keywords: ['교사 제지 정당행위'],
      specialEd: false,
      fetchImpl: mockFetch('사건 2021도13926 교사의 제지는 정당행위'),
      timeoutMs: 50,
    });
    expect(r.precedents.some((p) => p.caseNo === '2021도13926')).toBe(true);
  });
});
