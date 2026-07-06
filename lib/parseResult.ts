import type { GenerateRequest, GenerateResult } from '@/lib/types';
import { validateSlots } from '@/lib/validation';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/prompt';
import { verifyLaws } from '@/lib/lawVerify';
import { callLlm } from '@/lib/llm';
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

  const warnings: string[] = [];

  const raw1 = await callLlm({ system, user, ai: req.ai, fetchImpl: opts?.fetchImpl, geminiKey: opts?.geminiKey });
  let parsed = parseModelJson(raw1);

  const scanTarget = () => parsed.body + '\n' + parsed.meta.bases;
  let hits = scanProhibited(scanTarget());
  if (hits.length > 0) {
    // Regenerate once with a stricter instruction naming the offending phrases.
    const stricter = user + '\n\n주의: 이전 초안에 다음 금지 표현이 있었다: ' +
      hits.map((h) => `'${h.matched}'`).join(', ') +
      '. 이 표현들을 제거하고 묘사 표현으로 바꿔 다시 작성하라.';
    const raw2 = await callLlm({ system, user: stricter, ai: req.ai, fetchImpl: opts?.fetchImpl, geminiKey: opts?.geminiKey });
    parsed = parseModelJson(raw2);
    hits = scanProhibited(scanTarget());
  }

  if (hits.length > 0) {
    const convBody = applyConversions(parsed.body);
    const convBases = applyConversions(parsed.meta.bases);
    parsed.body = convBody.text;
    parsed.meta.bases = convBases.text;
    warnings.push('일부 위험 표현이 감지되어 자동 조정했습니다. 반드시 검토 후 사용하세요.');
    warnings.push(...convBody.notes, ...convBases.notes);
  }

  return { ...parsed, warnings };
}
