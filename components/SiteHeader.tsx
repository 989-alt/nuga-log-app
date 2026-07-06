import Link from 'next/link';

export default function SiteHeader() {
  return (
    <header style={{ borderBottom: '1px solid var(--color-frost)', height: 76, display: 'flex', alignItems: 'center' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'var(--color-midnight-ink)', fontSize: 18, fontWeight: 400 }}>
          NEIS 누가기록 도우미
        </Link>
        <span style={{ fontSize: 12, color: 'var(--color-smoke)' }}>기록은 이 브라우저에만 저장됩니다</span>
      </div>
    </header>
  );
}
