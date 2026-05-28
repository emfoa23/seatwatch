'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SITE_LABELS, type Site } from '@/lib/types/seat';
import { SiteLogo } from './Icons';

const NAV_SITES: Site[] = ['cgv', 'megabox', 'lotte', 'interpark', 'catchtable'];

interface Props {
  loggedIn: boolean;
  logoutAction: () => Promise<void>;
}

export function SiteHeaderClient({ loggedIn, logoutAction }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="site-header">
      <div className="site-header-top">
        <Link href="/" className="brand">seatwatch</Link>
        <button
          type="button"
          className="hamburger"
          aria-label="메뉴 열기"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span /><span /><span />
        </button>
        <nav className="site-nav site-nav-desktop">
          {NAV_SITES.map((s) => (
            <Link key={s} href={`/${s}`} className="nav-link">
              <SiteLogo site={s} size={18} />
              <span>{SITE_LABELS[s]}</span>
            </Link>
          ))}
          <div className="nav-spacer" />
          {loggedIn ? (
            <>
              <Link href="/my" className="nav-link nav-link-plain">마이페이지</Link>
              <form action={logoutAction}>
                <button type="submit" className="nav-link nav-link-plain">로그아웃</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="nav-link nav-link-plain">로그인</Link>
          )}
        </nav>
      </div>
      {open && (
        <nav className="site-nav site-nav-drawer">
          {NAV_SITES.map((s) => (
            <Link key={s} href={`/${s}`} className="nav-link">
              <SiteLogo site={s} size={18} />
              <span>{SITE_LABELS[s]}</span>
            </Link>
          ))}
          <hr className="drawer-divider" />
          {loggedIn ? (
            <>
              <Link href="/my" className="nav-link nav-link-plain">마이페이지</Link>
              <form action={logoutAction}>
                <button type="submit" className="nav-link nav-link-plain" style={{ width: '100%', textAlign: 'left' }}>로그아웃</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="nav-link nav-link-plain">로그인</Link>
          )}
        </nav>
      )}
    </header>
  );
}
