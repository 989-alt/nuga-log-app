'use client';
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/types';

/** 대화 스레드. 사용자=오른쪽 accent 말풍선, 도우미=왼쪽 surface 말풍선. 새 메시지가 오면 자동으로 아래로 스크롤한다. */
export default function ChatThread({ messages }: { messages: ChatMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  return (
    <div style={{ maxHeight: 460, overflowY: 'auto', padding: '20px 20px 4px' }}>
      {messages.length === 0 ? (
        <div style={{ padding: '28px 4px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 14.5, lineHeight: 1.7, wordBreak: 'keep-all' }}>
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
                  borderRadius: 14,
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
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
