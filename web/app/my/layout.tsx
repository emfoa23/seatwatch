import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth, signOut } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

async function logoutAction() {
  'use server';
  await signOut({ redirectTo: '/' });
}

export default async function MyLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?callbackUrl=/my');
  const u = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });

  return (
    <div className="my-shell">
      <aside className="my-sidebar">
        <div className="my-user">
          {u?.displayName && <p className="my-user-name">{u.displayName}</p>}
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
          <Link href="/my/profile">프로필 편집</Link>
        </nav>
      </aside>
      <section className="my-content">{children}</section>
    </div>
  );
}
