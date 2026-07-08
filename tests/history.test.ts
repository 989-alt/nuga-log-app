import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadHistory, addHistory, clearHistory, makeId, type HistoryItem } from '@/lib/history';
import type { GenerateResult } from '@/lib/types';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
  });
});

const result: GenerateResult = {
  body: 'x', meta: { bases: 'b', caseType: 'c', charCount: '약 5자', guidanceStep: '주의', guardianNotice: '-', followUp: '-' },
  teacherUnderstanding: [], safeGuidance: [], teacherMemo: [], warnings: [], legalProtection: [],
};

describe('history', () => {
  it('starts empty', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('prepends items and persists', () => {
    const item: HistoryItem = { id: makeId('a'), date: '2026-07-06', caseTypeId: 1, result };
    addHistory(item);
    const loaded = loadHistory();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(item.id);
  });

  it('caps at 30 items', () => {
    for (let i = 0; i < 35; i++) addHistory({ id: makeId('k' + i), date: 'd', caseTypeId: 1, result });
    expect(loadHistory().length).toBe(30);
  });

  it('clearHistory empties it', () => {
    addHistory({ id: makeId('z'), date: 'd', caseTypeId: 1, result });
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });
});
