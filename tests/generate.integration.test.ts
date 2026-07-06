import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/generate/route';
import type { GenerateRequest } from '@/lib/types';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/generate', () => {
  it('returns 400 with missing keys when required slots are blank', async () => {
    const req: GenerateRequest = { caseTypeId: 1, slots: { datetime: '' }, isSpecialEd: false, ai: { mode: 'free' } };
    const res = await POST(makeReq(req));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(Array.isArray(json.missing)).toBe(true);
    expect(json.missing).toContain('place');
  });
});
