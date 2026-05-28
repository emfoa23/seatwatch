import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'seatwatch',
  description: 'CGV · 인터파크 · 캐치테이블 좌석 모니터링 + 빈자리 알림',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <a href="/" className="brand">seatwatch</a>
          <nav>
            <a href="/cgv/test">CGV Mock</a>
            <a href="/catchtable/test">캐치테이블 Mock</a>
            <a href="/interpark/test">인터파크 Mock</a>
            <a href="/my/watches">내 알림</a>
            <a href="/login">로그인</a>
          </nav>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
