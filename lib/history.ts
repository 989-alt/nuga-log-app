import type { CaseTypeId, GenerateResult } from '@/lib/types';

const KEY = 'nuga-log-history-v1';
const CAP = 30;

export interface HistoryItem {
  id: string;
  date: string;
  caseTypeId: CaseTypeId;
  result: GenerateResult;
  // 이 기록이 다른 기록의 후속 기록으로 작성되었으면 원 기록의 id.
  parentId?: string;
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
