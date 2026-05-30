import { and, desc, eq } from 'drizzle-orm';
import { auth } from './auth';
import { db } from './db';
import { watchTargets } from './db/schema';
import type { Site } from './types/seat';

export interface WatchContext {
  watchId: string;
  registered: string[];
}

function toContext(w: { id: string; seatSelector: unknown }): WatchContext {
  const sel = w.seatSelector as { kind?: string; values?: string[] };
  return {
    watchId: w.id,
    registered: Array.isArray(sel.values) ? sel.values : [],
  };
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
  return Array.from(new Set(contexts.flatMap((c) => c.registered)));
}
