import { CASE_TYPES } from '@/lib/caseTypes';
import CaseTypeCard from '@/components/CaseTypeCard';
import SiteHeader from '@/components/SiteHeader';
import RecentRecords from '@/components/RecentRecords';

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 56, paddingBottom: 88 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>NEIS 행동관찰 누가기록</div>
        <h1 style={{ fontSize: 'var(--text-heading-lg)', maxWidth: 660, lineHeight: 1.28 }}>
          교실 사안을 입력하면 붙여넣기용 누가기록으로 정리해 드립니다
        </h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-body-lg)', marginTop: 18, maxWidth: 620, lineHeight: 1.7 }}>
          사안 유형을 고르고 사실을 입력하면, 평어로 종결된 복사용 본문과 교사용 참고 메모를 함께 만들어 드립니다.
          법적 단정 표현은 자동으로 걸러 냅니다.
        </p>

        <hr className="hairline" style={{ margin: '44px 0 32px' }} />

        <div className="eyebrow" style={{ marginBottom: 20 }}>사안 유형 선택</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
          {CASE_TYPES.map((t) => (
            <CaseTypeCard key={t.id} type={t} />
          ))}
        </div>

        <hr className="hairline" style={{ margin: '48px 0 32px' }} />
        <RecentRecords />
      </main>
    </>
  );
}
