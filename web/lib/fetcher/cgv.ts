/**
 * CGV fetcher.
 *
 * Cloudflare WAF + dynamic signature 헤더로 Vercel function 직접 호출 불가.
 * `playwright-fetch.yml` workflow 가 Playwright 로 cgv.co.kr 진입 후
 * api.cgv.co.kr/tme/more/itgrSrch/searchItgrSrchMov 호출.
 * 본 fetcher 는 캐시 miss 시 workflow_dispatch 트리거 + 폴링.
 *
 * 주의: CGV search input fire 방식은 추가 분석 필요 (Phase 3 진행중) — 현재 trigger 만 결선,
 *       실제 데이터 적재는 fetch.mjs 의 cgv.mjs 가 완전해진 후 결합.
 */
import type { SearchResult, SiteFetcher } from '.';
import type { SeatSnapshot } from '@/lib/types/seat';
import { dispatchAndWait } from './_dispatch';

export const cgvFetcher: SiteFetcher = {
  async search(query: string): Promise<SearchResult> {
    const entries = await dispatchAndWait('cgv', query);
    return { entries };
  },
  async snapshot(): Promise<SeatSnapshot> {
    throw new Error('cgv 좌석맵 fetch 미구현 — Playwright 회차/좌석 endpoint 추가 분석 필요');
  },
};
