import Link from 'next/link';
import type { CaseType } from '@/lib/types';

export default function CaseTypeCard({ type }: { type: CaseType }) {
  return (
    <Link href={`/generate?type=${type.id}`} className="card card-link" style={{ display: 'flex', flexDirection: 'column', minHeight: 168 }}>
      <div style={{ marginBottom: 14 }}>
        {type.highRisk ? (
          <span className="badge badge-risk">고위험 · 법령 실시간 검증</span>
        ) : (
          <span className="badge badge-neutral">일반 지도</span>
        )}
      </div>
      <div style={{ fontSize: 21, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: 6 }}>
        {type.shortName}
      </div>
      <div style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.55 }}>{type.name}</div>
      <div style={{ marginTop: 'auto', paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>권장 분량 {type.lengthHint}</span>
        <span aria-hidden style={{ fontSize: 15, color: 'var(--accent)', fontWeight: 600 }}>→</span>
      </div>
    </Link>
  );
}
