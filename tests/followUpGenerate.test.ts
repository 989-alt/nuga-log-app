import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildFollowUpUserPrompt, buildSystemPrompt } from '@/lib/prompt';
import { runGenerate } from '@/lib/parseResult';
import { POST } from '@/app/api/generate/route';
import type { FollowUpContext, GenerateRequest } from '@/lib/types';

const followUp: FollowUpContext = {
  parentId: 'abc123',
  parentDate: '2026-07-08',
  caseTypeId: 1,
  parentBody: '2026년 7월 8일 수요일 4교시 교실에서 본인이 소리를 지름. 교사가 주의를 주었고 본인은 잠시 조용해짐.',
};

const followUpSlots = {
  followUpAction: '보호자 통보',
  datetime: '2026-07-09 15시',
  counterpart: '보호자(모)',
  outcome: '통보 내용을 전달하였고 보호자가 가정 지도를 약속함',
  nextStep: '2주간 재관찰',
};

describe('buildFollowUpUserPrompt', () => {
  const p = buildFollowUpUserPrompt({
    followUp,
    slots: followUpSlots,
    basis: { grounding: '[근거자료] 초·중등교육법 제20조의2', precedents: [{ caseNo: '2021도13926', gist: '지도행위 정당성 판단기준' }] },
  });

  it('presents the parent record (date + full body)', () => {
    expect(p).toContain(followUp.parentDate);
    expect(p).toContain(followUp.parentBody);
  });

  it('lists the follow-up slot values by label', () => {
    expect(p).toContain('보호자 통보');
    expect(p).toContain('보호자(모)');
    expect(p).toContain('통보 내용을 전달하였고 보호자가 가정 지도를 약속함');
    expect(p).toContain('2주간 재관찰');
  });

  it('instructs a one-clause reference to the original case, not a retelling', () => {
    expect(p).toContain('7월 8일');
    expect(p).toContain('후속 조치로서');
    expect(p).toContain('재서술');
  });

  it('instructs the meta.caseType literal format for follow-up records', () => {
    expect(p).toContain('『일반 생활지도 — 조언·주의 단계』 후속 기록');
  });

  it('carries forward the searched precedent for caseRefs guidance', () => {
    expect(p).toContain('2021도13926');
  });
});

describe('buildSystemPrompt reuse', () => {
  it('is the same system prompt builder used for regular generation (no follow-up variant)', () => {
    // buildFollowUpUserPrompt only builds the user turn; the system prompt is unchanged.
    expect(typeof buildSystemPrompt).toBe('function');
    expect(buildSystemPrompt().length).toBeGreaterThan(0);
  });
});

// --- mock LLM + mock MCP for runGenerate follow-up path ---
function isMcp(url: unknown): boolean {
  return String(url).includes('korean-law-mcp');
}
function mcpEmpty(): Response {
  return new Response(JSON.stringify({ result: { content: [{ text: '' }] } }), { status: 200 });
}
function claudeEnv(text: string): Response {
  return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });
}

const followUpDraft = JSON.stringify({
  body: '7월 8일 기록된 일반 생활지도 사안의 후속 조치로서 교사가 2026년 7월 9일 15시 보호자에게 전화로 통보하였고 보호자는 가정 지도를 약속함. 향후 2주간 재관찰할 예정임.',
  meta: { bases: '초·중등교육법 제20조의2', caseType: '『일반 생활지도』 후속 기록', charCount: '약 90자', guidanceStep: '주의', guardianNotice: '2026-07-09 15시 전화 통보', followUp: '2주간 재관찰' },
  teacherUnderstanding: ['보호자 통보 의무 이행'],
  safeGuidance: ['통보 시각과 반응을 기록으로 남긴다'],
  teacherMemo: ['통화 기록 보관'],
  legalProtection: [{ element: '후속 조치', support: '보호자 통보 완료', caseRefs: ['2021도13926'] }],
  actionItems: [],
});
const followUpVerified = JSON.stringify({ pass: true, violations: [], missingElements: [], revisedBody: '' });

function followUpPipeline(draftText: string, verifyText: string): typeof fetch {
  let n = 0;
  return (async (url: string) => {
    if (isMcp(url)) return mcpEmpty();
    n += 1;
    return claudeEnv(n === 1 ? draftText : verifyText);
  }) as any;
}

const followUpReq: GenerateRequest = {
  caseTypeId: 1,
  slots: followUpSlots,
  ai: { mode: 'byok', provider: 'claude', apiKey: 'k', model: 'claude-haiku-4-5-20251001' },
  followUp,
};

describe('runGenerate — follow-up path', () => {
  it('uses the follow-up prompt/search and returns a parsed result referencing the parent case', async () => {
    const res = await runGenerate(followUpReq, { fetchImpl: followUpPipeline(followUpDraft, followUpVerified), retryDelayMs: 0 });
    expect(res.body).toContain('후속 조치로서');
    expect(res.meta.caseType).toBe('『일반 생활지도』 후속 기록');
    expect(res.legalProtection[0].caseRefs).toContain('2021도13926');
  });

  it('strips a hallucinated case number not in the search-allowed set', async () => {
    const draftBad = followUpDraft.replace('2021도13926', '2099도0001');
    const res = await runGenerate(followUpReq, { fetchImpl: followUpPipeline(draftBad, followUpVerified), retryDelayMs: 0 });
    const refs = res.legalProtection.flatMap((p) => p.caseRefs);
    expect(refs).not.toContain('2099도0001');
  });

  it('throws when required follow-up slots are missing (validateFollowUpSlots gate)', async () => {
    const reqMissing: GenerateRequest = { ...followUpReq, slots: { followUpAction: '보호자 통보' } };
    await expect(
      runGenerate(reqMissing, { fetchImpl: followUpPipeline(followUpDraft, followUpVerified), retryDelayMs: 0 })
    ).rejects.toThrow('필수 항목이 비어 있습니다');
  });
});

// --- route branch: validateFollowUpSlots instead of validateSlots when body.followUp present ---
function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/generate — follow-up validation branch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates against follow-up slots (not the parent case-type slots) when body.followUp is present', async () => {
    // caseTypeId 1's own required slots (datetime/place/behavior/...) are all blank here,
    // but that must NOT trigger the regular validateSlots error — only follow-up slots matter.
    const req = { caseTypeId: 1, slots: {}, ai: { mode: 'free' }, followUp };
    const res = await POST(makeReq(req));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.missing).toContain('followUpAction');
    expect(json.missing).not.toContain('place');
  });

  it('passes through to generation once required follow-up slots are filled', async () => {
    // Route wires runGenerate() to the real global fetch (no fetchImpl injection point).
    // Stub global fetch so retrieveBasis()'s law-MCP call and the LLM call both resolve
    // instantly instead of hitting the network — we only need to prove the request cleared
    // the follow-up validation branch (a 400 there would short-circuit before runGenerate
    // is ever called), not exercise the full generation pipeline again.
    vi.stubGlobal('fetch', followUpPipeline(followUpDraft, followUpVerified));
    const req = { ...followUpReq };
    const res = await POST(makeReq(req));
    expect(res.status).not.toBe(400);
  });
});
