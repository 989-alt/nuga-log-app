import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEIS 누가기록 도우미',
  description: '교실 사안을 입력하면 NEIS 누가기록을 작성해 줍니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
