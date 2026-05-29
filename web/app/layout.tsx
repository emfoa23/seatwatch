import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteHeader } from './_components/SiteHeader';

export const metadata = {
  title: 'seatwatch',
  description: 'CGV · 메가박스 · 롯데시네마 · 인터파크 · 캐치테이블 좌석 모니터링 + 빈자리 알림',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <SiteHeader />
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보처리방침</Link>
          <span className="dim small">© seatwatch — 비공식 알림 서비스</span>
        </footer>
      </body>
    </html>
  );
}
