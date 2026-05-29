/**
 * CatchTable 식당 상세 + timeslot fetch (Playwright).
 * Flow: 검색 → 식당 카드 → 식당 상세 → 예약 → 날짜 → 시간 → endpoint capture.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const QUERY = process.env.QUERY || '모수';
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
      u.includes('ct-api.catchtable.co.kr') &&
      (u.includes('/shop/') || u.includes('/reservation') || u.includes('/timeslot') ||
       u.includes('/time-slot') || u.includes('/available') || u.includes('/seat'))
    ) {
      try {
        const body = await resp.text();
        if (body && body.length < 100_000) {
          seatEndpoints.push({
            url: u,
            method: resp.request().method(),
            status: resp.status(),
            postData: resp.request().postData()?.slice(0, 500) || null,
            body: body.slice(0, 3000),
          });
          console.log(`  [endpoint] ${resp.status()} ${u.slice(0, 130)}`);
        }
      } catch {}
    }
  });

  await page.goto(
    `https://app.catchtable.co.kr/ct/search/result?keyword=${encodeURIComponent(QUERY)}`,
    { waitUntil: 'networkidle', timeout: 30_000 },
  ).catch(() => null);
  await page.waitForTimeout(4_000);
  console.log(`  url: ${page.url()}`);
  await page.screenshot({ path: 'ct-seat-1-search.png' }).catch(() => null);

  // 첫 식당 카드 click
  await clickAny(page, [
    'a[href*="/shop/"]',
    'a[href*="urlPathAlias"]',
    '[class*="SearchList" i] a',
    '[class*="ShopCard" i] a',
    'main a:has(img)',
    'div[role="button"]:has(img)',
  ], 'shop-card');
  await page.waitForTimeout(5_000);
  console.log(`  detail url: ${page.url()}`);
  await page.screenshot({ path: 'ct-seat-2-detail.png' }).catch(() => null);

  // 예약 button click
  await clickAny(page, [
    'button:has-text("예약")',
    'a:has-text("예약하기")',
    'button:has-text("예약하기")',
    '[class*="reservation" i] button',
    '[class*="Reservation" i] button',
  ], 'reserve');
  await page.waitForTimeout(4_000);

  // 날짜 click
  await clickAny(page, [
    'button[class*="date" i]:not([disabled]):visible',
    'li[class*="day" i]:visible',
    'div[role="button"][class*="date" i]',
  ], 'date');

  // 인원 select
  await clickAny(page, [
    'button:has-text("2명")',
    'button:has-text("2인")',
    'button[class*="people" i]',
    'button[class*="party" i]',
  ], 'people');

  // 시간 click
  await clickAny(page, [
    'button[class*="time" i]:not([disabled]):visible',
    'button[class*="slot" i]:visible',
    'li[class*="time" i] button',
  ], 'time', 3_000);

  await page.waitForTimeout(6_000);
  console.log(`  final url: ${page.url()}`);
  await page.screenshot({ path: 'ct-seat-3-final.png' }).catch(() => null);

  writeFileSync('catchtable-seat-result.json', JSON.stringify({
    finalUrl: page.url(),
    seatEndpoints,
  }, null, 2));
  console.log(`[ct-seat] ${seatEndpoints.length} endpoints captured`);
  await browser.close();
}

main().catch((e) => {
  console.error('[ct-seat] fatal', e);
  process.exit(1);
});
