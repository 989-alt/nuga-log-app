import type { CaseTypeId } from '@/lib/types';
import { LAW_MCP_URL } from '@/lib/lawVerify';
import { groundingText } from '@/lib/legalKb';

export interface Precedent { caseNo: string; gist: string }
export interface RetrievedBasis { grounding: string; precedents: Precedent[] }

// 대법원/하급심 사건번호: 4자리 연도 + 사건부호(가~힣 1자) + 일련번호.
export const CASE_NO_RE = /\b(\d{4}[가-힣]\d{2,7})\b/g;

export function extractCaseNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CASE_NO_RE)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

// 사건번호 토큰 단위로 텍스트를 치환한다(경계 인식 단일 패스).
// CASE_NO_RE는 module-level global regex라 .source로 새 RegExp를 만들어
// lastIndex 상태가 호출 간에 공유되지 않도록 한다.
export function replaceCaseNumbers(
  text: string,
  replacer: (caseNo: string) => string
): string {
  return text.replace(new RegExp(CASE_NO_RE.source, 'g'), (m) => replacer(m));
}

async function mcpCall(
  name: string,
  args: Record<string, unknown>,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(LAW_MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const text: string | undefined = data?.result?.content?.[0]?.text;
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function retrieveBasis(args: {
  caseTypeId: CaseTypeId;
  keywords: string[];
  specialEd: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<RetrievedBasis> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const timeoutMs = args.timeoutMs ?? 3500;
  const grounding = groundingText(args.specialEd);

  const query = args.keywords.filter((k) => k.trim() !== '').join(' ').trim();
  if (query === '') return { grounding, precedents: [] };

  // 결정적 기본 판례 검색 1회(약한 턴에도 최소 판례 확보).
  const decisionText = await mcpCall('search_decisions', { query }, fetchImpl, timeoutMs);
  const precedents: Precedent[] = [];
  if (decisionText) {
    const caseNos = extractCaseNumbers(decisionText);
    const firstLine = decisionText.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
    for (const caseNo of caseNos.slice(0, 5)) {
      precedents.push({ caseNo, gist: firstLine.slice(0, 200) });
    }
  }
  return { grounding, precedents };
}
