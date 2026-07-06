import Link from 'next/link';
import type { CaseType } from '@/lib/types';

export default function CaseTypeCard({ type }: { type: CaseType }) {
  return (
    <Link
      href={`/generate?type=${type.id}`}
      className="card"
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <div style={{ fontSize: 12, color: 'var(--color-smoke)', marginBottom: 8 }}>
        {type.highRisk ? '고위험 · 법령 실시간 검증' : '일반'}
      </div>
      <div style={{ fontSize: 26, letterSpacing: '-0.26px', marginBottom: 8 }}>{type.shortName}</div>
      <div style={{ fontSize: 14, color: 'var(--color-steel)' }}>{type.name}</div>
      <div style={{ fontSize: 12, color: 'var(--color-slate)', marginTop: 16 }}>권장 분량 {type.lengthHint}</div>
    </Link>
  );
}
