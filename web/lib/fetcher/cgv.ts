/**
 * CGV fetcher — 검색만 결선 (Playwright workflow).
 *
 * Cloudflare WAF + dynamic signature + 좌석맵 Bearer/custNo 인증 으로 회차/좌석 결선 불가.
 * snapshot 호출 시 빈 timeSlots 반환 — UI 가 "외부에서 예매 페이지로" deep link 안내.
 */
import type { SearchResult, SiteFetcher } from '.';
import type { SeatSnapshot } from '@/lib/types/seat';
import { dispatchAndWait } from './_dispatch';

export const cgvFetcher: SiteFetcher = {
  async search(query: string): Promise<SearchResult> {
    const entries = await dispatchAndWait('cgv', query);
    return { entries };
  },

  async snapshot(externalEventId: string, eventDatetime: string): Promise<SeatSnapshot> {
    return {
      site: 'cgv',
      externalEventId,
      eventDatetime,
      capturedAt: new Date().toISOString(),
      title: '',
      venue: 'CGV',
      timeSlots: [],
    };
  },
};
