import type { AiConfig, AiProvider } from '@/lib/types';

/**
 * 생성 예상 소요 시간(초). 설계 문서 실측(gemini-2.5-flash)에 근거:
 * 속도 우선(off)≈3s · 균형(light)≈5s · 품질 우선(dynamic)≈11~14s. 정밀 모드는 2단계 순차 호출(×2).
 * Gemini 외 제공자는 추론 스위치가 없어 호출당 일반 추정치(~8s)를 쓴다.
 * 대기(한도) 시간은 포함하지 않는다 — 순수 생성(추론) 시간만.
 */
function perCallSeconds(ai: AiConfig): number {
  const provider: AiProvider = ai.mode === 'free' ? 'gemini' : (ai.provider ?? 'gemini');
  if (provider !== 'gemini') return 8;
  const level = ai.thinkingLevel ?? 'dynamic';
  if (level === 'off') return 3;
  if (level === 'light') return 5;
  return 13; // dynamic
}

export function estimateSeconds(ai: AiConfig, refineMode: boolean): number {
  return perCallSeconds(ai) * (refineMode ? 2 : 1);
}

/** 10초 미만은 그대로, 그 이상은 5초 단위로 반올림해 과도한 정밀함을 피한다. */
export function formatEstimate(sec: number): string {
  if (sec < 10) return `약 ${sec}초`;
  return `약 ${Math.round(sec / 5) * 5}초`;
}
