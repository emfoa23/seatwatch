import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { SITE_LABELS, type Site } from '@/lib/types/seat';
import { SiteLogo } from './Icons';

const NAV_SITES: Site[] = ['cgv', 'megabox', 'lotte', 'interpark', 'catchtable'];

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
      <nav className="site-nav">
        {NAV_SITES.map((s) => (
          <Link key={s} href={`/${s}`} className="nav-link">
            <SiteLogo site={s} size={18} />
            <span>{SITE_LABELS[s]}</span>
          </Link>
        ))}
        <div className="nav-spacer" />
        {loggedIn ? (
          <>
            <Link href="/my/watches" className="nav-link nav-link-plain">내 알림</Link>
            <form action={logoutAction} className="logout-form">
              <button type="submit" className="link-button">로그아웃</button>
            </form>
          </>
        ) : (
          <Link href="/login" className="nav-link nav-link-plain">로그인</Link>
        )}
      </nav>
    </header>
  );
}
