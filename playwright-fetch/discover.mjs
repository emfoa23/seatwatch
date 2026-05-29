/**
 * Discovery — 사이트의 검색 + 회차 + 좌석 전체 흐름 traffic 캡쳐.
 *
 * 사이트별 navigation flow 가 다르므로 BOOKING_FLOWS 안에서 site-specific click.
 * 결과: discover-<site>.json + phase 별 screenshot.
 *
 * Usage: SITE=cgv QUERY="마이클" node discover.mjs
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

const requests = [];
const responses = [];
const jsBundles = [];
const phaseMarkers = [];

function markPhase(name) {
  phaseMarkers.push({ name, requestIdx: requests.length, t: Date.now() });
  console.log(`\n[discover] ===== ${name} (req idx ${requests.length}) =====`);
}

async function clickFirstVisible(page, selectors, label) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1_500 })) {
        await el.click({ timeout: 3_000 });
        console.log(`  click [${label}]: ${sel}`);
        await page.waitForTimeout(2_500);
        return true;
      }
    } catch {
      /* try next */
    }
  }
  console.log(`  [${label}] no visible match`);
  return false;
}

async function fillInput(page, selectors, value, label) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1_500 })) {
        await el.click({ clickCount: 3 });
        await el.fill(value);
        await page.keyboard.press('Enter');
        console.log(`  fill [${label}]: ${sel}`);
        return true;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

// 사이트별 booking flow — search 페이지 → 좌석 페이지까지
const FLOWS = {
  cgv: async (page) => {
    markPhase('search');
    await page.goto(
      `https://cgv.co.kr/tme/itgrSrch?swrd=${encodeURIComponent(QUERY)}`,
      { waitUntil: 'networkidle', timeout: 30_000 },
    ).catch((e) => console.log('  search goto err', String(e).slice(0, 100)));
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: `discover-${SITE}-search.png` }).catch(() => null);

    markPhase('booking');
    // 검색결과의 영화 카드 클릭 (없으면 직접 movieBook 으로)
    const clicked = await clickFirstVisible(page, [
      'a[href*="movieBook"]',
      'a[href*="movieIdx"]',
      '[class*="movie-list" i] a',
      '[class*="MovieCard" i] a',
      'main a:has(img)',
    ], 'movie-card');
    if (!clicked) {
      await page.goto('https://cgv.co.kr/cnm/movieBook', {
        waitUntil: 'networkidle', timeout: 30_000,
      }).catch(() => null);
      await page.waitForTimeout(3_000);
    }
    await page.screenshot({ path: `discover-${SITE}-booking.png` }).catch(() => null);

    markPhase('theater');
    // 영화 chip
    await clickFirstVisible(page, [
      '[class*="movieList" i] li',
      'button[class*="movie" i]',
      '[class*="movPostr" i]',
    ], 'movie-chip');

    // 극장 chip
    await clickFirstVisible(page, [
      'button[class*="theater" i]',
      'button[class*="site" i]',
      'li[class*="theater" i]',
      'a[class*="branch" i]',
    ], 'theater-chip');

    markPhase('date');
    await clickFirstVisible(page, [
      'button[class*="date" i]:not([disabled])',
      'li[class*="date" i] button',
      '[role="tab"][class*="date" i]',
      'button[class*="day" i]',
    ], 'date');

    markPhase('time');
    await clickFirstVisible(page, [
      'button[class*="time" i]:not([disabled])',
      '[class*="TimeBtn" i]',
      'button[class*="schedule" i]',
      'a[class*="time" i]',
    ], 'time');
    await page.waitForTimeout(4_000);

    markPhase('seat');
    // 좌석 페이지 가능성
    await clickFirstVisible(page, [
      'button:has-text("좌석선택")',
      'a:has-text("좌석선택")',
      'button:has-text("선택")',
    ], 'seat-btn');
    await page.waitForTimeout(3_000);
  },

  lottecinema: async (page) => {
    markPhase('search');
    // Lotte 는 자체 search 페이지가 없음 — 메인의 검색 input 또는 Ticketing 직접
    await fillInput(page, [
      'input[type="search"]',
      'input[name*="search" i]',
      'input[placeholder*="검색"]',
    ], QUERY, 'search');
    await page.waitForTimeout(2_000);
    await page.screenshot({ path: `discover-${SITE}-search.png` }).catch(() => null);

    markPhase('booking');
    await page.goto('https://www.lottecinema.co.kr/NLCHS/Ticketing', {
      waitUntil: 'networkidle', timeout: 30_000,
    }).catch(() => null);
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: `discover-${SITE}-booking.png` }).catch(() => null);

    markPhase('movie');
    await clickFirstVisible(page, [
      '[class*="ticket-movie" i] li',
      'li[class*="movie" i]',
      'button[class*="movie" i]',
      '[class*="MovieList" i] li',
    ], 'movie');

    markPhase('theater');
    await clickFirstVisible(page, [
      '[class*="ticket-cinema" i] li',
      'li[class*="cinema" i]',
      'button[class*="cinema" i]',
    ], 'cinema');

    markPhase('date');
    await clickFirstVisible(page, [
      'button[class*="date" i]:not([disabled])',
      'li[class*="date" i]',
      '[class*="DatePicker" i] button',
    ], 'date');

    markPhase('time');
    await clickFirstVisible(page, [
      'button[class*="time" i]:not([disabled])',
      'li[class*="time" i] button',
      '[class*="TimeList" i] button',
    ], 'time');
    await page.waitForTimeout(4_000);

    markPhase('seat');
    await clickFirstVisible(page, [
      'button:has-text("좌석선택")',
      'button:has-text("좌석")',
      'a:has-text("좌석선택")',
    ], 'seat-btn');
    await page.waitForTimeout(3_000);
  },

  megabox: async (page) => {
    markPhase('search');
    await page.goto(
      `https://www.megabox.co.kr/movie?searchKeyword=${encodeURIComponent(QUERY)}`,
      { waitUntil: 'networkidle', timeout: 30_000 },
    ).catch(() => null);
    await page.waitForTimeout(2_000);
    await page.screenshot({ path: `discover-${SITE}-search.png` }).catch(() => null);

    markPhase('booking');
    await page.goto('https://www.megabox.co.kr/booking', {
      waitUntil: 'networkidle', timeout: 30_000,
    }).catch(() => null);
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: `discover-${SITE}-booking.png` }).catch(() => null);

    markPhase('movie');
    await clickFirstVisible(page, [
      '.movie-list .movie-item',
      '.movie-list li',
      'button[class*="movie" i]',
      '[class*="MoviePoster" i]',
    ], 'movie');

    markPhase('theater');
    await clickFirstVisible(page, [
      '.brch-list li',
      'button[class*="brch" i]',
      '[class*="branch" i] li',
    ], 'brch');

    markPhase('time');
    await clickFirstVisible(page, [
      '.time-list button:not([disabled])',
      'button[class*="time" i]:not([disabled])',
      'a[class*="time" i]',
    ], 'time');
    await page.waitForTimeout(4_000);

    markPhase('seat');
    await clickFirstVisible(page, [
      'button:has-text("좌석선택")',
      'a:has-text("좌석선택")',
    ], 'seat-btn');
    await page.waitForTimeout(3_000);
  },

  interpark: async (page) => {
    markPhase('search');
    await page.goto(
      `https://tickets.interpark.com/contents/search?keyword=${encodeURIComponent(QUERY)}`,
      { waitUntil: 'networkidle', timeout: 30_000 },
    ).catch(() => null);
    await page.waitForTimeout(2_000);
    await page.screenshot({ path: `discover-${SITE}-search.png` }).catch(() => null);

    markPhase('detail');
    // 첫 카드 click
    await clickFirstVisible(page, [
      'a[href*="goods"]',
      '[class*="goods" i] a',
      'a:has(img)',
    ], 'goods-card');
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: `discover-${SITE}-detail.png` }).catch(() => null);

    markPhase('booking');
    await clickFirstVisible(page, [
      'a:has-text("예매하기")',
      'button:has-text("예매하기")',
      'a:has-text("예매")',
      'button:has-text("예매")',
    ], 'reserve-btn');
    await page.waitForTimeout(4_000);
    await page.screenshot({ path: `discover-${SITE}-booking.png` }).catch(() => null);

    markPhase('date');
    await clickFirstVisible(page, [
      'button[class*="date" i]:not([disabled])',
      'li[class*="date" i]',
    ], 'date');

    markPhase('time');
    await clickFirstVisible(page, [
      'button[class*="time" i]:not([disabled])',
      'button[class*="play" i]',
    ], 'time');
    await page.waitForTimeout(4_000);

    markPhase('seat');
    await page.waitForTimeout(2_000);
  },

  catchtable: async (page) => {
    markPhase('search');
    await page.goto(
      `https://app.catchtable.co.kr/ct/search/result?keyword=${encodeURIComponent(QUERY)}`,
      { waitUntil: 'networkidle', timeout: 30_000 },
    ).catch(() => null);
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: `discover-${SITE}-search.png` }).catch(() => null);

    markPhase('detail');
    // 첫 식당 카드 click
    await clickFirstVisible(page, [
      'a[href*="/shop/"]',
      'a[href*="urlPathAlias"]',
      '[class*="shop" i] a',
      '[class*="SearchListShop" i] a',
      'a:has(img)',
    ], 'shop-card');
    await page.waitForTimeout(4_000);
    await page.screenshot({ path: `discover-${SITE}-detail.png` }).catch(() => null);

    markPhase('booking');
    // 예약 button
    await clickFirstVisible(page, [
      'button:has-text("예약하기")',
      'button:has-text("예약")',
      'a:has-text("예약")',
      '[class*="reservation" i] button',
    ], 'reserve-btn');
    await page.waitForTimeout(3_000);

    markPhase('date');
    await clickFirstVisible(page, [
      'button[class*="date" i]:not([disabled])',
      'li[class*="date" i]',
      '[class*="DatePicker" i] button',
    ], 'date');
    await page.waitForTimeout(3_000);

    markPhase('time');
    await clickFirstVisible(page, [
      'button[class*="time" i]:not([disabled])',
      'button[class*="slot" i]',
    ], 'time');
    await page.waitForTimeout(3_000);
  },
};

async function main() {
  const home = HOME_BY_SITE[SITE];
  if (!home) {
    console.log(`unknown site: ${SITE}`);
    process.exit(1);
  }
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
        bodyPreview = txt.slice(0, 800);
      } catch {
        /* ignore */
      }
      responses.push({ url: resp.url(), status: resp.status(), bodyPreview });
    }
  });

  markPhase('home');
  try {
    await page.goto(home, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    console.log('home goto err', String(e).slice(0, 100));
  }
  console.log(`  url=${page.url()} title=${(await page.title().catch(() => '?')).slice(0, 80)}`);
  await page.screenshot({ path: `discover-${SITE}-home.png` }).catch(() => null);

  const flow = FLOWS[SITE];
  if (flow) await flow(page);

  markPhase('final');
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: `discover-${SITE}-final.png` }).catch(() => null);

  const out = {
    site: SITE,
    query: QUERY,
    finalUrl: page.url(),
    title: await page.title().catch(() => null),
    phaseMarkers,
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
