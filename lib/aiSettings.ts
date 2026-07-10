import type { AiConfig } from '@/lib/types';

const KEY = 'nuga-log-ai-v1';

/** 저장된 설정(레거시 무료 모드 포함)을 항상 BYOK 형태로 정규화한다. 무료 모드는 더 이상 지원하지 않는다. */
function normalizeToByok(cfg: Partial<AiConfig> | null | undefined): AiConfig {
  return {
    mode: 'byok',
    provider: cfg?.provider ?? 'gemini',
    apiKey: cfg?.apiKey ?? '',
    model: cfg?.model ?? '',
    thinkingLevel: cfg?.thinkingLevel,
  };
}

export function loadAiSettings(): AiConfig {
  if (typeof window === 'undefined') return normalizeToByok(null);
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return normalizeToByok(null);
    return normalizeToByok(JSON.parse(raw) as Partial<AiConfig>);
  } catch {
    return normalizeToByok(null);
  }
}

export function saveAiSettings(cfg: AiConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* ignore quota errors */
  }
}
