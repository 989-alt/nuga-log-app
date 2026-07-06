import { describe, it, expect } from 'vitest';
import { validateSlots, maskOtherStudentNames } from '@/lib/validation';

describe('validateSlots', () => {
  it('returns keys of blank required slots', () => {
    const missing = validateSlots(1, { datetime: '', place: '교실' });
    expect(missing).toContain('datetime');
    expect(missing).not.toContain('place');
  });

  it('treats whitespace-only as blank', () => {
    expect(validateSlots(1, { datetime: '   ' })).toContain('datetime');
  });

  it('ignores optional slots when blank', () => {
    // guardianNotice is optional in type 1
    const missing = validateSlots(1, {
      datetime: 'x', place: 'x', behavior: 'x', teacherUtterance: 'x',
      studentUtterance: 'x', guidanceStep: '주의', studentReaction: 'x',
      followUp: 'x',
    });
    expect(missing).toEqual([]);
  });
});

describe('maskOtherStudentNames', () => {
  it('replaces a single other-student name with 다른 학생', () => {
    expect(maskOtherStudentNames('본인이 서연이 필통을 떨어뜨림', ['서연'])).toBe(
      '본인이 다른 학생이 필통을 떨어뜨림'.replace('다른 학생이', '다른 학생')
    );
  });

  it('returns text unchanged when no names given', () => {
    expect(maskOtherStudentNames('아무 이름 없음', [])).toBe('아무 이름 없음');
  });

  it('maps a second distinct name to B', () => {
    const out = maskOtherStudentNames('민수와 지훈이 다툼', ['민수', '지훈']);
    expect(out).toContain('다른 학생');
    expect(out).toContain('B');
  });
});
