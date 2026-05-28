import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { payments } from '@/lib/db/schema';
import { PAYMENT } from '@/lib/toss';

const bodySchema = z.object({
  slots: z.number().int().min(1).max(50),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const amount = PAYMENT.SLOT_PRICE_KRW * parsed.data.slots;
  const orderId = `sw_${Date.now()}_${randomUUID().slice(0, 8)}`;

  const [created] = await db
    .insert(payments)
    .values({
      userId: session.user.id,
      orderId,
      amountKrw: amount,
      slotsGranted: parsed.data.slots,
      status: 'pending',
    })
    .returning();

  return NextResponse.json({
    paymentId: created.id,
    orderId,
    amount,
    orderName: `${PAYMENT.SLOT_LABEL}${parsed.data.slots > 1 ? ` x ${parsed.data.slots}` : ''}`,
    customerEmail: session.user.email,
    clientKey: process.env.TOSS_CLIENT_KEY,
  });
}
