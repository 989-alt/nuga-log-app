# 챗봇 UX 개선 + 프론트 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. 컨트롤러(Fable)가 설계·검증·리뷰를 직접 수행한다.

**Goal:** ① 생성 시 "네트워크 오류" 근본 수정 ② 챗 UX 개선(페이지 점프 제거, 타이핑 인디케이터, 퀵리플라이 예/아니오, 하단 생성 callout 제거) ③ 인터뷰 LLM의 지도방법 제안(조문·판례·교육학 근거) ④ 레퍼런스(더함 소프트블루 + trost 친근함 + Iconora 글래스 3D 아이콘) 기반 리디자인 + kie.ai gpt-image-2 에셋.

**진단 확정(수정 근거):** `/api/generate`는 LLM 직렬 다회 호출인데 `lib/llm.ts` `fetchWithRetry`가 429 시 제공자 힌트(25~30초+)만큼 함수 안에서 sleep 후 재시도 → Vercel `maxDuration=60` 초과 → 504가 비JSON 본문으로 반환 → `Chat.tsx`의 `await res.json()`이 throw → catch가 "네트워크 오류"로 오표시.

## Global Constraints

- 기존 아키텍처(Next.js 14 App Router, CSS 변수 토큰, Vitest node 환경) 유지. 새 런타임 의존성 금지(dev 포함).
- 모든 사용자 대면 문자열 한국어, `wordBreak: keep-all`. 텍스트 대비 4.5:1 이상(ui-ux-pro-max 접근성 규칙).
- 애니메이션: 의미 전달용만, `prefers-reduced-motion` 존중. 10초+ 무정보 스피너 금지(AI Interaction 가이드라인) — 단계 문구로 대체.
- transcript 메모리 전용·최종본만 localStorage — 기존 원칙 불변. 서버 무저장·무로그.
- **토큰 변수명은 유지하고 값만 교체**(컴포넌트 전반 blast radius 최소화). 새 토큰 추가는 허용.
- 에셋: kie.ai gpt-image-2(`~/.claude/skills/education-pptx/scripts/image_gen.py`, 키는 `~/chaos-race/.env`의 `KIE.AI_API_KEY` — cwd를 `~/chaos-race`로 두면 자동 로드). 투명 배경 미지원 → 페이지 배경색(#eef5ff)과 동일한 배경으로 생성해 원형/라운드 컨테이너에 담는다. 이미지 내 텍스트 금지 문구 필수.
- 검증: 로직은 Vitest TDD. UI는 `npx tsc --noEmit`+`npm run build`+태스크별 셀프 스크린샷(권장) / 최종 E2E 스모크는 컨트롤러 수행.

## 디자인 스펙 (레퍼런스 3장 + ui-ux-pro-max 근거)

**컨셉 "맑은 상담실":** 더함의 깔끔한 소프트블루 + trost의 따뜻한 상담 어조 + Iconora의 프로스티드 글래스 3D 아이콘.

`app/globals.css` 토큰 교체표 (변수명 유지):

| 변수 | 현재 | 신규 |
|---|---|---|
| --accent | #4338ca | **#2563eb** (white 위 ~5.2:1) |
| --accent-hover | #362eb0 | #1d4ed8 |
| --accent-weak | #eef0fb | #eaf1ff |
| --accent-border | #cdd0f3 | #c3d7fe |
| --accent-ring | rgba(67,56,202,.18) | rgba(37,99,235,.18) |
| --bg | #f5f8fc | **#f0f6ff** |
| --surface-sunken | #f2f5fa | #f3f7fd |
| --line | #e3e8ef | #dfe8f5 |
| --line-strong | #c9d3df | #c5d4e8 |
| --header-bg | #0d1b2a | **rgba(255,255,255,.82)** (라이트 글래스 헤더) |
| --header-fg | #e8eef6 | #0d1b2a |
| --header-muted | #9fb0c4 | #566476 |

추가 토큰: `--radius-lg: 16px`(카드), `--bubble-radius: 18px`, `--glass-bg: rgba(255,255,255,.65)`, `--glass-border: rgba(255,255,255,.55)`, `--shadow-soft: 0 8px 30px rgba(37,99,235,.08)`.
body 배경: `linear-gradient(180deg, #e7f0ff 0%, #f0f6ff 320px)` 고정(스크롤 시에도 `background-attachment` 불필요 — body 전체 그라디언트).
헤더: sticky + `backdrop-filter: blur(14px)` 글래스, 텍스트/자물쇠 잉크색으로 반전. ink/의미색/타이포 토큰은 유지.

**에셋 5종** (`public/glass/*.png`, 1:1 1024, 스타일 공통 프롬프트: "frosted glass 3D icon, translucent light-blue glass with white frost, soft studio lighting, subtle depth, premium glassmorphism icon style, centered, solid pale blue background (#EEF5FF). No text, no letters, no watermark."):

| 파일 | 모티프 | 사용처 |
|---|---|---|
| hero-chat.png | 둥근 말풍선 + 작은 반짝임 | 챗 빈 상태(스레드 empty) |
| icon-scale.png | 법률 저울 | LegalProtectionBlock 헤더 |
| icon-doc-search.png | 문서+돋보기 | 판례 더 찾기 영역 |
| icon-folder.png | 체크 표시 폴더 | RecentRecords 헤더/빈 상태 |
| icon-shield.png | 체크 방패 | 랜딩 히어로 보조(신뢰 배지) |

## 파일 구조

**생성:** `components/TypingIndicator.tsx`, `components/QuickReplies.tsx`, `public/glass/*.png`(5), `tests/llmRetryCap.test.ts`, `tests/interviewGuidance.test.ts`
**수정:** `lib/llm.ts`, `components/Chat.tsx`, `components/ChatThread.tsx`, `lib/interview.ts`, `app/globals.css`, `components/SiteHeader.tsx`, `app/page.tsx`, `components/LegalProtectionBlock.tsx`, `components/RecentRecords.tsx`

---

### Task 1: 생성 "네트워크 오류" 근본 수정 (서버 대기 캡 + 클라이언트 JSON 가드)

**Files:** Modify `lib/llm.ts`, `components/Chat.tsx` / Test `tests/llmRetryCap.test.ts`

**서버(`lib/llm.ts` `fetchWithRetry`):** 429/503 재시도 대기 `waitMs`가 **8000ms를 초과하면 재시도하지 않고 즉시** 해당 상태의 `LlmError`(retryAfterSec 포함)를 throw한다(함수 타임아웃 예산 보호 — 클라이언트에 재시도 UX가 이미 있음). 8000ms 이하면 기존대로 1회 재시도. 기존 시그니처·기본 delay 2000ms 유지.

**클라이언트(`components/Chat.tsx`):** `sendTurn`·`handleGenerate` 둘 다 `const data = await res.json()`을 `res.json().catch(() => null)`로 교체하고:
- `data === null && !res.ok` → status별 문구: 504/502 → "서버 처리 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."(재시도 버튼 유지), 그 외 → "서버 응답을 해석하지 못했습니다(상태 {status}). 다시 시도해 주세요."
- `data === null && res.ok` → 동일한 해석 실패 문구. 나머지 기존 로직 유지.

**Test (`tests/llmRetryCap.test.ts`):** fetch 목으로 ① Retry-After 30s인 429 → sleep 없이 즉시 LlmError(429, retryAfterSec=30) throw(재호출 1회뿐임을 목 호출수로 확인) ② Retry-After 3s인 429 → 1회 재시도 후 성공. 기존 llm 테스트 깨지지 않아야 함.

Steps: 실패 테스트 → 확인 → 구현 → PASS → `npx vitest run` 전체 green → 커밋 `fix: 생성 타임아웃 근본 수정 — 서버 재시도 대기 캡 + 응답 해석 가드`

---

### Task 2: 인터뷰 프롬프트 확장 — 지도방법 제안 + 확인질문 + '아니오' 후속

**Files:** Modify `lib/interview.ts` / Test `tests/interviewGuidance.test.ts`
**참고:** `lib/legalKb.ts`(`groundingText(specialEd: boolean)` — 핵심 조문·판례 텍스트)

`buildInterviewSystemPrompt(specialEd)`에 추가(기존 규칙 유지):
1. **근거 주입:** lines에 `'[참고 법령·판례]'` + `groundingText(specialEd.isSpecialEd)` 삽입(슬롯 키 명세 앞).
2. **지도방법 제안 규칙:** `'- 교사가 지도 방법을 모르겠다고 하거나 어떻게 해야 할지 물으면, 위 법령·판례와 교육학적 원칙(비례성, 단계적 개입, 긍정행동지원)에 근거한 지도 방법을 2~3가지 제안하고 각 방법의 근거(조문·판례 번호)를 assistantMessage 안에 함께 밝힌다.'`
3. **확인 질문 규칙:** `'- 필수(*) 슬롯이 모두 모여 readyToGenerate를 true로 낼 때는, assistantMessage를 수집 내용 한 줄 요약 뒤 정확히 "이 내용을 바탕으로 NEIS 누가기록 초안을 생성할까요?" 로 끝맺는다.'`
4. **'아니오' 후속 규칙:** `'- 교사가 초안 생성 확인에 아니오라고 답하거나 추가·수정할 내용이 있다고 하면, 어떤 내용을 추가·수정할지 구체적으로 되묻는다(readyToGenerate는 다시 false).'`

**Test:** 프롬프트에 `'생성할까요?'` 문구 규칙·`groundingText` 산출물 일부(예: 첫 조문 제목)·`'지도 방법'` 제안 규칙이 포함되는지 포함-단언. 기존 interview 테스트 green 유지.

커밋: `feat: 인터뷰에 법령 근거 주입 + 지도방법 제안·초안 확인·아니오 후속 규칙`

---

### Task 3: 디자인 토큰 리뉴얼 + 글래스 헤더

**Files:** Modify `app/globals.css`, `components/SiteHeader.tsx`

- 위 **디자인 스펙 교체표** 그대로 토큰 값 교체 + 추가 토큰 4종 + body 그라디언트.
- `.card` 라운딩 `var(--radius-lg)`(16px)·`box-shadow: var(--shadow-soft)`로, `.btn` 라운딩 12px로 상향.
- `SiteHeader`: sticky + 글래스(`backdrop-filter: blur(14px)`, `background: var(--header-bg)`, `border-bottom: 1px solid var(--line)`), 로고 심볼은 `--accent` 원형 배지 유지하되 텍스트 잉크색. "기록은 이 브라우저에만 저장" 배지는 `--accent-weak` 칩으로.
- `prefers-reduced-motion` 미디어쿼리 골격 추가(이후 태스크의 애니메이션이 사용).
- 다크모드는 미지원 현행 유지. 대비: 본문 잉크 토큰 불변이므로 4.5:1 유지 확인(변경분은 accent 계열뿐).

검증: `npx tsc --noEmit` 0, `npm run build` 성공, dev 스크린샷 1장 리포트 첨부(권장 — playwright 한 컷).
커밋: `feat: 소프트블루 토큰 리뉴얼 + 글래스 헤더 (레퍼런스 기반)`

---

### Task 4: kie.ai 글래스 3D 에셋 5종 생성

**Files:** Create `public/glass/{hero-chat,icon-scale,icon-doc-search,icon-folder,icon-shield}.png`

- 실행: `cd "/c/Users/4F 전담실/chaos-race" && python "/c/Users/4F 전담실/.claude/skills/education-pptx/scripts/image_gen.py" --provider kie "<프롬프트>" --aspect 1:1 --filename "/c/Users/4F 전담실/nuga-log-app/public/glass/<이름>.png"` (키는 cwd의 .env에서 자동 로드. 스크립트 옵션은 `--help`로 확인 후 맞춰 호출)
- 프롬프트: 디자인 스펙의 공통 프롬프트 + 파일별 모티프. **이미지 안 텍스트 금지 문구 포함.**
- 각 생성물 검증: 파일 존재 + 0.2MB~4MB + (가능하면) 파이썬 PIL로 크기 확인. 생성 실패 시 1회 재시도, 그래도 실패면 해당 파일만 BLOCKED 보고.
- 커밋: `feat: kie.ai 글래스 3D 아이콘 에셋 5종 추가`

---

### Task 5: ChatThread 개선 — 스크롤 격리 + 타이핑 인디케이터

**Files:** Modify `components/ChatThread.tsx` / Create `components/TypingIndicator.tsx` / Modify `app/globals.css`(키프레임)

- **스크롤 격리(페이지 점프 제거):** `scrollIntoView` 제거. 스레드 컨테이너 ref에 `container.scrollTop = container.scrollHeight`로만 스크롤(페이지 스크롤 불변). 사용자가 위로 60px 이상 스크롤해 있으면 자동 스크롤 생략(읽는 중 존중). 새 메시지·타이핑 상태 변화 시에만 동작.
- **TypingIndicator:** props `{ mode: 'chat' | 'generate' }`. 어시스턴트 말풍선 스타일로:
  - 점 3개 바운스 애니메이션(`@keyframes typing-dot`, 1.2s 무한, `prefers-reduced-motion`이면 정적 점).
  - 회전 문구(3초 간격 페이드 교체, mode별): chat → ["답변을 준비하고 있어요…","사안을 살펴보고 있어요…","필요한 사실을 정리하고 있어요…"] / generate → ["누가기록 초안을 작성하고 있어요…","법령·판례를 확인하고 있어요…","문장을 다듬고 있어요…"]. 회전은 setInterval+state, 언마운트 정리.
- `ChatThread` props 확장: `{ messages, typing?: 'chat' | 'generate' | null }` — typing이면 목록 끝에 TypingIndicator 렌더.
- 말풍선 리스타일: 사용자=`--accent` 배경 유지, 어시스턴트=`--surface`+`--line` 테두리+`--bubble-radius`. 빈 상태에 `public/glass/hero-chat.png`(Task 4) 96px 라운드 이미지 + 기존 안내 문구.

검증: tsc 0 + build + (권장) 타이핑 상태 스크린샷. 커밋: `feat: 스레드 스크롤 격리 + 타이핑 인디케이터(회전 문구 애니메이션)`

---

### Task 6: 퀵리플라이(예/아니오) + 하단 생성 callout 제거

**Files:** Modify `components/Chat.tsx` / Create `components/QuickReplies.tsx`

- **QuickReplies:** `{ options: { label: string; variant?: 'primary' | 'ghost'; onSelect: () => void }[] }` — 마지막 어시스턴트 말풍선 바로 아래 칩 버튼 행(44px 최소 터치, `--accent-weak` 배경/`--accent` 텍스트, primary는 채움). 스레드 안(ChatThread 하단이 아니라 Chat에서 스레드 카드 내부에) 렌더.
- **Chat.tsx 흐름 재배선:**
  - busy를 `chatBusy`/`genBusy`로 분리. `ChatThread`에 `typing={chatBusy ? 'chat' : genBusy ? 'generate' : null}` 전달.
  - `chatState.readyToGenerate && !result && !genBusy`일 때 QuickReplies 표시: **[네, 초안을 만들어 주세요]**(primary) → `handleGenerate()` / **[아니오, 추가할 내용이 있어요]** → `send('추가하거나 수정할 내용이 있어요.')`(일반 턴 전송 — Task 2 규칙이 되묻기 처리).
  - **기존 하단 `callout-info` "필요한 사실이 모두 모였습니다 + 누가기록 생성 버튼" 블록 삭제.** genError callout은 유지(재시도 버튼 포함, Task 1 문구).
  - 생성 완료 후 스레드에 어시스턴트 안내 1줄을 로컬로 추가: "초안을 만들었어요. 아래에서 확인하고 복사·저장해 주세요." (서버 왕복 없이 `withTurnResponse`가 아닌 메시지 배열에 직접 append — readyToGenerate 상태 건드리지 않음).
  - 입력창·전송은 `chatBusy || genBusy` 동안 비활성.

검증: tsc 0 + build. 커밋: `feat: 초안 확인 퀵리플라이 예/아니오 + 하단 생성 배너 제거`

---

### Task 7: 랜딩·블록 리디자인 마감 (에셋 적용)

**Files:** Modify `app/page.tsx`, `components/LegalProtectionBlock.tsx`, `components/RecentRecords.tsx`

- `app/page.tsx` 히어로: 좌측 카피(현행 유지) + 우측 `icon-shield.png` 112px 글래스 타일(라운드 24px, `--accent-weak` 배경, 모바일에서는 카피 아래 중앙). "법적 단정 표현 자동 필터" 문구를 trost풍 신뢰 칩 3개로: [고시·법령 근거] [판례 검증] [브라우저에만 저장] (`--accent-weak` 칩, `next/image` 사용).
- `LegalProtectionBlock` 헤더 좌측에 `icon-scale.png` 36px 라운드 타일. "판례 더 찾기" 영역에 `icon-doc-search.png` 28px.
- `RecentRecords` 헤더에 `icon-folder.png` 28px, 빈 상태 문구에 96px 타일 + "아직 기록이 없어요. 첫 사안을 대화로 알려 주세요."
- 이미지는 모두 `next/image`(width/height 명시 — CLS 방지, ui-ux-pro-max 성능 규칙), alt 한국어.

검증: tsc 0 + build + 랜딩 스크린샷. 커밋: `feat: 글래스 에셋 적용 — 히어로·법적보호·최근기록 리디자인 마감`

---

### Task 8 (컨트롤러 직접): 최종 게이트 + E2E 스모크

`npx vitest run` 전체 green / `npx tsc --noEmit` 0 / `npm run build` 성공 → 실앱 스모크(스크롤 점프 없음, 타이핑 인디케이터, 퀵리플라이 예/아니오 흐름, 생성 오류 문구, 리디자인 시각 확인 — 스크린샷) → master 병합·푸시는 스모크 통과 후.
