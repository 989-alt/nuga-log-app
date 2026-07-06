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

  // 생성 1회당 LLM 요청은 정확히 1번만 보낸다(요청 한도 절약·순차성).
  // 금지 표현이 있으면 재생성(2차 호출) 대신 결정론적 치환으로 안전하게 처리한다.
  const raw1 = await callLlm({ system, user, ai: req.ai, fetchImpl: opts?.fetchImpl, geminiKey: opts?.geminiKey });
  const parsed = parseModelJson(raw1);

  const hits = scanProhibited(parsed.body + '\n' + parsed.meta.bases);

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
