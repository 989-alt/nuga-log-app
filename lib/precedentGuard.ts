import { extractCaseNumbers } from '@/lib/lawRetrieval';

const CORE_CASE_NOS = ['2021도13926', '2015도13488'];

export function allowedCaseSet(precedentCaseNos: string[]): Set<string> {
  return new Set([...CORE_CASE_NOS, ...precedentCaseNos]);
}

export function stripUnknownCaseNumbers(
  text: string,
  allowed: Set<string>
): { text: string; removed: string[] } {
  const present = extractCaseNumbers(text);
  const removed = present.filter((c) => !allowed.has(c));
  let out = text;
  for (const caseNo of removed) {
    out = out.split(caseNo).join('(판례 참조)');
  }
  return { text: out, removed };
}
