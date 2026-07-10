import type { GenerateResult, LegalProtection } from '@/lib/types';
import { neisText } from '@/lib/format';

function section(title: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return ['', `[${title} — NEIS에 붙여넣지 말 것]`, ...lines.map((l) => `- ${l}`)];
}

function legalLines(items: LegalProtection[]): string[] {
  return items.map((p) => {
    const refs = p.caseRefs.length ? ` (참고 판례: ${p.caseRefs.join(', ')})` : '';
    return `${p.element}: ${p.support}${refs}`;
  });
}

export function fullRecordText(r: GenerateResult): string {
  return [
    neisText(r),
    ...section('교사 이해용 — 법령·판례 풀이', r.teacherUnderstanding),
    ...section('향후 안전한 지도 방법 — 교사용', r.safeGuidance),
    ...section('교사 보관 메모', r.teacherMemo),
    ...section('법적 보호 분석 — 교사용', legalLines(r.legalProtection)),
  ].join('\n');
}

export function recordFilename(r: GenerateResult, isoDate: string): string {
  const raw = (r.meta.caseType ?? '').trim();
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\/\\:*?"<>|\x00-\x1f]/g, '').replace(/\s+/g, '_').slice(0, 20);
  const summary = cleaned || '기록';
  return `누가기록_${isoDate}_${summary}.txt`;
}
