import { describe, it, expect } from 'vitest';
import { runGenerate } from '@/lib/parseResult';
import type { GenerateRequest } from '@/lib/types';

// LLM 목: korean-law-mcp 호출은 최소 판례 문자열로, 이후 순번대로 draft → verify 응답.
// (tests/generate.pipeline.test.ts의 sequencedLlm 패턴과 동일한 모양)
function llm(draftBody: string, meta: Record<string, string>, legalProtection: any[], verifiedBody: string): typeof fetch {
  let i = 0;
  const draft = JSON.stringify({
    body: draftBody,
    meta,
    teacherUnderstanding: ['고시: 해당 단계 적용'],
    safeGuidance: ['원인을 관찰한다', '대체행동을 안내한다'],
    teacherMemo: ['통보 시각 기록'],
    legalProtection,
  });
  const verify = JSON.stringify({ pass: true, violations: [], missingElements: [], revisedBody: verifiedBody });
  return (async (url: string) => {
    if (typeof url === 'string' && url.includes('korean-law-mcp')) {
      return new Response(JSON.stringify({ result: { content: [{ text: '2021도13926 정당한 지도' }] } }), { status: 200 });
    }
    const body = i++ === 0 ? draft : verify;
    return new Response(JSON.stringify({ content: [{ type: 'text', text: body }] }), { status: 200 });
  }) as any;
}

// 사안 1: 의복정리 주의 (2026-07-08)
const clothingCase: GenerateRequest = {
  caseTypeId: 1,
  slots: {
    datetime: '2026-07-08 수 3교시',
    place: '교실',
    behavior: '상의를 목 위로 올려 배와 가슴이 드러나는 행동, 약 4회 관찰됨',
    teacherUtterance: '옷을 내리자',
    studentUtterance: '네',
    guidanceStep: '주의',
    studentReaction: '잠시 내렸다가 다시 반복함',
    followUp: '지속 관찰',
  },
  specialEd: { isSpecialEd: true, disabilities: ['autism'] },
  ai: { mode: 'byok', provider: 'claude', apiKey: 'k', model: 'claude-haiku-4-5-20251001' },
};

const clothingBody =
  "2026년 7월 8일 수요일 3교시 교실에서 본인이 상의를 목 위로 올려 배와 가슴이 드러나는 행동이 약 4회 관찰됨. 교사가 '옷을 내리자'라고 안내하자 본인은 '네'라고 답하며 잠시 내렸으나 다시 반복함. 주의 단계로 지도하였으며 지속 관찰할 예정임.";

const clothingMeta = {
  bases: '교원의 학생생활지도에 관한 고시(교육부고시 제2026-3호), 초·중등교육법 제20조의2',
  caseType: '일반 생활지도',
  charCount: '약 130자',
  guidanceStep: '주의',
  guardianNotice: '당일 통보 예정',
  followUp: '지속 관찰',
};

// 사안 2: 수업중 제지·발언 지도 (2026-07-08)
const disruptionCase: GenerateRequest = {
  caseTypeId: 1,
  slots: {
    datetime: '2026-07-08 수 4교시',
    place: '교실',
    behavior: '수업 중 허락 없이 큰 소리로 발언하며 수업을 방해함, 약 3회',
    teacherUtterance: '지금은 손 들고 말하는 시간이야',
    studentUtterance: '아 왜요',
    guidanceStep: '조언',
    studentReaction: '잠시 멈췄다가 다시 큰 소리로 발언함',
    followUp: '자리 배치 재검토',
  },
  specialEd: { isSpecialEd: false, disabilities: [] },
  ai: { mode: 'byok', provider: 'claude', apiKey: 'k', model: 'claude-haiku-4-5-20251001' },
};

const disruptionBody =
  "2026년 7월 8일 수요일 4교시 교실에서 본인이 허락 없이 큰 소리로 발언하여 수업을 방해하는 행동이 약 3회 관찰됨. 교사가 '지금은 손 들고 말하는 시간이야'라고 안내하자 본인은 '아 왜요'라고 답하며 잠시 멈췄으나 다시 큰 소리로 발언함. 조언 단계로 지도하였으며 자리 배치를 재검토할 예정임.";

const disruptionMeta = {
  bases: '교원의 학생생활지도에 관한 고시(교육부고시 제2026-3호), 초·중등교육법 제20조의2',
  caseType: '일반 생활지도',
  charCount: '약 140자',
  guidanceStep: '조언',
  guardianNotice: '미통보 (경미)',
  followUp: '자리 배치 재검토',
};

describe('regression: 2026-07-08 real cases', () => {
  it('clothing case: body uses single quotes only, no law-assertion wording, hallucinated case ref stripped', async () => {
    const fetchImpl = llm(
      clothingBody,
      clothingMeta,
      [{ element: '비례성', support: '반복 상황에서 안내 수준의 최소 개입', caseRefs: ['2021도13926', '2099도0001'] }],
      clothingBody
    );
    const res = await runGenerate(clothingCase, { fetchImpl, retryDelayMs: 0 });

    // 본문 규칙: 작은따옴표만 사용(큰따옴표 금지)
    expect(res.body).not.toContain('"');
    expect(res.body).toContain("'");
    // 본문 규칙: 법률 단정 표현 금지
    expect(res.body).not.toContain('해당함');
    expect(res.body).not.toContain('죄');
    // 평어 종결(~함/~임)로 끝남
    expect(res.body.trim()).toMatch(/(함|임)\.$/);
    // 환각 판례 사건번호는 제거되고, 실제 검색된 핵심 판례는 유지됨
    const refs = res.legalProtection.flatMap((p) => p.caseRefs);
    expect(refs).not.toContain('2099도0001');
    expect(refs).toContain('2021도13926');
  });

  it('in-class disruption case: body uses single quotes only, no law-assertion wording, hallucinated case ref stripped', async () => {
    const fetchImpl = llm(
      disruptionBody,
      disruptionMeta,
      [{ element: '비례성', support: '경미한 수업 방해에 대한 최소 개입', caseRefs: ['2021도13926', '2099도0002'] }],
      disruptionBody
    );
    const res = await runGenerate(disruptionCase, { fetchImpl, retryDelayMs: 0 });

    expect(res.body).not.toContain('"');
    expect(res.body).toContain("'");
    expect(res.body).not.toContain('해당함');
    expect(res.body).not.toContain('죄');
    expect(res.body.trim()).toMatch(/(함|임)\.$/);
    const refs = res.legalProtection.flatMap((p) => p.caseRefs);
    expect(refs).not.toContain('2099도0002');
    expect(refs).toContain('2021도13926');
  });
});
