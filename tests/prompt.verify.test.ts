import { describe, it, expect } from 'vitest';
import { buildVerifyPrompt } from '@/lib/prompt';

describe('buildVerifyPrompt', () => {
  it('audits body for prohibitions and the four defensibility elements', () => {
    const { system, user } = buildVerifyPrompt({
      body: '본인이 소리를 지름.',
      facts: '4교시 교실, 제지 있었음',
      basis: { grounding: '핵심 근거', precedents: [{ caseNo: '2021도13926', gist: '정당행위' }] },
    });
    expect(system).toContain('2021도13926');
    expect(system).toContain('비례성');
    expect(user).toContain('본인이 소리를 지름');
    // 출력 스키마 안내
    expect(system).toContain('revisedBody');
  });
});
