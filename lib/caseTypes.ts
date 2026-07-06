import raw from '@/data/legal-content.json';
import type { CaseType, CaseTypeId } from '@/lib/types';

export const CASE_TYPES: CaseType[] = raw.caseTypes as CaseType[];

export const HIGH_RISK_IDS: Set<CaseTypeId> = new Set(
  CASE_TYPES.filter((c) => c.highRisk).map((c) => c.id)
);

export function getCaseType(id: CaseTypeId): CaseType {
  const found = CASE_TYPES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown case type id: ${id}`);
  return found;
}
