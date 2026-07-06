# 누가기록 생성 품질·속도 개선 설계

**날짜:** 2026-07-06
**대상:** `nuga-log-app` (Next.js 14)
**문제:** 무료 API 키로 생성한 누가기록이 "입력을 이어붙인 것"처럼 얇게 느껴짐. 더 좋은 모델을 무료로 쓰고, 요청 한도(rate limit)에 안정적으로 대응하고 싶음.

---

## 1. 진단 (코드 + 실측 근거)

### 1.1 프롬프트는 이미 잘 돼 있음
`lib/prompt.ts`의 시스템 프롬프트는 *"입력을 복사한 결과물은 실패다"*를 명시하고, 평가어→관찰사실 변환 few-shot 예시까지 포함한다. "이어붙이기" 출력은 프롬프트 결함이 아니라 **약한 모델**(flash-lite) 탓이다.

### 1.2 실측 (이 저장소의 무료 Gemini 키, 2026-07-06)
동일 사례(일반 생활지도, 타입1)로 측정:

| 항목 | 실측 |
|---|---|
| flash-lite 생성 | 본문 ~210자, 교사이해용 1항목, 향후지도 2항목 (얇음) |
| flash(dynamic) 생성 | **본문 ~260자, 교사이해용 2항목, 향후지도 3항목** (사안-특정, 입력 재구성됨) |
| flash 단일 지연 | 11.5 / 13.1 / 14.1 / 11.0초 → **~11~14초** |
| gemini-2.5-pro (무료) | **0.23초 만에 429** (일일/분당 한도 소진) |
| flash 2회 연속(정밀 시뮬) | **25.5초** |

**thinkingBudget 스위치 실측 (gemini-2.5-flash, 동일 프롬프트):**

| 설정 | 시간 | 추론 토큰 |
|---|---|---|
| off (budget 0) | **3.1초** | 0 |
| light (budget 512) | 4.6초 | 489 |
| dynamic (앱 현재 기본) | 11.3초 | 2017 |

**핵심 발견:**
- 무료 키에서 **pro는 사실상 사용 불가**(즉시 429). "강한 모델을 무료로"의 현실 상한은 `gemini-2.5-flash`.
- 앱은 `thinkingConfig`를 안 보내 **항상 dynamic(가장 느림)** → 생성이 11~14초 걸리던 근본 원인.
- 앱은 이미 429 시 최대 4회 자동 대기·재시도(`app/generate/page.tsx`)하지만 **같은 모델에 고정** — 다른 모델로 강등하는 폴백이 없다.

---

## 2. 설계

세 컴포넌트. 모두 서버(`lib/`) 중심, UI는 표시·토글만.

### 2.1 모델 폴백 사다리 (server)
- `req.ai.model`을 **선호 모델**로 두고 제공자별 사다리를 구성:
  - Gemini: `[선호, gemini-2.5-flash, gemini-2.5-flash-lite]` (중복 제거)
  - Claude: `[선호, claude-haiku-4-5]` · OpenAI: `[선호, gpt-4o-mini]`
- 사다리 순회: rung이 **429/503**이면(기존 ≤5초 짧은 in-process 재시도만) **즉시 다음 rung으로 강등**. 마지막 rung까지 실패해야 `LlmError`를 던져 기존 클라이언트 대기 루프로 넘어간다.
- 성공 시 **실제 사용 모델(`usedModel`)** 과 강등 사유를 반환한다.
- 근거: pro는 0.23초 만에 429 → 강등 비용이 무시할 수준. "pro 선택 = 사실상 flash 속도".

### 2.2 pro 등 명시 선택 시 투명한 강등
법적 증빙 문서이므로 조용한 품질 강등을 피한다.
- 결과 헤더에 표시: *"gemini-2.5-flash로 생성됨 · pro 한도 초과로 자동 전환"*.
- **"선호 모델로 다시 시도"** 버튼 제공(의도 존중 + 투명성).

### 2.3 정밀 모드 (2단계: 초안 → 비평·재작성)
무료에서 품질을 끌어올리는 실질 레버.
- **1단계 초안:** 기존 생성(사다리 적용) → JSON 초안.
- **2단계 비평·재작성:** 두 번째 호출. 입력 = 원자료 + 초안 JSON + 비평 루브릭:
  - 입력 어휘를 그대로 옮긴 부분을 관찰 서술로 재작성했는가
  - 평가어 → 구체 관찰사실 치환
  - 법률 단정 금지·헤지 준수
  - `teacherUnderstanding/safeGuidance/teacherMemo`가 일반론이면 사안-특정으로 구체화
  - 권장 분량 준수
  → 동일 스키마 JSON 반환.
- 요청 **순차 1개씩**(기존 원칙 유지), 각 호출 사다리 적용.
- **부분 실패 안전:** 2단계가 429/503/파싱실패면 → **초안 + 경고**("정밀 2단계 중 한도로 1단계 결과만 반환") 반환. 전체 실패로 만들지 않는다.

### 2.4 속도/품질 스위치 (thinkingBudget) — Gemini
- 3단계: **속도 우선(off, budget 0) / 균형(512) / 품질 우선(dynamic)**.
- `callLlm`의 Gemini 경로에서 `generationConfig.thinkingConfig.thinkingBudget`을 설정.
- Claude/OpenAI에는 해당 없음(무시). Claude는 이미 확장 추론 미요청 상태.
- **기본값:** 일반 유형 = 속도 우선(off) / 고위험 유형 = 품질 우선(dynamic).

### 2.5 정밀 모드 발동 규칙
- `ApiKeyPanel`(또는 폼)에 토글: **"정밀 모드 (2단계 · 요청 2배)"**, 기본 off.
- **고위험 유형(`type.highRisk`)은 정밀·품질 우선 기본 on**(끌 수 있음).

---

## 3. 예상 소요시간 (실측 기반)

| 모드 | 속도 우선(off) | 균형(512) | 품질 우선(dynamic) |
|---|---|---|---|
| 일반 · 정밀 off | ~3초 | ~4.5초 | ~12초 |
| 일반 · 정밀 on (2회) | ~6초 | ~9초 | ~24초 |
| 고위험 · 정밀 on (+법령 ~3초) | ~9초 | ~12초 | ~27초 |
| pro 선택(무료) | 위 + 0.2초 (즉시 flash 강등) | | |

법령 MCP(`lib/lawVerify.ts`)는 고위험만, 병렬 + 각 3.5초 타임아웃 → 상한 ~3.5초.

---

## 4. 데이터 흐름

```
클라이언트({ai(=thinkingLevel 포함), refineMode}) → POST /api/generate → runGenerate:
  ladder = buildLadder(ai)
  {result: draft, usedModel} = callLlmLadder(system, userPrompt, ladder, thinkingLevel)
  if refineMode:
     {result: refined} = callLlmLadder(critiqueSystem, critiquePrompt(draft), ladder, thinkingLevel)
       → 실패 시 draft + warning
  scanProhibited(최종본)            # 기존 로직 유지
  return {…final, usedModel, fallbackNote, refined, warnings}
```

---

## 5. 에러 처리

- 사다리 소진(전 rung 429/503) → 마지막 rung의 `LlmError`(retryAfterSec) → 기존 클라이언트 대기 루프.
- 정밀 2단계 호출 실패 → 초안 + 경고 반환(전체 실패 금지).
- 정밀 2단계 파싱 실패 → 초안 + 경고 반환.
- 금지 표현 스캔(`scanProhibited`/`applyConversions`)은 **최종본**에 대해 여전히 동작.

---

## 6. 손대는 파일

| 파일 | 변경 |
|---|---|
| `lib/types.ts` | `AiConfig`에 `thinkingLevel?`; `GenerateRequest`에 `refineMode?`; `GenerateResult`에 `usedModel?`·`fallbackNote?`·`refined?` |
| `lib/llm.ts` | 폴백 사다리(`callLlmLadder`), Gemini `thinkingConfig` 반영, `usedModel` 반환 |
| `lib/prompt.ts` | 비평·재작성 프롬프트(`buildCritiquePrompt`) |
| `lib/parseResult.ts` | `runGenerate`에 2단계·사다리·usedModel 통합 |
| `app/api/generate/route.ts` | 새 응답 필드 통과 |
| `app/generate/page.tsx` | 진행 표시(1/2·2/2), 사용 모델·강등 배지, "선호 모델로 다시 시도" |
| `components/ApiKeyPanel.tsx` | 속도/품질 스위치, 정밀 모드 토글 |
| `tests/*` (vitest) | 아래 |

---

## 7. 테스트 (기존 vitest)

- **사다리:** rung0=429, rung1=200 → `usedModel==rung1`, 결과=rung1.
- **사다리 소진:** 전부 429 → `LlmError`(retryAfterSec 포함) throw.
- **정밀 성공:** 초안·재작성 200 → `refined:true`, 재작성 결과 반환.
- **정밀 부분 실패:** 재작성 429 → 초안 + warning.
- **thinkingBudget:** off/light/dynamic가 Gemini 요청 body에 올바르게 매핑.
- **금지어 스캔:** 최종본(정밀 시 재작성본)에 대해 동작.

---

## 8. 비목표 (YAGNI)

- Best-of-N / self-consistency(초안 여러 개 생성 후 병합) — 무료 한도 소모 대비 이득 낮음.
- 유료 키 전용 pro 최적화 — 폴백으로 흡수.
- 스트리밍 출력 — 현 범위 밖.
