/**
 * Lotte Cinema 좌석맵 fetch (Playwright).
 * Flow: /NLCHS/Ticketing → 영화 → 극장 → 시간 → 좌석 페이지 → endpoint capture.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

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
    if (u.includes('lottecinema.co.kr') && (u.includes('LCWS') || u.includes('LCAPI'))) {
      try {
        const body = await resp.text();
        // GetSeat, GetPlay 등의 method 응답만 dump
        if (body && (body.length < 100_000) && (
          /Seat|Play|Ticketing|Seq|SCREEN/i.test(body) || resp.request().postData()?.match(/Seat|Play|Ticketing|Seq/i)
        )) {
          // post body 의 MethodName 도 capture
          const pd = resp.request().postData() ?? '';
          const m = pd.match(/"MethodName"\s*:\s*"([^"]+)"/);
          seatEndpoints.push({
            url: u,
            method: resp.request().method(),
            postData: pd.slice(0, 500),
            methodName: m ? m[1] : null,
            status: resp.status(),
            body: body.slice(0, 3000),
          });
          console.log(`  [endpoint] ${resp.status()} ${m ? m[1] : 'NoMethod'} ${u.slice(0, 110)}`);
        }
      } catch {}
    }
  });

  await page.goto('https://www.lottecinema.co.kr/NLCHS/Ticketing', {
    waitUntil: 'networkidle', timeout: 30_000,
  }).catch(() => null);
  await page.waitForTimeout(4_000);
  console.log(`  url: ${page.url()}`);
  await page.screenshot({ path: 'lt-seat-1-ticketing.png' }).catch(() => null);

  // 영화 chip — Lotte UI 의 영화 list
  await clickAny(page, [
    '.ticket-movie .item:not(.disabled)',
    '.ticket-movie li',
    'ul.movie-list li',
    'div[class*="ticket-movie" i] li',
    'button[class*="movie" i]',
    'li[data-id]',
  ], 'movie');
  await page.screenshot({ path: 'lt-seat-2-movie.png' }).catch(() => null);

  // 극장 chip
  await clickAny(page, [
    '.ticket-cinema .item:not(.disabled)',
    '.ticket-cinema li',
    'div[class*="ticket-cinema" i] li',
    'button[class*="cinema" i]',
  ], 'cinema');
  await page.screenshot({ path: 'lt-seat-3-cinema.png' }).catch(() => null);

  // 시간 chip
  await clickAny(page, [
    '.ticket-time .item:not(.disabled)',
    'div[class*="ticket-time" i] li',
    'button[class*="play-time" i]:not([disabled])',
    'a[class*="time" i]:not(.disabled)',
    'li[class*="time" i] button',
  ], 'time', 3_000);

  await page.waitForTimeout(6_000);
  console.log(`  final url: ${page.url()}`);
  await page.screenshot({ path: 'lt-seat-4-final.png' }).catch(() => null);

  writeFileSync('lotte-seat-result.json', JSON.stringify({
    finalUrl: page.url(),
    seatEndpoints,
  }, null, 2));
  console.log(`[lt-seat] ${seatEndpoints.length} endpoints captured`);
  await browser.close();
}

main().catch((e) => {
  console.error('[lt-seat] fatal', e);
  process.exit(1);
});
