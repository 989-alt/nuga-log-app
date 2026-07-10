import { describe, it, expect } from 'vitest';
import { fullRecordText, recordFilename } from '@/lib/recordText';
import type { GenerateResult } from '@/lib/types';

const r: GenerateResult = {
  body: '본문', meta: { bases: 'b', caseType: '긴급제지', charCount: '', guidanceStep: '', guardianNotice: '', followUp: '' },
  teacherUnderstanding: [], safeGuidance: [], teacherMemo: [], legalProtection: [], warnings: [],
};

describe('result save helpers', () => {
  it('filename reflects caseType', () => {
    expect(recordFilename(r, '2026-07-08')).toBe('누가기록_2026-07-08_긴급제지.txt');
  });
  it('fullRecordText always includes NEIS body header', () => {
    expect(fullRecordText(r)).toContain('[NEIS 누가기록');
  });
});
