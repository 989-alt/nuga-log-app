# NEIS 누가기록 RAG 챗봇 — Plan 2 (프론트엔드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 1(백엔드/로직) 위에 대화형 챗봇 UI를 얹어 앱을 완성한다 — 정적 폼을 제거하고, 챗 화면(에이전트 인터뷰 + 특수교육 토글/장애유형 체크박스)·`[법적 보호 분석]` 렌더·"판례 더 찾기"·파일 저장(다운로드 + Chrome 폴더 직접 저장)·BYOK 전용 등급 모델 선택을 구현한다.

**Architecture:** 기존 Next.js 14 App Router + 디자인 토큰(CSS 변수, `.card`/`.btn`/`.callout` 등) 재사용. 챗은 클라이언트 컴포넌트가 transcript를 **메모리에만** 쥐고 매 턴 `/api/chat`(Plan 1)로 무상태 왕복, 게이트 통과 시 `/api/generate`로 최종 5+1블록 생성. 대화 원문은 저장하지 않고 최종본만 localStorage 히스토리에. 저장은 File System Access API(지원 시 폴더 직접) + 다운로드 폴백.

**Tech Stack:** TypeScript, Next.js 14 App Router, React 클라이언트 컴포넌트, Vitest(순수 로직 단위 테스트), 기존 디자인 토큰(`app/globals.css`).

## Global Constraints

- **Plan 1 백엔드는 완료·병합됨(로컬 master, 미푸시)**. `/api/chat`(ChatTurnRequest/Response), `/api/generate`(specialEd 형태), `lib/types`(`SpecialEdInfo`·`LegalProtection`·`ChatMessage`·`ChatTurn*`), `lib/specialEd`(`DISABILITY_CATEGORIES`), `lib/interview`(게이트) 는 이미 존재한다. 재구현 금지, import해서 사용.
- **BYOK 전용**: 무료 서버 Gemini 모드를 UI에서 제거한다. 모델 선택 UI는 "권장(결제)/가능(무료등급)" 등급을 표시. 서버는 무저장·무로그(기존 라우트 규칙 유지).
- **대화 transcript는 브라우저 메모리에만**(새로고침 시 소멸). 최종 누가기록만 `localStorage`(`nuga-log-history-v1`) 저장. 학생 PII(장애 유형 포함)를 로깅·서버 저장하지 않는다.
- **장애 유형은 민감정보** — 사용자 토글로 선택하되 NEIS 본문에 넣지 않는다(백엔드가 이미 본문 미기입 처리; UI는 값만 `specialEd`로 전달).
- NEIS 본문(body)만 복붙 대상. 교사용 섹션(`teacherUnderstanding`·`safeGuidance`·`teacherMemo`·`legalProtection`)에는 "NEIS에 붙여넣지 말 것" 라벨 유지.
- 모든 사용자 대면 문자열은 한국어. 기존 디자인 토큰/클래스를 따르고 새 색·폰트를 임의 추가하지 않는다.
- 저장 파일명은 스킬과 동일하게 `누가기록_YYYY-MM-DD_<사안요약>.txt`(공백→`_`, 파일명 금지문자 제거).
- 검증: 순수 로직은 Vitest로 목킹 테스트. 브라우저 전용 API(File System Access, clipboard)는 feature-detect 뒤 폴백하고, 순수 부분(파일명·텍스트 조립)만 단위 테스트한다. 최종에 `npx tsc --noEmit` 0 + 전체 `npx vitest run` green + 실제 앱 구동 스모크.
- **날짜는 클라이언트 `new Date()`로 생성**(브라우저 런타임이므로 허용). 서버/워크플로 제약과 무관.

## 파일 구조 (생성/수정/삭제)

**생성**
- `lib/recordText.ts` — 전체 산출물(6블록)을 스킬 저장본과 동일한 plain text로 조립 + 파일명 생성.
- `lib/fileSave.ts` — File System Access(폴더 직접 저장) + 다운로드 폴백.
- `lib/chatState.ts` — 순수 대화 리듀서(슬롯 병합·유형·readyToGenerate 반영). UI에서 분리해 테스트 가능하게.
- `components/Chat.tsx` — 챗 UI 컨테이너(진입점).
- `components/ChatThread.tsx` — 메시지 목록/말풍선.
- `components/SpecialEdPanel.tsx` — 특수교육 토글 + 장애유형 체크박스 10종.
- `components/LegalProtectionBlock.tsx` — `[법적 보호 분석]` 렌더 + "판례 더 찾기".
- `app/api/precedents/route.ts` — "판례 더 찾기" 온디맨드 검색 엔드포인트(무상태).

**수정**
- `app/page.tsx` — 폼 랜딩 제거 → `Chat` 진입점.
- `components/ResultBlocks.tsx` — `legalProtection` 블록 추가, "전체 복사"를 `recordText`로, 파일 저장 버튼 추가.
- `components/ApiKeyPanel.tsx` — BYOK 전용(무료 모드 제거) + 등급 표시.
- `lib/aiSettings.ts` — 기본 모드 `byok`로, `free` 기본값 제거.
- `lib/format.ts` — `neisText`는 유지(본문+메타), `recordText.ts`가 이를 재사용하거나 대체.
- `lib/types.ts` — 잔여 `GenerateResult.refined?` 제거(백엔드 미방출).
- `app/api/chat/route.ts` — 오류 문구를 `/api/generate`의 `messageForStatus`와 공유(공통 util 추출).

**삭제**
- `app/generate/page.tsx`, `components/SlotForm.tsx`, `components/CaseTypeCard.tsx` — 폼 흐름 제거.

---

### Task 1: 전체 산출물 텍스트 조립 + 파일명 (`lib/recordText.ts`)

**Files:**
- Create: `lib/recordText.ts`
- Test: `tests/recordText.test.ts`
- 참고: `lib/format.ts`(neisText), `lib/types.ts`(GenerateResult, LegalProtection)

**Interfaces:**
- Consumes: `GenerateResult`, `neisText`
- Produces:
  - `function fullRecordText(r: GenerateResult): string` — 스킬 저장본과 동일 구조: NEIS 본문+메타(=neisText) → `[교사 이해용]` → `[향후 안전한 지도 방법]` → `[교사 보관 메모]` → `[법적 보호 분석]`(각 항목 element/support + 판례 사건번호). 빈 블록은 생략.
  - `function recordFilename(r: GenerateResult, isoDate: string): string` — `누가기록_<isoDate>_<요약>.txt`. 요약 = `r.meta.caseType`에서 공백→`_`, `/ \ : * ? " < > |` 및 제어문자 제거, 20자 컷. 빈 요약이면 `기록`.

- [ ] **Step 1: 실패 테스트** — `tests/recordText.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { fullRecordText, recordFilename } from '@/lib/recordText';
import type { GenerateResult } from '@/lib/types';

const r: GenerateResult = {
  body: '2026년 7월 8일 수요일 4교시 교실에서 본인이 큰 소리를 냄. 주의 단계로 지도함.',
  meta: { bases: '교원의 학생생활지도에 관한 고시', caseType: '일반 생활지도', charCount: '약 40자', guidanceStep: '주의', guardianNotice: '당일 통보', followUp: '재관찰' },
  teacherUnderstanding: ['고시: 주의 단계 적용'],
  safeGuidance: ['단계적으로 지도한다'],
  teacherMemo: ['통보 시각 기록'],
  legalProtection: [{ element: '비례성', support: '안내 수준의 최소 개입', caseRefs: ['2021도13926'] }],
  warnings: [],
};

describe('recordText', () => {
  it('assembles all blocks with the legal-protection section', () => {
    const t = fullRecordText(r);
    expect(t).toContain('[NEIS 누가기록');
    expect(t).toContain(r.body);
    expect(t).toContain('교사 이해용');
    expect(t).toContain('법적 보호 분석');
    expect(t).toContain('2021도13926');
    expect(t).toContain('NEIS에 붙여넣지 말 것');
  });

  it('builds a skill-style filename, sanitizing forbidden chars', () => {
    expect(recordFilename(r, '2026-07-08')).toBe('누가기록_2026-07-08_일반_생활지도.txt');
    const bad = { ...r, meta: { ...r.meta, caseType: 'a/b:c d' } };
    expect(recordFilename(bad, '2026-07-08')).toBe('누가기록_2026-07-08_abc_d.txt');
  });

  it('omits empty blocks', () => {
    const empty = { ...r, legalProtection: [], teacherMemo: [] };
    const t = fullRecordText(empty);
    expect(t).not.toContain('법적 보호 분석');
    expect(t).not.toContain('교사 보관 메모');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `npx vitest run tests/recordText.test.ts` → FAIL(module 없음)

- [ ] **Step 3: 구현** — `lib/recordText.ts`

```ts
import type { GenerateResult, LegalProtection } from '@/lib/types';
import { neisText } from '@/lib/format';

function section(title: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return ['', `[${title} — NEIS에 붙여넣지 말 것]`, ...lines.map((l) => `- ${l}`)];
}

function legalLines(items: LegalProtection[]): string[] {
  return items.map((p) => {
    const refs = p.caseRefs.length ? ` (참고 판례: ${p.caseRefs.join(', ')})` : '';
    return `${p.element}: ${p.support}${refs}`;
  });
}

export function fullRecordText(r: GenerateResult): string {
  return [
    neisText(r),
    ...section('교사 이해용 — 법령·판례 풀이', r.teacherUnderstanding),
    ...section('향후 안전한 지도 방법 — 교사용', r.safeGuidance),
    ...section('교사 보관 메모', r.teacherMemo),
    ...section('법적 보호 분석 — 교사용', legalLines(r.legalProtection)),
  ].join('\n');
}

export function recordFilename(r: GenerateResult, isoDate: string): string {
  const raw = (r.meta.caseType ?? '').trim();
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\/\\:*?"<>|-]/g, '').replace(/\s+/g, '_').slice(0, 20);
  const summary = cleaned || '기록';
  return `누가기록_${isoDate}_${summary}.txt`;
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/recordText.test.ts` → PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/recordText.ts tests/recordText.test.ts
git commit -m "feat: 전체 산출물 텍스트 조립과 스킬형 파일명 생성 추가"
```

---

### Task 2: 파일 저장 (`lib/fileSave.ts`)

**Files:**
- Create: `lib/fileSave.ts`
- Test: `tests/fileSave.test.ts`

**Interfaces:**
- Consumes: (없음 — 텍스트·파일명을 인자로 받음)
- Produces:
  - `function supportsDirectorySave(): boolean` — `window.showSaveFilePicker` 존재 여부.
  - `async function saveViaPicker(filename: string, text: string): Promise<'saved' | 'cancelled' | 'unsupported'>` — File System Access `showSaveFilePicker`로 저장. 미지원이면 `'unsupported'`, 사용자가 취소하면 `'cancelled'`.
  - `function downloadText(filename: string, text: string): void` — Blob + 임시 `<a download>` 클릭(폴백).

- [ ] **Step 1: 실패 테스트** — `tests/fileSave.test.ts` (jsdom 환경, 브라우저 API 목킹)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supportsDirectorySave, saveViaPicker, downloadText } from '@/lib/fileSave';

describe('fileSave', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('supportsDirectorySave reflects showSaveFilePicker presence', () => {
    (globalThis as any).window = {};
    expect(supportsDirectorySave()).toBe(false);
    (globalThis as any).window = { showSaveFilePicker: () => {} };
    expect(supportsDirectorySave()).toBe(true);
  });

  it('saveViaPicker returns unsupported when API missing', async () => {
    (globalThis as any).window = {};
    expect(await saveViaPicker('a.txt', 'x')).toBe('unsupported');
  });

  it('saveViaPicker returns cancelled when the user aborts', async () => {
    const abort = Object.assign(new Error('abort'), { name: 'AbortError' });
    (globalThis as any).window = { showSaveFilePicker: vi.fn().mockRejectedValue(abort) };
    expect(await saveViaPicker('a.txt', 'x')).toBe('cancelled');
  });

  it('saveViaPicker writes and closes on success', async () => {
    const write = vi.fn(); const close = vi.fn();
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    (globalThis as any).window = { showSaveFilePicker: vi.fn().mockResolvedValue({ createWritable }) };
    expect(await saveViaPicker('a.txt', 'hello')).toBe('saved');
    expect(write).toHaveBeenCalledWith('hello');
    expect(close).toHaveBeenCalled();
  });
});
```

(참고: `vitest.config.ts`의 test environment가 `node`면 이 테스트 파일 상단에 `// @vitest-environment jsdom`를 붙이거나, `downloadText`는 DOM 의존이라 단위 테스트에서 제외하고 수동 검증한다. 구현자는 기존 `vitest.config.ts`를 확인해 환경에 맞춰 조정한다.)

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/fileSave.test.ts` → FAIL

- [ ] **Step 3: 구현** — `lib/fileSave.ts`

```ts
export function supportsDirectorySave(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showSaveFilePicker === 'function';
}

/** File System Access API로 저장. 최초 1회 위치를 고르면 브라우저가 기억한다. */
export async function saveViaPicker(
  filename: string,
  text: string
): Promise<'saved' | 'cancelled' | 'unsupported'> {
  if (!supportsDirectorySave()) return 'unsupported';
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: '텍스트 파일', accept: { 'text/plain': ['.txt'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return 'saved';
  } catch (e: any) {
    if (e && e.name === 'AbortError') return 'cancelled';
    throw e;
  }
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/fileSave.test.ts` → PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/fileSave.ts tests/fileSave.test.ts
git commit -m "feat: 파일 저장(File System Access + 다운로드 폴백) 추가"
```

---

### Task 3: 대화 상태 리듀서 (`lib/chatState.ts`)

**Files:**
- Create: `lib/chatState.ts`
- Test: `tests/chatState.test.ts`
- 참고: `lib/types.ts`(ChatMessage, ChatTurnResponse, CaseTypeId), `lib/specialEd.ts`

**Interfaces:**
- Produces:
  - `interface ChatState { messages: ChatMessage[]; slots: Record<string,string>; caseTypeId: CaseTypeId | null; readyToGenerate: boolean }`
  - `const initialChatState: ChatState`
  - `function withUserMessage(s: ChatState, text: string): ChatState` — 사용자 메시지 추가.
  - `function withTurnResponse(s: ChatState, r: ChatTurnResponse): ChatState` — 어시스턴트 메시지 추가 + `slots`에 `slotUpdates` 병합 + `caseTypeId`/`readyToGenerate` 반영.

- [ ] **Step 1: 실패 테스트** — `tests/chatState.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { initialChatState, withUserMessage, withTurnResponse } from '@/lib/chatState';

describe('chatState', () => {
  it('appends a user message immutably', () => {
    const s = withUserMessage(initialChatState, '학생이 떠들어요');
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]).toEqual({ role: 'user', content: '학생이 떠들어요' });
    expect(initialChatState.messages).toHaveLength(0);
  });

  it('merges slotUpdates and reflects caseType/ready from a turn response', () => {
    let s = withUserMessage(initialChatState, '수업 중 소란');
    s = withTurnResponse(s, { assistantMessage: '일시는요?', caseTypeId: 1, slotUpdates: { place: '교실' }, readyToGenerate: false });
    expect(s.messages.at(-1)).toEqual({ role: 'assistant', content: '일시는요?' });
    expect(s.slots.place).toBe('교실');
    expect(s.caseTypeId).toBe(1);
    expect(s.readyToGenerate).toBe(false);
    s = withTurnResponse(s, { assistantMessage: '준비됐습니다', caseTypeId: 1, slotUpdates: { datetime: '4교시' }, readyToGenerate: true });
    expect(s.slots).toMatchObject({ place: '교실', datetime: '4교시' });
    expect(s.readyToGenerate).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/chatState.test.ts` → FAIL

- [ ] **Step 3: 구현** — `lib/chatState.ts`

```ts
import type { ChatMessage, ChatTurnResponse, CaseTypeId } from '@/lib/types';

export interface ChatState {
  messages: ChatMessage[];
  slots: Record<string, string>;
  caseTypeId: CaseTypeId | null;
  readyToGenerate: boolean;
}

export const initialChatState: ChatState = {
  messages: [],
  slots: {},
  caseTypeId: null,
  readyToGenerate: false,
};

export function withUserMessage(s: ChatState, text: string): ChatState {
  return { ...s, messages: [...s.messages, { role: 'user', content: text }], readyToGenerate: false };
}

export function withTurnResponse(s: ChatState, r: ChatTurnResponse): ChatState {
  return {
    ...s,
    messages: [...s.messages, { role: 'assistant', content: r.assistantMessage }],
    slots: { ...s.slots, ...r.slotUpdates },
    caseTypeId: r.caseTypeId ?? s.caseTypeId,
    readyToGenerate: r.readyToGenerate,
  };
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/chatState.test.ts` → PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/chatState.ts tests/chatState.test.ts
git commit -m "feat: 대화 상태 리듀서(슬롯 병합·게이트 반영) 추가"
```

---

### Task 4: 특수교육 패널 (`components/SpecialEdPanel.tsx`)

**Files:**
- Create: `components/SpecialEdPanel.tsx`
- Test: `tests/specialEdPanel.logic.test.ts` (렌더 대신 순수 토글 로직만; 컴포넌트는 수동 검증)
- 참고: `lib/specialEd.ts`(DISABILITY_CATEGORIES), `lib/types.ts`(SpecialEdInfo)

**Interfaces:**
- Produces: `SpecialEdPanel({ value, onChange }: { value: SpecialEdInfo; onChange: (v: SpecialEdInfo) => void })` — 토글 on 시 `DISABILITY_CATEGORIES` 10종 체크박스 노출(복수 선택). 값은 `{ isSpecialEd, disabilities }`.
- 순수 헬퍼 `toggleDisability(list: string[], key: string): string[]`를 같은 파일에서 export해 테스트한다.

- [ ] **Step 1: 실패 테스트** — `tests/specialEdPanel.logic.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { toggleDisability } from '@/components/SpecialEdPanel';

describe('toggleDisability', () => {
  it('adds when absent, removes when present, ignores unknown keys', () => {
    expect(toggleDisability([], 'autism')).toEqual(['autism']);
    expect(toggleDisability(['autism'], 'autism')).toEqual([]);
    expect(toggleDisability([], 'nope')).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/specialEdPanel.logic.test.ts` → FAIL

- [ ] **Step 3: 구현** — `components/SpecialEdPanel.tsx`

```tsx
'use client';
import type { SpecialEdInfo } from '@/lib/types';
import { DISABILITY_CATEGORIES, isValidDisabilityKey } from '@/lib/specialEd';

export function toggleDisability(list: string[], key: string): string[] {
  if (!isValidDisabilityKey(key)) return list;
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

export default function SpecialEdPanel({ value, onChange }: { value: SpecialEdInfo; onChange: (v: SpecialEdInfo) => void }) {
  return (
    <div className="field">
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={value.isSpecialEd}
          onChange={(e) => onChange({ isSpecialEd: e.target.checked, disabilities: e.target.checked ? value.disabilities : [] })}
        />
        <span>이 학생은 <strong style={{ fontWeight: 600 }}>특수교육대상자</strong>입니다</span>
      </label>
      {value.isSpecialEd && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginTop: 10 }}>
          {DISABILITY_CATEGORIES.map((c) => (
            <label key={c.key} className="checkbox-row" style={{ fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={value.disabilities.includes(c.key)}
                onChange={() => onChange({ ...value, disabilities: toggleDisability(value.disabilities, c.key) })}
              />
              <span>{c.label}</span>
            </label>
          ))}
          <p className="help" style={{ gridColumn: '1 / -1', margin: '2px 0 0' }}>장애 유형은 지도 방법·법적 분석에만 참고하며 NEIS 본문에는 넣지 않습니다.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/specialEdPanel.logic.test.ts` → PASS

- [ ] **Step 5: 커밋**

```bash
git add components/SpecialEdPanel.tsx tests/specialEdPanel.logic.test.ts
git commit -m "feat: 특수교육 토글 + 장애유형 체크박스 패널 추가"
```

---

### Task 5: ApiKeyPanel BYOK 전용 + 등급 표시

**Files:**
- Modify: `components/ApiKeyPanel.tsx`, `lib/aiSettings.ts`
- Test: `tests/aiSettings.test.ts` (신규 또는 확장)
- 참고: `lib/types.ts`(AiConfig), `lib/llm.ts`(DEFAULT_MODELS)

**Interfaces:**
- `lib/aiSettings.ts`: 기본값을 `{ mode: 'byok', provider: 'gemini', apiKey: '', model: '' }`로 바꾸고, 저장된 값이 `mode: 'free'`면 마이그레이션해 `byok`로 반환(무료 모드 제거).
- `ApiKeyPanel`: 무료/내키 라디오 제거(항상 BYOK). 제공자·키·모델·추론강도 UI 유지. 모델 도움말에 "권장(결제): 고급 모델이 판례 분석·검증 품질↑ / 무료등급: 한도·품질 편차" 등급 안내 추가. `onChange`는 항상 `mode:'byok'` config 전달.

- [ ] **Step 1: 실패 테스트** — `tests/aiSettings.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadAiSettings } from '@/lib/aiSettings';

describe('aiSettings BYOK-only', () => {
  beforeEach(() => { (globalThis as any).window = { localStorage: { getItem: () => null, setItem: () => {} } }; });

  it('defaults to byok when nothing stored', () => {
    expect(loadAiSettings().mode).toBe('byok');
  });

  it('migrates a legacy free setting to byok', () => {
    (globalThis as any).window = { localStorage: { getItem: () => JSON.stringify({ mode: 'free' }), setItem: () => {} } };
    expect(loadAiSettings().mode).toBe('byok');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/aiSettings.test.ts` → FAIL

- [ ] **Step 3: 구현**
  - `lib/aiSettings.ts`: SSR 기본값과 파싱 결과를 `normalizeToByok(cfg)`로 통과시켜 `mode:'free'` → `{ mode:'byok', provider: cfg.provider ?? 'gemini', apiKey: cfg.apiKey ?? '', model: cfg.model ?? '', thinkingLevel: cfg.thinkingLevel }`로 변환. 기본 반환도 byok.
  - `components/ApiKeyPanel.tsx`: `details` 요약/무료·내키 라디오 두 개(현재 82~100행) 제거. 항상 BYOK 폼(제공자/키/모델/추론강도)만 표시. 상단에 한 줄 안내: "이 앱은 본인 API 키로 동작합니다. 판례 분석·검증 품질을 위해 <strong>결제가 설정된 고급 모델(Claude Sonnet/Opus, GPT-4급 등)</strong>을 권장합니다. 무료 등급 키도 되지만 한도·품질 편차가 있습니다." `onChange`가 마운트 시 저장된 byok config를 올리도록 유지.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/aiSettings.test.ts` → PASS. `npx tsc --noEmit`에서 `ApiKeyPanel` 관련 에러 0.

- [ ] **Step 5: 커밋**

```bash
git add components/ApiKeyPanel.tsx lib/aiSettings.ts tests/aiSettings.test.ts
git commit -m "feat: BYOK 전용 + 결제키 권장 등급 안내로 생성 엔진 UI 전환"
```

---

### Task 6: 결과 렌더 확장 — 법적 보호 분석 + 파일 저장

**Files:**
- Modify: `components/ResultBlocks.tsx`
- Create: `components/LegalProtectionBlock.tsx`
- Test: `tests/resultBlocks.logic.test.ts` (순수 보조 함수만; 렌더는 수동 검증)
- 참고: `lib/recordText.ts`, `lib/fileSave.ts`, `lib/types.ts`

**Interfaces:**
- `LegalProtectionBlock({ items }: { items: LegalProtection[] })` — 항목별 `element`(굵게)·`support`·판례 사건번호 배지. 헤더에 "NEIS에 붙여넣지 말 것" 라벨. `items`가 비면 null.
- `ResultBlocks` 확장: "전체 복사"를 `fullRecordText(result)`로 교체. 본문 카드 헤더에 저장 버튼 추가 — 지원 브라우저면 "누가기록 폴더에 저장"(`saveViaPicker`), 아니면/실패면 "다운로드"(`downloadText`). 파일명은 `recordFilename(result, new Date().toISOString().slice(0,10))`. `LegalProtectionBlock`을 교사용 블록들 뒤에 렌더.
- 저장 결과 토스트: `'saved'`→"저장했습니다", `'cancelled'`→무시, `'unsupported'`→다운로드로 폴백.

- [ ] **Step 1: 실패 테스트** — `tests/resultBlocks.logic.test.ts` (파일명·전체텍스트가 result에서 잘 나오는지 — 사실상 Task1 재확인 + ResultBlocks가 export하는 보조가 있으면 그것)

```ts
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
```

- [ ] **Step 2: 실패/통과 확인** — Run: `npx vitest run tests/resultBlocks.logic.test.ts` (Task1 구현이 있으므로 통과할 수 있음 — 이 파일은 회귀 고정용). 렌더 변경은 Step 3에서.

- [ ] **Step 3: 구현** — `components/LegalProtectionBlock.tsx` 신설(카드 스타일은 기존 `TeacherBlock` 참고), `ResultBlocks.tsx`에서:
  - import `fullRecordText`, `recordFilename`, `saveViaPicker`, `downloadText`, `supportsDirectorySave`.
  - `copy('all', ...)`의 텍스트를 `neisText` → `fullRecordText(result)`로 교체.
  - 본문 카드 헤더 버튼 묶음에 저장 버튼 추가:

    ```tsx
    async function save() {
      const name = recordFilename(result, new Date().toISOString().slice(0, 10));
      const text = fullRecordText(result);
      if (supportsDirectorySave()) {
        const res = await saveViaPicker(name, text);
        if (res === 'unsupported') downloadText(name, text);
        // 'cancelled'면 아무것도 안 함
      } else {
        downloadText(name, text);
      }
    }
    ```

  - `<LegalProtectionBlock items={result.legalProtection} />`를 `교사 보관 메모` 블록 뒤에 렌더.

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/resultBlocks.logic.test.ts` → PASS. `npx tsc --noEmit` 관련 에러 0.

- [ ] **Step 5: 커밋**

```bash
git add components/ResultBlocks.tsx components/LegalProtectionBlock.tsx tests/resultBlocks.logic.test.ts
git commit -m "feat: 법적 보호 분석 블록 렌더 + 파일 저장/전체 복사 확장"
```

---

### Task 7: "판례 더 찾기" 엔드포인트 (`app/api/precedents/route.ts`)

**Files:**
- Create: `app/api/precedents/route.ts`
- Test: `tests/precedents.route.test.ts`
- 참고: `lib/lawRetrieval.ts`(retrieveBasis/Precedent), `lib/llm.ts`

**Interfaces:**
- `POST /api/precedents` — body `{ caseTypeId, slots, specialEd, extraKeywords?: string[] }`. 서버가 `retrieveBasis`를 (기본 키워드 + extraKeywords로) 호출해 추가 판례 목록 `{ precedents: Precedent[] }` 반환. 무상태·무로그. LLM은 쓰지 않고 MCP 검색만(비용 최소). 테스트를 위해 로직을 `export async function runPrecedents(body, opts?)`로 분리.

- [ ] **Step 1: 실패 테스트** — `tests/precedents.route.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { runPrecedents } from '@/app/api/precedents/route';

function mcpMock(text: string): typeof fetch {
  return (async (url: string) =>
    new Response(JSON.stringify({ result: { content: [{ text }] } }), { status: 200 })) as any;
}

describe('runPrecedents', () => {
  it('returns precedents extracted from an extra-keyword search', async () => {
    const res = await runPrecedents(
      { caseTypeId: 6, slots: { behavior: '제지' }, specialEd: { isSpecialEd: false, disabilities: [] }, extraKeywords: ['정당행위'] },
      { fetchImpl: mcpMock('2020도5555 교사의 제지는 정당행위') }
    );
    expect(res.precedents.some((p) => p.caseNo === '2020도5555')).toBe(true);
  });

  it('never throws on MCP failure', async () => {
    const failing: typeof fetch = (async () => new Response('x', { status: 500 })) as any;
    const res = await runPrecedents(
      { caseTypeId: 1, slots: {}, specialEd: { isSpecialEd: false, disabilities: [] } },
      { fetchImpl: failing }
    );
    expect(res.precedents).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/precedents.route.test.ts` → FAIL

- [ ] **Step 3: 구현** — `app/api/precedents/route.ts`

```ts
import { NextResponse } from 'next/server';
import type { CaseTypeId, SpecialEdInfo } from '@/lib/types';
import { getCaseType } from '@/lib/caseTypes';
import { retrieveBasis } from '@/lib/lawRetrieval';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface Body { caseTypeId: CaseTypeId; slots: Record<string, string>; specialEd: SpecialEdInfo; extraKeywords?: string[] }

export async function runPrecedents(body: Body, opts?: { fetchImpl?: typeof fetch }) {
  const type = getCaseType(body.caseTypeId);
  const keywords = [type.name, ...(body.extraKeywords ?? []), ...Object.values(body.slots)].slice(0, 8);
  const basis = await retrieveBasis({
    caseTypeId: body.caseTypeId,
    keywords,
    specialEd: body.specialEd.isSpecialEd,
    fetchImpl: opts?.fetchImpl,
  });
  return { precedents: basis.precedents };
}

export async function POST(request: Request) {
  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 }); }
  try {
    return NextResponse.json(await runPrecedents(body));
  } catch {
    // 본문·키 로깅 금지.
    return NextResponse.json({ error: '판례 검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/precedents.route.test.ts` → PASS

- [ ] **Step 5: LegalProtectionBlock에 "판례 더 찾기" 배선** — `components/LegalProtectionBlock.tsx`에 버튼 추가: 클릭 시 `/api/precedents`로 현재 사안(caseTypeId·slots·specialEd)을 보내 추가 판례를 받아 블록 하단에 사건번호·요지 목록으로 표시. (필요한 컨텍스트는 `ResultBlocks`가 prop으로 내려준다 — `ResultBlocks`에 `context?: { caseTypeId; slots; specialEd }`를 추가하고 생성 시점에 보관.) 실패/빈 결과는 조용한 안내. **주의: 이 프롭 배선은 Task 8의 챗 흐름이 result와 함께 context를 넘겨야 완성된다 — Task 8에서 연결.**

- [ ] **Step 6: 커밋**

```bash
git add app/api/precedents/route.ts components/LegalProtectionBlock.tsx tests/precedents.route.test.ts
git commit -m "feat: 판례 더 찾기 온디맨드 엔드포인트 + 버튼 추가"
```

---

### Task 8: 챗 UI 컨테이너 + 진입점 교체 (`components/Chat.tsx`, `app/page.tsx`)

**Files:**
- Create: `components/Chat.tsx`, `components/ChatThread.tsx`
- Modify: `app/page.tsx`
- Test: (렌더는 수동 스모크. 순수 로직은 Task 3의 `chatState`가 커버.)
- 참고: `lib/chatState.ts`, `components/ApiKeyPanel.tsx`, `components/SpecialEdPanel.tsx`, `components/ResultBlocks.tsx`, `lib/history.ts`

**Interfaces:**
- `Chat()` — 상태: `chatState`(Task3), `ai`(AiConfig), `specialEd`(SpecialEdInfo), `busy`, `error`, `result`. 흐름:
  1. 상단에 `ApiKeyPanel`(BYOK) + `SpecialEdPanel`.
  2. `ChatThread`가 `chatState.messages` 렌더. 입력창 + 전송.
  3. 전송 → `withUserMessage` → `POST /api/chat`(`{ messages, slots, caseTypeId, specialEd, ai }`) → `withTurnResponse`. 429/오류는 문구 표시.
  4. `chatState.readyToGenerate`이면 "누가기록 생성" 버튼 활성 → `POST /api/generate`(`{ caseTypeId, slots, specialEd, ai }`) → `result` 표시(`ResultBlocks`) + `addHistory`(최종본만) + `ResultBlocks`에 `context={{ caseTypeId, slots, specialEd }}` 전달(판례 더 찾기용).
  5. transcript는 컴포넌트 상태(메모리)만 — localStorage 저장 안 함.
- `ChatThread({ messages }: { messages: ChatMessage[] })` — 사용자/어시스턴트 말풍선(기존 토큰). 스크롤 최신 유지.
- `app/page.tsx` — `SiteHeader` + `Chat` + `RecentRecords`. 기존 폼/카드 그리드 제거.

- [ ] **Step 1: `ChatThread.tsx` 구현** — 메시지 배열을 말풍선으로. `role==='user'`는 오른쪽 accent, `assistant`는 왼쪽 surface. `wordBreak: keep-all`.

- [ ] **Step 2: `Chat.tsx` 구현** — 위 흐름. `/api/chat`·`/api/generate` fetch. 최소 429 안내(재시도 버튼). `busy` 중 입력·버튼 비활성. `result`가 생기면 `ResultBlocks` 렌더.

- [ ] **Step 3: `app/page.tsx` 교체** — `Chat`을 진입점으로.

- [ ] **Step 4: 빌드·타입 확인** — Run: `npx tsc --noEmit`(Chat/ChatThread/page 관련 에러 0), `npx next build`(또는 `npm run build`) 성공.

- [ ] **Step 5: 커밋**

```bash
git add components/Chat.tsx components/ChatThread.tsx app/page.tsx
git commit -m "feat: 대화형 챗 UI 컨테이너와 진입점 교체"
```

---

### Task 9: 폼 제거 + 잔여 정리 + 최종 검증

**Files:**
- Delete: `app/generate/page.tsx`, `components/SlotForm.tsx`, `components/CaseTypeCard.tsx`
- Modify: `lib/types.ts`(GenerateResult `refined?` 제거), `app/api/chat/route.ts` + `app/api/generate/route.ts`(공통 `messageForStatus`를 `lib/apiErrors.ts`로 추출·공유), 잔여 `refined`/`isSpecialEd`/`refineMode` 참조 제거
- Create: `lib/apiErrors.ts`
- Test: 기존 `tests/route.passthrough.test.ts` 등에서 삭제된 필드 참조 정리

**Interfaces:**
- `lib/apiErrors.ts`: `export function messageForStatus(status: number, retryAfterSec?: number): string` — `/api/generate`의 기존 매핑을 이관. 두 라우트가 import.

- [ ] **Step 1: 폼 파일 삭제** — `git rm app/generate/page.tsx components/SlotForm.tsx components/CaseTypeCard.tsx`.

- [ ] **Step 2: 공통 오류 유틸 추출** — `/api/generate/route.ts`의 `messageForStatus`를 `lib/apiErrors.ts`로 옮기고 두 라우트가 import. `/api/chat/route.ts`의 `AI 오류(${status})`를 `messageForStatus(e.status, e.retryAfterSec)`로 교체.

- [ ] **Step 3: 잔여 필드 정리** — `lib/types.ts`의 `GenerateResult.refined?` 제거. 코드베이스 전역에서 `refined`/`isSpecialEd`/`refineMode`/`estimate`(폼 전용이면) 잔여 참조 검색(`grep`)해 제거·수정. `RecentRecords.tsx`가 삭제된 라우트로 링크하면 수정.

- [ ] **Step 4: 최종 검증 (게이트)** — 
  - Run: `npx vitest run` → 전체 green.
  - Run: `npx tsc --noEmit` → **에러 0** (이제 폼 UI가 없으므로 완전 클린이어야 함).
  - Run: `npm run build` → 성공.

- [ ] **Step 5: 실제 앱 스모크 검증** — `superpowers`/`webapp-testing` 또는 `npm run dev`로 로컬 구동해 end-to-end 확인: (a) 챗 입력→질문 왕복, (b) 필수슬롯 미충족 시 생성 버튼 비활성, (c) 충족 시 생성→5+1블록, (d) 본문 복사·전체 복사, (e) 저장(Chrome 폴더 저장/다운로드), (f) "판례 더 찾기". BYOK 키가 필요하면 검증자에게 테스트 키를 요청하거나 목 응답으로 대체. 결과를 리포트에 캡처/기록.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "refactor: 폼 흐름 제거 + 오류문구 공유 + 잔여 필드 정리, 챗봇 앱 완성"
```

---

## 실행 후

Plan 2 완료 시 챗봇 앱이 end-to-end로 동작하고 전체 Vitest·tsc·build가 통과한다. 그 시점에 **Plan 1 + Plan 2를 함께 원격 master로 푸시**하면 Vercel 프로덕션에 온전한 챗봇이 단일 배포된다(중간 깨짐 없음). 푸시 전 `finishing-a-development-branch`로 최종 확인한다.

## Self-Review 메모(계획 작성자)

- Plan 1과의 인터페이스 정합: `/api/chat`·`/api/generate`·`SpecialEdInfo`·`LegalProtection`·`DISABILITY_CATEGORIES`·`retrieveBasis`는 Plan 1에서 이미 존재(재사용). 
- 브라우저 전용 API(File System Access, clipboard, download)는 순수 부분만 단위 테스트하고 나머지는 Task 9의 실제 구동 스모크로 검증 — 이 분리를 각 태스크에 명시함.
- "판례 더 찾기"의 result↔context 프롭 배선이 Task 7~8에 걸쳐 있으므로 Task 7 Step 5에 의존성 주석을 남김.
- 삭제 대상(폼 파일)과 이를 참조하는 곳(`app/page.tsx`, `RecentRecords`)의 링크 정리를 Task 8·9에 배치해 순서 결합을 피함.
