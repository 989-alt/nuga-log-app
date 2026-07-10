import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildVerifyPrompt } from '@/lib/prompt';
import { parseModelJson } from '@/lib/parseResult';

const baseMeta = { bases: 'b', caseType: 'c', charCount: '약 10자', guidanceStep: '주의', guardianNotice: '-', followUp: '-' };

describe('evidence completeness rules — buildSystemPrompt', () => {
  it('includes repeated-count, closure-state, procedure-distinction, other-student-protection, and physical-check rules', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('최소 N회');
    expect(p).toContain('종결');
    expect(p).toContain('절차 구분 원칙');
    expect(p).toContain('다른 학생');
    expect(p).toContain('신체 특이 소견');
  });

  it('includes the actionItems JSON schema field', () => {
    const p = buildSystemPrompt();
    expect(p).toMatch(/"actionItems"/);
    expect(p).toContain('task');
    expect(p).toContain('how');
  });

  it('includes an explicit trigger requiring actionItems when mandatory procedures are incomplete', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('특히 원자료에 보호자 통보·관리자 보고·신고·분리조치가 미완(미통보, 아직 안 함, 예정)으로 나타나면 반드시 그 절차를 actionItems에 넣는다');
  });
});

describe('evidence completeness rules — buildVerifyPrompt', () => {
  it('adds an audit axis flagging "예정" phrasing for mandatory procedures without deleting it', () => {
    const { system } = buildVerifyPrompt({ body: 'x', facts: 'y', basis: { grounding: '', precedents: [] } });
    expect(system).toContain('할 예정임');
    expect(system).toContain('missingElements');
    expect(system).toContain('임의 삭제는 금지');
  });
});

describe('parseModelJson — actionItems normalization', () => {
  it('normalizes a well-formed actionItems array', () => {
    const r = parseModelJson(JSON.stringify({
      body: 'x', meta: baseMeta,
      teacherUnderstanding: [], safeGuidance: [], teacherMemo: [],
      actionItems: [{ task: '보호자 통보', how: '통보 완료 후 일시·수단·반응을 추가 기록' }],
    }));
    expect(r.actionItems).toEqual([{ task: '보호자 통보', how: '통보 완료 후 일시·수단·반응을 추가 기록' }]);
  });

  it('defaults to an empty array when actionItems is missing', () => {
    const r = parseModelJson(JSON.stringify({
      body: 'x', meta: baseMeta,
      teacherUnderstanding: [], safeGuidance: [], teacherMemo: [],
    }));
    expect(r.actionItems).toEqual([]);
  });

  it('drops malformed entries and non-array values', () => {
    const r = parseModelJson(JSON.stringify({
      body: 'x', meta: baseMeta,
      teacherUnderstanding: [], safeGuidance: [], teacherMemo: [],
      actionItems: 'not-an-array',
    }));
    expect(r.actionItems).toEqual([]);

    const r2 = parseModelJson(JSON.stringify({
      body: 'x', meta: baseMeta,
      teacherUnderstanding: [], safeGuidance: [], teacherMemo: [],
      actionItems: [{ how: '내용만 있음' }, { task: '   ' }, { task: '유효 항목', how: 123 }],
    }));
    expect(r2.actionItems).toEqual([{ task: '유효 항목', how: '123' }]);
  });
});
