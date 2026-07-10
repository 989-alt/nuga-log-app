import { NextResponse } from 'next/server';
import type { PrecedentsQueryBody } from '@/lib/precedentsQuery';
import { runPrecedents } from '@/lib/precedentsQuery';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: PrecedentsQueryBody;
  try { body = (await request.json()) as PrecedentsQueryBody; }
  catch { return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 }); }
  try {
    return NextResponse.json(await runPrecedents(body));
  } catch {
    // 본문·키 로깅 금지.
    return NextResponse.json({ error: '판례 검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
