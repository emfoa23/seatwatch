import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth, signOut } from '@/lib/auth';

async function logoutAction() {
  'use server';
  await signOut({ redirectTo: '/' });
}

export default async function MyLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?callbackUrl=/my');

  return (
    <div className="my-shell">
      <aside className="my-sidebar">
        <div className="my-user">
          <p className="my-user-email">{session.user.email}</p>
          <form action={logoutAction}>
            <button type="submit" className="link-button">로그아웃</button>
          </form>
        </div>
        <nav className="my-nav">
          <Link href="/my">대시보드</Link>
          <Link href="/my/watches">내 알림</Link>
          <Link href="/my/billing">슬롯 구매</Link>
          <Link href="/my/payments">결제 내역</Link>
        </nav>
      </aside>
      <section className="my-content">{children}</section>
    </div>
  );
}
