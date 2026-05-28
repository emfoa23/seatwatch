import { and, eq } from 'drizzle-orm';
import { auth } from './auth';
import { db } from './db';
import { watchTargets } from './db/schema';
import type { Site } from './types/seat';

export interface WatchContext {
  watchId: string;
  registered: string[];
  selectorKind: 'multi-seat' | 'multi-time' | 'single';
  adjacency?: number;
  partySize?: number;
}

export async function loadWatchContext(site: Site, externalEventId: string, watchIdParam?: string): Promise<WatchContext | null> {
  if (!watchIdParam) return null;
  const session = await auth();
  if (!session?.user?.id) return null;
  const w = await db.query.watchTargets.findFirst({
    where: and(
      eq(watchTargets.id, watchIdParam),
      eq(watchTargets.userId, session.user.id),
      eq(watchTargets.site, site),
      eq(watchTargets.externalEventId, externalEventId),
    ),
  });
  if (!w) return null;
  const sel = w.seatSelector as {
    type?: string;
    values?: string[];
    adjacency?: number;
    partySize?: number;
    mode?: 'seat' | 'time';
    id?: string;
    time?: string;
  };
  if (sel.type === 'multi' && sel.values) {
    return {
      watchId: w.id,
      registered: sel.values,
      selectorKind: sel.mode === 'time' ? 'multi-time' : 'multi-seat',
      adjacency: sel.adjacency,
      partySize: sel.partySize,
    };
  }
  if (sel.type === 'seat' && sel.id) {
    return { watchId: w.id, registered: [sel.id], selectorKind: 'single' };
  }
  if (sel.type === 'time' && sel.time) {
    return { watchId: w.id, registered: [sel.time], selectorKind: 'single' };
  }
  return { watchId: w.id, registered: [], selectorKind: 'single' };
}
