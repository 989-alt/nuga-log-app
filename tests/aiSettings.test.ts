import { describe, it, expect, beforeEach } from 'vitest';
import { loadAiSettings } from '@/lib/aiSettings';

describe('aiSettings BYOK-only', () => {
  beforeEach(() => { (globalThis as any).window = { localStorage: { getItem: () => null, setItem: () => {} } }; });

  it('defaults to byok when nothing stored', () => {
    expect(loadAiSettings().mode).toBe('byok');
  });

  it('migrates a legacy free setting to byok', () => {
    (globalThis as any).window = { localStorage: { getItem: () => JSON.stringify({ mode: 'free' }), setItem: () => {} } };
    expect(loadAiSettings().mode).toBe('byok');
  });
});
