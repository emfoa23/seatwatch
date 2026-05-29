/**
 * CGV 회차/좌석맵 snapshot (Playwright + Cloudflare 우회 + signature 자동).
 *
 * 사용자 캡쳐로 발견한 endpoint chain (관련 가능성 순):
 *   1) searchAtktTopPostrList?coCd=A420                     — 예매가능 영화 list
 *   2) searchRegnList?movNo&coCd&lntd&lttd                  — 영화별 예매가능 지역
 *   3) searchSchByMov?coCd&siteNo&scnYmd&movNo              — 영화/극장/날짜별 회차 (scnsNo, scnSseq)
 *   4) searchIfSeatData?coCd&siteNo&scnYmd&scnsNo&scnSseq   — 좌석맵 (Bearer + custNo 필요)
 *
 * Bearer/custNo 없이 호출되면 어떤 응답인지 + 실제 어떤 데이터가 들어있는지 알아내기 위한 script.
 *
 * Usage:
 *   MOV_NO=30001046 SITE_NO=0056 SCN_YMD=20260530 node cgv-snapshot.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const MOV_NO = process.env.MOV_NO || '30001046';
const SITE_NO = process.env.SITE_NO || '0056';
const SCN_YMD = process.env.SCN_YMD || (() => {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
})();

const captured = [];

async function callEndpoint(page, url, label) {
  const r = await page.evaluate(async (u) => {
    try {
      const res = await fetch(u, {
        headers: { accept: 'application/json' },
        credentials: 'include',
      });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { rawText: text.slice(0, 1500) }; }
      return { ok: res.ok, status: res.status, body };
    } catch (e) {
      return { ok: false, status: 0, error: String(e) };
    }
  }, url);
  captured.push({ label, url, ...r });
  console.log(`  [${label}] HTTP ${r.status}`);
  if (r.body && !r.body.rawText) {
    const keys = Object.keys(r.body).slice(0, 5);
    console.log(`         keys: ${keys.join(',')}`);
    if (r.body.data) {
      console.log(`         data: ${JSON.stringify(r.body.data).slice(0, 200)}`);
    }
  } else if (r.body?.rawText) {
    console.log(`         raw: ${r.body.rawText.slice(0, 200)}`);
  }
  return r;
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
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await ctx.newPage();
  console.log('[cgv-snap] visiting cgv.co.kr to warm Cloudflare + signature interceptor...');
  await page.goto('https://cgv.co.kr/', { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(3_000);
  // booking 페이지에 진입해야 signature interceptor 가 attach 됨
  await page.goto('https://cgv.co.kr/cnm/movieBook', { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(3_000);
  console.log(`  url=${page.url()}`);

  const BASE = 'https://api.cgv.co.kr';

  // 1) 영화별 예매가능 지역 list (movNo)
  await callEndpoint(page, `${BASE}/cnm/atkt/searchRegnList?coCd=A420&movNo=${MOV_NO}`, 'searchRegnList');

  // 2) 영화/극장/날짜별 회차 list
  await callEndpoint(page,
    `${BASE}/cnm/atkt/searchSchByMov?coCd=A420&siteNo=${SITE_NO}&scnYmd=${SCN_YMD}&movNo=${MOV_NO}&rtctlScopCd=08`,
    'searchSchByMov');

  // 3) 영화 회차 정보 (custNo 없이)
  await callEndpoint(page,
    `${BASE}/cnm/atkt/searchMovScnInfo?coCd=A420&siteNo=${SITE_NO}&scnYmd=${SCN_YMD}&scnsNo=005&scnSseq=1&rtctlScopCd=08`,
    'searchMovScnInfo');

  // 4) 좌석맵 (Bearer 없이) — 응답 확인
  await callEndpoint(page,
    `${BASE}/cnm/atkt/searchIfSeatData?coCd=A420&siteNo=${SITE_NO}&scnYmd=${SCN_YMD}&scnsNo=005&scnSseq=1`,
    'searchIfSeatData_noAuth');

  // 5) 좌석 가격/배치 정보 (Bearer 없이)
  await callEndpoint(page,
    `${BASE}/cnm/atkt/searchAtktAdncSeatInfo?coCd=A420&siteNo=${SITE_NO}&scnYmd=${SCN_YMD}&scnsNo=005&scnSseq=1&dblfrRpsntYn=N&cxprdYn=N&hotdlYn=N&movNo=${MOV_NO}`,
    'searchAtktAdncSeatInfo_noAuth');

  // 6) 좌석 상품/번들
  await callEndpoint(page,
    `${BASE}/cnm/sseq/searchMovSseqProdBudnList?coCd=A420&siteNo=${SITE_NO}&scnYmd=${SCN_YMD}&scnsNo=005&scnSseq=1`,
    'searchMovSseqProdBudnList');

  writeFileSync('cgv-snapshot-result.json', JSON.stringify(captured, null, 2));
  console.log(`[cgv-snap] ${captured.length} endpoints captured`);
  await browser.close();
}

main().catch((e) => {
  console.error('[cgv-snap] fatal', e);
  process.exit(1);
});
