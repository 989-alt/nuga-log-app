# Evals regression mapping (from neis-behavior-log skill)

The skill's `evals/evals.json` cases map to this app as follows:

- **Eval 1 (일반-주의-친구필통)** → Task 12 browser + a live `/api/generate` run. Verified: a type-1 필통 사안 produced a 평어 종결 본문 ('~되었음/~하였음/~예정임'), all six meta labels ([근거]/[유형]/[글자수]/[지도 단계]/[보호자 통보]/[후속]), the other student rendered as '다른 학생' (masked), no medical/evaluation language, plain text with single quotes only, ~169자. Confirmed live on 2026-07-06.
- **Eval 2 (자해징후-위기개입)** → type 4 form. Manual check before release: submit the eval-2 facts and confirm no medical speculation, guardian-notice time present, external-link present.
- **Eval 3 (학부모-악성민원-교권침해)** → type 7 form. Manual check: 제19조/제20조 in [근거], guardian utterance masked, principal-report time present.
- **Eval 4 (짧은입력-추가질문)** → satisfied structurally: this web app CANNOT submit with blank required slots (client-side required-slot gate, unit-tested in `tests/validation.test.ts`, and verified in the browser — the submit button stays disabled until all required fields are filled). The skill's "don't fabricate from sparse input" behavior is enforced by the form, not by re-prompting.

Run evals 1–3 manually against a working AI key before each release; eval 4 is covered by the automated validation unit tests and the browser gating check.

## Browser smoke test result (2026-07-06)
- 7 case-type cards render on the home page: PASS
- Card click → `/generate?type=<id>` with the correct form fields: PASS (see production-build note below)
- Submit disabled on empty required fields; enabled after filling: PASS
- Live generation: proven via direct `/api/generate` call (HTTP 200, valid 5-block result). The Playwright run's own generation step hit the free-tier Gemini rate limit (429, external) — not an app defect; the app surfaces a clean error and does not crash.
- Free-tier model note: `gemini-2.0-flash` free-tier request quota is 0 (retired); the app defaults to `gemini-2.5-flash` which works on the free tier (rate-limited).
- Dev-mode note: a Next.js dev-server RSC/webpack chunk error was observed on card-click navigation and self-healed via full-page reload; attributed to hot-reload chunk mismatch during development. Production-build navigation is verified separately on the Vercel deploy.
