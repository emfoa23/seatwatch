import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { slotInventory } from '@/lib/db/schema';
import { BillingClient } from './BillingClient';
import { PAYMENT } from '@/lib/toss';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login?callbackUrl=/my/billing');
  const inv = await db.query.slotInventory.findFirst({
    where: eq(slotInventory.userId, session.user.id),
  });

  const recent = await db.query.payments.findMany({
    where: (p, { eq }) => eq(p.userId, session.user.id!),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
    limit: 5,
  });

  return (
    <BillingClient
      free={inv?.freeSlots ?? 0}
      paid={inv?.paidSlots ?? 0}
      pricePerSlot={PAYMENT.SLOT_PRICE_KRW}
      email={session.user.email ?? ''}
      recent={recent.map((r) => ({
        orderId: r.orderId,
        amount: r.amountKrw,
        status: r.status,
        slotsGranted: r.slotsGranted,
        createdAt: r.createdAt.toISOString(),
        paidAt: r.paidAt?.toISOString() ?? null,
      }))}
    />
  );
}
