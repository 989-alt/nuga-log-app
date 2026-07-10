import Link from 'next/link';

export default function SiteHeader() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--header-bg)',
        WebkitBackdropFilter: 'blur(14px)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
        height: 68,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <Link
          href="/"
          style={{ textDecoration: 'none', color: 'var(--header-fg)', fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', gap: 9 }}
        >
          <span aria-hidden style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: 6, background: 'var(--accent)', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#fff', fontWeight: 700 }}>N</span>
          NEIS 누가기록 도우미
        </Link>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'var(--accent-weak)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 999,
          }}
        >
          <span aria-hidden>🔒</span>
          <span style={{ whiteSpace: 'nowrap' }}>기록은 이 브라우저에만 저장</span>
        </span>
      </div>
    </header>
  );
}
