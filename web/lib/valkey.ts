import Redis from 'ioredis';

const url = process.env.VALKEY_URL;
if (!url) throw new Error('VALKEY_URL is not set');

const prefix = process.env.VALKEY_KEY_PREFIX || 'seatwatch:dev';

declare global {
  // eslint-disable-next-line no-var
  var __valkey: Redis | undefined;
}

export const valkey =
  global.__valkey ??
  (global.__valkey = new Redis(url, {
    keyPrefix: `${prefix}:`,
    tls: {},
    lazyConnect: false,
    maxRetriesPerRequest: 3,
  }));

export const KEY = {
  snapshot: (site: string, eventId: string, datetime: string) =>
    `snapshot:${site}:${eventId}:${datetime}`,
  freshness: (site: string, eventId: string) => `freshness:${site}:${eventId}`,
  notifyQueue: () => `notify:queue`,
  notifyCooldown: (watchId: string, seatId: string) =>
    `notify:cooldown:${watchId}:${seatId}`,
  oauthState: (state: string) => `oauth:state:${state}`,
  rateLimit: (userId: string, action: string) => `ratelimit:${userId}:${action}`,
};
