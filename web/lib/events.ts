import { valkey, KEY } from './valkey';
import type { EventIndexEntry, Site } from './types/seat';

const PREFIX = process.env.VALKEY_KEY_PREFIX ?? 'seatwatch:dev';

export const EVENT_INDEX_KEY = (site: Site) => `events:${site}`;

export async function indexEvent(entry: EventIndexEntry): Promise<void> {
  await valkey.hset(EVENT_INDEX_KEY(entry.site), entry.externalEventId, JSON.stringify(entry));
}

export interface EventFilters {
  query?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  timeFrom?: string; // HH:MM
  timeTo?: string;   // HH:MM
}

function timeOf(iso: string): string {
  // local time HH:MM from ISO datetime
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function dayOf(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export async function listEvents(site: Site, queryOrFilters?: string | EventFilters, limit = 100): Promise<EventIndexEntry[]> {
  const filters: EventFilters = typeof queryOrFilters === 'string'
    ? { query: queryOrFilters }
    : (queryOrFilters ?? {});
  const map = await valkey.hgetall(EVENT_INDEX_KEY(site));
  const items: EventIndexEntry[] = Object.values(map).map((s) => JSON.parse(s));
  const q = filters.query?.trim().toLowerCase();
  let filtered = q
    ? items.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.venue.toLowerCase().includes(q) ||
          (e.region ?? '').toLowerCase().includes(q) ||
          (e.category ?? '').toLowerCase().includes(q),
      )
    : items;
  if (filters.dateFrom) {
    filtered = filtered.filter((e) => dayOf(e.eventDatetime) >= filters.dateFrom!);
  }
  if (filters.dateTo) {
    filtered = filtered.filter((e) => dayOf(e.eventDatetime) <= filters.dateTo!);
  }
  if (filters.timeFrom) {
    filtered = filtered.filter((e) => timeOf(e.eventDatetime) >= filters.timeFrom!);
  }
  if (filters.timeTo) {
    filtered = filtered.filter((e) => timeOf(e.eventDatetime) <= filters.timeTo!);
  }
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

export interface EventGroup {
  site: Site;
  title: string;
  venue: string;
  region?: string;
  category?: string;
  groupKey: string;
  entries: EventIndexEntry[];
}

export function groupKeyOf(entry: EventIndexEntry): string {
  // 영화관: (venue, title) — 카드 1장 = 한 극장 한 영화. 안에서 날짜→상영관(screen)→시간
  // 공연/식당: title — venue 가 단일
  if (entry.site === 'cgv' || entry.site === 'megabox' || entry.site === 'lotte') {
    return `${entry.venue}__${entry.title}`;
  }
  return entry.title;
}

export async function groupKeyForEvent(site: Site, externalEventId: string): Promise<string | null> {
  const entry = await getEventIndexEntry(site, externalEventId);
  if (!entry) return null;
  return groupKeyOf(entry);
}

export { encodeGroupKey, decodeGroupKey } from './events-key';

export async function listGroups(site: Site, filters?: string | EventFilters, limit = 100): Promise<EventGroup[]> {
  const all = await listEvents(site, filters, 2000);
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
