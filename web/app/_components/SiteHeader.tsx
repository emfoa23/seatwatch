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
          <Link href="/my" className="nav-link nav-link-plain">마이페이지</Link>
        ) : (
          <Link href="/login" className="nav-link nav-link-plain">로그인</Link>
        )}
      </nav>
    </header>
  );
}
