import { describe, it, expect } from 'vitest';
import { DISABILITY_CATEGORIES, isValidDisabilityKey } from '@/lib/specialEd';

describe('specialEd', () => {
  it('lists exactly the 10 statutory categories', () => {
    expect(DISABILITY_CATEGORIES).toHaveLength(10);
    const keys = DISABILITY_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(10);
    expect(keys).toContain('autism');
    expect(keys).toContain('emotional_behavioral');
  });

  it('validates known keys and rejects unknown', () => {
    expect(isValidDisabilityKey('autism')).toBe(true);
    expect(isValidDisabilityKey('nope')).toBe(false);
  });
});
