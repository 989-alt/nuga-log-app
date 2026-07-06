import { CASE_TYPES } from '@/lib/caseTypes';
import CaseTypeCard from '@/components/CaseTypeCard';
import SiteHeader from '@/components/SiteHeader';

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 64, paddingBottom: 96 }}>
        <h1 style={{ fontSize: 'var(--text-heading-lg)', letterSpacing: '-0.96px', maxWidth: 720 }}>
          교실 사안을 입력하면 NEIS 누가기록으로 정리해 드립니다
        </h1>
        <p style={{ color: 'var(--color-slate)', fontSize: 22, marginTop: 24, maxWidth: 720 }}>
          사안 유형을 선택하고 사실을 입력하면, 평어 종결의 복사·붙여넣기용 누가기록과 교사용 참고 메모를 만들어 드립니다.
        </p>
        <hr className="hairline" />
        <div style={{ fontSize: 12, color: 'var(--color-slate)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 24 }}>
          사안 유형 선택
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
          {CASE_TYPES.map((t) => (
            <CaseTypeCard key={t.id} type={t} />
          ))}
        </div>
      </main>
    </>
  );
}
