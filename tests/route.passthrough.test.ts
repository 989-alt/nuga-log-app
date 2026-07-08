import { describe, it, expect, vi } from 'vitest';

// vi.mock is hoisted above imports, so the route sees the mocked runGenerate.
vi.mock('@/lib/parseResult', () => ({
  runGenerate: vi.fn(async () => ({
    body: 'x',
    meta: { bases: '', caseType: '', charCount: '', guidanceStep: '', guardianNotice: '', followUp: '' },
    teacherUnderstanding: [],
    safeGuidance: [],
    teacherMemo: [],
    warnings: [],
    usedModel: 'gemini-2.5-flash-lite',
    fallbackNote: '전환됨',
    refined: true,
  })),
}));

import { POST } from '@/app/api/generate/route';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/generate — passthrough of usedModel/refined/fallbackNote', () => {
  it('returns the fields from runGenerate unchanged', async () => {
    const req = {
      caseTypeId: 1,
      slots: { datetime: 'a', place: 'b', behavior: 'c', teacherUtterance: 'd', studentUtterance: 'e', guidanceStep: 'f', studentReaction: 'g', followUp: 'h' },
      specialEd: { isSpecialEd: false, disabilities: [] },
      ai: { mode: 'free' },
    };
    const res = await POST(makeReq(req));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.usedModel).toBe('gemini-2.5-flash-lite');
    expect(json.refined).toBe(true);
    expect(json.fallbackNote).toBe('전환됨');
  });
});
