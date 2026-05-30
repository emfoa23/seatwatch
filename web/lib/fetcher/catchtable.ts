/**
 * CatchTable fetcher.
 *
 * Cloudflare WAF 차단 → Vercel function 에서 직접 호출 불가.
 * GitHub Actions `catchtable-fetch.yml` (curl_cffi chrome131 TLS spoofing) 가 우회.
 *
 * 검색: workflow_dispatch mode=search → events:catchtable hash + search 캐시 적재
 * 타임슬롯: workflow_dispatch mode=snapshot SHOP_REFS → snapshot 캐시 적재
 *
 * Vercel fetcher 는 캐시 hit 이면 즉시 반환, miss 시 workflow trigger + polling.
 */
import type { SearchResult, SiteFetcher } from '.';
import type { SeatSnapshot } from '@/lib/types/seat';
import { dispatchAndWait, dispatchSnapshot } from './_dispatch';
import { getCachedSnapshot } from '@/lib/cache';
import { getEventIndexEntry } from '@/lib/events';

export const catchtableFetcher: SiteFetcher = {
  async search(query: string): Promise<SearchResult> {
    const entries = await dispatchAndWait('catchtable', query);
    return { entries };
  },

  async snapshot(externalEventId: string, eventDatetime: string): Promise<SeatSnapshot> {
    const cached = await getCachedSnapshot('catchtable', externalEventId, eventDatetime);
    if (cached) return cached;
    // events index 의 meta.shopRef 가져와서 workflow 에 SHOP_REFS 로 전달
    const entry = await getEventIndexEntry('catchtable', externalEventId);
    const shopRef = entry?.meta?.shopRef;
    if (!shopRef) {
      throw new Error('catchtable shopRef 미상 — 검색을 먼저 실행해주세요');
    }
    return dispatchSnapshot('catchtable', shopRef, externalEventId, eventDatetime, { cacheSite: 'catchtable' });
  },
};
