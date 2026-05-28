import { and, desc, eq } from 'drizzle-orm';
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

function toContext(w: { id: string; seatSelector: unknown }): WatchContext {
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

export async function loadAllWatchContexts(site: Site, externalEventId: string): Promise<WatchContext[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  const list = await db.query.watchTargets.findMany({
    where: and(
      eq(watchTargets.userId, session.user.id),
      eq(watchTargets.site, site),
      eq(watchTargets.externalEventId, externalEventId),
      eq(watchTargets.status, 'active'),
    ),
    orderBy: [desc(watchTargets.createdAt)],
  });
  return list.map(toContext);
}

export function resolveHighlight(contexts: WatchContext[], activeWatchId?: string): string[] {
  if (activeWatchId) {
    const found = contexts.find((c) => c.watchId === activeWatchId);
    return found?.registered ?? [];
  }
  // 전체 — 모든 watch 의 자리 합집합
  return Array.from(new Set(contexts.flatMap((c) => c.registered)));
}
