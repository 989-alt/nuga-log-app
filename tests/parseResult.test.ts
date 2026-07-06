import { describe, it, expect, vi } from 'vitest';
import { parseModelJson, runGenerate } from '@/lib/parseResult';
import type { GenerateRequest } from '@/lib/types';

describe('parseModelJson', () => {
  it('parses a bare JSON object', () => {
    const r = parseModelJson('{"body":"x","meta":{"bases":"b","caseType":"c","charCount":"약 10자","guidanceStep":"주의","guardianNotice":"-","followUp":"-"},"teacherUnderstanding":[],"safeGuidance":[],"teacherMemo":[]}');
    expect(r.body).toBe('x');
  });

  it('strips code fences and surrounding prose', () => {
    const r = parseModelJson('설명입니다\n```json\n{"body":"y","meta":{"bases":"b","caseType":"c","charCount":"약 10자","guidanceStep":"주의","guardianNotice":"-","followUp":"-"},"teacherUnderstanding":[],"safeGuidance":[],"teacherMemo":[]}\n```');
    expect(r.body).toBe('y');
  });

  it('throws when no object present', () => {
    expect(() => parseModelJson('no json here')).toThrow('AI 응답을 해석하지 못했습니다');
  });
});

describe('runGenerate', () => {
  const baseReq: GenerateRequest = {
    caseTypeId: 1,
    slots: {
      datetime: '2026.5.13.(수) 3교시', place: '교실', behavior: '필통을 떨어뜨림',
      teacherUtterance: '무슨 일이니', studentUtterance: '장난이었어요',
      guidanceStep: '주의', studentReaction: '사과함', followUp: '1주 재관찰',
    },
    isSpecialEd: false,
    ai: { mode: 'free' },
  };

  function geminiJson(obj: unknown): typeof fetch {
    return vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 })
    ) as unknown as typeof fetch;
  }

  const cleanResult = {
    body: '본인이 필통을 떨어뜨림.', meta: { bases: '초·중등교육법 제20조의2', caseType: '일반 생활지도', charCount: '약 30자', guidanceStep: '주의', guardianNotice: '-', followUp: '1주 재관찰' },
    teacherUnderstanding: ['조항 풀이'], safeGuidance: ['단계적 지도'], teacherMemo: ['목격자 확인'],
  };

  it('returns a parsed result on the happy path', async () => {
    const out = await runGenerate(baseReq, { fetchImpl: geminiJson(cleanResult), geminiKey: 'K' });
    expect(out.body).toContain('필통');
    expect(out.warnings).toEqual([]);
  });

  it('rejects when required slots are missing', async () => {
    await expect(
      runGenerate({ ...baseReq, slots: { datetime: '' } }, { geminiKey: 'K' })
    ).rejects.toThrow('필수 항목');
  });

  it('applies conversions and adds a warning when the body has a prohibited phrase', async () => {
    const dirty = { ...cleanResult, body: '보호자 발언은 모욕죄 성립임.' };
    // Model returns the dirty body twice (initial + regenerate); conversion still cleans it and warns.
    const out = await runGenerate(baseReq, { fetchImpl: geminiJson(dirty), geminiKey: 'K' });
    expect(out.body).not.toContain('모욕죄 성립');
    expect(out.warnings.length).toBeGreaterThan(0);
  });

  it('applies conversions and adds a warning when meta.bases has a prohibited phrase', async () => {
    const dirty = { ...cleanResult, meta: { ...cleanResult.meta, bases: '보호자 발언은 모욕죄 성립임.' } };
    // Model returns the dirty meta.bases twice (initial + regenerate); conversion still cleans it and warns.
    const out = await runGenerate(baseReq, { fetchImpl: geminiJson(dirty), geminiKey: 'K' });
    expect(out.meta.bases).not.toContain('모욕죄 성립');
    expect(out.warnings.length).toBeGreaterThan(0);
  });
});

function resultJson(body: string) {
  return JSON.stringify({
    body,
    meta: { bases: 'b', caseType: '일반 생활지도', charCount: '약 100자', guidanceStep: '주의', guardianNotice: '해당 없음', followUp: 'f' },
    teacherUnderstanding: ['u1'],
    safeGuidance: ['s1'],
    teacherMemo: ['m1'],
  });
}
function gem(text: string, status = 200) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status });
}
const baseReq2: GenerateRequest = {
  caseTypeId: 1,
  slots: { datetime: '2026.7.6.', place: '교실', behavior: '떠듦', teacherUtterance: '조용히', studentUtterance: '네', guidanceStep: '주의', studentReaction: '조용', followUp: '관찰' },
  isSpecialEd: false,
  ai: { mode: 'free' },
};

describe('runGenerate — ladder + refine', () => {
  it('single pass returns the model result and usedModel', async () => {
    const fetchImpl = vi.fn(async () => gem(resultJson('초안본문'))) as unknown as typeof fetch;
    const out = await runGenerate(baseReq2, { fetchImpl, geminiKey: 'K' });
    expect(out.body).toBe('초안본문');
    expect(out.usedModel).toBe('gemini-2.5-flash');
    expect(out.refined).toBe(false);
  });

  it('refine mode makes a second call and returns the refined body', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => { n += 1; return gem(resultJson(n === 1 ? '초안' : '정밀본문')); }) as unknown as typeof fetch;
    const out = await runGenerate({ ...baseReq2, refineMode: true }, { fetchImpl, geminiKey: 'K' });
    expect(out.body).toBe('정밀본문');
    expect(out.refined).toBe(true);
    expect(n).toBe(2);
  });

  it('refine failure falls back to the draft with a warning', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => { n += 1; return n === 1 ? gem(resultJson('초안')) : new Response('rate', { status: 429 }); }) as unknown as typeof fetch;
    const out = await runGenerate({ ...baseReq2, refineMode: true }, { fetchImpl, geminiKey: 'K', retryDelayMs: 0 });
    expect(out.body).toBe('초안');
    expect(out.refined).toBe(false);
    expect(out.warnings.some((w) => w.includes('정밀'))).toBe(true);
  });

  it('sets fallbackNote when the preferred model is degraded', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      String(url).includes('flash-lite') ? gem(resultJson('lite본문')) : new Response('rate', { status: 429 })
    ) as unknown as typeof fetch;
    const out = await runGenerate(baseReq2, { fetchImpl, geminiKey: 'K', retryDelayMs: 0 });
    expect(out.usedModel).toBe('gemini-2.5-flash-lite');
    expect(out.fallbackNote).toContain('gemini-2.5-flash');
  });
});
