import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq, and, desc } from 'drizzle-orm';
import { auth, signOut } from '@/lib/auth';
import { db } from '@/lib/db';
import { watchTargets, slotInventory } from '@/lib/db/schema';
import type { Site } from '@/lib/types/seat';
import { WatchListItem } from './WatchListItem';

export const dynamic = 'force-dynamic';

export default async function WatchesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?callbackUrl=/my/watches');

  const userId = session.user.id;
  const [inventory, active] = await Promise.all([
    db.query.slotInventory.findFirst({ where: eq(slotInventory.userId, userId) }),
    db.query.watchTargets.findMany({
      where: and(eq(watchTargets.userId, userId), eq(watchTargets.status, 'active')),
      orderBy: [desc(watchTargets.createdAt)],
    }),
  ]);

  const totalSlots = (inventory?.freeSlots ?? 0) + (inventory?.paidSlots ?? 0);

  async function doSignOut() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <div className="my-watches">
      <header className="my-header">
        <div>
          <h1>내 알림</h1>
          <p className="hello">{session.user.email}</p>
        </div>
        <form action={doSignOut}>
          <button type="submit" className="btn btn-secondary">로그아웃</button>
        </form>
      </header>

      <div className="slot-summary">
        <span>사용 {active.length} / 보유 {totalSlots}</span>
        <span className="dim">무료 {inventory?.freeSlots ?? 0} · 추가 {inventory?.paidSlots ?? 0}</span>
        <Link href="/my/billing" className="btn btn-primary">슬롯 추가</Link>
      </div>

      {active.length === 0 ? (
        <div className="empty">
          <p>아직 등록된 알림이 없습니다.</p>
          <p>좌석 페이지에서 마감된 자리를 골라 알림을 등록하세요.</p>
        </div>
      ) : (
        <ul className="watch-list">
          {active.map((w) => (
            <WatchListItem
              key={w.id}
              item={{
                id: w.id,
                site: w.site as Site,
                externalEventId: w.externalEventId,
                eventDatetime: w.eventDatetime.toISOString(),
                seatSelector: w.seatSelector,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
