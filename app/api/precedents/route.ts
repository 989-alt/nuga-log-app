import { NextResponse } from 'next/server';
import type { CaseTypeId, SpecialEdInfo } from '@/lib/types';
import { getCaseType } from '@/lib/caseTypes';
import { retrieveBasis } from '@/lib/lawRetrieval';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface Body { caseTypeId: CaseTypeId; slots: Record<string, string>; specialEd: SpecialEdInfo; extraKeywords?: string[] }

export async function runPrecedents(body: Body, opts?: { fetchImpl?: typeof fetch }) {
  const type = getCaseType(body.caseTypeId);
  const keywords = [type.name, ...(body.extraKeywords ?? []), ...Object.values(body.slots)].slice(0, 8);
  const basis = await retrieveBasis({
    caseTypeId: body.caseTypeId,
    keywords,
    specialEd: body.specialEd.isSpecialEd,
    fetchImpl: opts?.fetchImpl,
  });
  return { precedents: basis.precedents };
}

export async function POST(request: Request) {
  let body: Body;
  try { body = (await request.json()) as Body; }
  catch { return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 }); }
  try {
    return NextResponse.json(await runPrecedents(body));
  } catch {
    // 본문·키 로깅 금지.
    return NextResponse.json({ error: '판례 검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
