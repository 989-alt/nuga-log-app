import type { CaseTypeId, GenerateResult } from '@/lib/types';

const KEY = 'nuga-log-history-v1';
const CAP = 30;

export interface HistoryItem {
  id: string;
  date: string;
  caseTypeId: CaseTypeId;
  result: GenerateResult;
}

export function makeId(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function addHistory(item: HistoryItem): void {
  if (typeof window === 'undefined') return;
  const next = [item, ...loadHistory()].slice(0, CAP);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
