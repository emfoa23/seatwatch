/**
 * CatchTable fetcher.
 *
 * Cloudflare WAF 차단 → Vercel function 에서 직접 호출 불가.
 *
 * 검색: workflow_dispatch 'catchtable' (page.evaluate POST /api/v6/search/list)
 * 타임슬롯: workflow_dispatch 'catchtable-snapshot' (page.evaluate GET /api/reservation/v1/dining/day-slots?shopRef)
 *
 * 둘 다 Vercel fetcher 는 캐시 hit 이면 즉시 반환, miss 시 workflow trigger + polling.
 */
import type { SearchResult, SiteFetcher } from '.';
import type { SeatSnapshot } from '@/lib/types/seat';
import { dispatchAndWait, dispatchSnapshot } from './_dispatch';
import { getCachedSnapshot } from '@/lib/cache';

export const catchtableFetcher: SiteFetcher = {
  async search(query: string): Promise<SearchResult> {
    const entries = await dispatchAndWait('catchtable', query);
    return { entries };
  },

  async snapshot(externalEventId: string, eventDatetime: string): Promise<SeatSnapshot> {
    // 식당 상세 endpoint = ct-api/api/reservation/v1/dining/day-slots?shopRef=<ref>
    // events index 에서 shopRef 를 가져와야 하지만 현재 externalEventId = hash(shopRef+title) 라
    // shopRef 자체를 events index entry 에 별도 저장하거나, externalEventId 의 hash 역추적 필요.
    // 임시: externalEventId 를 shopRef 로 사용 — 추후 hash 분리 필요.
    const cached = await getCachedSnapshot('catchtable', externalEventId, eventDatetime);
    if (cached) return cached;
    const snap = await dispatchSnapshot('catchtable-snapshot', externalEventId, eventDatetime);
    return snap;
  },
};
