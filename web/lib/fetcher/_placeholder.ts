import type { Site } from '@/lib/types/seat';
import type { SearchResult, SiteFetcher } from '.';

/**
 * 사이트별 실 endpoint 분석 전 placeholder.
 * Phase 2 에서 site 별 fetcher 가 이 함수 호출 X — 실 fetch + parse 로 교체.
 */
export function placeholder(site: Site): SiteFetcher {
  return {
    async search(): Promise<SearchResult> {
      throw new Error(`${site} 검색 endpoint 아직 미구현 (Phase 2 작업)`);
    },
    async snapshot(): Promise<never> {
      throw new Error(`${site} 좌석 fetch endpoint 아직 미구현 (Phase 2 작업)`);
    },
  };
}
