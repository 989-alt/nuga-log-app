import type { GenerateResult } from '@/lib/types';

/** NEIS 붙여넣기용 본문 + 메타 라벨을 한 덩어리 텍스트로 조립한다. */
export function neisText(r: GenerateResult): string {
  return [
    '[NEIS 누가기록 — 복사·붙여넣기용 / 평어 종결]',
    '',
    r.body,
    '',
    `[근거] ${r.meta.bases}`,
    `[유형] ${r.meta.caseType}`,
    `[글자수] ${r.meta.charCount}`,
    `[지도 단계] ${r.meta.guidanceStep}`,
    `[보호자 통보] ${r.meta.guardianNotice}`,
    `[후속] ${r.meta.followUp}`,
  ].join('\n');
}
