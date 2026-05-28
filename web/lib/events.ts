import { valkey, KEY } from './valkey';
import type { EventIndexEntry, Site } from './types/seat';

const PREFIX = process.env.VALKEY_KEY_PREFIX ?? 'seatwatch:dev';

export const EVENT_INDEX_KEY = (site: Site) => `events:${site}`;

export async function indexEvent(entry: EventIndexEntry): Promise<void> {
  await valkey.hset(EVENT_INDEX_KEY(entry.site), entry.externalEventId, JSON.stringify(entry));
}

export async function listEvents(site: Site, query?: string, limit = 100): Promise<EventIndexEntry[]> {
  const map = await valkey.hgetall(EVENT_INDEX_KEY(site));
  const items: EventIndexEntry[] = Object.values(map).map((s) => JSON.parse(s));
  const q = query?.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.venue.toLowerCase().includes(q) ||
          (e.region ?? '').toLowerCase().includes(q) ||
          (e.category ?? '').toLowerCase().includes(q),
      )
    : items;
  filtered.sort((a, b) => a.eventDatetime.localeCompare(b.eventDatetime));
  return filtered.slice(0, limit);
}

export async function getEventIndexEntry(site: Site, externalEventId: string): Promise<EventIndexEntry | null> {
  const raw = await valkey.hget(EVENT_INDEX_KEY(site), externalEventId);
  return raw ? JSON.parse(raw) : null;
}

// snapshot full key 검색 헬퍼 (외부 사용)
export async function findSnapshotKey(site: Site, externalEventId: string): Promise<string | null> {
  const full = await valkey.keys(`${PREFIX}:snapshot:${site}:${externalEventId}:*`);
  return full[0] ?? null;
}
