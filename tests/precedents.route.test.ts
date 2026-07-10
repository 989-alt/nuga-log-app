import { describe, it, expect } from 'vitest';
import { runPrecedents } from '@/lib/precedentsQuery';

function mcpMock(text: string): typeof fetch {
  return (async (url: string) =>
    new Response(JSON.stringify({ result: { content: [{ text }] } }), { status: 200 })) as any;
}

describe('runPrecedents', () => {
  it('returns precedents extracted from an extra-keyword search', async () => {
    const res = await runPrecedents(
      { caseTypeId: 6, slots: { behavior: '제지' }, specialEd: { isSpecialEd: false, disabilities: [] }, extraKeywords: ['정당행위'] },
      { fetchImpl: mcpMock('2020도5555 교사의 제지는 정당행위') }
    );
    expect(res.precedents.some((p) => p.caseNo === '2020도5555')).toBe(true);
  });

  it('never throws on MCP failure', async () => {
    const failing: typeof fetch = (async () => new Response('x', { status: 500 })) as any;
    const res = await runPrecedents(
      { caseTypeId: 1, slots: {}, specialEd: { isSpecialEd: false, disabilities: [] } },
      { fetchImpl: failing }
    );
    expect(res.precedents).toEqual([]);
  });
});
