'use client';
import { useLayoutEffect, useRef } from 'react';
import Image from 'next/image';
import type { ChatMessage } from '@/lib/types';
import TypingIndicator from '@/components/TypingIndicator';

/** 자동 스크롤을 생략할 기준: 바닥에서 이 값(px) 이상 위로 올려 읽는 중이면 사용자의 스크롤 위치를 존중한다. */
const BOTTOM_STICKY_THRESHOLD = 60;

/**
 * 대화 스레드. 사용자=오른쪽 accent 말풍선, 도우미=왼쪽 surface 말풍선.
 * 새 메시지·타이핑 상태가 바뀔 때만 컨테이너 내부 스크롤을 바닥으로 내린다.
 * (scrollIntoView는 조상 스크롤 컨테이너까지 함께 움직여 페이지 전체가 점프하므로 사용하지 않는다.)
 * 마운트 직후(빈 상태)에는 스크롤하지 않고, 사용자가 위로 스크롤해 읽는 중이면 자동 스크롤을 생략한다.
 * 바닥 추종 여부는 렌더 후가 아니라 사용자 스크롤 이벤트에서 판정한다(렌더 후 측정은 방금 추가된 말풍선 높이만큼 오판함).
 */
export default function ChatThread({ messages, typing = null }: { messages: ChatMessage[]; typing?: 'chat' | 'generate' | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  // 바닥 추종 상태. 사용자가 스크롤할 때만 갱신되며(onScroll), 새 말풍선이 추가된 뒤의
  // 렌더 결과로는 갱신하지 않는다 — 그래야 긴 말풍선 추가가 "위로 스크롤함"으로 오판되지 않는다.
  const stickRef = useRef(true);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_STICKY_THRESHOLD;
  };

  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    if (stickRef.current || last?.role === 'user') {
      // 프로그램적으로 scrollTop을 바닥까지 내리면 onScroll이 다시 발화하지만,
      // 그 시점엔 이미 바닥이므로 stickRef가 true로 재계산되어 부작용이 없다.
      el.scrollTop = el.scrollHeight;
      stickRef.current = true;
    }
  }, [messages.length, typing]);

  return (
    <div ref={containerRef} onScroll={handleScroll} style={{ maxHeight: 460, overflowY: 'auto', padding: '20px 20px 4px' }}>
      {messages.length === 0 ? (
        <div style={{ padding: '28px 4px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 14.5, lineHeight: 1.7, wordBreak: 'keep-all' }}>
          <Image
            src="/glass/hero-chat.png"
            alt=""
            width={96}
            height={96}
            style={{ borderRadius: 24, margin: '0 auto 16px', display: 'block' }}
          />
          있었던 일을 편하게 말씀해 주세요.
          <br />
          예: &ldquo;오늘 3교시에 OO이 수업 중 계속 소란을 피웠어요&rdquo;
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '78%',
                  padding: '12px 16px',
                  borderRadius: 'var(--bubble-radius)',
                  fontSize: 15,
                  lineHeight: 1.7,
                  wordBreak: 'keep-all',
                  overflowWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                  ...(m.role === 'user'
                    ? { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 4 }
                    : { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', borderBottomLeftRadius: 4 }),
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {typing && <TypingIndicator mode={typing} />}
        </div>
      )}
    </div>
  );
}
