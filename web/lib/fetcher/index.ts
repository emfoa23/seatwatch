/**
 * 외부 사이트 검색·좌석 fetcher 인터페이스.
 *
 * 사이트별 구현체는 lib/fetcher/<site>.ts 에 두고 각자 lazy fetch + parse.
 * Valkey 캐시 layer 가 위에서 hit/miss 판단.
 */
import type { EventIndexEntry, SeatSnapshot, Site } from '@/lib/types/seat';

export interface SearchResult {
  entries: EventIndexEntry[];
}

export interface SiteFetcher {
  /**
   * 이름으로 검색 — 영화/공연/식당 list + 가능하면 시간/극장 정보까지.
   * 외부 사이트가 차단/오류면 throw.
   */
  search(query: string): Promise<SearchResult>;

  /**
   * 특정 회차의 좌석맵 (또는 식당의 시간슬롯).
   * @param externalEventId  내부 unique id
   * @param eventDatetime    ISO KST
   */
  snapshot(externalEventId: string, eventDatetime: string): Promise<SeatSnapshot>;
}

const cache: Partial<Record<Site, SiteFetcher>> = {};

export async function getFetcher(site: Site): Promise<SiteFetcher> {
  if (cache[site]) return cache[site]!;
  switch (site) {
    case 'megabox': {
      const m = await import('./megabox');
      cache.megabox = m.megaboxFetcher;
      return m.megaboxFetcher;
    }
    case 'lotte': {
      const m = await import('./lotte');
      cache.lotte = m.lotteFetcher;
      return m.lotteFetcher;
    }
    case 'interpark': {
      const m = await import('./interpark');
      cache.interpark = m.interparkFetcher;
      return m.interparkFetcher;
    }
    case 'catchtable': {
      const m = await import('./catchtable');
      cache.catchtable = m.catchtableFetcher;
      return m.catchtableFetcher;
    }
    case 'cgv': {
      const m = await import('./cgv');
      cache.cgv = m.cgvFetcher;
      return m.cgvFetcher;
    }
  }
}
