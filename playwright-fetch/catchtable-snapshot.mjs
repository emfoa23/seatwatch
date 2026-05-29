/**
 * CatchTable 식당 timeslot snapshot (Playwright + Cloudflare 우회).
 *
 * Flow:
 *   1) app.catchtable.co.kr 진입 → Cloudflare cookies
 *   2) page.evaluate() 안에서 GET ct-api/api/reservation/v1/dining/day-slots?shopRef=...
 *   3) 응답 JSON → SeatSnapshot.timeSlots 매핑
 *   4) Valkey snapshot:catchtable:<shopRef>:<datetime> 적재
 *
 * Env: VALKEY_URL, VALKEY_KEY_PREFIX, SHOP_REFS (CSV — 여러 식당의 shopRef)
 */
import { chromium } from 'playwright';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';

const PREFIX = process.env.VALKEY_KEY_PREFIX || 'seatwatch:prod';
const VALKEY_URL = process.env.VALKEY_URL;
if (!VALKEY_URL) throw new Error('VALKEY_URL required');

const SHOP_REFS = (process.env.SHOP_REFS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!SHOP_REFS.length) {
  console.log('SHOP_REFS 비어있음');
  process.exit(0);
}

function eidOf(shopRef, title = '') {
  return createHash('sha256').update(`catchtable|${shopRef}|${title}`).digest('hex').slice(0, 16);
}

function parseDaySlots(json, shopRef) {
  // 응답 구조 추정: {data: {daySlots: [{date, slots: [{time, available, partySize}]}]}}
  // 또는 {data: {availableDays: [...], slots: [...]}}
  // 일단 가능한 구조 모두 탐색
  const out = [];
  const data = json?.data || json;
  function visit(o, currentDate) {
    if (!o) return;
    if (Array.isArray(o)) {
      for (const x of o) visit(x, currentDate);
      return;
    }
    if (typeof o !== 'object') return;
    const date = o.date || o.day || o.diningDate || currentDate;
    if (o.time || o.slotTime || o.startTime) {
      const time = o.time || o.slotTime || o.startTime;
      const available = o.available ?? (o.state === 'AVAILABLE') ?? (o.status === 'OPEN');
      const min = o.minPersonCount || o.minPersons || o.minParty || 1;
      const max = o.maxPersonCount || o.maxPersons || o.maxParty || min;
      out.push({
        date,
        time,
        available: !!available,
        partySize: [Number(min), Number(max)],
      });
      return;
    }
    for (const k in o) visit(o[k], date);
  }
  visit(data);
  return out;
}

async function fetchTimeslots(page, shopRef) {
  const url = `https://ct-api.catchtable.co.kr/api/reservation/v1/dining/day-slots?shopRef=${shopRef}&tableSeqs=&personCounts=`;
  const result = await page.evaluate(async (u) => {
    try {
      const r = await fetch(u, {
        headers: {
          accept: 'application/json, text/plain, */*',
          'x-device-id': '5a1ef292-956f-401e-8577-c917a58bdaf0',
          'x-requested-with': 'XMLHttpRequest',
          'x-transaction-id': String(Date.now()).slice(-6),
        },
        credentials: 'include',
      });
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { rawText: text.slice(0, 500) }; }
      return { ok: r.ok, status: r.status, body };
    } catch (e) {
      return { ok: false, status: 0, error: String(e) };
    }
  }, url);
  return result;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh) Chrome/146.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 800 },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await ctx.newPage();
  console.log('[ct-snap] visiting app.catchtable.co.kr...');
  await page.goto('https://app.catchtable.co.kr/', {
    waitUntil: 'networkidle', timeout: 30_000,
  }).catch(() => null);
  console.log(`  url=${page.url()} title=${(await page.title().catch(() => '?')).slice(0, 50)}`);

  const redis = new Redis(VALKEY_URL, {
    tls: VALKEY_URL.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: 3,
  });

  let ok = 0, fail = 0;
  for (const shopRef of SHOP_REFS) {
    console.log(`[ct-snap] shopRef=${shopRef}`);
    const r = await fetchTimeslots(page, shopRef);
    if (!r.ok || r.status !== 200) {
      console.log(`  fail status=${r.status} ${JSON.stringify(r.body || r.error).slice(0, 200)}`);
      fail++;
      continue;
    }
    const slots = parseDaySlots(r.body, shopRef);
    console.log(`  parsed slots=${slots.length} ok status=${r.status}`);
    if (slots.length === 0) {
      // dump body 일부
      console.log(`  raw body: ${JSON.stringify(r.body).slice(0, 800)}`);
    }
    // 날짜별 SeatSnapshot 적재 — 식당은 (eid, date) 단위로 snapshot
    const byDate = new Map();
    for (const s of slots) {
      const d = s.date || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push({
        time: s.time,
        partySize: s.partySize,
        available: s.available,
      });
    }
    const captured = new Date().toISOString();
    for (const [date, timeSlots] of byDate.entries()) {
      const eid = eidOf(shopRef);
      const eventDt = `${date}T18:00:00+09:00`;
      const snap = {
        site: 'catchtable',
        externalEventId: eid,
        eventDatetime: eventDt,
        capturedAt: captured,
        title: '',
        venue: '',
        timeSlots,
      };
      await redis.set(
        `${PREFIX}:snapshot:catchtable:${eid}:${eventDt}`,
        JSON.stringify(snap),
        'EX', 60 * 5, // 5분 TTL
      );
      await redis.set(`${PREFIX}:freshness:catchtable:${eid}`, captured);
    }
    ok++;
  }
  await redis.quit();
  await browser.close();
  console.log(`[ct-snap] done ok=${ok} fail=${fail}`);
  process.exit(fail > 0 && ok === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[ct-snap] fatal', e);
  process.exit(1);
});
