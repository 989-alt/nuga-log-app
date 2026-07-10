import Image from 'next/image';
import SiteHeader from '@/components/SiteHeader';
import Chat from '@/components/Chat';
import RecentRecords from '@/components/RecentRecords';

const TRUST_CHIPS = ['고시·법령 근거', '판례 검증', '브라우저에만 저장'];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 56, paddingBottom: 88 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center' }}>
          <div style={{ flex: '1 1 480px', minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 14 }}>NEIS 행동관찰 누가기록</div>
            <h1 style={{ fontSize: 'var(--text-heading-lg)', maxWidth: 660, lineHeight: 1.28 }}>
              있었던 일을 대화로 알려 주시면 누가기록으로 정리해 드립니다
            </h1>
            <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-body-lg)', marginTop: 18, maxWidth: 620, lineHeight: 1.7 }}>
              사안을 자유롭게 말씀해 주시면 필요한 사실을 몇 가지 여쭤본 뒤, 평어로 종결된 복사용 본문과 교사용 참고 메모를 함께 만들어 드립니다.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
              {TRUST_CHIPS.map((label) => (
                <span
                  key={label}
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: 'var(--accent-weak)', color: 'var(--accent)',
                    fontSize: 13, fontWeight: 600, lineHeight: 1,
                    padding: '7px 14px', borderRadius: 999,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          <Image
            src="/glass/icon-shield.png"
            alt=""
            width={112}
            height={112}
            style={{ borderRadius: 24, flexShrink: 0, margin: '0 auto' }}
          />
        </div>

        <hr className="hairline" style={{ margin: '44px 0 32px' }} />

        <Chat />

        <hr className="hairline" style={{ margin: '48px 0 32px' }} />
        <RecentRecords />
      </main>
    </>
  );
}
