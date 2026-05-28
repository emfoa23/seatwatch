import Link from 'next/link';
import { eq, and, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { slotInventory, watchTargets, payments } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export default async function MyHome() {
  const session = (await auth())!;
  const userId = session.user.id;

  const [inv, activeCount, recentPayments, recentWatches] = await Promise.all([
    db.query.slotInventory.findFirst({ where: eq(slotInventory.userId, userId) }),
    db.query.watchTargets.findMany({
      where: and(eq(watchTargets.userId, userId), eq(watchTargets.status, 'active')),
    }),
    db.query.payments.findMany({
      where: eq(payments.userId, userId),
      orderBy: [desc(payments.createdAt)],
      limit: 3,
    }),
    db.query.watchTargets.findMany({
      where: and(eq(watchTargets.userId, userId), eq(watchTargets.status, 'active')),
      orderBy: [desc(watchTargets.createdAt)],
      limit: 3,
    }),
  ]);

  const total = (inv?.freeSlots ?? 0) + (inv?.paidSlots ?? 0);
  const used = activeCount.length;

  return (
    <div className="my-dashboard">
      <h1>대시보드</h1>
      <div className="dash-cards">
        <Link href="/my/watches" className="dash-card">
          <span className="dash-label">알림 슬롯</span>
          <strong>{used} / {total}</strong>
          <span className="dim small">무료 {inv?.freeSlots ?? 0} · 추가 {inv?.paidSlots ?? 0}</span>
        </Link>
        <Link href="/my/billing" className="dash-card">
          <span className="dash-label">슬롯 추가</span>
          <strong>+ 1,000원/슬롯</strong>
          <span className="dim small">신용카드 / 토스페이 / 카카오페이</span>
        </Link>
        <Link href="/my/payments" className="dash-card">
          <span className="dash-label">최근 결제</span>
          <strong>{recentPayments.filter((p) => p.status === 'paid').length}건</strong>
          <span className="dim small">결제내역 전체보기</span>
        </Link>
      </div>

      <section className="dash-section">
        <header className="dash-section-header">
          <h2>최근 알림</h2>
          <Link href="/my/watches">전체 보기 →</Link>
        </header>
        {recentWatches.length === 0 ? (
          <p className="empty small">아직 등록된 알림이 없습니다.</p>
        ) : (
          <ul className="dash-list">
            {recentWatches.map((w) => (
              <li key={w.id}>
                <span className={`badge badge-${w.site}`}>{w.site.toUpperCase()}</span>
                <span>{w.externalEventId}</span>
                <span className="dim">{new Date(w.eventDatetime).toLocaleString('ko-KR')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dash-section">
        <header className="dash-section-header">
          <h2>최근 결제</h2>
          <Link href="/my/payments">전체 보기 →</Link>
        </header>
        {recentPayments.length === 0 ? (
          <p className="empty small">결제 내역이 없습니다.</p>
        ) : (
          <ul className="dash-list">
            {recentPayments.map((p) => (
              <li key={p.id}>
                <span className={`pay-status pay-${p.status}`}>{p.status}</span>
                <span>{p.amountKrw.toLocaleString()}원 · 슬롯 {p.slotsGranted}</span>
                <span className="dim">{new Date(p.createdAt).toLocaleString('ko-KR')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
