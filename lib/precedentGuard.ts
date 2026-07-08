import { replaceCaseNumbers } from '@/lib/lawRetrieval';

const CORE_CASE_NOS = ['2021도13926', '2015도13488'];

export function allowedCaseSet(precedentCaseNos: string[]): Set<string> {
  return new Set([...CORE_CASE_NOS, ...precedentCaseNos]);
}

export function stripUnknownCaseNumbers(
  text: string,
  allowed: Set<string>
): { text: string; removed: string[] } {
  const removed: string[] = [];
  const out = replaceCaseNumbers(text, (caseNo) => {
    if (allowed.has(caseNo)) return caseNo;
    if (!removed.includes(caseNo)) removed.push(caseNo);
    return '(판례 참조)';
  });
  return { text: out, removed };
}
