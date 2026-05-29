/**
 * Interpark 좌석맵 fetch (Playwright).
 * Flow: 검색 → 공연 카드 → 예매하기 → 회차 → 좌석 페이지 → endpoint capture.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const QUERY = process.env.QUERY || '캣츠';
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
  page.on('response', async (resp) => {
    const u = resp.url();
    if (
      (u.includes('interpark') || u.includes('ticket')) &&
      (u.includes('seat') || u.includes('Seat') || u.includes('play') ||
       u.includes('Play') || u.includes('schedule') || u.includes('book') ||
       u.includes('goods'))
    ) {
      try {
        const body = await resp.text();
        if (body && body.length < 100_000) {
          seatEndpoints.push({
            url: u,
            method: resp.request().method(),
            status: resp.status(),
            postData: resp.request().postData()?.slice(0, 500) || null,
            body: body.slice(0, 2500),
          });
          console.log(`  [endpoint] ${resp.status()} ${u.slice(0, 130)}`);
        }
      } catch {}
    }
  });

  await page.goto(
    `https://tickets.interpark.com/contents/search?keyword=${encodeURIComponent(QUERY)}`,
    { waitUntil: 'networkidle', timeout: 30_000 },
  ).catch(() => null);
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: 'ip-seat-1-search.png' }).catch(() => null);

  // 첫 결과 카드 click
  await clickAny(page, [
    'a[href*="/goods/"]',
    'a[href*="goodsCode"]',
    'main a:has(img)',
  ], 'goods-card');
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: 'ip-seat-2-detail.png' }).catch(() => null);
  console.log(`  detail url: ${page.url()}`);

  // 예매하기 button
  await clickAny(page, [
    'a:has-text("예매하기")',
    'button:has-text("예매하기")',
    'a:has-text("예매")',
    '[class*="booking" i] a',
  ], 'reserve');
  await page.waitForTimeout(5_000);
  console.log(`  reserve url: ${page.url()}`);
  await page.screenshot({ path: 'ip-seat-3-reserve.png' }).catch(() => null);

  // 날짜 / 회차 chip
  await clickAny(page, [
    'button[class*="date" i]:not([disabled]):visible',
    'li[class*="day" i]:visible',
  ], 'date');
  await clickAny(page, [
    'button[class*="time" i]:not([disabled]):visible',
    'button[class*="play" i]:visible',
  ], 'time', 3_000);

  await page.waitForTimeout(6_000);
  console.log(`  final url: ${page.url()}`);
  await page.screenshot({ path: 'ip-seat-4-final.png' }).catch(() => null);

  writeFileSync('interpark-seat-result.json', JSON.stringify({
    finalUrl: page.url(),
    seatEndpoints,
  }, null, 2));
  console.log(`[ip-seat] ${seatEndpoints.length} endpoints captured`);
  await browser.close();
}

main().catch((e) => {
  console.error('[ip-seat] fatal', e);
  process.exit(1);
});
