/**
 * CatchTable 식당 검색 fetch (Cloudflare WAF 우회).
 *
 * 흐름:
 *   1) Chromium 가 app.catchtable.co.kr 로 진입 → Cloudflare bot challenge 자동 통과
 *      → `__cf_bm` 쿠키 발급 + JS 로드
 *   2) page.evaluate() 안에서 ct-api.catchtable.co.kr/api/v6/search/list POST
 *      → 페이지의 같은 origin 으로 fetch (CORS / cookie 자동 inject)
 *   3) 응답 JSON → EventIndexEntry[] 로 변환 → Valkey events:catchtable + search 캐시 적재
 *
 * 환경변수: VALKEY_URL, VALKEY_KEY_PREFIX, QUERY 또는 QUERIES (CSV).
 */
import { chromium } from 'playwright';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';

const PREFIX = process.env.VALKEY_KEY_PREFIX || 'seatwatch:prod';
const VALKEY_URL = process.env.VALKEY_URL;
if (!VALKEY_URL) throw new Error('VALKEY_URL is required');

const TARGET_URL = 'https://ct-api.catchtable.co.kr/api/v6/search/list';

function normalizeQuery(q) {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

function searchKey(query) {
  const h = createHash('sha256').update(normalizeQuery(query)).digest('hex').slice(0, 24);
  return `${PREFIX}:search:catchtable:${h}`;
}

function eidOf(shopId, title) {
  return createHash('sha256')
    .update(`catchtable|${shopId}|${title}`)
    .digest('hex')
    .slice(0, 16);
}

function todayKstIso() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  // 18:00 default
  const ymd = kst.toISOString().slice(0, 10);
  return `${ymd}T18:00:00+09:00`;
}

/** CatchTable 응답 → EventIndexEntry[]
 *  실제 구조: data.shopResults.shops[].shopMeta.{shopRef, shopName, urlPathAlias, ...}
 *            + shops[].shopAddress (or shops[].addressLevel1) 등 동봉.
 */
function parseToEntries(json) {
  const out = [];
  const dt = todayKstIso();
  const shops = json?.data?.shopResults?.shops || [];
  for (const s of Array.isArray(shops) ? shops : []) {
    const meta = s.shopMeta || s;
    const shopRef = meta.shopRef || meta.shopId || meta.urlPathAlias || meta.id;
    const title = meta.shopName || meta.name || meta.title;
    if (!shopRef || !title) continue;
    const addr = s.shopAddress || s.address || {};
    const region =
      addr.addressLevel1 || addr.level1 || meta.addressLevel1 || s.regionName || '';
    const venue =
      addr.addressLevel2 ||
      addr.level2 ||
      meta.addressLevel2 ||
      s.subRegion ||
      region ||
      '';
    out.push({
      site: 'catchtable',
      externalEventId: eidOf(shopRef, title),
      eventDatetime: dt,
      title,
      venue: venue || '캐치테이블',
      region: region || undefined,
    });
  }
  // 중복 제거
  const seen = new Set();
  const dedup = [];
  for (const e of out) {
    if (seen.has(e.externalEventId)) continue;
    seen.add(e.externalEventId);
    dedup.push(e);
  }
  return dedup;
}

async function searchOne(page, query) {
  const url = TARGET_URL;
  // page.evaluate 안에서 fetch — page 가 catchtable origin 이라 cookie 자동 첨부
  const body = {
    paging: { offset: '0', size: 30 },
    listType: 'GENERAL',
    reservationParams: {},
    notUseSpellCorrection: false,
    divideType: 'DIVIDE_BY_AVAILABILITY',
    sort: { sortType: 'recommended', sortChunkSize: 5 },
    userInfo: { clientGeoPoint: { lat: 37.5665, lon: 126.978 } },
    filters: {
      legalDistrictCodes: [],
      facilityCodes: [],
      filterTags: [],
      contractedType: 'CONTRACTED_ONLY',
    },
    keywordSearch: { keyword: query },
    recommendationModel: 'bmk-cwse',
    useRerank: true,
  };
  const result = await page.evaluate(
    async ({ u, b }) => {
      try {
        const r = await fetch(u, {
          method: 'POST',
          headers: {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json',
            'x-requested-with': 'XMLHttpRequest',
            'x-device-id': '5a1ef292-956f-401e-8577-c917a58bdaf0',
            'x-transaction-id': String(Date.now()).slice(-6),
            'search-list-page-visit-id': String(Date.now()),
          },
          credentials: 'include',
          body: JSON.stringify(b),
        });
        const text = await r.text();
        let body;
        try { body = JSON.parse(text); } catch { body = { rawText: text.slice(0, 800) }; }
        return { ok: r.ok, status: r.status, body };
      } catch (e) {
        return { ok: false, status: 0, error: String(e) };
      }
    },
    { u: url, b: body },
  );
  return result;
}

async function main() {
  const queries = process.env.QUERIES
    ? process.env.QUERIES.split(',').map((s) => s.trim()).filter(Boolean)
    : process.env.QUERY
      ? [process.env.QUERY]
      : [];
  if (!queries.length) {
    console.log('no QUERY/QUERIES provided');
    process.exit(0);
  }
  console.log(`[ct-fetch] queries: ${queries.join(', ')}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 800 },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await ctx.newPage();
  console.log('[ct-fetch] visiting app.catchtable.co.kr to warm Cloudflare cookies…');
  try {
    await page.goto('https://app.catchtable.co.kr/', {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
  } catch (e) {
    console.log('[ct-fetch] initial goto error:', String(e).slice(0, 200));
  }
  console.log(`[ct-fetch] after warmup: url=${page.url()} title=${(await page.title().catch(() => '?')).slice(0, 80)}`);
  await page.screenshot({ path: 'ct-warmup.png' }).catch(() => null);

  const redis = new Redis(VALKEY_URL, {
    tls: VALKEY_URL.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: 3,
  });

  let ok = 0, fail = 0;
  for (const q of queries) {
    console.log(`[ct-fetch] query: ${q}`);
    const r = await searchOne(page, q);
    if (!r.ok || r.status !== 200) {
      console.log(`  failed status=${r.status} ${JSON.stringify(r.body || r.error || '').slice(0, 300)}`);
      fail++;
      continue;
    }
    // 응답 첫 keys 출력 (구조 파악)
    const keys = Object.keys(r.body).slice(0, 10);
    console.log(`  resp keys: ${keys.join(', ')}`);
    const entries = parseToEntries(r.body);
    console.log(`  parsed entries=${entries.length}`);
    if (entries.length) {
      const pipeline = redis.pipeline();
      for (const e of entries) {
        pipeline.hset(`${PREFIX}:events:catchtable`, e.externalEventId, JSON.stringify(e));
      }
      pipeline.set(searchKey(q), JSON.stringify(entries), 'EX', 60 * 60);
      await pipeline.exec();
    } else {
      await redis.set(searchKey(q), JSON.stringify([]), 'EX', 60 * 10);
      // 응답 일부 dump (구조 디버그)
      console.log(`  body sample: ${JSON.stringify(r.body).slice(0, 600)}`);
    }
    ok++;
  }

  await redis.quit();
  await browser.close();
  console.log(`[ct-fetch] done ok=${ok} fail=${fail}`);
  process.exit(fail > 0 && ok === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[ct-fetch] fatal', e);
  process.exit(1);
});
