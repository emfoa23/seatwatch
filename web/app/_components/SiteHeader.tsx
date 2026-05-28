import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';

async function logoutAction() {
  'use server';
  await signOut({ redirectTo: '/' });
}

export async function SiteHeader() {
  const session = await auth();
  const loggedIn = !!session?.user?.id;

  return (
    <header className="site-header">
      <Link href="/" className="brand">seatwatch</Link>
      <nav>
        <Link href="/cgv">CGV</Link>
        <Link href="/megabox">메가박스</Link>
        <Link href="/lotte">롯데시네마</Link>
        <Link href="/interpark">인터파크</Link>
        <Link href="/catchtable">캐치테이블</Link>
        {loggedIn && <Link href="/my/watches">내 알림</Link>}
        {loggedIn ? (
          <form action={logoutAction} className="logout-form">
            <button type="submit" className="link-button">로그아웃</button>
          </form>
        ) : (
          <Link href="/login">로그인</Link>
        )}
      </nav>
    </header>
  );
}
