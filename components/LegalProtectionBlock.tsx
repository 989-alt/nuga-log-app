import type { LegalProtection } from '@/lib/types';

export default function LegalProtectionBlock({ items }: { items: LegalProtection[] }) {
  if (items.length === 0) return null;
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>법적 보호 분석 — 교사용</span>
        <span className="badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>NEIS에 붙여넣지 말 것</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 12 }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: 15, color: 'var(--ink-soft)', lineHeight: 1.7, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
            <strong style={{ color: 'var(--ink)' }}>{it.element}</strong>
            {it.support && <>: {it.support}</>}
            {it.caseRefs.length > 0 && (
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, marginLeft: 8 }}>
                {it.caseRefs.map((ref, j) => (
                  <span key={j} className="badge badge-normal" style={{ fontSize: 12 }}>{ref}</span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
