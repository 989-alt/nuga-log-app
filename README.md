# nuga-log-app

교실 사안을 입력하면 NEIS 누가기록(평어 종결)과 교사용 참고 메모를 생성하는 웹앱. `neis-behavior-log` Claude Code 스킬의 규칙을 서버 프롬프트로 이식했다.

## 동작
- 사안 유형 선택(7종) → 유형별 구조화 폼(필수 항목 미입력 시 제출 차단) → `POST /api/generate` → 5블록 결과(본문 / 근거 / 교사 이해용 / 향후 안전한 지도 방법 / 교사 보관 메모).
- 고위험 유형(학교폭력·자해자살·아동학대의심·긴급제지·학부모민원)은 https://korean-law-mcp-shared.vercel.app 로 현행 법령을 실시간 대조하고, 실패 시 조용히 정적 인용으로 폴백한다.

## AI 계층
- **무료**: 서버 환경변수 `GEMINI_API_KEY`(기본 모델 `gemini-2.5-flash`). Vercel 대시보드에만 저장하고 코드/커밋에는 넣지 않는다.
- **내 키(BYOK)**: 브라우저에서 Gemini / Claude / OpenAI 키를 입력. 키는 이 브라우저 localStorage에만 저장되고, 생성 요청 처리에만 서버로 전달되며 서버에 저장·로그하지 않는다.

## 프라이버시
- 서버 DB·로그인 없음. 서버는 학생 개인정보(이름·사안 내용)나 API 키를 로그로 남기지 않는다. 결과는 브라우저 localStorage(`nuga-log-history-v1`)에만 저장된다.

## 법령 데이터 유지보수
- `data/legal-content.json`은 `neis-behavior-log` 스킬의 `references/legal-basis.md`·`assets/templates.md`를 1회 포팅한 것이다. 법령이 개정되면 스킬 마크다운과 이 JSON을 **함께** 갱신해야 한다(자동 동기화 없음).

## 개발
- `npm install` (경로에 한글+공백이 있어 husky 크래시가 나면 `HUSKY=0 npm install`)
- `npm run dev` — http://localhost:3000
- `npm test` — Vitest 유닛 테스트
- `.env.local`에 `GEMINI_API_KEY=` 설정(무료 티어 로컬 테스트용). `.env.local`은 gitignore됨.

## 배포
- Vercel. 환경변수 `GEMINI_API_KEY`를 프로덕션에 설정한다(값은 대시보드/CLI로만).

## 면책
- 생성된 누가기록은 초안이다. 교사가 반드시 사실관계와 표현을 검토한 뒤 NEIS에 입력해야 한다. 법적 판단(범죄 성립 여부 등)은 본 도구가 하지 않으며, 수사기관·법원·교권보호위원회·학교폭력전담기구의 몫이다.
