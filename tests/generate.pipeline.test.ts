import { describe, it, expect } from 'vitest';
import { runGenerate } from '@/lib/parseResult';
import type { GenerateRequest } from '@/lib/types';

// LLM 목: 순차 호출마다 다른 응답을 돌려준다(draft → verify).
function sequencedLlm(responses: string[]): typeof fetch {
  let i = 0;
  return (async (url: string) => {
    // MCP 호출(law endpoint)은 빈 결과로.
    if (typeof url === 'string' && url.includes('korean-law-mcp')) {
      return new Response(JSON.stringify({ result: { content: [{ text: '' }] } }), { status: 200 });
    }
    const body = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return new Response(JSON.stringify({ content: [{ type: 'text', text: body }] }), { status: 200 });
  }) as any;
}

const draft = JSON.stringify({
  body: '2026년 7월 8일 수요일 4교시 교실에서 본인이 소리를 지름. 교사가 주의를 주었고 본인은 잠시 조용해짐. 이후 관찰 예정임.',
  meta: { bases: '교원의 학생생활지도에 관한 고시', caseType: '일반 생활지도', charCount: '약 90자', guidanceStep: '주의', guardianNotice: '당일 통보', followUp: '재관찰' },
  teacherUnderstanding: ['고시: 주의 단계 적용'],
  safeGuidance: ['단계적으로 지도한다'],
  teacherMemo: ['통보 시각 기록'],
  legalProtection: [{ element: '구체 관찰사실', support: '소리 지름을 관찰로 기술', caseRefs: ['2021도13926'] }],
});
const verified = JSON.stringify({ pass: true, violations: [], missingElements: [], revisedBody: '2026년 7월 8일 수요일 4교시 교실에서 본인이 큰 소리를 냄. 교사가 주의 단계로 지도하였고 본인은 잠시 조용해진 뒤 관찰을 지속할 예정임.' });

const req: GenerateRequest = {
  caseTypeId: 1,
  slots: { datetime: '2026-07-08 수 4교시', place: '교실', behavior: '소리 지름', teacherUtterance: "'조용히'", studentUtterance: '침묵', guidanceStep: '주의', studentReaction: '잠시 조용', followUp: '재관찰' },
  specialEd: { isSpecialEd: false, disabilities: [] },
  ai: { mode: 'byok', provider: 'claude', apiKey: 'k', model: 'claude-haiku-4-5-20251001' },
};

describe('runGenerate pipeline', () => {
  it('runs draft then verification and returns the revised body + legalProtection', async () => {
    const res = await runGenerate(req, { fetchImpl: sequencedLlm([draft, verified]), retryDelayMs: 0 });
    expect(res.body).toContain('주의 단계');
    expect(res.legalProtection.length).toBeGreaterThan(0);
  });

  it('strips case numbers not in the allowed set from legalProtection/meta', async () => {
    const draftBad = draft.replace('2021도13926', '2099도0001');
    const res = await runGenerate(req, { fetchImpl: sequencedLlm([draftBad, verified]), retryDelayMs: 0 });
    const refs = res.legalProtection.flatMap((p) => p.caseRefs);
    expect(refs).not.toContain('2099도0001');
  });
});
