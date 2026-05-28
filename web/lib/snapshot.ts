import { valkey, KEY } from './valkey';
import { mockSnapshot } from './seat-mock';
import type { Site, SeatSnapshot } from './types/seat';

export async function getSnapshot(site: Site, eventId: string): Promise<{
  snapshot: SeatSnapshot;
  source: 'valkey' | 'mock';
}> {
  const prefix = process.env.VALKEY_KEY_PREFIX ?? 'seatwatch:dev';
  const fullKeys = await valkey.keys(`${prefix}:snapshot:${site}:${eventId}:*`);
  if (fullKeys.length > 0) {
    const stripped = fullKeys[0].slice(prefix.length + 1);
    const raw = await valkey.get(stripped);
    if (raw) return { snapshot: JSON.parse(raw), source: 'valkey' };
  }
  return { snapshot: mockSnapshot(site, eventId), source: 'mock' };
}

export async function setSnapshot(snap: SeatSnapshot): Promise<void> {
  const k = KEY.snapshot(snap.site, snap.externalEventId, snap.eventDatetime);
  await valkey.set(k, JSON.stringify(snap), 'EX', 60 * 60 * 3);
  await valkey.set(KEY.freshness(snap.site, snap.externalEventId), snap.capturedAt);
}
