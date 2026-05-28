import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { payments, slotInventory } from '@/lib/db/schema';
import { confirmPayment } from '@/lib/toss';

const bodySchema = z.object({
  paymentKey: z.string().min(1),
  orderId: z.string().min(1),
  amount: z.number().int().positive(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const { paymentKey, orderId, amount } = parsed.data;

  const pending = await db.query.payments.findFirst({
    where: and(eq(payments.orderId, orderId), eq(payments.userId, session.user.id)),
  });
  if (!pending) return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  if (pending.status === 'paid') {
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }
  if (pending.amountKrw !== amount) {
    return NextResponse.json({ error: 'amount_mismatch' }, { status: 400 });
  }

  const result = await confirmPayment({ paymentKey, orderId, amount });
  if (!result.ok) {
    await db
      .update(payments)
      .set({ status: 'failed' })
      .where(eq(payments.orderId, orderId));
    return NextResponse.json({ error: 'confirm_failed', detail: result.error }, { status: 400 });
  }

  // pending → paid atomic transition. returning rows = [updated] 이면 첫 전환.
  const transitioned = await db
    .update(payments)
    .set({ status: 'paid', tossPaymentKey: paymentKey, paidAt: new Date() })
    .where(and(eq(payments.orderId, orderId), eq(payments.status, 'pending')))
    .returning({ slotsGranted: payments.slotsGranted });

  if (transitioned.length === 0) {
    // 다른 동시 요청이 이미 paid 로 전환. 슬롯 부여 skip (멱등).
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  await db
    .update(slotInventory)
    .set({ paidSlots: sql`${slotInventory.paidSlots} + ${transitioned[0].slotsGranted}` })
    .where(eq(slotInventory.userId, session.user.id));

  return NextResponse.json({ ok: true, slotsGranted: transitioned[0].slotsGranted });
}
