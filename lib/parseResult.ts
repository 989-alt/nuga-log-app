import type { GenerateRequest, GenerateResult, LegalProtection } from '@/lib/types';
import { validateSlots } from '@/lib/validation';
import { getCaseType } from '@/lib/caseTypes';
import { buildSystemPrompt, buildUserPrompt, buildVerifyPrompt } from '@/lib/prompt';
import { retrieveBasis } from '@/lib/lawRetrieval';
import { allowedCaseSet, stripUnknownCaseNumbers } from '@/lib/precedentGuard';
import { callLlmLadder, buildLadder } from '@/lib/llm';
import { applyConversions, scanProhibited } from '@/lib/prohibited';

const MAX_VERIFY_ROUNDS = 2;

export function parseModelJson(raw: string): Omit<GenerateResult, 'warnings'> {
  let text = raw.trim();
  text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 응답을 해석하지 못했습니다');
  }
  const slice = text.slice(start, end + 1);
  let obj: any;
  try {
    obj = JSON.parse(slice);
  } catch {
    throw new Error('AI 응답을 해석하지 못했습니다');
  }
  return {
    body: String(obj.body ?? ''),
    meta: {
      bases: String(obj.meta?.bases ?? ''),
      caseType: String(obj.meta?.caseType ?? ''),
      charCount: String(obj.meta?.charCount ?? ''),
      guidanceStep: String(obj.meta?.guidanceStep ?? ''),
      guardianNotice: String(obj.meta?.guardianNotice ?? ''),
      followUp: String(obj.meta?.followUp ?? ''),
    },
    teacherUnderstanding: toStringArray(obj.teacherUnderstanding),
    safeGuidance: toStringArray(obj.safeGuidance),
    teacherMemo: toStringArray(obj.teacherMemo),
    legalProtection: toLegalProtection(obj.legalProtection),
  };
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter((s) => s.trim() !== '');
}

function toLegalProtection(v: unknown): import('@/lib/types').LegalProtection[] {
  if (!Array.isArray(v)) return [];
  return v.map((x: any) => ({
    element: String(x?.element ?? ''),
    support: String(x?.support ?? ''),
    caseRefs: Array.isArray(x?.caseRefs) ? x.caseRefs.map((c: any) => String(c)).filter((s: string) => s.trim() !== '') : [],
  })).filter((p) => p.element.trim() !== '' || p.support.trim() !== '');
}

export async function runGenerate(
  req: GenerateRequest,
  opts?: { fetchImpl?: typeof fetch; geminiKey?: string; retryDelayMs?: number }
): Promise<GenerateResult> {
  const missing = validateSlots(req.caseTypeId, req.slots);
  if (missing.length > 0) {
    throw new Error(`필수 항목이 비어 있습니다: ${missing.join(', ')}`);
  }

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
