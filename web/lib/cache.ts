/**
 * Lazy fetch 캐시 layer.
 * 검색 결과 1h, 좌석 snapshot 5m TTL.
 */
import { valkey } from './valkey';
import type { Site, EventIndexEntry, SeatSnapshot } from './types/seat';

const SEARCH_TTL = 60 * 60;          // 1h
const SNAPSHOT_TTL = 60 * 5;         // 5m

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

export async function getCachedSearch(site: Site, query: string): Promise<EventIndexEntry[] | null> {
  const h = await sha256Hex(normalizeQuery(query));
  const raw = await valkey.get(`search:${site}:${h}`);
  return raw ? JSON.parse(raw) : null;
}

export async function setCachedSearch(site: Site, query: string, entries: EventIndexEntry[]): Promise<void> {
  const h = await sha256Hex(normalizeQuery(query));
  await valkey.set(`search:${site}:${h}`, JSON.stringify(entries), 'EX', SEARCH_TTL);
}

export async function getCachedSnapshot(site: Site, externalEventId: string, eventDatetime: string): Promise<SeatSnapshot | null> {
  const raw = await valkey.get(`snapshot:${site}:${externalEventId}:${eventDatetime}`);
  return raw ? JSON.parse(raw) : null;
}

export async function setCachedSnapshot(snapshot: SeatSnapshot): Promise<void> {
  const k = `snapshot:${snapshot.site}:${snapshot.externalEventId}:${snapshot.eventDatetime}`;
  await valkey.set(k, JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL);
  await valkey.set(`freshness:${snapshot.site}:${snapshot.externalEventId}`, snapshot.capturedAt);
}

/**
 * Rate limit — 사용자/IP 당 action 별.
 * 분당 limit 회 까지. 초과 시 throw RateLimitError.
 */
export class RateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    super(`Rate limit exceeded, retry after ${retryAfterSec}s`);
  }
}

export async function checkRateLimit(key: string, limit: number, windowSec = 60): Promise<void> {
  const fullKey = `rl:${key}`;
  const n = await valkey.incr(fullKey);
  if (n === 1) {
    await valkey.expire(fullKey, windowSec);
  }
  if (n > limit) {
    const ttl = await valkey.ttl(fullKey);
    throw new RateLimitError(ttl > 0 ? ttl : windowSec);
  }
}
