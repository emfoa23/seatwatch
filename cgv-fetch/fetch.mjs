/**
 * CGV 좌석/검색 데이터 fetch (Cloudflare WAF 우회).
 *
 * 흐름:
 *   1) Chromium headless 로 cgv.co.kr 페이지 로드 → Cloudflare bot challenge 자동 통과
 *      → `__cf_bm`, `_cfuvid` 쿠키 발급 + 페이지 JS context 활성
 *   2) page.evaluate() 안에서 `await fetch('/tme/more/itgrSrch/searchItgrSrchMov?...')`
 *      → CGV 의 JS 가 자동으로 `x-signature`, `x-timestamp` 헤더 inject
 *   3) 응답 JSON 캡쳐 → Valkey 캐시 적재 (search: 1h TTL)
 *
 * 사용:
 *   QUERY="<keyword>" node fetch.mjs               # search 1건
 *   ACTION=search QUERIES="A,B,C" node fetch.mjs   # 여러 query batch
 *
 * 환경변수: VALKEY_URL, VALKEY_KEY_PREFIX, QUERY (단건) 또는 QUERIES (CSV).
 */
import { chromium } from 'playwright';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';

const PREFIX = process.env.VALKEY_KEY_PREFIX || 'seatwatch:prod';
const VALKEY_URL = process.env.VALKEY_URL;
if (!VALKEY_URL) throw new Error('VALKEY_URL is required');

const TARGET_URL_BASE = 'https://api.cgv.co.kr/tme/more/itgrSrch/searchItgrSrchMov';
const COCD = 'A420';

function normalizeQuery(q) {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

function searchKey(query) {
  const h = createHash('sha256').update(normalizeQuery(query)).digest('hex').slice(0, 24);
  return `${PREFIX}:search:cgv:${h}`;
}

/** Parse CGV 응답 → EventIndexEntry[] (web/lib/types/seat.ts 와 동일 형식) */
function parseToEntries(json, query) {
  // CGV response 구조 예상 (실제 응답에서 확정해야 함):
  // { resultData: { movieList: [{ movieNm, coCdNo, theaters: [...] }] } } 등
  // 일단 raw 보존 + 가능한 만큼 변환
  const list = json?.resultData?.movieList || json?.movieList || json?.data?.movieList || [];
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    const title = m.movieNm || m.title || m.name;
    const eid = String(m.movieCd || m.movieIdx || m.movieNo || m.coCdNo || '').trim();
    if (!title || !eid) continue;
    // 회차 정보가 응답에 포함돼 있지 않으면 첫 entry 1개만 placeholder
    out.push({
      site: 'cgv',
      externalEventId: `cgv_${eid}`.slice(0, 16),
      eventDatetime: new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace('Z', '+09:00'),
      title,
      venue: 'CGV',
    });
  }
  return out;
}

async function searchOne(page, query) {
  // 검색 페이지로 navigate — CGV SPA 가 자체 fetch 로 endpoint 자동 호출.
  // 그 응답을 page.waitForResponse 로 캡쳐.
  const searchUrl = `https://cgv.co.kr/search/?searchKeyword=${encodeURIComponent(query)}`;
  console.log(`  goto ${searchUrl}`);
  const respPromise = page.waitForResponse(
    (r) => r.url().includes('/tme/more/itgrSrch/searchItgrSrchMov'),
    { timeout: 15_000 },
  ).catch((e) => ({ _error: String(e) }));

  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  console.log(`  after search goto: url=${page.url()} title=${(await page.title().catch(() => '?')).slice(0, 80)}`);
  await page.screenshot({ path: `search-${Date.now()}.png` }).catch(() => null);

  const resp = await respPromise;
  if (resp && resp._error) {
    return { ok: false, status: 0, error: resp._error };
  }
  if (!resp) return { ok: false, status: 0, error: 'no response captured' };
  try {
    const status = resp.status();
    const body = status === 200 ? await resp.json() : { rawText: (await resp.text()).slice(0, 800) };
    return { ok: status === 200, status, body };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
}

async function main() {
  const queries = (process.env.QUERIES
    ? process.env.QUERIES.split(',').map((s) => s.trim()).filter(Boolean)
    : process.env.QUERY
      ? [process.env.QUERY]
      : []
  );
  if (!queries.length) {
    console.log('no QUERY/QUERIES provided');
    process.exit(0);
  }
  console.log(`[cgv-fetch] queries: ${queries.join(', ')}`);

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
  // Bot detection 회피 — navigator.webdriver false
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await ctx.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [page.console.error]', msg.text().slice(0, 200));
  });
  page.on('requestfailed', (req) => {
    if (req.url().includes('cgv.co.kr')) {
      console.log('  [requestfailed]', req.url(), req.failure()?.errorText);
    }
  });
  console.log('[cgv-fetch] visiting cgv.co.kr to warm Cloudflare bot challenge…');
  try {
    await page.goto('https://cgv.co.kr/', {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
  } catch (e) {
    console.log('[cgv-fetch] initial goto error (continuing):', String(e).slice(0, 200));
  }
  console.log(`[cgv-fetch] after warmup: url=${page.url()} title=${(await page.title().catch(() => '?')).slice(0, 80)}`);
  await page.screenshot({ path: 'warmup.png', fullPage: false }).catch(() => null);

  const redis = new Redis(VALKEY_URL, {
    tls: VALKEY_URL.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: 3,
  });

  let ok = 0, fail = 0;
  for (const q of queries) {
    console.log(`[cgv-fetch] query: ${q}`);
    const r = await searchOne(page, q);
    if (!r.ok || r.status !== 200) {
      console.log(`  failed status=${r.status} ${JSON.stringify(r.body || r.error).slice(0, 300)}`);
      fail++;
      continue;
    }
    const entries = parseToEntries(r.body, q);
    console.log(`  parsed entries=${entries.length}`);
    // events index hset (lazy fetch indexEvent 와 같은 키)
    if (entries.length) {
      const pipeline = redis.pipeline();
      for (const e of entries) {
        pipeline.hset(`${PREFIX}:events:cgv`, e.externalEventId, JSON.stringify(e));
      }
      pipeline.set(searchKey(q), JSON.stringify(entries), 'EX', 60 * 60); // 1h TTL
      await pipeline.exec();
    } else {
      // 빈 결과도 캐시 (계속 fetch 폭주 방지)
      await redis.set(searchKey(q), JSON.stringify([]), 'EX', 60 * 10); // 10m
    }
    ok++;
  }

  await redis.quit();
  await browser.close();
  console.log(`[cgv-fetch] done ok=${ok} fail=${fail}`);
  process.exit(fail > 0 && ok === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('[cgv-fetch] fatal', e);
  process.exit(1);
});
