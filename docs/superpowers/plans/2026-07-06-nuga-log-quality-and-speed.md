# 누가기록 품질·속도 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 무료 Gemini 키에서 누가기록 품질을 높이고(정밀 2단계), 모델 한도(429/503)에 폴백 사다리로 대응하며, 추론(thinking) 스위치로 속도를 조절한다.

**Architecture:** 모든 핵심 로직은 서버 `lib/`에 둔다. `callLlmLadder`가 모델 사다리를 순회하며 429/503 시 다음 모델로 강등하고 실제 사용 모델을 반환한다. `runGenerate`가 초안→(선택)비평·재작성 2단계를 조율한다. Gemini 요청에 `thinkingConfig.thinkingBudget`을 매핑해 속도/품질을 조절한다. UI는 스위치·토글·배지 표시만 담당.

**Tech Stack:** Next.js 14, TypeScript, Vitest. 기존 테스트 패턴: `fetchImpl` 스파이 주입 + `retryDelayMs: 0`.

**Spec:** `docs/superpowers/specs/2026-07-06-nuga-log-quality-and-speed-design.md`

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `lib/types.ts` | 타입 정의 | `ThinkingLevel`, `AiConfig.thinkingLevel`, `GenerateRequest.refineMode`, `GenerateResult.usedModel/fallbackNote/refined` 추가 |
| `lib/llm.ts` | 제공자 호출 | `thinkingConfigFor`, `callGemini` thinking 반영, `buildLadder`, `callLlmLadder` |
| `lib/prompt.ts` | 프롬프트 | `buildCritiqueSystemPrompt`, `buildCritiquePrompt` |
| `lib/parseResult.ts` | 생성 조율 | `runGenerate`를 사다리 + 정밀 2단계로 |
| `app/api/generate/route.ts` | HTTP | (코드 변경 없음 — 결과 객체 그대로 통과. 테스트로 보증) |
| `app/generate/page.tsx` | 생성 UI | 정밀 토글, 사용 모델·강등 배지, 진행 표시 |
| `components/ApiKeyPanel.tsx` | 엔진 설정 | 속도/품질 스위치(Gemini) |
| `tests/*.test.ts` | 검증 | 각 Task의 테스트 |

TDD는 lib 레벨(기존 테스트 인프라 존재). UI(React)는 이 저장소에 컴포넌트 테스트가 없으므로 `npx tsc --noEmit` + `npm run build` + 수동 브라우저 확인으로 검증한다.

---

## Task 1: 타입 추가

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: 타입 추가**

`lib/types.ts`에서 `AiProvider` 정의 아래에 `ThinkingLevel`을 추가하고, 세 인터페이스를 확장한다.

```ts
export type AiProvider = 'gemini' | 'claude' | 'openai';

// Gemini 추론(thinking) 예산 스위치. off=0, light=512, dynamic=모델 자율(현재 기본).
export type ThinkingLevel = 'off' | 'light' | 'dynamic';

export interface AiConfig {
  mode: 'free' | 'byok';
  provider?: AiProvider;
  apiKey?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
}

export interface GenerateRequest {
  caseTypeId: CaseTypeId;
  slots: Record<string, string>;
  isSpecialEd: boolean;
  ai: AiConfig;
  refineMode?: boolean;
}
```

그리고 `GenerateResult`에 필드 3개 추가:

```ts
export interface GenerateResult {
  body: string;
  meta: ResultMeta;
  teacherUnderstanding: string[];
  safeGuidance: string[];
  teacherMemo: string[];
  warnings: string[];
  usedModel?: string;
  fallbackNote?: string;
  refined?: boolean;
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 통과 (에러 0). 기존 코드가 새 optional 필드를 요구하지 않으므로 깨지지 않는다.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): thinkingLevel·refineMode·usedModel 필드 추가"
```

---

## Task 2: Gemini thinkingBudget 매핑

**Files:**
- Modify: `lib/llm.ts`
- Test: `tests/llm.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/llm.test.ts` 끝의 `describe` 블록 안에 추가:

```ts
  it('maps thinkingLevel off to thinkingBudget 0 in the Gemini request', async () => {
    const spy = vi.fn(async () => geminiResponse('ok')) as unknown as typeof fetch;
    await callLlm({
      system: 's', user: 'u',
      ai: { mode: 'free', thinkingLevel: 'off' },
      geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0,
    });
    const body = JSON.parse((spy as any).mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });

  it('omits thinkingConfig when thinkingLevel is dynamic or unset', async () => {
    const spy = vi.fn(async () => geminiResponse('ok')) as unknown as typeof fetch;
    await callLlm({
      system: 's', user: 'u',
      ai: { mode: 'free', thinkingLevel: 'dynamic' },
      geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0,
    });
    const body = JSON.parse((spy as any).mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/llm.test.ts -t thinking`
Expected: FAIL (`thinkingConfig`가 undefined이거나 매핑 안 됨).

- [ ] **Step 3: 구현**

`lib/llm.ts` 상단 import에 `ThinkingLevel` 추가:

```ts
import type { AiConfig, AiProvider, ThinkingLevel } from '@/lib/types';
```

`callGemini` 함수 바로 위에 헬퍼 추가:

```ts
/** Gemini thinkingBudget 매핑. dynamic/미지정은 thinkingConfig 자체를 생략(모델 자율). */
function thinkingConfigFor(level?: ThinkingLevel): { thinkingBudget: number } | undefined {
  if (level === 'off') return { thinkingBudget: 0 };
  if (level === 'light') return { thinkingBudget: 512 };
  return undefined;
}
```

`callGemini` 시그니처에 `thinking` 파라미터를 추가하고 body에 반영:

```ts
async function callGemini(system: string, user: string, key: string, model: string, doFetch: typeof fetch, delayMs: number, thinking?: ThinkingLevel): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const tc = thinkingConfigFor(thinking);
  const res = await requestWithRetry(doFetch, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.3, ...(tc ? { thinkingConfig: tc } : {}) },
    }),
  }, 'gemini', delayMs);
  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  if (!text) throw new Error('Gemini 응답이 비어 있습니다');
  return text;
}
```

`callLlm` 안의 `callGemini` 호출 2곳에 `args.ai.thinkingLevel`을 전달:

```ts
  if (args.ai.mode === 'free') {
    const key = args.geminiKey ?? '';
    if (!key) throw new Error('AI 키가 없습니다');
    return callGemini(args.system, args.user, key, DEFAULT_MODELS.gemini, doFetch, delay, args.ai.thinkingLevel);
  }
```

```ts
    case 'gemini':
      return callGemini(args.system, args.user, key, model ?? DEFAULT_MODELS.gemini, doFetch, delay, args.ai.thinkingLevel);
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/llm.test.ts`
Expected: PASS (신규 2개 + 기존 전부).

- [ ] **Step 5: Commit**

```bash
git add lib/llm.ts tests/llm.test.ts
git commit -m "feat(llm): Gemini thinkingBudget 스위치 매핑"
```

---

## Task 3: 모델 폴백 사다리 구성 `buildLadder`

**Files:**
- Modify: `lib/llm.ts`
- Test: `tests/llm.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/llm.test.ts`에 import를 확장하고 새 describe를 추가한다. 파일 상단 import를 다음으로 교체:

```ts
import { callLlm, callLlmLadder, buildLadder, DEFAULT_MODELS, LlmError } from '@/lib/llm';
```

파일 끝에 추가:

```ts
describe('buildLadder', () => {
  it('free mode → [flash, flash-lite]', () => {
    expect(buildLadder({ mode: 'free' })).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('byok gemini with pro preferred → [pro, flash, flash-lite], deduped', () => {
    expect(buildLadder({ mode: 'byok', provider: 'gemini', apiKey: 'K', model: 'gemini-2.5-pro' }))
      .toEqual(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('byok gemini preferring flash does not duplicate flash', () => {
    expect(buildLadder({ mode: 'byok', provider: 'gemini', apiKey: 'K', model: 'gemini-2.5-flash' }))
      .toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('claude falls back to haiku', () => {
    expect(buildLadder({ mode: 'byok', provider: 'claude', apiKey: 'K', model: 'claude-opus-4-8' }))
      .toEqual(['claude-opus-4-8', 'claude-haiku-4-5-20251001']);
  });

  it('openai falls back to gpt-4o-mini', () => {
    expect(buildLadder({ mode: 'byok', provider: 'openai', apiKey: 'K', model: 'gpt-4o' }))
      .toEqual(['gpt-4o', 'gpt-4o-mini']);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/llm.test.ts -t buildLadder`
Expected: FAIL (`buildLadder` export 없음).

- [ ] **Step 3: 구현**

`lib/llm.ts`에 추가(파일 하단, provider 함수들 아래):

```ts
const FALLBACK_TAILS: Record<AiProvider, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  claude: [DEFAULT_MODELS.claude],
  openai: [DEFAULT_MODELS.openai],
};

/** 선호 모델 + 제공자별 저비용 폴백 꼬리. 중복 제거, 순서 유지. */
export function buildLadder(ai: AiConfig): string[] {
  const provider: AiProvider = ai.mode === 'free' ? 'gemini' : (ai.provider ?? 'gemini');
  const preferred = (ai.model && ai.model.trim() !== '') ? ai.model.trim() : DEFAULT_MODELS[provider];
  const ladder = [preferred, ...FALLBACK_TAILS[provider]];
  return ladder.filter((m, i) => ladder.indexOf(m) === i);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/llm.test.ts -t buildLadder`
Expected: PASS (5개). (참고: `callLlmLadder` import 때문에 아직 파일 전체는 실패할 수 있음 — Task 4에서 해소.)

- [ ] **Step 5: Commit**

```bash
git add lib/llm.ts tests/llm.test.ts
git commit -m "feat(llm): 제공자별 폴백 사다리 buildLadder"
```

---

## Task 4: 사다리 순회 호출 `callLlmLadder`

**Files:**
- Modify: `lib/llm.ts`
- Test: `tests/llm.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/llm.test.ts` 끝에 추가:

```ts
describe('callLlmLadder', () => {
  it('falls back to the next model on 429 and reports usedModel', async () => {
    const spy = vi.fn(async (url: string) => {
      return String(url).includes('gemini-2.5-flash-lite')
        ? geminiResponse('lite결과')
        : new Response('rate', { status: 429 });
    }) as unknown as typeof fetch;
    const out = await callLlmLadder({
      system: 's', user: 'u', ai: { mode: 'free' },
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
      geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0,
    });
    expect(out.text).toBe('lite결과');
    expect(out.usedModel).toBe('gemini-2.5-flash-lite');
  });

  it('returns the first model when it succeeds', async () => {
    const spy = vi.fn(async () => geminiResponse('flash결과')) as unknown as typeof fetch;
    const out = await callLlmLadder({
      system: 's', user: 'u', ai: { mode: 'free' },
      models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
      geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0,
    });
    expect(out.usedModel).toBe('gemini-2.5-flash');
  });

  it('throws LlmError when every rung is rate-limited', async () => {
    const spy = vi.fn(async () => new Response('rate', { status: 429 })) as unknown as typeof fetch;
    let err: any;
    try {
      await callLlmLadder({
        system: 's', user: 'u', ai: { mode: 'free' },
        models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
        geminiKey: 'K', fetchImpl: spy, retryDelayMs: 0,
      });
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(429);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/llm.test.ts -t callLlmLadder`
Expected: FAIL (`callLlmLadder` export 없음).

- [ ] **Step 3: 구현**

`lib/llm.ts`에 추가(`buildLadder` 아래):

```ts
/** 사다리를 순회하며 429/503이면 다음 모델로 강등한다. 성공 모델을 함께 반환. */
export async function callLlmLadder(args: {
  system: string;
  user: string;
  ai: AiConfig;
  models: string[];
  fetchImpl?: typeof fetch;
  geminiKey?: string;
  retryDelayMs?: number;
}): Promise<{ text: string; usedModel: string }> {
  const doFetch = args.fetchImpl ?? fetch;
  const delay = args.retryDelayMs ?? 2000;
  const thinking = args.ai.thinkingLevel;
  const provider: AiProvider = args.ai.mode === 'free' ? 'gemini' : (args.ai.provider ?? 'gemini');
  const key = args.ai.mode === 'free' ? (args.geminiKey ?? '') : (args.ai.apiKey ?? '');
  if (!key) throw new Error('AI 키가 없습니다');
  const models = args.models.length > 0 ? args.models : [DEFAULT_MODELS[provider]];

  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      let text: string;
      switch (provider) {
        case 'gemini': text = await callGemini(args.system, args.user, key, model, doFetch, delay, thinking); break;
        case 'claude': text = await callClaude(args.system, args.user, key, model, doFetch, delay); break;
        case 'openai': text = await callOpenai(args.system, args.user, key, model, doFetch, delay); break;
        default: throw new Error('지원하지 않는 provider');
      }
      return { text, usedModel: model };
    } catch (e) {
      lastErr = e;
      const degradable = e instanceof LlmError && (e.status === 429 || e.status === 503);
      if (degradable && i < models.length - 1) continue;
      throw e;
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/llm.test.ts`
Expected: PASS (전체 — Task 2·3·4 신규 포함).

- [ ] **Step 5: Commit**

```bash
git add lib/llm.ts tests/llm.test.ts
git commit -m "feat(llm): 사다리 순회 호출 callLlmLadder (429/503 강등 + usedModel)"
```

---

## Task 5: 비평·재작성 프롬프트

**Files:**
- Modify: `lib/prompt.ts`
- Test: `tests/prompt.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/prompt.test.ts`에 추가(파일 상단 import에 `buildCritiquePrompt, buildCritiqueSystemPrompt`를 더한다):

```ts
import { buildCritiqueSystemPrompt, buildCritiquePrompt } from '@/lib/prompt';

describe('critique prompt', () => {
  const draft = {
    body: '수업 중 떠들었음 그냥요',
    meta: { bases: 'x', caseType: '일반 생활지도', charCount: '약 10자', guidanceStep: '주의', guardianNotice: '해당 없음', followUp: '관찰' },
    teacherUnderstanding: ['일반론'],
    safeGuidance: ['잘 지도한다'],
    teacherMemo: ['메모'],
  };

  it('system prompt keeps the base rules and adds a critique framing', () => {
    const sys = buildCritiqueSystemPrompt();
    expect(sys).toContain('이어붙이지'); // 기본 규칙 유지
    expect(sys).toContain('초안');        // 비평 프레이밍
  });

  it('user prompt embeds the draft and the rubric', () => {
    const u = buildCritiquePrompt({ caseTypeId: 1, slots: { behavior: 'x' }, isSpecialEd: false, liveLaw: null, draft });
    expect(u).toContain('수업 중 떠들었음 그냥요'); // 초안 본문 포함
    expect(u).toContain('일반론');                 // 초안 항목 포함
    expect(u).toContain('구체화');                 // 루브릭 키워드
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/prompt.test.ts -t critique`
Expected: FAIL (두 함수 export 없음).

- [ ] **Step 3: 구현**

`lib/prompt.ts` 상단 import에 `ResultMeta`를 더한다:

```ts
import type { CaseTypeId, ResultMeta } from '@/lib/types';
```

파일 끝에 추가:

```ts
export function buildCritiqueSystemPrompt(): string {
  return [
    buildSystemPrompt(),
    '',
    '추가 지침 — 지금은 이미 1차 생성된 초안을 비평·재작성하는 작업이다.',
    '초안의 사실관계와 직접인용은 보존하되, 위 규칙 위반(입력 어휘 답습, 평가어, 법률 단정, 일반론)을 교정해 더 구체적이고 안전한 최종본을 만든다.',
    '반드시 위와 동일한 JSON 객체 하나만 출력한다.',
  ].join('\n');
}

export function buildCritiquePrompt(args: {
  caseTypeId: CaseTypeId;
  slots: Record<string, string>;
  isSpecialEd: boolean;
  liveLaw: string | null;
  draft: {
    body: string;
    meta: ResultMeta;
    teacherUnderstanding: string[];
    safeGuidance: string[];
    teacherMemo: string[];
  };
}): string {
  const base = buildUserPrompt({
    caseTypeId: args.caseTypeId,
    slots: args.slots,
    isSpecialEd: args.isSpecialEd,
    liveLaw: args.liveLaw,
  });
  return [
    base,
    '',
    '[1단계 초안 — 아래를 개선하라]',
    JSON.stringify(args.draft),
    '',
    '[비평 루브릭 — 각 항목을 점검해 고쳐라]',
    '- 입력 어휘를 그대로 옮긴 부분을 관찰 서술로 다시 쓴다.',
    '- 평가어를 구체 관찰사실로 바꾼다.',
    '- 법률 단정을 헤지 표현으로 바꾼다.',
    '- teacherUnderstanding·safeGuidance·teacherMemo가 일반론이면 본 사안에 맞춰 구체화한다.',
    '- 권장 분량을 지킨다.',
    '개선한 동일 스키마 JSON 하나만 출력한다.',
  ].join('\n');
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/prompt.test.ts`
Expected: PASS (신규 2개 + 기존).

- [ ] **Step 5: Commit**

```bash
git add lib/prompt.ts tests/prompt.test.ts
git commit -m "feat(prompt): 비평·재작성 2단계 프롬프트"
```

---

## Task 6: `runGenerate` — 사다리 + 정밀 2단계

**Files:**
- Modify: `lib/parseResult.ts`
- Test: `tests/parseResult.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/parseResult.test.ts`에 추가한다. Gemini 응답을 흉내내는 헬퍼와 유효한 결과 JSON을 만든다:

```ts
import { runGenerate } from '@/lib/parseResult';
import type { GenerateRequest } from '@/lib/types';

function resultJson(body: string) {
  return JSON.stringify({
    body,
    meta: { bases: 'b', caseType: '일반 생활지도', charCount: '약 100자', guidanceStep: '주의', guardianNotice: '해당 없음', followUp: 'f' },
    teacherUnderstanding: ['u1'],
    safeGuidance: ['s1'],
    teacherMemo: ['m1'],
  });
}
function gem(text: string, status = 200) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status });
}
const baseReq: GenerateRequest = {
  caseTypeId: 1,
  slots: { datetime: '2026.7.6.', place: '교실', behavior: '떠듦', teacherUtterance: '조용히', studentUtterance: '네', guidanceStep: '주의', studentReaction: '조용', followUp: '관찰' },
  isSpecialEd: false,
  ai: { mode: 'free' },
};

describe('runGenerate — ladder + refine', () => {
  it('single pass returns the model result and usedModel', async () => {
    const fetchImpl = vi.fn(async () => gem(resultJson('초안본문'))) as unknown as typeof fetch;
    const out = await runGenerate(baseReq, { fetchImpl, geminiKey: 'K' });
    expect(out.body).toBe('초안본문');
    expect(out.usedModel).toBe('gemini-2.5-flash');
    expect(out.refined).toBe(false);
  });

  it('refine mode makes a second call and returns the refined body', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => { n += 1; return gem(resultJson(n === 1 ? '초안' : '정밀본문')); }) as unknown as typeof fetch;
    const out = await runGenerate({ ...baseReq, refineMode: true }, { fetchImpl, geminiKey: 'K' });
    expect(out.body).toBe('정밀본문');
    expect(out.refined).toBe(true);
    expect(n).toBe(2);
  });

  it('refine failure falls back to the draft with a warning', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => { n += 1; return n === 1 ? gem(resultJson('초안')) : new Response('rate', { status: 429 }); }) as unknown as typeof fetch;
    const out = await runGenerate({ ...baseReq, refineMode: true }, { fetchImpl, geminiKey: 'K' });
    expect(out.body).toBe('초안');
    expect(out.refined).toBe(false);
    expect(out.warnings.some((w) => w.includes('정밀'))).toBe(true);
  });

  it('sets fallbackNote when the preferred model is degraded', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      String(url).includes('flash-lite') ? gem(resultJson('lite본문')) : new Response('rate', { status: 429 })
    ) as unknown as typeof fetch;
    const out = await runGenerate(baseReq, { fetchImpl, geminiKey: 'K' });
    expect(out.usedModel).toBe('gemini-2.5-flash-lite');
    expect(out.fallbackNote).toContain('gemini-2.5-flash');
  });
});
```

기존 `tests/parseResult.test.ts` 상단에 이미 `import { describe, it, expect, vi } from 'vitest';`가 있으면 중복 추가하지 말 것. 없으면 추가한다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/parseResult.test.ts -t "ladder + refine"`
Expected: FAIL (`runGenerate`가 `usedModel/refined/fallbackNote`를 채우지 않음).

- [ ] **Step 3: 구현**

`lib/parseResult.ts`의 import를 교체·확장:

```ts
import type { GenerateRequest, GenerateResult } from '@/lib/types';
import { validateSlots } from '@/lib/validation';
import { buildSystemPrompt, buildUserPrompt, buildCritiqueSystemPrompt, buildCritiquePrompt } from '@/lib/prompt';
import { verifyLaws } from '@/lib/lawVerify';
import { callLlmLadder, buildLadder } from '@/lib/llm';
import { applyConversions, scanProhibited } from '@/lib/prohibited';
```

`runGenerate` 전체를 다음으로 교체:

```ts
export async function runGenerate(
  req: GenerateRequest,
  opts?: { fetchImpl?: typeof fetch; geminiKey?: string }
): Promise<GenerateResult> {
  const missing = validateSlots(req.caseTypeId, req.slots);
  if (missing.length > 0) {
    throw new Error(`필수 항목이 비어 있습니다: ${missing.join(', ')}`);
  }

  const liveLaw = await verifyLaws(req.caseTypeId, opts?.fetchImpl ?? fetch);
  const system = buildSystemPrompt();
  const user = buildUserPrompt({
    caseTypeId: req.caseTypeId,
    slots: req.slots,
    isSpecialEd: req.isSpecialEd,
    liveLaw,
  });
  const models = buildLadder(req.ai);
  const preferred = models[0];

  const warnings: string[] = [];

  // 1단계 초안 (사다리 적용)
  const draftCall = await callLlmLadder({ system, user, ai: req.ai, models, fetchImpl: opts?.fetchImpl, geminiKey: opts?.geminiKey });
  let parsed = parseModelJson(draftCall.text);
  let usedModel = draftCall.usedModel;
  let refined = false;

  // 2단계 비평·재작성 (선택). 실패해도 초안을 반환한다.
  if (req.refineMode) {
    try {
      const critiqueUser = buildCritiquePrompt({
        caseTypeId: req.caseTypeId,
        slots: req.slots,
        isSpecialEd: req.isSpecialEd,
        liveLaw,
        draft: {
          body: parsed.body,
          meta: parsed.meta,
          teacherUnderstanding: parsed.teacherUnderstanding,
          safeGuidance: parsed.safeGuidance,
          teacherMemo: parsed.teacherMemo,
        },
      });
      const refineCall = await callLlmLadder({ system: buildCritiqueSystemPrompt(), user: critiqueUser, ai: req.ai, models, fetchImpl: opts?.fetchImpl, geminiKey: opts?.geminiKey });
      parsed = parseModelJson(refineCall.text);
      usedModel = refineCall.usedModel;
      refined = true;
    } catch {
      warnings.push('정밀 2단계 중 문제가 발생하여 1단계(초안) 결과를 반환합니다. 반드시 검토 후 사용하세요.');
    }
  }

  const fallbackNote = usedModel !== preferred
    ? `${preferred} 한도 초과로 ${usedModel}(으)로 자동 전환되었습니다.`
    : undefined;

  // 금지 표현 스캔은 최종본(정밀 시 재작성본)에 대해 동작한다.
  const hits = scanProhibited(parsed.body + '\n' + parsed.meta.bases);
  if (hits.length > 0) {
    const convBody = applyConversions(parsed.body);
    const convBases = applyConversions(parsed.meta.bases);
    parsed.body = convBody.text;
    parsed.meta.bases = convBases.text;
    warnings.push('일부 위험 표현이 감지되어 자동 조정했습니다. 반드시 검토 후 사용하세요.');
    warnings.push(...convBody.notes, ...convBases.notes);
  }

  return { ...parsed, warnings, usedModel, fallbackNote, refined };
}
```

`parseModelJson` 함수는 그대로 둔다(변경 없음).

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/parseResult.test.ts`
Expected: PASS (신규 4개 + 기존).

- [ ] **Step 5: Commit**

```bash
git add lib/parseResult.ts tests/parseResult.test.ts
git commit -m "feat(generate): 폴백 사다리 + 정밀 2단계 조율 (usedModel·fallbackNote·refined)"
```

---

## Task 7: 라우트 결과 통과 보증

**Files:**
- Test: `tests/generate.integration.test.ts`
- (코드 변경 없음 — `route.ts`는 이미 `NextResponse.json(result)`로 전체 객체를 반환)

- [ ] **Step 1: 실패하지 않아야 할 테스트 작성(통과로 보증)**

`tests/generate.integration.test.ts`의 `describe` 안에 추가. 라우트가 새 필드를 그대로 통과시키는지 확인한다. `runGenerate`를 목킹한다:

```ts
import { vi } from 'vitest';

it('passes usedModel/refined through the route response', async () => {
  vi.doMock('@/lib/parseResult', async (orig) => {
    const actual = await (orig as any)();
    return {
      ...actual,
      runGenerate: vi.fn(async () => ({
        body: 'x', meta: { bases: '', caseType: '', charCount: '', guidanceStep: '', guardianNotice: '', followUp: '' },
        teacherUnderstanding: [], safeGuidance: [], teacherMemo: [], warnings: [],
        usedModel: 'gemini-2.5-flash-lite', fallbackNote: '전환됨', refined: true,
      })),
    };
  });
  const { POST: PostMocked } = await import('@/app/api/generate/route');
  const req = { caseTypeId: 1, slots: { datetime: 'a', place: 'b', behavior: 'c', teacherUtterance: 'd', studentUtterance: 'e', guidanceStep: 'f', studentReaction: 'g', followUp: 'h' }, isSpecialEd: false, ai: { mode: 'free' }, refineMode: true };
  const res = await PostMocked(makeReq(req));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.usedModel).toBe('gemini-2.5-flash-lite');
  expect(json.refined).toBe(true);
  vi.doUnmock('@/lib/parseResult');
});
```

- [ ] **Step 2: 실행 확인**

Run: `npx vitest run tests/generate.integration.test.ts`
Expected: PASS. 만약 목킹 방식이 환경에서 동작하지 않으면(모듈 캐시 문제), 이 테스트를 삭제하고 대신 `lib/parseResult.ts`의 반환 필드를 신뢰한다(Task 6에서 이미 검증됨). 라우트 코드는 변경하지 않는다.

- [ ] **Step 3: Commit**

```bash
git add tests/generate.integration.test.ts
git commit -m "test(route): usedModel·refined 응답 통과 보증"
```

---

## Task 8: UI — 속도/품질 스위치 · 정밀 토글 · 배지

**Files:**
- Modify: `components/ApiKeyPanel.tsx` (Gemini 속도/품질 스위치)
- Modify: `app/generate/page.tsx` (정밀 토글, 진행 표시, 사용 모델·강등 배지)

컴포넌트 유닛 테스트는 이 저장소에 없으므로 `tsc` + `build` + 수동 브라우저 확인으로 검증한다.

- [ ] **Step 1: ApiKeyPanel에 thinkingLevel 스위치 추가**

`components/ApiKeyPanel.tsx`의 `import type { AiConfig, AiProvider }` 줄을 다음으로 교체:

```ts
import type { AiConfig, AiProvider, ThinkingLevel } from '@/lib/types';
```

Gemini 안내 문구(`provider === 'gemini' && ( ... )`) 블록 **바로 위**, 같은 `모델` field div 뒤에 추가한다. `cfg.mode === 'byok'`이고 `provider === 'gemini'`일 때만 노출:

```tsx
{provider === 'gemini' && (
  <div className="field">
    <label className="label">속도 / 품질 <span className="muted" style={{ fontWeight: 400 }}>(추론 강도)</span></label>
    <select
      value={cfg.thinkingLevel ?? 'dynamic'}
      onChange={(e) => update({ ...cfg, thinkingLevel: e.target.value as ThinkingLevel })}
    >
      <option value="off">속도 우선 (추론 끔 · 가장 빠름)</option>
      <option value="light">균형 (약한 추론)</option>
      <option value="dynamic">품질 우선 (추론 자동 · 가장 느림)</option>
    </select>
    <div className="help">일반 사안은 ‘속도 우선’으로 충분하고, 고위험 사안은 ‘품질 우선’을 권장합니다.</div>
  </div>
)}
```

`free` 모드에도 스위치를 노출하려면(무료 Gemini도 대상), 위 블록을 `cfg.mode === 'byok'` 조건 밖으로 빼되 `provider` 대신 `(cfg.mode === 'free' || provider === 'gemini')`로 감싼다. **결정:** 무료 모드는 UI를 단순하게 유지하기 위해 스위치를 노출하지 않고 서버 기본값(일반=off, 고위험=dynamic; Task 8 Step 2에서 page가 설정)에 맡긴다. 따라서 위 블록은 `byok` + `gemini`에서만 노출한다(현 위치 유지).

- [ ] **Step 2: page.tsx에 정밀 토글 + 기본값 + 배지**

`app/generate/page.tsx`의 `GenerateInner` 컴포넌트에서:

(a) 상태 추가 — `const [ai, setAi] = useState<AiConfig>({ mode: 'free' });` 아래에:

```tsx
  const [refineMode, setRefineMode] = useState<boolean>(type.highRisk);
```

(b) 유형별 기본 thinkingLevel을 요청에 주입한다. `handleSubmit` 안 `fetch` body를 다음으로 교체:

```tsx
      const aiForRequest: AiConfig = {
        ...ai,
        thinkingLevel: ai.thinkingLevel ?? (type.highRisk ? 'dynamic' : 'off'),
      };
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseTypeId, slots, isSpecialEd, ai: aiForRequest, refineMode }),
      });
```

(c) 정밀 토글 UI — `<SlotForm ... />` **바로 위**에 추가:

```tsx
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 18px', fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={refineMode} onChange={(e) => setRefineMode(e.target.checked)} />
          <span>정밀 모드 <span className="muted" style={{ fontWeight: 400 }}>(2단계 생성 · 요청 2배 · 더 느림)</span></span>
        </label>
```

(d) 진행 표시 — 기존 `cooldown` 콜아웃은 그대로 두고, `submitting`일 때 정밀 단계 안내를 추가하려면 `SlotForm`의 submit 버튼이 이미 `submitting`을 표시하므로 별도 변경은 생략한다(YAGNI). 대신 결과 헤더에 사용 모델·강등·정밀 배지를 붙인다.

(e) 사용 모델·강등·정밀 배지 — 결과 렌더 부분을 교체:

```tsx
          {result && (
            <div style={{ marginTop: 32 }}>
              {(result.usedModel || result.refined || result.fallbackNote) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 12.5 }}>
                  {result.usedModel && <span className="badge">{result.usedModel}</span>}
                  {result.refined && <span className="badge">정밀 2단계</span>}
                  {result.fallbackNote && <span className="badge badge-risk">{result.fallbackNote}</span>}
                </div>
              )}
              <ResultBlocks result={result} />
            </div>
          )}
```

`AiConfig` 타입이 `page.tsx`에 이미 import되어 있는지 확인하고(있음: `import type { AiConfig, CaseTypeId, GenerateResult } from '@/lib/types';`) 없으면 추가한다.

- [ ] **Step 3: 타입 체크 + 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 둘 다 통과.

- [ ] **Step 4: 수동 브라우저 확인**

Run: `npm run dev` 후 http://localhost:3000/generate?type=1
확인 항목:
1. 엔진 패널에서 ‘내 API 키 사용’ + Gemini 선택 시 **속도/품질 스위치**가 보인다.
2. 폼 위에 **정밀 모드 체크박스**가 보이고, 고위험 유형(예: `?type=3`)에서는 기본 체크되어 있다.
3. 생성 후 결과 상단에 **사용 모델 배지**가 뜬다(강등 시 강등 배지도).

- [ ] **Step 5: Commit**

```bash
git add app/generate/page.tsx components/ApiKeyPanel.tsx
git commit -m "feat(ui): 속도/품질 스위치·정밀 토글·사용 모델 배지"
```

---

## Task 9: 전체 검증 + 마무리

**Files:** (없음 — 검증만)

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: 전체 PASS.

- [ ] **Step 2: 빌드**

Run: `npm run build`
Expected: 통과.

- [ ] **Step 3: 실사용 스모크(수동, 무료 키)**

`npm run dev` → 타입1에서 정밀 모드 켜고 생성 → 결과가 초안보다 구체적인지, 배지에 `정밀 2단계`가 있는지 확인. (Gemini 용량에 따라 시간은 스펙의 예상 표 참고.)

- [ ] **Step 4: 최종 커밋 (없으면 생략)**

```bash
git status   # 정리되어 있어야 함
```

---

## Self-Review 결과

- **Spec 커버리지:** 폴백 사다리(Task 3·4), pro 투명 강등=fallbackNote+배지(Task 6·8), 정밀 2단계(Task 5·6·8), thinking 스위치(Task 2·8), 에러 처리=정밀 실패 시 초안 반환(Task 6), 금지어 스캔 최종본 유지(Task 6), 테스트(Task 2~7). 스펙의 모든 섹션에 대응 Task 존재.
- **플레이스홀더:** 없음. 모든 코드 블록은 실제 구현.
- **타입 일관성:** `callLlmLadder`, `buildLadder`, `thinkingConfigFor`, `buildCritiqueSystemPrompt`, `buildCritiquePrompt`, `runGenerate` 반환 필드(`usedModel/fallbackNote/refined`)가 Task 간 동일 시그니처로 사용됨.
