// 장애인 등에 대한 특수교육법 시행령 별표 기준 10종.
export const DISABILITY_CATEGORIES = [
  { key: 'visual', label: '시각장애' },
  { key: 'hearing', label: '청각장애' },
  { key: 'intellectual', label: '지적장애' },
  { key: 'physical', label: '지체장애' },
  { key: 'emotional_behavioral', label: '정서·행동장애' },
  { key: 'autism', label: '자폐성장애' },
  { key: 'communication', label: '의사소통장애' },
  { key: 'learning', label: '학습장애' },
  { key: 'health', label: '건강장애' },
  { key: 'developmental_delay', label: '발달지체' },
] as const;

const KEY_SET = new Set<string>(DISABILITY_CATEGORIES.map((c) => c.key));

export function isValidDisabilityKey(key: string): boolean {
  return KEY_SET.has(key);
}

export function disabilityLabels(keys: string[]): string[] {
  return keys
    .filter(isValidDisabilityKey)
    .map((k) => DISABILITY_CATEGORIES.find((c) => c.key === k)!.label);
}
