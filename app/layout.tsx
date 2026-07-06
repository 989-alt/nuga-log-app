import type { Metadata } from 'next';
import { Inter_Tight } from 'next/font/google';
import './globals.css';

const interTight = Inter_Tight({ subsets: ['latin'], weight: ['300', '400'], display: 'swap' });

export const metadata: Metadata = {
  title: 'NEIS 누가기록 도우미',
  description: '교실 사안을 입력하면 NEIS 누가기록을 작성해 줍니다.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={interTight.className}>
      <body>{children}</body>
    </html>
  );
}
