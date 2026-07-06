import type { GenerateRequest, GenerateResult } from '@/lib/types';
import { validateSlots } from '@/lib/validation';
import { buildSystemPrompt, buildUserPrompt, buildCritiqueSystemPrompt, buildCritiquePrompt } from '@/lib/prompt';
import { verifyLaws } from '@/lib/lawVerify';
import { callLlmLadder, buildLadder } from '@/lib/llm';
import { applyConversions, scanProhibited } from '@/lib/prohibited';

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
  };
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter((s) => s.trim() !== '');
}

export async function runGenerate(
  req: GenerateRequest,
  opts?: { fetchImpl?: typeof fetch; geminiKey?: string; retryDelayMs?: number }
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
  const draftCall = await callLlmLadder({ system, user, ai: req.ai, models, fetchImpl: opts?.fetchImpl, geminiKey: opts?.geminiKey, retryDelayMs: opts?.retryDelayMs });
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
      const refineCall = await callLlmLadder({ system: buildCritiqueSystemPrompt(), user: critiqueUser, ai: req.ai, models, fetchImpl: opts?.fetchImpl, geminiKey: opts?.geminiKey, retryDelayMs: opts?.retryDelayMs });
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
