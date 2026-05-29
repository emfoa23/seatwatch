/**
 * Discovery mode — 사이트의 DOM + traffic 자동 분석.
 *
 * 1) 메인 페이지 진입
 * 2) 모든 outgoing requests 캡쳐 (URL, method, headers, body)
 * 3) 검색 관련 DOM elements 찾기 (button[aria-label*="검색"], input[type="search"] 등)
 * 4) 검색 입력 시도 + Enter → 그 결과 fire 되는 api 호출 캡쳐
 * 5) 모두 JSON 으로 dump → artifact 로 upload
 *
 * Usage:
 *   SITE=cgv QUERY="마이클" node discover.mjs
 *   SITE=lottecinema QUERY="어벤져스" node discover.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const SITE = process.env.SITE || 'cgv';
const QUERY = process.env.QUERY || '마이클';
// SEARCH_URL 패턴이 있으면 진입 직후 search 페이지로 navigate 해서 traffic 캡쳐
const SEARCH_URL_BY_SITE = {
  cgv: (q) => `https://cgv.co.kr/tme/itgrSrch?swrd=${encodeURIComponent(q)}`,
  lottecinema: (q) => `https://www.lottecinema.co.kr/NLCHS/Search?searchKeyword=${encodeURIComponent(q)}`,
  megabox: (q) => `https://www.megabox.co.kr/search?content=${encodeURIComponent(q)}`,
};

const HOME_BY_SITE = {
  cgv: 'https://cgv.co.kr/',
  lottecinema: 'https://www.lottecinema.co.kr/NLCHS',
  megabox: 'https://www.megabox.co.kr/',
  interpark: 'https://tickets.interpark.com/',
  catchtable: 'https://app.catchtable.co.kr/',
};

const home = HOME_BY_SITE[SITE];
if (!home) {
  console.log(`unknown site: ${SITE}`);
  process.exit(1);
}

const requests = [];
const responses = [];
const jsBundles = [];

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

  // 모든 request 캡쳐 (XHR/fetch 만)
  page.on('request', (req) => {
    const t = req.resourceType();
    if (t === 'xhr' || t === 'fetch') {
      requests.push({
        url: req.url(),
        method: req.method(),
        type: t,
        headers: req.headers(),
        postData: req.postData()?.slice(0, 1000) ?? null,
      });
    } else if (t === 'script') {
      // JS bundle URLs
      const u = req.url();
      if (u.includes('.js') && !u.includes('analytics') && !u.includes('gtm') && !u.includes('kakao')) {
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
        bodyPreview = txt.slice(0, 400);
      } catch {
        /* ignore */
      }
      responses.push({
        url: resp.url(),
        status: resp.status(),
        bodyPreview,
      });
    }
  });

  console.log(`[discover] visiting ${home}`);
  try {
    await page.goto(home, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    console.log('goto error:', String(e).slice(0, 200));
  }
  console.log(`[discover] after warmup: url=${page.url()} title=${(await page.title().catch(() => '?')).slice(0, 80)}`);

  // SEARCH URL pattern 있으면 진입 → 발생하는 모든 fetch/XHR 캡쳐
  const sUrlFn = SEARCH_URL_BY_SITE[SITE];
  if (sUrlFn) {
    const before = requests.length;
    const url = sUrlFn(QUERY);
    console.log(`[discover] navigate to search page: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    } catch (e) {
      console.log('search-goto error:', String(e).slice(0, 200));
    }
    await page.waitForTimeout(4_000);
    console.log(`[discover] after search-goto: ${page.url()}`);
    const newReqs = requests.slice(before);
    console.log(`\n[discover] requests after search-page goto (${newReqs.length}):`);
    for (const r of newReqs) console.log(`  ${r.method} ${r.url.slice(0, 160)}`);
  }

  // DOM 안 search 관련 elements 자동 발견
  const domInfo = await page.evaluate(() => {
    const results = [];
    const candidates = [
      'input[type="search"]',
      'input[role="searchbox"]',
      'input[placeholder*="검색"]',
      'input[placeholder*="search" i]',
      'input[name*="search" i]',
      'input[name*="keyword" i]',
      'input[name*="query" i]',
      'button[aria-label*="검색"]',
      'button[aria-label*="search" i]',
      'a[aria-label*="검색"]',
      '[role="search"]',
      'header [class*="search" i]',
      '[class*="searchBtn" i]',
      '[class*="search-btn" i]',
      '[class*="search_btn" i]',
      '[data-cy*="search" i]',
      '[data-testid*="search" i]',
    ];
    for (const sel of candidates) {
      const els = document.querySelectorAll(sel);
      if (els.length) {
        const sample = els[0];
        results.push({
          selector: sel,
          count: els.length,
          firstTag: sample.tagName,
          firstOuter: sample.outerHTML?.slice(0, 300),
          visible: sample.offsetParent !== null,
        });
      }
    }
    return results;
  });

  console.log('\n[discover] DOM search elements:');
  for (const d of domInfo) console.log(' -', d.selector, `count=${d.count} visible=${d.visible}`);

  await page.screenshot({ path: `discover-${SITE}-1.png`, fullPage: false }).catch(() => null);

  // search 시도 — visible 한 첫 input 클릭 후 입력
  const visibleInput = domInfo.find((d) => d.firstTag === 'INPUT' && d.visible);
  const visibleBtn = domInfo.find((d) => d.firstTag !== 'INPUT' && d.visible);

  if (visibleBtn && !visibleInput) {
    console.log(`\n[discover] clicking search button: ${visibleBtn.selector}`);
    try {
      await page.locator(visibleBtn.selector).first().click({ timeout: 3_000 });
      await page.waitForTimeout(1_500);
      await page.screenshot({ path: `discover-${SITE}-2-after-click.png` }).catch(() => null);
    } catch (e) {
      console.log('  click failed:', String(e).slice(0, 200));
    }
  }

  // 다시 visible input 찾기 (button click 후 열린 검색바)
  const inputSelectors = [
    'input[type="search"]:visible',
    'input[placeholder*="검색"]:visible',
    'input[role="searchbox"]:visible',
    'input[name*="search" i]:visible',
    'input[name*="keyword" i]:visible',
  ];

  const beforeReqLen = requests.length;
  let filled = false;
  for (const sel of inputSelectors) {
    try {
      const el = page.locator(sel.replace(':visible', '')).first();
      if (await el.isVisible({ timeout: 2_000 })) {
        await el.click({ clickCount: 3 });
        await el.fill(QUERY);
        await page.keyboard.press('Enter');
        console.log(`[discover] filled via: ${sel}`);
        filled = true;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!filled) console.log('[discover] no visible input — search not fired');

  // 검색 fire 후 발생하는 fetch/XHR 캡쳐
  await page.waitForTimeout(8_000);
  await page.screenshot({ path: `discover-${SITE}-3-after-search.png` }).catch(() => null);

  const newRequests = requests.slice(beforeReqLen);
  console.log(`\n[discover] requests after search (${newRequests.length}):`);
  for (const r of newRequests) {
    console.log(`  ${r.method} ${r.url.slice(0, 160)}`);
  }

  // dump 파일
  const out = {
    site: SITE,
    query: QUERY,
    finalUrl: page.url(),
    title: await page.title().catch(() => null),
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
