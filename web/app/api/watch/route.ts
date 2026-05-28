import { NextRequest, NextResponse } from 'next/server';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { watchTargets, slotInventory } from '@/lib/db/schema';

const bodySchema = z.object({
  site: z.enum(['cgv', 'megabox', 'lotte', 'interpark', 'catchtable']),
  externalEventId: z.string().min(1),
  eventDatetime: z.string().min(1),
  seatSelector: z.union([
    z.object({
      type: z.literal('multi'),
      values: z.array(z.string().min(1)).min(1).max(20),
      mode: z.literal('seat'),
      adjacency: z.number().int().min(1).max(10).default(1),
    }),
    z.object({
      type: z.literal('multi'),
      values: z.array(z.string().min(1)).min(1).max(20),
      mode: z.literal('time'),
      partySize: z.number().int().min(1).max(10).default(1),
    }),
    z.object({
      type: z.enum(['seat', 'time', 'grade', 'row', 'any']),
      id: z.string().optional(),
      time: z.string().optional(),
      grade: z.string().optional(),
      row: z.string().optional(),
    }),
  ]),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  const inv = await db.query.slotInventory.findFirst({
    where: eq(slotInventory.userId, userId),
  });
  const total = (inv?.freeSlots ?? 0) + (inv?.paidSlots ?? 0);

  const [{ n }] = await db
    .select({ n: count() })
    .from(watchTargets)
    .where(and(eq(watchTargets.userId, userId), eq(watchTargets.status, 'active')));

  if (Number(n) >= total) {
    return NextResponse.json(
      { error: 'slot_required', used: Number(n), total, message: '슬롯이 부족합니다.' },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(watchTargets)
    .values({
      userId,
      site: body.site,
      externalEventId: body.externalEventId,
      eventDatetime: new Date(body.eventDatetime),
      seatSelector: body.seatSelector,
      status: 'active',
    })
    .returning();

  return NextResponse.json({ ok: true, watchId: created.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  await db
    .update(watchTargets)
    .set({ status: 'cancelled' })
    .where(and(eq(watchTargets.id, id), eq(watchTargets.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
