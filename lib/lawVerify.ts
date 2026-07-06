import { getCaseType, HIGH_RISK_IDS } from '@/lib/caseTypes';
import type { CaseTypeId } from '@/lib/types';

export const LAW_MCP_URL = 'https://korean-law-mcp-shared.vercel.app/mcp';

async function searchOne(
  query: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(LAW_MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search_law', arguments: { query } },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text: string | undefined = data?.result?.content?.[0]?.text;
    if (!text || typeof text !== 'string') return null;
    // Keep only the first few lines (the top match), trimmed.
    return text.split('\n').slice(0, 6).join('\n').trim();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyLaws(
  caseTypeId: CaseTypeId,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3500
): Promise<string | null> {
  if (!HIGH_RISK_IDS.has(caseTypeId)) return null;
  const type = getCaseType(caseTypeId);
  if (type.lawQueries.length === 0) return null;
  try {
    const results = await Promise.all(
      type.lawQueries.map((q) => searchOne(q, fetchImpl, timeoutMs))
    );
    const found = results.filter((r): r is string => !!r);
    if (found.length === 0) return null;
    return found.join('\n---\n');
  } catch {
    return null;
  }
}
