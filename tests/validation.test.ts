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
  it('replaces a single other-student name with 다른 학생, preserving the trailing particle', () => {
    expect(maskOtherStudentNames('본인이 서연이 필통을 떨어뜨림', ['서연'])).toBe(
      '본인이 다른 학생이 필통을 떨어뜨림'
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

  it('assigns labels by distinct name, not array index (duplicate then distinct)', () => {
    const out = maskOtherStudentNames('민수 민수 지훈', ['민수', '민수', '지훈']);
    // 지훈 is only the 2nd distinct name, so it must become 'B', not 'C'.
    expect(out).toBe('다른 학생 다른 학생 B');
  });

  it('does not strip characters from an unrelated following word (no particle over-match)', () => {
    expect(maskOtherStudentNames('서연이야기를 들음', ['서연'])).toBe(
      '다른 학생이야기를 들음'
    );
  });

  it('replaces longer names first so a shorter substring name cannot corrupt them', () => {
    const out = maskOtherStudentNames('민수', ['수', '민수']);
    expect(out).not.toContain('민수');
  });
});
