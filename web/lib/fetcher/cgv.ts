/**
 * CGV fetcher — Cloudflare WAF 차단으로 Vercel function 직접 호출 불가.
 *
 * 운영 패턴: GitHub Actions workflow_dispatch (Playwright + stealth) 가
 * 결과를 Aiven Valkey 에 직접 적재. 본 fetcher 는 캐시에 의존만 함.
 *
 * Phase 3 에서 actions/cgv-fetch workflow + webhook 구현 후 활성화.
 */
import type { SearchResult, SiteFetcher } from '.';

export const cgvFetcher: SiteFetcher = {
  async search(): Promise<SearchResult> {
    throw new Error('CGV 검색은 Github Actions 비동기 fetch 결과 캐시에만 의존 — 캐시 miss 시 빈 결과');
  },
  async snapshot(): Promise<never> {
    throw new Error('CGV 좌석 fetch 은 Github Actions 비동기 결과만 사용');
  },
};
