/**
 * CGV fetcher.
 *
 * Cloudflare WAF + 동적 x-signature 헤더로 Vercel 직접 호출 불가 →
 * GitHub Actions `cgv-fetch.yml` (Python curl_cffi + HMAC-SHA256 signature
 * 자체 생성, JS bundle 역공학) 가 우회.
 *
 * 검색/snapshot 모두 workflow_dispatch + Valkey 캐시 hit polling.
 */
import type { SearchResult, SiteFetcher } from '.';
import type { SeatSnapshot } from '@/lib/types/seat';
import { dispatchAndWait, dispatchSnapshot } from './_dispatch';
import { getCachedSnapshot } from '@/lib/cache';
import { getEventIndexEntry } from '@/lib/events';

export const cgvFetcher: SiteFetcher = {
  async search(query: string): Promise<SearchResult> {
    const entries = await dispatchAndWait('cgv', query);
    return { entries };
  },

  async snapshot(externalEventId: string, eventDatetime: string): Promise<SeatSnapshot> {
    const cached = await getCachedSnapshot('cgv', externalEventId, eventDatetime);
    if (cached) return cached;
    const entry = await getEventIndexEntry('cgv', externalEventId);
    const movNo = entry?.meta?.movNo;
    if (!movNo) {
      throw new Error('cgv movNo 미상 — 검색을 먼저 실행해주세요');
    }
    return dispatchSnapshot('cgv', movNo, externalEventId, eventDatetime, { cacheSite: 'cgv' });
  },
};
