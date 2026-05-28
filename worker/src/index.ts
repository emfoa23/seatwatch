import Redis from 'ioredis';
import { neon } from '@neondatabase/serverless';

interface NotifyPayload {
  watch_id: string;
  user_id: string;
  email: string;
  site: string;
  event_id: string;
  event_datetime: string;
  seat: Record<string, unknown>;
  dedupe_key: string;
}

const VALKEY_URL = req('VALKEY_URL');
const DATABASE_URL = req('DATABASE_URL');
const RESEND_API_KEY = req('RESEND_API_KEY');
const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const PREFIX = process.env.VALKEY_KEY_PREFIX ?? 'seatwatch:dev';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`env ${name} missing`);
  return v;
}

const sql = neon(DATABASE_URL);
const redis = new Redis(VALKEY_URL, {
  tls: {},
  keyPrefix: `${PREFIX}:`,
  maxRetriesPerRequest: 3,
});

const QUEUE = 'notify:queue';
const COOLDOWN_SEC = 30 * 60;

async function buildDetailUrl(p: NotifyPayload): Promise<string> {
  const raw = await redis.hget(`events:${p.site}`, p.event_id);
  const base = process.env.PUBLIC_SITE_URL ?? 'https://seatwatch.vercel.app';
  if (!raw) return `${base}/${p.site}`;
  try {
    const entry = JSON.parse(raw) as { title: string; venue: string };
    const movieSites = ['cgv', 'megabox', 'lotte'];
    const key = movieSites.includes(p.site) ? `${entry.venue}__${entry.title}` : entry.title;
    const encoded = Buffer.from(key, 'utf-8').toString('base64url');
    return `${base}/${p.site}/g/${encoded}?dt=${encodeURIComponent(p.event_datetime)}`;
  } catch {
    return `${base}/${p.site}`;
  }
}

async function sendMail(p: NotifyPayload): Promise<{ ok: boolean; status: number; body: string }> {
  const subject = `[seatwatch] ${p.site.toUpperCase()} ${p.event_id} — 빈자리 발견`;
  const seatStr = JSON.stringify(p.seat);
  const detailUrl = await buildDetailUrl(p);
  const html = `
    <h2>찾던 자리에 빈자리가 생겼습니다</h2>
    <p>사이트: <b>${p.site.toUpperCase()}</b></p>
    <p>이벤트 ID: <code>${p.event_id}</code></p>
    <p>일시: ${new Date(p.event_datetime).toLocaleString('ko-KR')}</p>
    <p>좌석: <code>${seatStr}</code></p>
    <p><a href="${detailUrl}">바로 확인</a></p>
    <hr>
    <p style="color:#999;font-size:12px">자동 알림 메일입니다. 알림을 끄려면 /my/watches 에서 해당 항목을 취소하세요.</p>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [p.email], subject, html }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function processOne(payload: NotifyPayload): Promise<'sent' | 'deduped' | 'failed'> {
  const cdKey = `notify:cooldown:${payload.watch_id}:${payload.seat?.id ?? payload.seat?.time ?? 'na'}`;
  const setRes = await redis.set(cdKey, '1', 'EX', COOLDOWN_SEC, 'NX');
  if (setRes !== 'OK') {
    await sql`
      INSERT INTO notifications (user_id, watch_target_id, channel, status, dedupe_key, payload)
      VALUES (${payload.user_id}::uuid, ${payload.watch_id}::uuid, 'email', 'deduped', ${payload.dedupe_key}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (dedupe_key) DO NOTHING
    `;
    return 'deduped';
  }

  const inserted = await sql`
    INSERT INTO notifications (user_id, watch_target_id, channel, status, dedupe_key, payload)
    VALUES (${payload.user_id}::uuid, ${payload.watch_id}::uuid, 'email', 'queued', ${payload.dedupe_key}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id
  `;
  if (inserted.length === 0) return 'deduped';
  const notifId = inserted[0].id;

  const mail = await sendMail(payload);
  if (mail.ok) {
    await sql`UPDATE notifications SET status='sent', sent_at=now() WHERE id=${notifId}`;
    console.log(`[ok] notify sent ${payload.watch_id} ${payload.seat?.id ?? payload.seat?.time}`);
    return 'sent';
  }
  await sql`UPDATE notifications SET status='failed', error=${mail.body.slice(0, 500)} WHERE id=${notifId}`;
  console.error(`[err] resend ${mail.status}: ${mail.body.slice(0, 200)}`);
  return 'failed';
}

async function loop(): Promise<void> {
  console.log(`worker started. queue=${PREFIX}:${QUEUE}`);
  while (true) {
    try {
      const popped = await redis.brpop(QUEUE, 5);
      if (!popped) continue;
      const [, raw] = popped;
      const payload = JSON.parse(raw) as NotifyPayload;
      await processOne(payload);
    } catch (e) {
      console.error('loop error:', e);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM — closing');
  await redis.quit();
  process.exit(0);
});
process.on('SIGINT', async () => {
  console.log('SIGINT — closing');
  await redis.quit();
  process.exit(0);
});

loop().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
