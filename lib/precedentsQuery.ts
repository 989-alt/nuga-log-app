import type { CaseTypeId } from '@/lib/types';
import { getCaseType } from '@/lib/caseTypes';
import { retrieveBasis } from '@/lib/lawRetrieval';

export interface PrecedentsQueryBody {
  caseTypeId: CaseTypeId;
  slots: Record<string, string>;
  extraKeywords?: string[];
}

export async function runPrecedents(body: PrecedentsQueryBody, opts?: { fetchImpl?: typeof fetch }) {
  const type = getCaseType(body.caseTypeId);
  const keywords = [type.name, ...(body.extraKeywords ?? []), ...Object.values(body.slots)].slice(0, 8);
  const basis = await retrieveBasis({
    caseTypeId: body.caseTypeId,
    keywords,
    fetchImpl: opts?.fetchImpl,
  });
  return { precedents: basis.precedents };
}
