/**
 * Megabox 좌석맵 fetch (Playwright).
 *
 * Flow: /booking → 영화 → 극장 → 시간 → 좌석 페이지 → endpoint capture
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

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
    userAgent: 'Mozilla/5.0 (Macintosh) Chrome/146.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  // 모든 좌석 관련 endpoint capture
  page.on('response', async (resp) => {
    const u = resp.url();
    if (
      u.includes('megabox.co.kr') &&
      (u.includes('Seat') || u.includes('seat') || u.includes('Play') ||
       u.includes('schedule') || u.includes('Schdl') ||
       u.includes('selectSpcrn') || u.includes('selectScn') ||
       u.includes('selectBokd') || u.includes('TheabPlay'))
    ) {
      try {
        const body = await resp.text();
        seatEndpoints.push({
          url: u,
          status: resp.status(),
          body: body.slice(0, 3000),
        });
        console.log(`  [endpoint] ${resp.status()} ${u.slice(0, 130)}`);
      } catch {}
    }
  });

  await page.goto('https://www.megabox.co.kr/booking', {
    waitUntil: 'networkidle', timeout: 30_000,
  }).catch(() => null);
  await page.waitForTimeout(3_000);
  console.log(`  url: ${page.url()}`);
  await page.screenshot({ path: 'mb-seat-1-booking.png' }).catch(() => null);

  // 영화 chip
  await clickAny(page, [
    '.movie-list .movie-item:not(.disabled)',
    '.movie-list li:not(.disabled)',
    'ul.movie-list li',
    '[class*="movie" i] li',
    'button[data-movie-no]',
  ], 'movie');
  await page.screenshot({ path: 'mb-seat-2-movie.png' }).catch(() => null);

  // 극장 chip — 지역 / 극장 list
  await clickAny(page, [
    '.brch-list li:not(.disabled)',
    'ul.brch-list li',
    '[class*="brch" i] li:not(.disabled)',
    'button[data-brch-no]',
    'li[data-brch-no]',
  ], 'brch');
  await page.screenshot({ path: 'mb-seat-3-theater.png' }).catch(() => null);

  // 시간 chip
  await clickAny(page, [
    '.time-list button:not([disabled])',
    'a.time-link:not(.disabled)',
    'a[class*="time" i]:not(.disabled)',
    'button[class*="time" i]:not([disabled])',
  ], 'time', 3_000);

  await page.waitForTimeout(6_000);
  console.log(`  final url: ${page.url()}`);
  await page.screenshot({ path: 'mb-seat-4-final.png' }).catch(() => null);

  writeFileSync('megabox-seat-result.json', JSON.stringify({
    finalUrl: page.url(),
    seatEndpoints,
  }, null, 2));
  console.log(`[megabox-seat] ${seatEndpoints.length} endpoints captured`);
  await browser.close();
}

main().catch((e) => {
  console.error('[megabox-seat] fatal', e);
  process.exit(1);
});
