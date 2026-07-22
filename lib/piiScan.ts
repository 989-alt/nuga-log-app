/**
 * 외부 AI로 전송되기 전, 사용자 입력에서 학생 식별정보(PII)와 민감정보를
 * 탐지·마스킹한다. 개인정보 보호법 제2조(개인정보의 정의: 다른 정보와 쉽게
 * 결합하여 알아볼 수 있는 정보 포함)·제23조(민감정보)를 실무적으로 반영한 것으로,
 * "이름 없이 행동만" 적어도 학교·학년·반·번호 같은 준식별자가 섞이면 특정 개인을
 * 알아볼 수 있게 되므로 이를 걸러 준다.
 *
 * 정직한 한계:
 *  - 학교/반/번호/연락처/주민번호/이메일 같은 '구조적' 식별자는 정규식으로
 *    신뢰도 높게(high) 잡는다.
 *  - '이름'은 임의의 한글 2~3자가 이름인지 규칙만으로 확정할 수 없어(예: '정수기',
 *    '고양이') 조사 패턴 휴리스틱으로 저신뢰(low)로만 표시하고, 오탐일 때 교사가
 *    직접 예외 처리(그대로 전송)할 수 있게 한다.
 */

export type PiiCategory =
  | 'name'
  | 'school'
  | 'grade'
  | 'class'
  | 'classNumber'
  | 'attendanceNo'
  | 'studentId'
  | 'phone'
  | 'rrn'
  | 'email';

export type PiiConfidence = 'high' | 'low';

export interface PiiHit {
  category: PiiCategory;
  /** 사람이 읽을 분류명 (경고 배너에 노출) */
  label: string;
  /** 원문에서 탐지된 실제 문자열 */
  value: string;
  start: number;
  end: number;
  confidence: PiiConfidence;
  /** 마스킹 시 이 span을 대체할 문자열 */
  replacement: string;
}

interface StructuralRule {
  category: PiiCategory;
  label: string;
  re: RegExp;
  /** 대체 문자열 (빈 문자열이면 삭제) */
  replacement: string;
}

/**
 * 구조적 식별자 규칙 — 더 구체적(긴)인 것을 앞에 둔다. 겹치는 매치는 뒤에서
 * start 오름차순·길이 내림차순으로 정리해 가장 긴 매치가 이기게 한다.
 */
const STRUCTURAL_RULES: StructuralRule[] = [
  { category: 'rrn', label: '주민등록번호', re: /\d{6}\s*-\s*[1-4]\d{6}/g, replacement: '' },
  { category: 'phone', label: '전화번호', re: /01[016789][\s-]?\d{3,4}[\s-]?\d{4}/g, replacement: '' },
  { category: 'email', label: '이메일', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: '' },
  { category: 'school', label: '학교명', re: /[가-힣A-Za-z]{2,}(?:여자중학교|여자고등학교|초등학교|중학교|고등학교)/g, replacement: '○○학교' },
  { category: 'classNumber', label: '학년·반·번호', re: /\d+\s*학년\s*\d+\s*반\s*\d+\s*번|\d+\s*반\s*\d+\s*번/g, replacement: '' },
  { category: 'grade', label: '학년·반', re: /\d+\s*학년\s*\d+\s*반|\d+\s*학년/g, replacement: '' },
  { category: 'class', label: '반', re: /\d+\s*반/g, replacement: '' },
  { category: 'attendanceNo', label: '출석번호', re: /(?:출석번호|번호)\s*:?\s*\d+/g, replacement: '' },
  { category: 'studentId', label: '학번', re: /학번\s*:?\s*\d+/g, replacement: '' },
];

/**
 * 이름 휴리스틱(저신뢰). 한글 2~3자 뒤에 이름에 특징적인 조사/호칭이 붙은 경우.
 * 흔한 오탐(자리'를', 교실'은')을 피하려고 조사를 이름 특징적인 것으로 좁혔다:
 *  - 삽입모음 '이' 형태: 서연'이가', 지훈'이는'
 *  - 호격: 민수'야', 서연'아'
 *  - 호칭: OO'군', OO'양'
 * 그래도 '고양이가'처럼 오탐이 남을 수 있어 low로만 표시한다.
 */
const NAME_RE = /([가-힣]{2,3})(이가|이는|이를|이랑|이한테|이와|이도|이야|이나|아|야|군|양)(?![가-힣])/g;

/** 삽입모음 '이'로 시작하는 조사는 이름을 모음/영문으로 바꾸면 불필요하므로 제거 */
function normalizeParticle(particle: string): string {
  if (particle.length > 1 && particle.startsWith('이')) return particle.slice(1);
  return particle;
}

/** 겹치는 span 제거: start 오름차순, 같은 start면 긴 것 우선. 앞 매치 끝을 넘는 매치는 버린다. */
function dropOverlaps(hits: PiiHit[]): PiiHit[] {
  const sorted = [...hits].sort((a, b) => (a.start - b.start) || (b.end - a.end));
  const kept: PiiHit[] = [];
  let lastEnd = -1;
  for (const h of sorted) {
    if (h.start >= lastEnd) {
      kept.push(h);
      lastEnd = h.end;
    }
  }
  return kept;
}

/** 입력 텍스트에서 식별정보를 탐지한다. */
export function scanIdentifiers(text: string): PiiHit[] {
  if (!text) return [];
  const hits: PiiHit[] = [];

  for (const rule of STRUCTURAL_RULES) {
    for (const m of text.matchAll(rule.re)) {
      const value = m[0];
      const start = m.index ?? 0;
      hits.push({
        category: rule.category,
        label: rule.label,
        value,
        start,
        end: start + value.length,
        confidence: 'high',
        replacement: rule.replacement,
      });
    }
  }

  for (const m of text.matchAll(NAME_RE)) {
    const whole = m[0];
    const name = m[1];
    const particle = m[2];
    const start = m.index ?? 0;
    hits.push({
      category: 'name',
      label: '이름(추정)',
      value: name,
      start,
      end: start + whole.length,
      confidence: 'low',
      replacement: `학생 A${normalizeParticle(particle)}`,
    });
  }

  return dropOverlaps(hits);
}

/** 탐지 결과를 반영해 텍스트를 마스킹한다. 삭제로 생긴 연속 공백은 한 칸으로 정리(줄바꿈 보존). */
export function maskIdentifiers(text: string, hits?: PiiHit[]): string {
  const list = (hits ?? scanIdentifiers(text)).slice().sort((a, b) => b.start - a.start);
  let out = text;
  for (const h of list) {
    out = out.slice(0, h.start) + h.replacement + out.slice(h.end);
  }
  // 삭제로 생긴 공백/구두점 앞 공백 정리 (탭·스페이스만; 줄바꿈은 유지)
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.·)\]}])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export interface SensitiveHit {
  category: string;
  matched: string;
}

/** 민감정보(개인정보 보호법 제23조) 신호 키워드 — 이름을 지워도 신중히 다뤄야 하는 범주 */
const SENSITIVE_GROUPS: { category: string; keywords: string[] }[] = [
  { category: '자해·자살 징후', keywords: ['자해', '자살', '극단적', '죽고 싶', '죽고싶', '손목을 긋', '목을 매', '자상'] },
  { category: '정신건강', keywords: ['우울', '불안장애', '공황', '조울', '정신과', '정신건강의학', 'ADHD', '트라우마'] },
  { category: '아동학대 정황', keywords: ['학대', '방임', '가정폭력', '멍이 들', '맞았다', '맞고 왔'] },
  { category: '성 관련', keywords: ['성추행', '성폭력', '성희롱', '성적 접촉', '신체 접촉', '몸을 만지', '음란'] },
  { category: '건강·질환', keywords: ['진단받', '지병', '복용', '발작', '입원', '뇌전증', '당뇨'] },
];

/** 입력에 포함된 민감정보 범주를 반환한다(정보 제공용 경고; 전송을 막지는 않는다). */
export function scanSensitive(text: string): SensitiveHit[] {
  if (!text) return [];
  const hits: SensitiveHit[] = [];
  for (const group of SENSITIVE_GROUPS) {
    const matched = group.keywords.find((k) => text.includes(k));
    if (matched) hits.push({ category: group.category, matched });
  }
  return hits;
}

/** 배너에 노출할, 중복 제거된 분류명 목록 */
export function summarizeCategories(hits: PiiHit[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    if (!seen.has(h.label)) {
      seen.add(h.label);
      out.push(h.label);
    }
  }
  return out;
}
