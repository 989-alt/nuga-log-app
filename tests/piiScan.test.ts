import { describe, it, expect } from 'vitest';
import {
  scanIdentifiers,
  maskIdentifiers,
  scanSensitive,
  summarizeCategories,
} from '@/lib/piiScan';

describe('scanIdentifiers — 구조적 식별자(high)', () => {
  it('학교명을 잡는다', () => {
    const hits = scanIdentifiers('서울대학교사범대학부설초등학교에서 있었던 일');
    expect(hits.some((h) => h.category === 'school')).toBe(true);
  });

  it('학년·반·번호를 하나의 매치로 잡는다', () => {
    const hits = scanIdentifiers('3학년 2반 15번 학생이 떠들었다');
    const cn = hits.find((h) => h.category === 'classNumber');
    expect(cn?.value.replace(/\s/g, '')).toBe('3학년2반15번');
  });

  it('학년만 있어도 잡는다', () => {
    expect(scanIdentifiers('6학년 학생').some((h) => h.category === 'grade')).toBe(true);
  });

  it('전화번호·주민번호·이메일을 잡는다', () => {
    expect(scanIdentifiers('010-1234-5678').some((h) => h.category === 'phone')).toBe(true);
    expect(scanIdentifiers('123456-3456789').some((h) => h.category === 'rrn')).toBe(true);
    expect(scanIdentifiers('parent@example.com').some((h) => h.category === 'email')).toBe(true);
  });

  it('출석번호·학번을 잡는다', () => {
    expect(scanIdentifiers('출석번호 12').some((h) => h.category === 'attendanceNo')).toBe(true);
    expect(scanIdentifiers('학번 20250101').some((h) => h.category === 'studentId')).toBe(true);
  });

  it('구조적 식별자가 없는 순수 행동 서술은 high 탐지가 없다', () => {
    const hits = scanIdentifiers('수업 중 자리를 세 번 이탈하고 큰 소리를 냈다');
    expect(hits.filter((h) => h.confidence === 'high')).toHaveLength(0);
  });

  it("'자리를 3번 이탈'의 3번을 출석번호로 오탐하지 않는다", () => {
    const hits = scanIdentifiers('자리를 3번 이탈했다');
    expect(hits.some((h) => h.category === 'attendanceNo')).toBe(false);
  });
});

describe('scanIdentifiers — 이름 휴리스틱(low)', () => {
  it('삽입모음 이 형태를 저신뢰로 잡는다', () => {
    const hits = scanIdentifiers('서연이가 소리쳤다');
    const name = hits.find((h) => h.category === 'name');
    expect(name?.confidence).toBe('low');
    expect(name?.value).toBe('서연');
  });

  it('호격 형태(민수야)를 잡는다', () => {
    expect(scanIdentifiers('민수야 그만하렴').some((h) => h.category === 'name')).toBe(true);
  });
});

describe('maskIdentifiers', () => {
  it('학교·학년·반·번호를 지운다', () => {
    const masked = maskIdentifiers('행복초등학교 3학년 2반 15번 학생이 떠들었다');
    expect(masked).not.toContain('초등학교');
    expect(masked).not.toMatch(/\d+\s*반/);
    expect(masked).not.toMatch(/\d+\s*번/);
  });

  it('이름을 학생 A로 치환하고 조사를 자연스럽게 만든다', () => {
    expect(maskIdentifiers('서연이가 소리쳤다')).toBe('학생 A가 소리쳤다');
    expect(maskIdentifiers('지훈이는 울었다')).toBe('학생 A는 울었다');
    expect(maskIdentifiers('민수야 그만')).toBe('학생 A야 그만');
  });

  it('삭제로 생긴 이중 공백을 정리하되 줄바꿈은 보존한다', () => {
    const masked = maskIdentifiers('가\n3학년 나');
    expect(masked).toContain('\n');
    expect(masked).not.toMatch(/ {2,}/);
  });

  it('연락처·이메일을 삭제한다', () => {
    const masked = maskIdentifiers('학부모 010-1234-5678 parent@x.com');
    expect(masked).not.toContain('010-1234-5678');
    expect(masked).not.toContain('parent@x.com');
  });
});

describe('scanSensitive', () => {
  it('자해·건강·학대·성 신호를 범주로 반환한다', () => {
    expect(scanSensitive('자해 흔적이 보였다')[0].category).toContain('자해');
    expect(scanSensitive('우울 증상을 호소했다').some((h) => h.category === '정신건강')).toBe(true);
    expect(scanSensitive('집에서 학대를 당한 정황').some((h) => h.category === '아동학대 정황')).toBe(true);
  });

  it('민감 신호가 없으면 빈 배열', () => {
    expect(scanSensitive('숙제를 두고 왔다')).toEqual([]);
  });
});

describe('summarizeCategories', () => {
  it('중복 라벨을 하나로 합친다', () => {
    const hits = scanIdentifiers('3학년 5반, 4학년 2반');
    const labels = summarizeCategories(hits);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
