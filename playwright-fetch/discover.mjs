/**
 * Discovery mode — 사이트의 검색 + 상세 + 예매 흐름 traffic 자동 캡쳐.
 *
 * 흐름:
 *   1) 홈 페이지 진입 → networkidle
 *   2) (SEARCH_URL 패턴 있으면) 검색 페이지 navigate → fetch/XHR 캡쳐
 *      (없으면) 헤더 검색 버튼 click → search input fill + Enter
 *   3) 검색 결과 첫 카드 클릭 → 상세 페이지 → fetch/XHR 캡쳐
 *   4) 예매/날짜/시간 element 클릭 시도 → 좌석/timeslot endpoint 캡쳐
 *
 * 결과: discover-<site>.json + 단계별 screenshot.
 *
 * Usage:  SITE=cgv QUERY="마이클" node discover.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const SITE = process.env.SITE || 'cgv';
const QUERY = process.env.QUERY || '마이클';

const HOME_BY_SITE = {
  cgv: 'https://cgv.co.kr/',
  lottecinema: 'https://www.lottecinema.co.kr/NLCHS',
  megabox: 'https://www.megabox.co.kr/',
  interpark: 'https://tickets.interpark.com/',
  catchtable: 'https://app.catchtable.co.kr/',
};

// 알려진 search URL 패턴 (있으면 직접 navigate, 없으면 input fire 시도)
const SEARCH_URL_BY_SITE = {
  cgv: (q) => `https://cgv.co.kr/tme/itgrSrch?swrd=${encodeURIComponent(q)}`,
  interpark: (q) => `https://tickets.interpark.com/contents/search?keyword=${encodeURIComponent(q)}`,
  lottecinema: (q) =>
    `https://www.lottecinema.co.kr/NLCHS/Movie/MovieSearchResult?keyword=${encodeURIComponent(q)}`,
};

const home = HOME_BY_SITE[SITE];
if (!home) {
  console.log(`unknown site: ${SITE}`);
  process.exit(1);
}

const requests = [];
const responses = [];
const jsBundles = [];
const phaseMarkers = [];

function markPhase(name) {
  phaseMarkers.push({ name, requestIdx: requests.length, t: Date.now() });
  console.log(`\n[discover] ===== phase: ${name} (req idx ${requests.length}) =====`);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
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
  page.on('request', (req) => {
    const t = req.resourceType();
    if (t === 'xhr' || t === 'fetch') {
      requests.push({
        url: req.url(),
        method: req.method(),
        type: t,
        headers: req.headers(),
        postData: req.postData()?.slice(0, 2000) ?? null,
      });
    } else if (t === 'script') {
      const u = req.url();
      if (
        u.includes('.js') &&
        !u.includes('analytics') &&
        !u.includes('gtm') &&
        !u.includes('kakao') &&
        !u.includes('googletag')
      ) {
        jsBundles.push(u);
      }
    }
  });
  page.on('response', async (resp) => {
    const t = resp.request().resourceType();
    if (t === 'xhr' || t === 'fetch') {
      let bodyPreview = '';
      try {
        const txt = await resp.text();
        bodyPreview = txt.slice(0, 600);
      } catch {
        /* ignore */
      }
      responses.push({ url: resp.url(), status: resp.status(), bodyPreview });
    }
  });

  // ============ PHASE 1: home ============
  markPhase('home');
  try {
    await page.goto(home, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    console.log('home goto error:', String(e).slice(0, 200));
  }
  console.log(
    `  url=${page.url()} title=${(await page.title().catch(() => '?')).slice(0, 80)}`,
  );
  await page.screenshot({ path: `discover-${SITE}-1-home.png` }).catch(() => null);

  // DOM search elements 발견
  const domInfo = await page.evaluate(() => {
    const candidates = [
      'input[type="search"]',
      'input[placeholder*="검색"]',
      'input[name*="search" i]',
      'input[name*="keyword" i]',
      'input[name*="query" i]',
      'button[aria-label*="검색"]',
      'a[aria-label*="검색"]',
      '[class*="searchBtn" i]',
      '[class*="search-btn" i]',
      '[class*="search_btn" i]',
      '[id*="search" i][role="button"]',
    ];
    const out = [];
    for (const sel of candidates) {
      const els = document.querySelectorAll(sel);
      if (els.length) {
        const first = els[0];
        out.push({
          selector: sel,
          count: els.length,
          firstTag: first.tagName,
          firstOuter: first.outerHTML?.slice(0, 250),
          visible: first.offsetParent !== null,
        });
      }
    }
    return out;
  });
  console.log('  DOM search elements:');
  for (const d of domInfo) {
    console.log(`   - ${d.selector} count=${d.count} tag=${d.firstTag} visible=${d.visible}`);
  }

  // ============ PHASE 2: search ============
  markPhase('search');
  const sUrlFn = SEARCH_URL_BY_SITE[SITE];
  let searchSucceeded = false;
  if (sUrlFn) {
    const url = sUrlFn(QUERY);
    console.log(`  navigate ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      searchSucceeded = true;
    } catch (e) {
      console.log('  search goto error:', String(e).slice(0, 200));
    }
  } else {
    // 검색 버튼 클릭 → input fill + Enter
    const buttonCandidates = [
      '[class*="searchBtn" i]',
      '[class*="search-btn" i]',
      'button[aria-label*="검색"]',
      'a[aria-label*="검색"]',
    ];
    for (const sel of buttonCandidates) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1_500 })) {
          await el.click({ timeout: 3_000 });
          console.log(`  clicked search btn: ${sel}`);
          await page.waitForTimeout(800);
          break;
        }
      } catch {
        /* try next */
      }
    }
    const inputCandidates = [
      'input[type="search"]',
      'input[placeholder*="검색"]',
      'input[name*="search" i]',
      'input[name*="keyword" i]',
    ];
    for (const sel of inputCandidates) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 1_500 })) {
          await el.click({ clickCount: 3 });
          await el.fill(QUERY);
          await page.keyboard.press('Enter');
          console.log(`  filled input ${sel}`);
          searchSucceeded = true;
          break;
        }
      } catch {
        /* try next */
      }
    }
  }
  if (searchSucceeded) {
    await page.waitForTimeout(6_000); // 검색 후 fetch 완료 대기
    console.log(`  after search: ${page.url()}`);
    await page.screenshot({ path: `discover-${SITE}-2-search.png` }).catch(() => null);
  } else {
    console.log('  search fire 실패');
  }

  // ============ PHASE 3: 첫 결과 클릭 → 상세 ============
  markPhase('detail');
  // 결과 카드 셀렉터 candidates (사이트별로 다름)
  const resultCandidates = [
    'a[href*="movie" i]',
    'a[href*="detail" i]',
    'a[href*="goods" i]',
    'a[href*="shop" i]',
    'a[href*="restaurant" i]',
    '[class*="card" i] a',
    '[class*="movie-item" i] a',
    'main a:has(img)',
  ];
  let clickedDetail = false;
  for (const sel of resultCandidates) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1_500 })) {
        const href = await el.getAttribute('href').catch(() => null);
        console.log(`  clicking first card via: ${sel} (href=${href?.slice(0, 80)})`);
        await el.click({ timeout: 3_000 });
        clickedDetail = true;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (clickedDetail) {
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null);
    await page.waitForTimeout(3_000);
    console.log(`  detail url: ${page.url()}`);
    await page.screenshot({ path: `discover-${SITE}-3-detail.png` }).catch(() => null);
  }

  // ============ PHASE 4: 예매/날짜 선택 시도 ============
  markPhase('booking');
  const bookingCandidates = [
    'a:has-text("예매")',
    'button:has-text("예매")',
    'a:has-text("바로 예매")',
    'a:has-text("예약")',
    'button:has-text("예약")',
    '[class*="booking" i]',
    '[class*="reserve" i]',
  ];
  for (const sel of bookingCandidates) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1_500 })) {
        console.log(`  clicking booking: ${sel}`);
        await el.click({ timeout: 3_000 });
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => null);
        await page.waitForTimeout(4_000);
        console.log(`  booking url: ${page.url()}`);
        await page.screenshot({ path: `discover-${SITE}-4-booking.png` }).catch(() => null);
        break;
      }
    } catch {
      /* try next */
    }
  }

  // ============ PHASE 5: 날짜 + 시간 + 좌석 click (좌석맵 endpoint 캡쳐) ============
  markPhase('seat');
  // 날짜 chip 클릭
  const dateCandidates = [
    'button[class*="date" i]:not([disabled])',
    'a[class*="date" i]',
    '[class*="DateBtn" i]',
    'li[class*="date" i] button',
    '.date-list li',
    '[role="tab"][class*="date" i]',
  ];
  let dateClicked = false;
  for (const sel of dateCandidates) {
    try {
      const els = page.locator(sel);
      const n = await els.count();
      if (n) {
        await els.first().click({ timeout: 2_000 });
        console.log(`  clicked date via: ${sel} (count=${n})`);
        await page.waitForTimeout(2_500);
        dateClicked = true;
        break;
      }
    } catch {
      /* skip */
    }
  }
  // 시간/회차 chip 클릭
  const timeCandidates = [
    'button[class*="time" i]:not([disabled])',
    '[class*="TimeBtn" i]',
    'button[class*="schedule" i]',
    'a[class*="time" i]',
    '[class*="time-item" i]',
  ];
  for (const sel of timeCandidates) {
    try {
      const els = page.locator(sel);
      const n = await els.count();
      if (n) {
        await els.first().click({ timeout: 2_000 });
        console.log(`  clicked time via: ${sel} (count=${n})`);
        await page.waitForTimeout(4_000);
        break;
      }
    } catch {
      /* skip */
    }
  }
  console.log(`  seat-phase url: ${page.url()}`);
  await page.screenshot({ path: `discover-${SITE}-5-seat.png` }).catch(() => null);

  // 모든 dump → JSON
  const out = {
    site: SITE,
    query: QUERY,
    finalUrl: page.url(),
    title: await page.title().catch(() => null),
    phaseMarkers,
    domInfo,
    jsBundles: Array.from(new Set(jsBundles)),
    requests,
    responses,
  };
  writeFileSync(`discover-${SITE}.json`, JSON.stringify(out, null, 2));
  console.log(`\n[discover] wrote discover-${SITE}.json (${requests.length} reqs, ${responses.length} resps)`);

  await browser.close();
}

main().catch((e) => {
  console.error('[discover] fatal', e);
  process.exit(1);
});
