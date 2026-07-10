'use client';
import { useEffect, useState } from 'react';

const PHRASES: Record<'chat' | 'generate', string[]> = {
  chat: ['답변을 준비하고 있어요…', '사안을 살펴보고 있어요…', '필요한 사실을 정리하고 있어요…'],
  generate: ['누가기록 초안을 작성하고 있어요…', '법령·판례를 확인하고 있어요…', '문장을 다듬고 있어요…'],
};

const ROTATE_MS = 3000;

/** 어시스턴트 말풍선 모양의 "답변 준비 중" 표시. 점 3개 바운스 + 3초마다 페이드 교체되는 안내 문구. */
export default function TypingIndicator({ mode }: { mode: 'chat' | 'generate' }) {
  const phrases = PHRASES[mode];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % phrases.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [phrases]);

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div
        role="status"
        aria-live="polite"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          maxWidth: '78%',
          padding: '12px 16px',
          borderRadius: 'var(--bubble-radius)',
          borderBottomLeftRadius: 4,
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          color: 'var(--ink-muted)',
          fontSize: 14.5,
          lineHeight: 1.6,
        }}
      >
        <span aria-hidden style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <span className="typing-dot" style={{ animationDelay: '0ms' }} />
          <span className="typing-dot" style={{ animationDelay: '160ms' }} />
          <span className="typing-dot" style={{ animationDelay: '320ms' }} />
        </span>
        <span key={index} className="typing-phrase" style={{ wordBreak: 'keep-all' }}>
          {phrases[index]}
        </span>
      </div>
    </div>
  );
}
