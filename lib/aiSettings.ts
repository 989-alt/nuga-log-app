import type { AiConfig } from '@/lib/types';

const KEY = 'nuga-log-ai-v1';

export function loadAiSettings(): AiConfig {
  if (typeof window === 'undefined') return { mode: 'free' };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { mode: 'free' };
    return JSON.parse(raw) as AiConfig;
  } catch {
    return { mode: 'free' };
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
