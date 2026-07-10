# 증빙 완결성 하네스 + 후속 기록 기능 Implementation Plan

> **For agentic workers:** superpowers:subagent-driven-development. 컨트롤러(Fable)가 설계·검증·리뷰 직접 수행.

**Goal:** ① 모든 유형의 누가기록에 "법적 증빙 완결성" 기준(반복 회차별 대응·종결 상태·절차는 완료 사실만·타학생 보호·특이 소견)을 적용하고, 미이행 절차는 새 블록 `[지금 해야 할 일]`(actionItems: 무엇을 지금 하고, 후에 어떻게 기록할지)로 안내 ② 기존 기록을 선택해 후속 절차를 대화로 알려주면 원 사건 컨텍스트+법령 검색(korean law MCP)을 참고해 **후속 누가기록**을 인터뷰→생성.

## Global Constraints
- 기존 파이프라인(인터뷰 게이트→검색→초안→검증 루프→환각 제거) 구조 유지. 새 의존성 금지. 한국어, 무저장·무로그, transcript 메모리 전용.
- **절차 구분 원칙(전 유형 공통):** 이행 의무가 있는 절차(보호자 통보·신고·관리자 보고·분리조치)는 본문에 **완료된 사실만**(일시·수단·상대 반응) 기재하고, 미완이면 본문에 "예정"으로 쓰지 않고 actionItems로 안내한다. 장래 교육 계획(재관찰·상담 예정·IEP 협의 예정)은 예정 표현 허용.
- `GenerateResult.actionItems?: { task: string; how: string }[]` — **optional**(기존 픽스처 무수정). 파싱 시 배열 정규화.
- FollowUpContext = `{ parentId: string; parentDate: string; caseTypeId: CaseTypeId; parentBody: string }` — slots 불필요(원 사실은 body에 있음). 기존 히스토리 항목도 후속 작성 가능.
- 후속 슬롯(유형 무관 고정, lib/followUp.ts): `followUpAction*(수행한 절차)`, `datetime*(수행 일시)`, `counterpart(상대·참여자)`, `outcome*(내용·결과)`, `nextStep(다음 계획)`.
- 검증: 로직 Vitest TDD, UI는 tsc+build, 최종 스모크 컨트롤러.

---

### Task 1: 생성 하네스 증빙 완결성 규칙 + actionItems 스키마
**Files:** Modify `lib/prompt.ts`, `lib/types.ts`, `lib/parseResult.ts` / Test `tests/evidenceRules.test.ts`
- `lib/types.ts`: `GenerateResult`에 `actionItems?: { task: string; how: string }[]` 추가.
- `buildSystemPrompt()`에 "증빙 완결성 규칙" 절 추가: (1) 반복 행동은 확정 횟수(불확실하면 "최소 N회")와 반복 시 교사 대응을 본문에 포함 (2) 상황 종결 상태(학생 진정·수업 복귀 등)를 본문 끝에 기재 (3) 절차 구분 원칙(Global Constraints 문구 그대로) (4) 다른 학생이 목격·연루된 사안은 취한 보호 조치를 기재(입력에 있을 때만) (5) 입력에 신체 특이 소견 점검 사실이 있으면 기재. + JSON 스키마에 `"actionItems": [{"task":"지금 수행할 절차","how":"수행 후 누가기록에 추가 기록할 문구 예시"}]` 추가(미이행 필수 절차 없으면 빈 배열) + EXAMPLE_OUTPUT에 actionItems 예시(예: 보호자 통보 미완 케이스가 아니므로 빈 배열 또는 통보 완료 기록 예시) 반영.
- `buildVerifyPrompt` 감사 축에 ⑤ 추가: "이행 의무 절차가 '~할 예정임'으로 본문에 있으면 missingElements에 지적한다(임의 삭제는 금지 — 지적만)."
- `parseResult.ts` `parseModelJson`: actionItems를 `{task,how}` 문자열 쌍 배열로 정규화(없거나 형식 불량이면 []).
- Test: 시스템 프롬프트에 규칙·스키마 포함 단언 + parseModelJson이 actionItems 정규화(정상/누락/불량 3케이스).
- 커밋: `feat: 증빙 완결성 규칙 + 지금 해야 할 일(actionItems) 스키마`

### Task 2: 인터뷰 수집 규칙 확장
**Files:** Modify `lib/interview.ts` / Test `tests/interviewEvidence.test.ts`
`buildInterviewSystemPrompt` 수집 원칙에 추가: (1) '- 행동이 반복된 사안이면 정확한 횟수(불확실하면 최소 횟수)와 각 반복 시 교사의 대응, 상황이 어떻게 종결되었는지를 반드시 묻는다.' (2) '- 보호자 통보·관리자 보고·신고 같은 절차는 완료했는지 아직인지 구분해 묻고, 완료면 일시·수단·상대 반응까지, 미완이면 슬롯 값에 "미완(예정: ...)" 형태로 수집한다.' (3) '- 다른 학생이 목격하거나 연루된 사안이면 다른 학생 보호를 위해 취한 조치를 묻는다.' Test: 포함 단언 3건 + 기존 테스트 green.
- 커밋: `feat: 인터뷰에 반복 회차·절차 완료 여부·타학생 보호 수집 규칙`

### Task 3: [지금 해야 할 일] 렌더 + 저장 텍스트
**Files:** Modify `components/ResultBlocks.tsx`, `lib/recordText.ts` / Test `tests/recordText.test.ts`(확장)
- ResultBlocks: `result.actionItems ?? []`가 비어있지 않으면 **본문 카드 바로 아래**(교사용 블록들보다 위)에 카드 렌더 — 헤더 "지금 해야 할 일 — 기록의 증빙력을 완성하세요" + `--warning` 톤 배지 "NEIS에 붙여넣지 말 것", 항목별 ① task(굵게) ② how(아래 줄, `--ink-soft`, "기록 방법: " 접두). 번호 매김.
- recordText `fullRecordText`: `[지금 해야 할 일]` 섹션을 legalProtection 뒤에 추가(빈 배열이면 생략, `- {task}\n  기록 방법: {how}` 형식). actionItems가 undefined여도 안전.
- Test: fullRecordText에 actionItems 포함/생략 케이스 추가.
- 커밋: `feat: 지금 해야 할 일 블록 렌더 + 저장 텍스트 포함`

### Task 4: 후속 기록 백엔드 — 인터뷰
**Files:** Modify `lib/types.ts`, `lib/interview.ts`, `lib/chatTurn.ts` / Create `lib/followUp.ts` / Test `tests/followUpInterview.test.ts`
- types: `FollowUpContext`(Global Constraints 형태), `ChatTurnRequest.followUp?: FollowUpContext`, `GenerateRequest.followUp?: FollowUpContext`, `HistoryItem`(lib/history.ts)에 `parentId?: string` 추가.
- `lib/followUp.ts`: `FOLLOWUP_SLOTS: SlotDef[]`(위 5종, required 표기), `validateFollowUpSlots(slots): string[]`(필수 누락 키 반환), `followUpSlotSpecLine(): string`(키*(라벨) 나열).
- interview.ts: `buildFollowUpInterviewPrompt(specialEd, followUp)` — 역할: 원 사건(parentDate·유형명·parentBody 전문)을 제시하고 "교사가 그 후 밟은 절차"를 인터뷰(예: 보호자 통보 완료, 상담 실시, 협의회 개최, 재관찰 결과, 전문기관 연계, 신고). 기존 JSON 턴 형식·법령 grounding·지도방법 제안 규칙 재사용(공통 부분 함수 추출 허용), 슬롯 키는 FOLLOWUP_SLOTS만, caseTypeId는 항상 원 사건 값 유지, 다 모이면 정확히 "이 내용을 바탕으로 후속 누가기록 초안을 생성할까요?"로 끝맺기. `applyFollowUpGate(modelReady, mergedSlots): boolean`.
- chatTurn.ts: `req.followUp` 있으면 follow-up 프롬프트+게이트 분기(caseTypeId는 req.followUp.caseTypeId 고정 반환).
- Test: 프롬프트에 parentBody·후속 슬롯 키·확인질문 포함, 게이트 필수슬롯 동작, chatTurn 분기(목 LLM).
- 커밋: `feat: 후속 기록 인터뷰(원 사건 컨텍스트+후속 슬롯 게이트)`

### Task 5: 후속 기록 백엔드 — 생성
**Files:** Modify `lib/prompt.ts`, `lib/parseResult.ts`, `app/api/generate/route.ts` / Test `tests/followUpGenerate.test.ts`
- prompt.ts: `buildFollowUpUserPrompt({ followUp, slots, specialEd, basis })` — 구조: 원 기록(날짜+본문 전문) 제시 → "아래는 그 후속 조치의 원자료" + FOLLOWUP_SLOTS 라벨별 값 → 요구: 후속 누가기록 본문은 "M월 D일 기록된 ○○ 사안의 후속 조치로서 …함" 취지로 원 사안을 1구절로만 참조(재서술 금지), 평어 한 문단, 동일 JSON 스키마(meta.caseType은 "『유형명』 후속 기록", actionItems에는 아직 남은 절차). 시스템 프롬프트는 기존 buildSystemPrompt 재사용.
- parseResult.ts `runGenerate`: args에 `followUp?` 추가 — 있으면 ① 검색 키워드를 [유형명, slots.followUpAction, slots.outcome]로 ② buildFollowUpUserPrompt 사용 ③ 검증 루프·환각 제거는 동일 적용.
- generate route: body.followUp 전달 + followUp 시 validateSlots 대신 `validateFollowUpSlots`.
- Test(목 LLM·목 MCP): followUp 경로가 후속 프롬프트를 사용하고 결과 파싱·판례 허용목록이 동작하는지, 라우트 검증 분기.
- 커밋: `feat: 후속 누가기록 생성 경로(원 사건 참조+법령 검색+검증 루프)`

### Task 6: 후속 기록 프론트
**Files:** Create `components/Home.tsx` / Modify `app/page.tsx`, `components/Chat.tsx`, `components/RecentRecords.tsx`, `lib/history.ts`
- `Home.tsx`('use client'): `followUpTarget` 상태(HistoryItem|null) 보유, `<Chat followUpTarget onDone={()=>setFollowUpTarget(null)} />`와 `<RecentRecords onFollowUp={setFollowUpTarget} />` 렌더. `app/page.tsx`는 SiteHeader+`<Home/>`로.
- RecentRecords: 각 항목에 "후속 기록 작성" 버튼(onFollowUp prop 있을 때만) → 해당 HistoryItem 전달. `parentId` 있는 항목은 "↳ 후속" 배지 표시. 클릭 시 페이지 상단 챗으로 스크롤(window.scrollTo — 명시적 사용자 액션이므로 허용).
- Chat: props `{ followUpTarget?: HistoryItem | null; onDone?: () => void }`. followUpTarget 설정 시: 챗 상태 리셋 + 상단에 원 기록 배너(날짜·유형·본문 앞 60자, "후속 기록 작성 중" 라벨 + "취소" 버튼→onDone) + 봇 첫 메시지 로컬 삽입: "{M월 D일} 기록의 후속 기록이군요. 어떤 절차를 밟으셨나요? (예: 보호자 통보 완료, 상담 실시, 협의회 개최, 재관찰 결과, 전문기관 연계)" + 이후 /api/chat·/api/generate 요청에 `followUp: { parentId, parentDate: item.date, caseTypeId: item.caseTypeId, parentBody: item.result.body }` 포함, readyToGenerate 퀵리플라이는 기존 재사용, 생성 성공 시 addHistory에 `parentId` 포함.
- 검증: tsc 0 + build + vitest green.
- 커밋: `feat: 기존 기록에서 후속 기록 작성 흐름(배너·첫 안내·parentId 저장)`

### Task 7 (컨트롤러): 최종 게이트 + 스모크(후속 흐름 포함) + master 병합·배포
