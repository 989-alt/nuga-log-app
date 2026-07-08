# NEIS 누가기록 RAG 챗봇 — Plan 1 (백엔드/로직) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정적 폼 앱을 대화형 RAG 챗봇으로 전환하기 위한 서버/로직 계층 — 법령 KB, 판례 라이브 검색, 인터뷰 엔진, 판례 환각 제거, 본문 법률 검증 에이전트, `/api/chat` 엔드포인트, 검증 루프를 포함한 생성 파이프라인을 구축한다.

**Architecture:** 기존 Next.js 14 App Router + 무상태 API 구조를 유지한다. 핵심 조문은 로컬 KB(`data/legal-content.json` 확장)로 항상 grounding하고, 판례는 `korean-law-mcp-shared` HTTP(JSON-RPC)로 세밀 탐색한다. 인터뷰는 LLM이 주도하되 `validateSlots` 코드 게이트가 필수슬롯 미충족 생성을 차단한다. 생성은 근거검색 → 1차 draft → 법률 검증 에이전트 루프 → 판례 환각 제거 순서로 진행한다. UI는 Plan 2에서 다룬다.

**Tech Stack:** TypeScript, Next.js 14 App Router (route handlers, `runtime='nodejs'`), Vitest, 기존 `callLlm`/`callLlmLadder`(lib/llm.ts), 기존 `korean-law-mcp-shared` HTTP.

## Global Constraints

- 서버는 무상태·무저장·무로그. **요청 본문(학생 PII)과 API 키를 절대 로깅하지 않는다**(기존 route.ts 규칙 유지).
- NEIS 본문은 법률 직접 명시·단정 금지(헤지 서술). 깊은 법적 분석은 본문 밖 섹션(`legalProtection`, `teacherUnderstanding`)에만.
- 판례 사건번호는 MCP가 실제 반환한 것만 인용. 검색결과에 없는 사건번호는 제거한다.
- 장애 유형은 민감정보 — 본문에 자동 삽입 금지, 교사용 섹션 조정에만 사용.
- MCP 실패·타임아웃 시 조용히 로컬 KB로 폴백. 출력은 MCP에 막히지 않는다.
- 모든 사용자 대면 문자열은 한국어.
- BYOK 전용. 무료 서버 Gemini 폴백은 이 계획 범위에서 신설하지 않는다(기존 코드 유지, 기본 진입은 Plan 2에서 BYOK).
- 파일당 단일 책임. 기존 파일 패턴(순수 함수 + 얇은 route)을 따른다.
- 테스트: 네트워크는 항상 `fetchImpl` 주입으로 목킹. 실제 외부 호출 금지. `retryDelayMs: 0`으로 대기 제거.

---

### Task 1: 타입·장애유형 상수 확장

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/specialEd.ts`
- Test: `tests/specialEd.test.ts`

**Interfaces:**
- Produces:
  - `DISABILITY_CATEGORIES: readonly { key: string; label: string }[]` (10종)
  - `isValidDisabilityKey(key: string): boolean`
  - `SpecialEdInfo { isSpecialEd: boolean; disabilities: string[] }` (types.ts)
  - `ChatMessage { role: 'user' | 'assistant'; content: string }` (types.ts)
  - `ChatTurnRequest { messages: ChatMessage[]; slots: Record<string,string>; caseTypeId: CaseTypeId | null; specialEd: SpecialEdInfo; ai: AiConfig }` (types.ts)
  - `ChatTurnResponse { assistantMessage: string; caseTypeId: CaseTypeId | null; slotUpdates: Record<string,string>; readyToGenerate: boolean }` (types.ts)
  - `LegalProtection { element: string; support: string; caseRefs: string[] }` (types.ts)
  - `GenerateResult`에 `legalProtection: LegalProtection[]` 추가
  - `GenerateRequest`의 `isSpecialEd: boolean`을 `specialEd: SpecialEdInfo`로 대체

- [ ] **Step 1: 실패 테스트 작성** — `tests/specialEd.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { DISABILITY_CATEGORIES, isValidDisabilityKey } from '@/lib/specialEd';

describe('specialEd', () => {
  it('lists exactly the 10 statutory categories', () => {
    expect(DISABILITY_CATEGORIES).toHaveLength(10);
    const keys = DISABILITY_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(10);
    expect(keys).toContain('autism');
    expect(keys).toContain('emotional_behavioral');
  });

  it('validates known keys and rejects unknown', () => {
    expect(isValidDisabilityKey('autism')).toBe(true);
    expect(isValidDisabilityKey('nope')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/specialEd.test.ts`
Expected: FAIL — Cannot find module '@/lib/specialEd'

- [ ] **Step 3: 구현** — `lib/specialEd.ts`

```ts
// 장애인 등에 대한 특수교육법 시행령 별표 기준 10종.
export const DISABILITY_CATEGORIES = [
  { key: 'visual', label: '시각장애' },
  { key: 'hearing', label: '청각장애' },
  { key: 'intellectual', label: '지적장애' },
  { key: 'physical', label: '지체장애' },
  { key: 'emotional_behavioral', label: '정서·행동장애' },
  { key: 'autism', label: '자폐성장애' },
  { key: 'communication', label: '의사소통장애' },
  { key: 'learning', label: '학습장애' },
  { key: 'health', label: '건강장애' },
  { key: 'developmental_delay', label: '발달지체' },
] as const;

const KEY_SET = new Set(DISABILITY_CATEGORIES.map((c) => c.key));

export function isValidDisabilityKey(key: string): boolean {
  return KEY_SET.has(key);
}

export function disabilityLabels(keys: string[]): string[] {
  return keys
    .filter(isValidDisabilityKey)
    .map((k) => DISABILITY_CATEGORIES.find((c) => c.key === k)!.label);
}
```

- [ ] **Step 4: types.ts 수정** — 아래 타입 추가/변경(기존 `ResultMeta`·`AiConfig` 등은 유지)

```ts
export interface SpecialEdInfo {
  isSpecialEd: boolean;
  disabilities: string[]; // DISABILITY_CATEGORIES의 key들
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatTurnRequest {
  messages: ChatMessage[];
  slots: Record<string, string>;
  caseTypeId: CaseTypeId | null;
  specialEd: SpecialEdInfo;
  ai: AiConfig;
}

export interface ChatTurnResponse {
  assistantMessage: string;
  caseTypeId: CaseTypeId | null;
  slotUpdates: Record<string, string>;
  readyToGenerate: boolean;
}

export interface LegalProtection {
  element: string; // 방어 요건/논점
  support: string; // 사안 사실 ↔ 근거 연결 설명
  caseRefs: string[]; // 실제 검색된 판례 사건번호
}
```

그리고 `GenerateRequest`에서 `isSpecialEd: boolean;`을 `specialEd: SpecialEdInfo;`로 바꾸고, `GenerateResult`에 `legalProtection: LegalProtection[];`를 추가한다.

- [ ] **Step 5: 테스트 통과 확인 + 타입 컴파일**

Run: `npx vitest run tests/specialEd.test.ts && npx tsc --noEmit`
Expected: 테스트 PASS. `tsc`는 `isSpecialEd`를 참조하던 기존 파일(`parseResult.ts`, `prompt.ts`, `route.ts`, 관련 테스트)에서 에러를 낸다 — **이 에러는 Task 8·기존 호출부에서 해소**한다. 이 태스크에서는 `specialEd.ts`와 types 추가분만 컴파일되면 된다. (임시로 기존 참조부를 깨지 않으려면 `isSpecialEd`를 지우지 말고 `specialEd`를 추가만 하고, Task 8에서 완전 전환한다.)

  → **결정:** 이 태스크에서는 `GenerateRequest`에 `specialEd`를 **추가**하고 `isSpecialEd`는 optional(`isSpecialEd?: boolean`)로 남겨 컴파일을 유지한다. Task 8에서 `isSpecialEd`를 제거한다.

- [ ] **Step 6: 커밋**

```bash
git add lib/specialEd.ts lib/types.ts tests/specialEd.test.ts
git commit -m "feat: 특수교육 장애유형 상수와 챗봇/법적보호 타입 추가"
```

---

### Task 2: 법령 지식베이스 확장 + 로더

**Files:**
- Modify: `data/legal-content.json` (최상위에 `coreStatutes` 배열 추가; 기존 `caseTypes`는 보존)
- Create: `lib/legalKb.ts`
- Test: `tests/legalKb.test.ts`

**Interfaces:**
- Produces:
  - `CoreStatute { id: string; title: string; scope: string; gist: string; kind: 'statute' | 'decision' }`
  - `CORE_STATUTES: CoreStatute[]`
  - `groundingText(specialEd: boolean): string` — 항상 선주입할 핵심 근거 요약 텍스트

- [ ] **Step 1: 실패 테스트** — `tests/legalKb.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { CORE_STATUTES, groundingText } from '@/lib/legalKb';

describe('legalKb', () => {
  it('includes the fixed core statutes and both precedents', () => {
    const ids = CORE_STATUTES.map((s) => s.id);
    expect(ids).toContain('gosi_2026_3');
    expect(ids).toContain('elementary_secondary_20_2');
    expect(ids).toContain('child_welfare_17');
    expect(ids).toContain('child_abuse_punishment_2');
    expect(ids).toContain('supreme_2021do13926');
    expect(ids).toContain('supreme_2015do13488');
  });

  it('groundingText mentions 고시 5단계 and includes 특수교육 제15조 only when specialEd', () => {
    expect(groundingText(false)).toContain('조언');
    expect(groundingText(false)).not.toContain('제15조');
    expect(groundingText(true)).toContain('제15조');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/legalKb.test.ts`
Expected: FAIL — Cannot find module '@/lib/legalKb'

- [ ] **Step 3: `data/legal-content.json`에 `coreStatutes` 추가** — 파일의 최상위 객체(현재 `{ "caseTypes": [...] }`)에 형제 키로 추가:

```json
"coreStatutes": [
  { "id": "gosi_2026_3", "title": "교원의 학생생활지도에 관한 고시(교육부고시 제2026-3호)", "scope": "교사의 지도를 조언·상담·주의·훈육·훈계 5단계로 구분하고, 위해를 막기 위한 최소한의 물리적 제지를 지도 범위로 정한 고시", "gist": "지도 5단계 구분. 제15조③은 특수교육대상자의 심각한 문제행동에 대해 개별화교육계획에 행동중재지원을 포함하도록 함.", "kind": "statute" },
  { "id": "elementary_secondary_20_2", "title": "초·중등교육법 제20조의2", "scope": "교원이 법령과 학칙에 따라 학생을 지도할 권한을 정한 조항", "gist": "교원의 학생 생활지도 권한 근거.", "kind": "statute" },
  { "id": "child_welfare_17", "title": "아동복지법 제17조·제71조", "scope": "아동에 대한 신체적·정서적 학대 금지와 벌칙", "gist": "모욕·비하·낙인 금지의 근거. 정서적 학대는 의도 없어도 성립할 수 있음.", "kind": "statute" },
  { "id": "child_abuse_punishment_2", "title": "아동학대범죄의 처벌 등에 관한 특례법 제2조 제3호 단서·제10조", "scope": "정당한 학생생활지도의 학대 제외와 신고의무", "gist": "교원의 정당한 생활지도는 아동학대로 보지 않음. 학대 의심 인지 시 신고의무.", "kind": "statute" },
  { "id": "supreme_2021do13926", "title": "대법원 2024.10.8. 선고 2021도13926", "scope": "객관적으로 타당한 지도는 아동학대가 아니라고 본 판례", "gist": "법령·학칙 취지에 따른 객관적으로 타당한 지도행위는 학대가 아님. 방어 4요건(구체 관찰사실·적용 지도단계·비례성·후속)의 근거.", "kind": "decision" },
  { "id": "supreme_2015do13488", "title": "대법원 2015.12.23. 선고 2015도13488", "scope": "정서적 학대의 미필적 인식 성립", "gist": "정서적 학대는 의도 없어도 미필적 인식으로 성립. 모욕·평가어가 적힌 기록은 학대 증거가 될 수 있음.", "kind": "decision" }
]
```

- [ ] **Step 4: 구현** — `lib/legalKb.ts`

```ts
import raw from '@/data/legal-content.json';

export interface CoreStatute {
  id: string;
  title: string;
  scope: string;
  gist: string;
  kind: 'statute' | 'decision';
}

export const CORE_STATUTES: CoreStatute[] = (raw as any).coreStatutes as CoreStatute[];

export function groundingText(specialEd: boolean): string {
  const lines: string[] = ['핵심 근거(항상 참고):'];
  for (const s of CORE_STATUTES) {
    if (!specialEd && s.id === 'gosi_2026_3') {
      lines.push(`- ${s.title}: 지도를 조언·상담·주의·훈육·훈계 5단계로 구분한 고시.`);
      continue;
    }
    lines.push(`- ${s.title}: ${s.scope}. ${s.gist}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/legalKb.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add data/legal-content.json lib/legalKb.ts tests/legalKb.test.ts
git commit -m "feat: 핵심 조문·판례 로컬 지식베이스와 grounding 로더 추가"
```

---

### Task 3: 판례 라이브 검색(lawRetrieval)

**Files:**
- Create: `lib/lawRetrieval.ts`
- Test: `tests/lawRetrieval.test.ts`
- 참고(변경 없음): 기존 `lib/lawVerify.ts`의 JSON-RPC 호출 패턴을 재사용

**Interfaces:**
- Consumes: `LAW_MCP_URL`(lawVerify.ts에서 export되어 있음), `CORE_STATUTES`(legalKb.ts)
- Produces:
  - `interface Precedent { caseNo: string; gist: string }`
  - `interface RetrievedBasis { grounding: string; precedents: Precedent[] }`
  - `async function retrieveBasis(args: { caseTypeId: CaseTypeId; keywords: string[]; specialEd: boolean; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<RetrievedBasis>`
  - `function extractCaseNumbers(text: string): string[]` — `2021도13926`, `2015도13488` 형태(숫자+도/다/두 등 대법원 사건부호+숫자) 추출

- [ ] **Step 1: 실패 테스트** — `tests/lawRetrieval.test.ts` (fetch 목킹)

```ts
import { describe, it, expect } from 'vitest';
import { retrieveBasis, extractCaseNumbers } from '@/lib/lawRetrieval';

function mockFetch(text: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ result: { content: [{ text }] } }), { status: 200 })) as unknown as typeof fetch;
}

describe('extractCaseNumbers', () => {
  it('finds supreme court style case numbers', () => {
    expect(extractCaseNumbers('대법원 2021도13926 및 2015도13488 참조')).toEqual(['2021도13926', '2015도13488']);
  });
  it('returns [] when none', () => {
    expect(extractCaseNumbers('판례 없음')).toEqual([]);
  });
});

describe('retrieveBasis', () => {
  it('always returns local grounding even when MCP fails', async () => {
    const failing: typeof fetch = (async () => new Response('x', { status: 500 })) as any;
    const r = await retrieveBasis({ caseTypeId: 6, keywords: ['제지'], specialEd: false, fetchImpl: failing, timeoutMs: 50 });
    expect(r.grounding).toContain('핵심 근거');
    expect(r.precedents).toEqual([]);
  });

  it('parses precedents from MCP search results', async () => {
    const r = await retrieveBasis({
      caseTypeId: 6,
      keywords: ['교사 제지 정당행위'],
      specialEd: false,
      fetchImpl: mockFetch('사건 2021도13926 교사의 제지는 정당행위'),
      timeoutMs: 50,
    });
    expect(r.precedents.some((p) => p.caseNo === '2021도13926')).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/lawRetrieval.test.ts`
Expected: FAIL — Cannot find module '@/lib/lawRetrieval'

- [ ] **Step 3: 구현** — `lib/lawRetrieval.ts`

```ts
import type { CaseTypeId } from '@/lib/types';
import { LAW_MCP_URL } from '@/lib/lawVerify';
import { groundingText } from '@/lib/legalKb';

export interface Precedent { caseNo: string; gist: string }
export interface RetrievedBasis { grounding: string; precedents: Precedent[] }

// 대법원/하급심 사건번호: 4자리 연도 + 사건부호(가~힣 1자) + 일련번호.
const CASE_NO_RE = /\b(\d{4}[가-힣]\d{2,7})\b/g;

export function extractCaseNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CASE_NO_RE)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

async function mcpCall(
  name: string,
  args: Record<string, unknown>,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(LAW_MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text: string | undefined = data?.result?.content?.[0]?.text;
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function retrieveBasis(args: {
  caseTypeId: CaseTypeId;
  keywords: string[];
  specialEd: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<RetrievedBasis> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const timeoutMs = args.timeoutMs ?? 3500;
  const grounding = groundingText(args.specialEd);

  const query = args.keywords.filter((k) => k.trim() !== '').join(' ').trim();
  if (query === '') return { grounding, precedents: [] };

  // 결정적 기본 판례 검색 1회(약한 턴에도 최소 판례 확보).
  const decisionText = await mcpCall('search_decisions', { query }, fetchImpl, timeoutMs);
  const precedents: Precedent[] = [];
  if (decisionText) {
    const caseNos = extractCaseNumbers(decisionText);
    const firstLine = decisionText.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
    for (const caseNo of caseNos.slice(0, 5)) {
      precedents.push({ caseNo, gist: firstLine.slice(0, 200) });
    }
  }
  return { grounding, precedents };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/lawRetrieval.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/lawRetrieval.ts tests/lawRetrieval.test.ts
git commit -m "feat: 판례 라이브 검색과 사건번호 추출(lawRetrieval) 추가"
```

---

### Task 4: 판례 환각 제거기(precedentGuard)

**Files:**
- Create: `lib/precedentGuard.ts`
- Test: `tests/precedentGuard.test.ts`

**Interfaces:**
- Consumes: `extractCaseNumbers`(lawRetrieval.ts)
- Produces:
  - `function allowedCaseSet(precedentCaseNos: string[]): Set<string>` — 로컬 KB 고정 판례(2021도13926, 2015도13488) + 검색된 판례를 합친 허용 집합
  - `function stripUnknownCaseNumbers(text: string, allowed: Set<string>): { text: string; removed: string[] }` — 허용 집합에 없는 사건번호 토큰을 '(판례 참조)'로 치환

- [ ] **Step 1: 실패 테스트** — `tests/precedentGuard.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { allowedCaseSet, stripUnknownCaseNumbers } from '@/lib/precedentGuard';

describe('precedentGuard', () => {
  it('always allows the two core precedents', () => {
    const s = allowedCaseSet([]);
    expect(s.has('2021도13926')).toBe(true);
    expect(s.has('2015도13488')).toBe(true);
  });

  it('allows retrieved case numbers too', () => {
    const s = allowedCaseSet(['2020도9999']);
    expect(s.has('2020도9999')).toBe(true);
  });

  it('removes hallucinated case numbers not in the allowed set', () => {
    const s = allowedCaseSet([]);
    const r = stripUnknownCaseNumbers('근거 2099도0001 과 2021도13926 참조', s);
    expect(r.text).not.toContain('2099도0001');
    expect(r.text).toContain('2021도13926');
    expect(r.removed).toEqual(['2099도0001']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/precedentGuard.test.ts`
Expected: FAIL — Cannot find module '@/lib/precedentGuard'

- [ ] **Step 3: 구현** — `lib/precedentGuard.ts`

```ts
import { extractCaseNumbers } from '@/lib/lawRetrieval';

const CORE_CASE_NOS = ['2021도13926', '2015도13488'];

export function allowedCaseSet(precedentCaseNos: string[]): Set<string> {
  return new Set([...CORE_CASE_NOS, ...precedentCaseNos]);
}

export function stripUnknownCaseNumbers(
  text: string,
  allowed: Set<string>
): { text: string; removed: string[] } {
  const present = extractCaseNumbers(text);
  const removed = present.filter((c) => !allowed.has(c));
  let out = text;
  for (const caseNo of removed) {
    out = out.split(caseNo).join('(판례 참조)');
  }
  return { text: out, removed };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/precedentGuard.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/precedentGuard.ts tests/precedentGuard.test.ts
git commit -m "feat: 검색결과에 없는 판례 사건번호 제거기 추가"
```

---

### Task 5: 인터뷰 엔진(interview)

**Files:**
- Create: `lib/interview.ts`
- Test: `tests/interview.test.ts`
- 참고: `lib/caseTypes.ts`(CASE_TYPES/getCaseType), `lib/validation.ts`(validateSlots)

**Interfaces:**
- Consumes: `CASE_TYPES`, `getCaseType`, `validateSlots`, `groundingText`
- Produces:
  - `function buildInterviewSystemPrompt(specialEd: SpecialEdInfo): string`
  - `function parseInterviewTurn(raw: string): { assistantMessage: string; caseTypeId: CaseTypeId | null; slotUpdates: Record<string,string>; readyToGenerate: boolean }`
  - `function applyGate(turn, mergedSlots, caseTypeId): boolean` — validateSlots가 빈 슬롯을 남기면 `readyToGenerate`를 false로 강제

- [ ] **Step 1: 실패 테스트** — `tests/interview.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseInterviewTurn, applyGate, buildInterviewSystemPrompt } from '@/lib/interview';

describe('interview', () => {
  it('system prompt states the 1~3 question rule and gate', () => {
    const p = buildInterviewSystemPrompt({ isSpecialEd: false, disabilities: [] });
    expect(p).toContain('한 번에');
    expect(p).toContain('필수');
  });

  it('parses a well-formed turn JSON', () => {
    const raw = JSON.stringify({
      assistantMessage: '일시와 장소를 알려주세요.',
      caseTypeId: 1,
      slotUpdates: { datetime: '2026-07-08 4교시' },
      readyToGenerate: false,
    });
    const t = parseInterviewTurn(raw);
    expect(t.caseTypeId).toBe(1);
    expect(t.slotUpdates.datetime).toBe('2026-07-08 4교시');
    expect(t.readyToGenerate).toBe(false);
  });

  it('gate forces readyToGenerate=false when required slots missing', () => {
    // caseType 1의 필수슬롯이 비어 있으면 게이트가 생성을 막는다.
    const ok = applyGate(true, {}, 1);
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/interview.test.ts`
Expected: FAIL — Cannot find module '@/lib/interview'

- [ ] **Step 3: 구현** — `lib/interview.ts`

```ts
import type { CaseTypeId, SpecialEdInfo } from '@/lib/types';
import { CASE_TYPES } from '@/lib/caseTypes';
import { validateSlots } from '@/lib/validation';
import { disabilityLabels } from '@/lib/specialEd';

export function buildInterviewSystemPrompt(specialEd: SpecialEdInfo): string {
  const typeList = CASE_TYPES.map((c) => `${c.id}. ${c.name}`).join(' / ');
  const lines = [
    '당신은 대한민국 초·중등 교사와 대화하며 NEIS 누가기록에 필요한 사실을 인터뷰로 수집하는 도우미다.',
    '교사가 사안을 자유롭게 서술하면 아래 7유형 중 하나로 분류한다(애매하면 한 줄로 확인).',
    `유형: ${typeList}`,
    '수집 원칙:',
    '- 한 번에 1~3개씩만 질문한다. 한꺼번에 많이 묻지 않는다.',
    '- 필수 사실: 일시(연·월·일·요일·교시), 장소, 관찰된 행동, 교사 발화와 학생 발화(직접인용 1쌍 이상), 적용한 지도 단계, 학생 반응, 보호자 통보(시각·수단), 후속 조치.',
    '- 평가어로 답하면 구체 관찰 행동을 되묻는다. 추측으로 빈칸을 채우지 않는다.',
    '- 아동학대가 의심되면 신고 의무를 먼저 안내한다.',
    specialEd.isSpecialEd
      ? `- 대상 학생은 특수교육대상자다(${disabilityLabels(specialEd.disabilities).join(', ') || '유형 미상'}). 장애 특성을 고려하되, 장애 유형을 본문에 넣지 말고 행동 중심으로 수집한다.`
      : '',
    '매 턴 아래 JSON 하나만 출력한다. 설명·코드펜스 금지.',
    '{"assistantMessage":"교사에게 할 다음 질문 또는 안내","caseTypeId":1~7 또는 null,"slotUpdates":{"슬롯키":"값"},"readyToGenerate":true/false}',
    'slotUpdates의 키는 분류한 유형의 슬롯 키를 사용한다. 필수 사실이 모두 모이기 전에는 readyToGenerate를 true로 하지 않는다.',
  ].filter((l) => l !== '');
  return lines.join('\n');
}

interface Turn {
  assistantMessage: string;
  caseTypeId: CaseTypeId | null;
  slotUpdates: Record<string, string>;
  readyToGenerate: boolean;
}

export function parseInterviewTurn(raw: string): Turn {
  let text = raw.trim().replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AI 응답을 해석하지 못했습니다');
  let obj: any;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('AI 응답을 해석하지 못했습니다');
  }
  const idNum = Number(obj.caseTypeId);
  const caseTypeId = idNum >= 1 && idNum <= 7 ? (idNum as CaseTypeId) : null;
  const slotUpdates: Record<string, string> = {};
  if (obj.slotUpdates && typeof obj.slotUpdates === 'object') {
    for (const [k, v] of Object.entries(obj.slotUpdates)) {
      if (typeof v === 'string' && v.trim() !== '') slotUpdates[k] = v.trim();
    }
  }
  return {
    assistantMessage: String(obj.assistantMessage ?? ''),
    caseTypeId,
    slotUpdates,
    readyToGenerate: obj.readyToGenerate === true,
  };
}

/** 게이트: 유형 미확정이거나 필수슬롯이 남아 있으면 생성 불가. */
export function applyGate(
  modelReady: boolean,
  mergedSlots: Record<string, string>,
  caseTypeId: CaseTypeId | null
): boolean {
  if (!modelReady) return false;
  if (caseTypeId === null) return false;
  return validateSlots(caseTypeId, mergedSlots).length === 0;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/interview.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/interview.ts tests/interview.test.ts
git commit -m "feat: 인터뷰 엔진(프롬프트·턴 파서·필수슬롯 게이트) 추가"
```

---

### Task 6: `/api/chat` 인터뷰 턴 엔드포인트

**Files:**
- Create: `app/api/chat/route.ts`
- Test: `tests/chat.route.test.ts`

**Interfaces:**
- Consumes: `buildInterviewSystemPrompt`, `parseInterviewTurn`, `applyGate`(interview.ts), `callLlm`(llm.ts), `LlmError`(llm.ts), `ChatTurnRequest`/`ChatTurnResponse`(types.ts)
- Produces: `POST /api/chat` — body `ChatTurnRequest`, 200 `ChatTurnResponse`. 서버 무저장·무로그. 오류는 `LlmError.status` 전달.
- 테스트 가능성을 위해 route 로직을 `export async function runChatTurn(req: ChatTurnRequest, opts?: { fetchImpl?; }): Promise<ChatTurnResponse>`로 분리하고 route는 얇게 감싼다.

- [ ] **Step 1: 실패 테스트** — `tests/chat.route.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { runChatTurn } from '@/app/api/chat/route';
import type { ChatTurnRequest } from '@/lib/types';

function mockLlm(json: object): typeof fetch {
  // callLlm은 provider별 응답 형태를 파싱한다. claude 형태로 목킹.
  return (async () =>
    new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(json) }] }), { status: 200 })) as any;
}

const base: ChatTurnRequest = {
  messages: [{ role: 'user', content: '학생이 수업 중 계속 떠들어요' }],
  slots: {},
  caseTypeId: null,
  specialEd: { isSpecialEd: false, disabilities: [] },
  ai: { mode: 'byok', provider: 'claude', apiKey: 'k', model: 'claude-haiku-4-5-20251001' },
};

describe('runChatTurn', () => {
  it('returns the next question and does not allow generate when slots are empty', async () => {
    const res = await runChatTurn(
      { ...base },
      { fetchImpl: mockLlm({ assistantMessage: '일시와 장소는요?', caseTypeId: 1, slotUpdates: {}, readyToGenerate: true }) }
    );
    expect(res.assistantMessage).toContain('일시');
    expect(res.caseTypeId).toBe(1);
    // 모델이 readyToGenerate=true를 줬어도 게이트가 막는다.
    expect(res.readyToGenerate).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/chat.route.test.ts`
Expected: FAIL — Cannot find module '@/app/api/chat/route'

- [ ] **Step 3: 구현** — `app/api/chat/route.ts`

```ts
import { NextResponse } from 'next/server';
import type { ChatTurnRequest, ChatTurnResponse } from '@/lib/types';
import { buildInterviewSystemPrompt, parseInterviewTurn, applyGate } from '@/lib/interview';
import { callLlm, LlmError } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 인터뷰 한 턴을 처리한다. 서버는 상태를 저장하지 않는다. */
export async function runChatTurn(
  req: ChatTurnRequest,
  opts?: { fetchImpl?: typeof fetch }
): Promise<ChatTurnResponse> {
  const system = buildInterviewSystemPrompt(req.specialEd);
  // 대화 전체를 user 프롬프트로 직렬화(무상태). slots 현황도 모델에 제공.
  const convo = req.messages.map((m) => `${m.role === 'user' ? '교사' : '도우미'}: ${m.content}`).join('\n');
  const slotState = Object.entries(req.slots).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '(아직 없음)';
  const user = [
    `현재까지 분류된 유형: ${req.caseTypeId ?? '미정'}`,
    `현재까지 수집된 슬롯:\n${slotState}`,
    '',
    '대화 기록:',
    convo,
    '',
    '위 대화를 바탕으로 다음 턴 JSON 하나만 출력하라.',
  ].join('\n');

  const raw = await callLlm({ system, user, ai: req.ai, fetchImpl: opts?.fetchImpl, retryDelayMs: 0 });
  const turn = parseInterviewTurn(raw);
  const mergedSlots = { ...req.slots, ...turn.slotUpdates };
  const ready = applyGate(turn.readyToGenerate, mergedSlots, turn.caseTypeId ?? req.caseTypeId);
  return {
    assistantMessage: turn.assistantMessage,
    caseTypeId: turn.caseTypeId ?? req.caseTypeId,
    slotUpdates: turn.slotUpdates,
    readyToGenerate: ready,
  };
}

export async function POST(request: Request) {
  let body: ChatTurnRequest;
  try {
    body = (await request.json()) as ChatTurnRequest;
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  try {
    const res = await runChatTurn(body);
    return NextResponse.json(res);
  } catch (e) {
    // 요청 본문·키 로깅 금지.
    if (e instanceof LlmError) {
      return NextResponse.json({ error: `AI 오류(${e.status})`, status: e.status, retryAfterSec: e.retryAfterSec }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : '대화 처리 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/chat.route.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/api/chat/route.ts tests/chat.route.test.ts
git commit -m "feat: /api/chat 인터뷰 턴 엔드포인트(무상태) 추가"
```

---

### Task 7: 프롬프트 확장 — 법적보호 블록 + 검증 에이전트

**Files:**
- Modify: `lib/prompt.ts`
- Test: `tests/prompt.verify.test.ts`

**Interfaces:**
- Consumes: `RetrievedBasis`/`Precedent`(lawRetrieval.ts), `LegalProtection`(types.ts)
- Produces (이 태스크는 **순수 추가형** — 기존 `buildUserPrompt` 시그니처는 건드리지 않는다. 시그니처 변경·critique 제거는 Task 8):
  - `buildSystemPrompt`의 출력 JSON 스키마에 `"legalProtection": [{"element","support","caseRefs"}]` 필드와 관련 지시 한 줄 추가(모델이 추가로 출력할 수 있게; 기존 필드·시그니처 불변).
  - `buildVerifyPrompt(args: { body: string; facts: string; basis: RetrievedBasis }): { system: string; user: string }` — 본문을 금지규칙 + 2021도13926 4요건으로 감사. 출력 JSON: `{"pass":bool,"violations":[],"missingElements":[],"revisedBody":""}`
  - `parseResult.ts`의 `parseModelJson`이 `legalProtection`을 파싱해 반환(추가 필드).

- [ ] **Step 1: 실패 테스트** — `tests/prompt.verify.test.ts`

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/prompt.verify.test.ts`
Expected: FAIL — buildVerifyPrompt is not a function

- [ ] **Step 3: 구현** — `lib/prompt.ts`에 추가/수정

`buildSystemPrompt`의 출력 JSON 스키마 블록에 `legalProtection` 필드를 추가한다(기존 필드 뒤):

```
'  "legalProtection": [{ "element": "방어 요건/논점", "support": "사안 사실과 근거의 연결", "caseRefs": ["실제 제공된 사건번호만"] }]',
```

시스템 프롬프트에 한 줄 추가:

```
'- legalProtection: 본 사안 사실을 방어 4요건(구체 관찰사실·적용 지도단계·비례성·후속)과 제공된 판례에 연결해 교사용으로 정리한다. caseRefs에는 아래 사용자 프롬프트에 제공된 사건번호만 넣고, 제공되지 않은 판례는 만들지 않는다. 이 블록과 판례는 본문(body)에 넣지 않는다.',
```

**buildUserPrompt는 이 태스크에서 바꾸지 않는다.** 시그니처 변경(`isSpecialEd`/`liveLaw` → `specialEd`/`basis`)과 critique 함수 제거는 그 소비자(`runGenerate`)와 함께 Task 8에서 원자적으로 처리한다. 이렇게 해야 Task 7 단독으로 기존 `prompt.test.ts`가 깨지지 않는다.

새 함수 추가:

```ts
import type { SpecialEdInfo } from '@/lib/types';
import type { RetrievedBasis } from '@/lib/lawRetrieval';

export function buildVerifyPrompt(args: { body: string; facts: string; basis: RetrievedBasis }): { system: string; user: string } {
  const system = [
    '당신은 이미 작성된 NEIS 누가기록 본문을 법적으로 감사·보강하는 검증 도우미다.',
    '두 축으로 감사한다.',
    '1) 금지 규칙: 법률 단정(~에 해당함, ~죄 성립, 공연성 충족 등), 평가어(산만함·버릇없음 등), 모욕·비하·낙인, 민감정보(장애·병력·종교 등), 타 학생·학부모 실명이 있으면 위반이다.',
    '2) 방어력(대법원 2021도13926의 객관적으로 타당한 지도 기준): 본문에 ①구체적 관찰사실 ②적용한 지도 단계 명시 ③비례성(단계적·최소개입) ④후속 조치가 드러나야 한다. 빠진 요건은 missingElements에 적는다.',
    '보강은 제공된 사실 범위 안에서만 한다. 없는 사실·발언·수치를 창작하지 않는다. 본문에는 판례 사건번호나 법률 단정을 넣지 않는다(헤지 서술 유지).',
    '아래 JSON 하나만 출력한다. 코드펜스 금지.',
    '{"pass":true/false,"violations":["위반 항목"],"missingElements":["누락 요건"],"revisedBody":"보강한 본문(문제 없으면 원문 그대로)"}',
  ].join('\n');
  const user = [
    '[감사 대상 본문]',
    args.body,
    '',
    '[확정된 사실(이 범위 밖 창작 금지)]',
    args.facts,
    '',
    args.basis.grounding,
    '',
    '위 본문을 감사하고, 위반·누락을 고친 revisedBody를 포함해 JSON 하나만 출력하라.',
  ].join('\n');
  return { system, user };
}
```

`parseResult.ts`의 `parseModelJson`이 `legalProtection`을 파싱하도록 반환 객체에 추가(Task 8에서 함께 처리해도 되나, 여기서 파서까지 바꾸면 Task 8이 가벼워짐 — 이 태스크에서 `parseModelJson`에 아래를 추가):

```ts
legalProtection: toLegalProtection(obj.legalProtection),
```

그리고 헬퍼:

```ts
function toLegalProtection(v: unknown): import('@/lib/types').LegalProtection[] {
  if (!Array.isArray(v)) return [];
  return v.map((x: any) => ({
    element: String(x?.element ?? ''),
    support: String(x?.support ?? ''),
    caseRefs: Array.isArray(x?.caseRefs) ? x.caseRefs.map((c: any) => String(c)).filter((s: string) => s.trim() !== '') : [],
  })).filter((p) => p.element.trim() !== '' || p.support.trim() !== '');
}
```

(`parseModelJson`의 반환 타입 `Omit<GenerateResult,'warnings'>`에 이제 `legalProtection`이 포함되므로 컴파일이 일관된다.)

- [ ] **Step 4: 기존 prompt 테스트 회귀 확인 + 새 테스트 통과**

Run: `npx vitest run tests/prompt.test.ts tests/prompt.verify.test.ts`
Expected: 둘 다 PASS. 이 태스크는 순수 추가형이므로 기존 `prompt.test.ts`는 수정 없이 그대로 통과해야 한다(버그 신호로 활용).

- [ ] **Step 5: 커밋**

```bash
git add lib/prompt.ts lib/parseResult.ts tests/prompt.test.ts tests/prompt.verify.test.ts
git commit -m "feat: 법적보호 블록 스키마와 본문 검증 에이전트 프롬프트 추가"
```

---

### Task 8: 생성 파이프라인 통합(runGenerate: 검색→draft→검증 루프→환각 제거)

**Files:**
- Modify: `lib/parseResult.ts`
- Modify: `app/api/generate/route.ts` (요청 타입 `specialEd` 반영)
- Modify: `lib/types.ts` (`GenerateRequest`에서 `isSpecialEd?` 제거)
- Modify: 기존 테스트 `tests/parseResult.test.ts`, `tests/generate.integration.test.ts`, `tests/route.passthrough.test.ts` 중 `isSpecialEd`/`liveLaw`/`verifyLaws`에 의존하던 부분
- Test: `tests/generate.pipeline.test.ts` (신규)

**Interfaces:**
- Consumes: `retrieveBasis`(lawRetrieval.ts), `buildVerifyPrompt`/`buildUserPrompt`/`buildSystemPrompt`(prompt.ts), `allowedCaseSet`/`stripUnknownCaseNumbers`(precedentGuard.ts), `callLlmLadder`(llm.ts)
- Produces: `runGenerate(req, opts)` — 근거검색 → draft → 검증 루프(상한 2) → 환각 제거 → `GenerateResult`(now with `legalProtection`). 검증 루프 상한 초과 시 `warnings`에 "검토 권장" 추가.

- [ ] **Step 1: 실패 테스트** — `tests/generate.pipeline.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { runGenerate } from '@/lib/parseResult';
import type { GenerateRequest } from '@/lib/types';

// LLM 목: 순차 호출마다 다른 응답을 돌려준다(draft → verify).
function sequencedLlm(responses: string[]): typeof fetch {
  let i = 0;
  return (async (url: string) => {
    // MCP 호출(law endpoint)은 빈 결과로.
    if (typeof url === 'string' && url.includes('korean-law-mcp')) {
      return new Response(JSON.stringify({ result: { content: [{ text: '' }] } }), { status: 200 });
    }
    const body = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return new Response(JSON.stringify({ content: [{ type: 'text', text: body }] }), { status: 200 });
  }) as any;
}

const draft = JSON.stringify({
  body: '2026년 7월 8일 수요일 4교시 교실에서 본인이 소리를 지름. 교사가 주의를 주었고 본인은 잠시 조용해짐. 이후 관찰 예정임.',
  meta: { bases: '교원의 학생생활지도에 관한 고시', caseType: '일반 생활지도', charCount: '약 90자', guidanceStep: '주의', guardianNotice: '당일 통보', followUp: '재관찰' },
  teacherUnderstanding: ['고시: 주의 단계 적용'],
  safeGuidance: ['단계적으로 지도한다'],
  teacherMemo: ['통보 시각 기록'],
  legalProtection: [{ element: '구체 관찰사실', support: '소리 지름을 관찰로 기술', caseRefs: ['2021도13926'] }],
});
const verified = JSON.stringify({ pass: true, violations: [], missingElements: [], revisedBody: '2026년 7월 8일 수요일 4교시 교실에서 본인이 큰 소리를 냄. 교사가 주의 단계로 지도하였고 본인은 잠시 조용해진 뒤 관찰을 지속할 예정임.' });

const req: GenerateRequest = {
  caseTypeId: 1,
  slots: { datetime: '2026-07-08 수 4교시', place: '교실', behavior: '소리 지름', utterance: "교사 '조용히' 학생 침묵", guidanceStep: '주의', reaction: '잠시 조용', followUp: '재관찰' },
  specialEd: { isSpecialEd: false, disabilities: [] },
  ai: { mode: 'byok', provider: 'claude', apiKey: 'k', model: 'claude-haiku-4-5-20251001' },
};

describe('runGenerate pipeline', () => {
  it('runs draft then verification and returns the revised body + legalProtection', async () => {
    const res = await runGenerate(req, { fetchImpl: sequencedLlm([draft, verified]), retryDelayMs: 0 });
    expect(res.body).toContain('주의 단계');
    expect(res.legalProtection.length).toBeGreaterThan(0);
  });

  it('strips case numbers not in the allowed set from legalProtection/meta', async () => {
    const draftBad = draft.replace('2021도13926', '2099도0001');
    const res = await runGenerate(req, { fetchImpl: sequencedLlm([draftBad, verified]), retryDelayMs: 0 });
    const refs = res.legalProtection.flatMap((p) => p.caseRefs);
    expect(refs).not.toContain('2099도0001');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/generate.pipeline.test.ts`
Expected: FAIL (runGenerate 아직 옛 구조)

- [ ] **Step 3: `lib/types.ts`에서 `GenerateRequest.isSpecialEd?` 제거** — `specialEd: SpecialEdInfo`만 남긴다.

- [ ] **Step 3b: `lib/prompt.ts`에서 `buildUserPrompt` 시그니처 변경 + critique 제거** — 이 변경과 소비자(runGenerate)를 한 태스크에서 원자적으로 처리한다.
  - `buildUserPrompt`의 인자를 `{ caseTypeId: CaseTypeId; slots: Record<string,string>; specialEd: SpecialEdInfo; basis: RetrievedBasis }`로 바꾼다.
  - 기존 `liveLaw` 주입부를 아래로 교체:

    ```ts
    lines.push(args.basis.grounding);
    lines.push('');
    if (args.basis.precedents.length > 0) {
      lines.push('검색된 판례(caseRefs에 이 사건번호만 사용, 없는 판례 창작 금지):');
      for (const p of args.basis.precedents) lines.push(`- ${p.caseNo}: ${p.gist}`);
      lines.push('');
    }
    ```

  - 특수교육 주입부의 `args.isSpecialEd` 조건을 `args.specialEd.isSpecialEd`로 바꾼다(기존 문구 유지).
  - `buildCritiqueSystemPrompt`와 `buildCritiquePrompt`를 삭제한다(검증 루프가 대체). `import` 추가: `import type { SpecialEdInfo } from '@/lib/types';`, `import type { RetrievedBasis } from '@/lib/lawRetrieval';`(Task 7에서 이미 추가됐으면 중복 제거).
  - `tests/prompt.test.ts`에서 `buildUserPrompt` 옛 시그니처(`isSpecialEd`/`liveLaw`)와 critique 함수를 검증하던 케이스를 새 시그니처(`specialEd`/`basis`)로 갱신하거나 제거한다.

- [ ] **Step 4: `runGenerate` 재작성** — `lib/parseResult.ts`

```ts
import type { GenerateRequest, GenerateResult, LegalProtection } from '@/lib/types';
import { validateSlots } from '@/lib/validation';
import { getCaseType } from '@/lib/caseTypes';
import { buildSystemPrompt, buildUserPrompt, buildVerifyPrompt } from '@/lib/prompt';
import { retrieveBasis } from '@/lib/lawRetrieval';
import { allowedCaseSet, stripUnknownCaseNumbers } from '@/lib/precedentGuard';
import { callLlmLadder, buildLadder } from '@/lib/llm';
import { applyConversions, scanProhibited } from '@/lib/prohibited';

const MAX_VERIFY_ROUNDS = 2;

export async function runGenerate(
  req: GenerateRequest,
  opts?: { fetchImpl?: typeof fetch; geminiKey?: string; retryDelayMs?: number }
): Promise<GenerateResult> {
  const missing = validateSlots(req.caseTypeId, req.slots);
  if (missing.length > 0) throw new Error(`필수 항목이 비어 있습니다: ${missing.join(', ')}`);

  const type = getCaseType(req.caseTypeId);
  const keywords = [type.name, ...Object.values(req.slots)].slice(0, 6);
  const basis = await retrieveBasis({
    caseTypeId: req.caseTypeId,
    keywords,
    specialEd: req.specialEd.isSpecialEd,
    fetchImpl: opts?.fetchImpl,
  });

  const system = buildSystemPrompt();
  const user = buildUserPrompt({ caseTypeId: req.caseTypeId, slots: req.slots, specialEd: req.specialEd, basis });
  const models = buildLadder(req.ai);
  const preferred = models[0];
  const warnings: string[] = [];

  const draftCall = await callLlmLadder({ system, user, ai: req.ai, models, fetchImpl: opts?.fetchImpl, geminiKey: opts?.geminiKey, retryDelayMs: opts?.retryDelayMs });
  let parsed = parseModelJson(draftCall.text);
  let usedModel = draftCall.usedModel;

  // 검증 루프: 본문을 감사·보강. 실패해도 최선본 유지.
  const facts = Object.entries(req.slots).map(([k, v]) => `${k}: ${v}`).join(' / ');
  let verified = false;
  for (let round = 0; round < MAX_VERIFY_ROUNDS; round++) {
    try {
      const vp = buildVerifyPrompt({ body: parsed.body, facts, basis });
      const vCall = await callLlmLadder({ system: vp.system, user: vp.user, ai: req.ai, models, fetchImpl: opts?.fetchImpl, geminiKey: opts?.geminiKey, retryDelayMs: opts?.retryDelayMs });
      const v = parseVerify(vCall.text);
      usedModel = vCall.usedModel;
      if (v.revisedBody.trim() !== '') parsed.body = v.revisedBody.trim();
      if (v.pass) { verified = true; break; }
    } catch {
      break; // 검증 호출 실패 시 draft 유지
    }
  }
  if (!verified) warnings.push('법률 검증을 완전히 통과하지 못했습니다. 반드시 검토 후 사용하세요.');

  // 판례 환각 제거: 허용 집합(핵심 2건 + 검색 판례)에 없는 사건번호 제거.
  const allowed = allowedCaseSet(basis.precedents.map((p) => p.caseNo));
  const cleanedRefs: LegalProtection[] = parsed.legalProtection.map((p) => ({
    ...p,
    caseRefs: p.caseRefs.filter((c) => allowed.has(c)),
  }));
  const basesClean = stripUnknownCaseNumbers(parsed.meta.bases, allowed);
  parsed.meta.bases = basesClean.text;
  parsed.legalProtection = cleanedRefs;

  const fallbackNote = usedModel !== preferred ? `${preferred} 한도 초과로 ${usedModel}(으)로 자동 전환되었습니다.` : undefined;

  // 기존 금지표현 스캔 유지.
  const hits = scanProhibited(parsed.body + '\n' + parsed.meta.bases);
  if (hits.length > 0) {
    const cb = applyConversions(parsed.body);
    const cbases = applyConversions(parsed.meta.bases);
    parsed.body = cb.text;
    parsed.meta.bases = cbases.text;
    warnings.push('일부 위험 표현이 감지되어 자동 조정했습니다. 반드시 검토 후 사용하세요.');
    warnings.push(...cb.notes, ...cbases.notes);
  }

  return { ...parsed, warnings, usedModel, fallbackNote };
}

function parseVerify(raw: string): { pass: boolean; violations: string[]; missingElements: string[]; revisedBody: string } {
  let text = raw.trim().replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('검증 응답 해석 실패');
  const obj = JSON.parse(text.slice(start, end + 1));
  return {
    pass: obj.pass === true,
    violations: Array.isArray(obj.violations) ? obj.violations.map(String) : [],
    missingElements: Array.isArray(obj.missingElements) ? obj.missingElements.map(String) : [],
    revisedBody: String(obj.revisedBody ?? ''),
  };
}
```

`parseModelJson`은 Task 7에서 `legalProtection`을 이미 반환한다. `GenerateResult`에서 `refined` 필드를 쓰던 곳이 있으면 제거(정밀 2단계 개념은 검증 루프로 대체). `refined?`는 타입에서 optional로 남겨 두어도 무방.

- [ ] **Step 5: `app/api/generate/route.ts` 조정** — 요청이 `specialEd`를 담아 오므로 `runGenerate(body, ...)` 호출은 그대로 유효(타입만 전환). `validateSlots` 사전 검사 유지. `refineMode` 분기 제거(있다면).

- [ ] **Step 6: 기존 테스트 갱신** — `tests/parseResult.test.ts`·`tests/generate.integration.test.ts`·`tests/route.passthrough.test.ts`에서 `isSpecialEd: false`를 `specialEd: { isSpecialEd:false, disabilities:[] }`로, `verifyLaws`/`liveLaw` 기대를 새 파이프라인(fetch 목에 MCP 분기 추가)으로 바꾼다. 각 요청 픽스처에 `specialEd`를 넣는다.

- [ ] **Step 7: 전체 테스트 통과 확인**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전체 PASS, 타입 에러 0.

- [ ] **Step 8: 커밋**

```bash
git add lib/parseResult.ts lib/types.ts app/api/generate/route.ts tests/
git commit -m "feat: 생성 파이프라인에 판례 검색·본문 검증 루프·환각 제거 통합"
```

---

### Task 9: 회귀 픽스처 — 2026-07-08 실제 사안 2건

**Files:**
- Test: `tests/regression.realcases.test.ts`

**Interfaces:**
- Consumes: `runGenerate`(parseResult.ts). LLM·MCP는 목킹.

이 태스크는 실제로 만든 두 누가기록(의복정리 주의 / 수업중 제지·발언 지도)을 파이프라인 회귀로 고정한다. 본문 규칙(작은따옴표만·법률 미명시·평어 종결)과 환각 제거가 유지되는지 검증한다.

- [ ] **Step 1: 테스트 작성** — `tests/regression.realcases.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { runGenerate } from '@/lib/parseResult';
import type { GenerateRequest } from '@/lib/types';

function llm(draftBody: string): typeof fetch {
  let i = 0;
  const draft = JSON.stringify({
    body: draftBody,
    meta: { bases: '교원의 학생생활지도에 관한 고시(교육부고시 제2026-3호), 초·중등교육법 제20조의2', caseType: '일반 생활지도', charCount: '약 300자', guidanceStep: '주의', guardianNotice: '당일 통보 예정', followUp: '지속 관찰' },
    teacherUnderstanding: ['고시: 주의 단계 적용'],
    safeGuidance: ['원인을 관찰한다', '대체행동을 안내한다'],
    teacherMemo: ['통보 시각 기록'],
    legalProtection: [{ element: '비례성', support: '반복 상황에서 안내 수준의 최소 개입', caseRefs: ['2021도13926'] }],
  });
  const verify = JSON.stringify({ pass: true, violations: [], missingElements: [], revisedBody: draftBody });
  return (async (url: string) => {
    if (typeof url === 'string' && url.includes('korean-law-mcp')) {
      return new Response(JSON.stringify({ result: { content: [{ text: '2021도13926 정당한 지도' }] } }), { status: 200 });
    }
    const body = (i++ === 0) ? draft : verify;
    return new Response(JSON.stringify({ content: [{ type: 'text', text: body }] }), { status: 200 });
  }) as any;
}

const clothingCase: GenerateRequest = {
  caseTypeId: 1,
  slots: { datetime: '2026-07-08 수 3교시', place: '교실', behavior: '상의를 목 위로 올려 배·가슴 노출, 4회', utterance: "교사 '옷 내리자' 학생 잠시 내림", guidanceStep: '주의', reaction: '잠시 내렸다 반복', followUp: '지속 관찰' },
  specialEd: { isSpecialEd: true, disabilities: ['autism'] },
  ai: { mode: 'byok', provider: 'claude', apiKey: 'k', model: 'claude-haiku-4-5-20251001' },
};

describe('regression: 2026-07-08 real cases', () => {
  it('clothing case: body uses only single quotes and asserts no law', async () => {
    const body = "2026년 7월 8일 수요일 3교시 교실에서 본인이 상의를 목 위로 올려 배와 가슴이 드러나는 행동이 약 4회 관찰됨. 교사가 '옷을 내리자'라고 안내하였고 본인은 잠시 내렸으나 다시 반복함. 주의 단계로 지도하였고 지속 관찰할 예정임.";
    const res = await runGenerate(clothingCase, { fetchImpl: llm(body), retryDelayMs: 0 });
    expect(res.body).not.toContain('"');
    expect(res.body).not.toContain('해당함');
    expect(res.body).not.toContain('죄');
    expect(res.legalProtection.flatMap((p) => p.caseRefs)).not.toContain('2099도0001');
  });
});
```

- [ ] **Step 2: 테스트 통과 확인**

Run: `npx vitest run tests/regression.realcases.test.ts`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add tests/regression.realcases.test.ts
git commit -m "test: 2026-07-08 실제 사안 2건 회귀 픽스처 추가"
```

---

## 실행 후

Plan 1 완료 시 `/api/chat`와 확장된 `/api/generate`가 동작하고 전체 Vitest가 통과한다. 이어서 **Plan 2(프론트엔드: 챗 UI·특수교육 토글/체크박스·법적보호 렌더·File System Access 저장·폼 제거)**를 별도 계획으로 작성·실행한다.
