import { describe, it, expect } from 'vitest';
import { toggleDisability } from '@/components/SpecialEdPanel';

describe('toggleDisability', () => {
  it('adds when absent, removes when present, ignores unknown keys', () => {
    expect(toggleDisability([], 'autism')).toEqual(['autism']);
    expect(toggleDisability(['autism'], 'autism')).toEqual([]);
    expect(toggleDisability([], 'nope')).toEqual([]);
  });
});
