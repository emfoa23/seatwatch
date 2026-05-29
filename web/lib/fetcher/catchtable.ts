/**
 * CatchTable fetcher.
 *
 * Cloudflare WAF 차단으로 Vercel function 에서 직접 호출 불가.
 * `playwright-fetch.yml` workflow 가 app.catchtable.co.kr 진입 후 page.evaluate 로
 * ct-api.catchtable.co.kr/api/v6/search/list 호출 + Valkey 적재.
 * 본 fetcher 는 캐시 miss 시 workflow_dispatch 트리거 + 폴링.
 */
import type { SearchResult, SiteFetcher } from '.';
import type { SeatSnapshot } from '@/lib/types/seat';
import { dispatchAndWait } from './_dispatch';

export const catchtableFetcher: SiteFetcher = {
  async search(query: string): Promise<SearchResult> {
    const entries = await dispatchAndWait('catchtable', query);
    return { entries };
  },
  async snapshot(): Promise<SeatSnapshot> {
    throw new Error('catchtable 시간슬롯 fetch 미구현 — 회차 endpoint 분석 필요 (Phase 2.2)');
  },
};
