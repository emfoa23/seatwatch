/**
 * CGV 좌석맵 fetch (Playwright + Cloudflare 우회).
 *
 * Flow:
 *   1) cgv.co.kr 진입 → Cloudflare cookies 자동 발급
 *   2) /cnm/movieBook 진입 (booking 페이지)
 *   3) 영화 카드 click → 영화 selection
 *   4) /cnm/movieBook/cinema 로 이동 → 극장 chip click
 *   5) 날짜 chip click → 시간 chip click
 *   6) /cnm/bookMovie/chooseSeatMyself 좌석 페이지 진입
 *   7) waitForResponse 로 좌석 endpoint 응답 캡쳐
 *
 * Usage: SITE=cgv QUERY="마이클" node cgv-seat.mjs
 */
import { chromium } from 'playwright';
import Redis from 'ioredis';
import { writeFileSync } from 'node:fs';

const PREFIX = process.env.VALKEY_KEY_PREFIX || 'seatwatch:prod';
const VALKEY_URL = process.env.VALKEY_URL;
const QUERY = process.env.QUERY || '마이클';

const seatEndpoints = [];

async function clickAny(page, selectors, label, timeout = 1_500) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout })) {
        await el.click({ timeout: 3_000 });
        console.log(`  click[${label}]: ${sel}`);
        await page.waitForTimeout(2_500);
        return true;
      }
    } catch {}
  }
  console.log(`  click[${label}] no match`);
  return false;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 800 },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await ctx.newPage();
  // 모든 fetch/XHR 캡쳐
  page.on('response', async (resp) => {
    const u = resp.url();
    if (
      (u.includes('searchSeat') || u.includes('seat') || u.includes('Seat') ||
       u.includes('searchSscns') || u.includes('searchSch') || u.includes('chooseSeat')) &&
      u.includes('api.cgv.co.kr')
    ) {
      try {
        const body = await resp.text();
        seatEndpoints.push({
          url: u,
          status: resp.status(),
          body: body.slice(0, 3000),
        });
        console.log(`  [seat-endpoint] ${resp.status()} ${u.slice(0, 130)}`);
      } catch {}
    }
  });

  console.log('[cgv-seat] visiting cgv.co.kr...');
  await page.goto('https://cgv.co.kr/', { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(3_000);

  console.log('[cgv-seat] navigating to /cnm/movieBook...');
  await page.goto('https://cgv.co.kr/cnm/movieBook', { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: 'cgv-seat-1-booking.png' }).catch(() => null);

  // 영화 검색 input 사용 (booking 페이지 안에 있음)
  await clickAny(page, [
    'input[placeholder*="검색"]',
    'input[type="search"]',
  ], 'search-input-focus');
  // 또는 검색창 안 키워드 입력
  try {
    const inp = page.locator('input[placeholder*="검색"]').first();
    if (await inp.isVisible({ timeout: 1_500 })) {
      await inp.fill(QUERY);
      await page.waitForTimeout(2_500);
    }
  } catch {}
  await page.screenshot({ path: 'cgv-seat-2-search.png' }).catch(() => null);

  // 영화 카드 click (검색 결과)
  await clickAny(page, [
    'a[href*="movieBook"]:has(img)',
    'a:has(img[alt*="포스터"])',
    '[class*="cnms01020"] a',
    'main button:has(img)',
    'main a:has(img)',
  ], 'movie-card');

  await page.screenshot({ path: 'cgv-seat-3-after-movie.png' }).catch(() => null);
  console.log(`  url after movie: ${page.url()}`);

  // 극장 chip click (다양한 셀렉터)
  await clickAny(page, [
    'button[class*="theater" i]:visible',
    'button[class*="site" i]:visible',
    '[class*="cnms01020"] button:visible',
    'li[role="button"]:visible',
    'button:has-text("CGV"):visible',
  ], 'theater-chip');

  await page.screenshot({ path: 'cgv-seat-4-after-theater.png' }).catch(() => null);

  // 날짜 chip click
  await clickAny(page, [
    'button[class*="date" i]:not([disabled]):visible',
    '[role="tab"][class*="date" i]',
    'li[class*="date" i] button',
    'button[aria-label*="20"]:visible',
  ], 'date-chip');

  // 시간 chip click
  await clickAny(page, [
    'button[class*="time" i]:not([disabled]):visible',
    'a[class*="time" i]:visible',
    'button:has-text(":")',
  ], 'time-chip', 3_000);

  await page.waitForTimeout(5_000);
  console.log(`  url after time: ${page.url()}`);
  await page.screenshot({ path: 'cgv-seat-5-seat.png' }).catch(() => null);

  // 좌석 endpoint 까지 더 wait
  await page.waitForTimeout(3_000);

  writeFileSync('cgv-seat-result.json', JSON.stringify({
    finalUrl: page.url(),
    title: await page.title().catch(() => null),
    seatEndpoints,
  }, null, 2));

  console.log(`[cgv-seat] captured ${seatEndpoints.length} seat-related endpoints`);
  if (VALKEY_URL && seatEndpoints.length) {
    const redis = new Redis(VALKEY_URL, {
      tls: VALKEY_URL.startsWith('rediss://') ? {} : undefined,
      maxRetriesPerRequest: 3,
    });
    await redis.set(
      `${PREFIX}:discover:cgv-seat:${Date.now()}`,
      JSON.stringify(seatEndpoints),
      'EX', 60 * 60 * 24,
    );
    await redis.quit();
  }
  await browser.close();
}

main().catch((e) => {
  console.error('[cgv-seat] fatal', e);
  process.exit(1);
});
