'use client';

export interface QuickReplyOption {
  label: string;
  variant?: 'primary' | 'ghost';
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * 말풍선 바로 아래에 붙는 칩 버튼 행. "네/아니오" 같은 즉답용 퀵리플라이.
 * 44px 최소 터치 높이, primary는 accent 채움, ghost는 accent 약한 배경/테두리.
 */
export default function QuickReplies({ options }: { options: QuickReplyOption[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt, i) => (
        <button
          key={i}
          type="button"
          onClick={opt.onSelect}
          disabled={opt.disabled}
          style={{
            minHeight: 44,
            padding: '0 18px',
            borderRadius: 999,
            fontSize: 14.5,
            fontWeight: 600,
            cursor: opt.disabled ? 'default' : 'pointer',
            wordBreak: 'keep-all',
            border: '1px solid',
            ...(opt.variant === 'primary'
              ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
              : { background: 'var(--accent-weak)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }),
            opacity: opt.disabled ? 0.6 : 1,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
