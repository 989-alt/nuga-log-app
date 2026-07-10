'use client';
import { useState } from 'react';
import type { HistoryItem } from '@/lib/history';
import Chat from '@/components/Chat';
import RecentRecords from '@/components/RecentRecords';

/**
 * 챗+최근 기록 영역의 클라이언트 컨테이너.
 * "최근 기록"에서 "후속 기록 작성"을 누르면 그 항목이 여기 담겨 Chat으로 내려가고,
 * Chat이 후속 인터뷰 모드로 전환된다. 히어로 등 나머지 페이지 구조는 app/page.tsx(서버
 * 컴포넌트)에 그대로 남는다 — 이 컴포넌트는 상태가 필요한 두 영역만 감싼다.
 */
export default function Home() {
  const [followUpTarget, setFollowUpTarget] = useState<HistoryItem | null>(null);

  return (
    <>
      <Chat followUpTarget={followUpTarget} onDone={() => setFollowUpTarget(null)} />

      <hr className="hairline" style={{ margin: '48px 0 32px' }} />
      <RecentRecords onFollowUp={setFollowUpTarget} />
    </>
  );
}
