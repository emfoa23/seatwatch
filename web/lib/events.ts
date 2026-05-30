import { valkey } from './valkey';
import type { EventIndexEntry, Site } from './types/seat';

export const EVENT_INDEX_KEY = (site: Site) => `events:${site}`;

export async function indexEvent(entry: EventIndexEntry): Promise<void> {
  await valkey.hset(EVENT_INDEX_KEY(entry.site), entry.externalEventId, JSON.stringify(entry));
}

export async function listEvents(site: Site, query?: string, limit = 100): Promise<EventIndexEntry[]> {
  const map = await valkey.hgetall(EVENT_INDEX_KEY(site));
  const items: EventIndexEntry[] = Object.values(map).map((s) => JSON.parse(s));
  const q = query?.trim().toLowerCase();
  const filtered = q
    ? items.filter((e) => e.title.toLowerCase().includes(q))
    : items;
  filtered.sort((a, b) => a.eventDatetime.localeCompare(b.eventDatetime));
  return filtered.slice(0, limit);
}

export async function getEventIndexEntry(site: Site, externalEventId: string): Promise<EventIndexEntry | null> {
  const raw = await valkey.hget(EVENT_INDEX_KEY(site), externalEventId);
  return raw ? JSON.parse(raw) : null;
}

export interface EventGroup {
  site: Site;
  title: string;
  venue: string;
  region?: string;
  category?: string;
  groupKey: string;
  entries: EventIndexEntry[];
}

/** 그룹 key = title. 회차 단위 entry 들은 같은 영화/공연/식당 = 같은 group. */
export function groupKeyOf(entry: EventIndexEntry): string {
  return entry.title;
}

export async function groupKeyForEvent(site: Site, externalEventId: string): Promise<string | null> {
  const entry = await getEventIndexEntry(site, externalEventId);
  return entry ? groupKeyOf(entry) : null;
}

export { encodeGroupKey, decodeGroupKey } from './events-key';

export async function listGroups(site: Site, query?: string, limit = 100): Promise<EventGroup[]> {
  const all = await listEvents(site, query, 2000);
  const map = new Map<string, EventGroup>();
  for (const e of all) {
    const key = groupKeyOf(e);
    const existing = map.get(key);
    if (existing) {
      existing.entries.push(e);
    } else {
      map.set(key, {
        site: e.site,
        title: e.title,
        venue: e.venue,
        region: e.region,
        category: e.category,
        groupKey: key,
        entries: [e],
      });
    }
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.entries.sort((a, b) => a.eventDatetime.localeCompare(b.eventDatetime));
  }
  groups.sort((a, b) => a.entries[0].eventDatetime.localeCompare(b.entries[0].eventDatetime));
  return groups.slice(0, limit);
}

export async function getGroup(site: Site, groupKey: string): Promise<EventGroup | null> {
  const all = await listEvents(site, undefined, 2000);
  const entries = all.filter((e) => groupKeyOf(e) === groupKey);
  if (entries.length === 0) return null;
  entries.sort((a, b) => a.eventDatetime.localeCompare(b.eventDatetime));
  const first = entries[0];
  return {
    site,
    title: first.title,
    venue: first.venue,
    region: first.region,
    category: first.category,
    groupKey,
    entries,
  };
}
