/**
 * Interpark Ticket fetcher.
 *
 * 검색: GET `tickets.interpark.com/contents/api/search/ticket?q=…&status=OPENED&status=SCHEDULED`
 *       → JSON `{docCount, docs: [{goodsCode, goodsName, placeName, startDate, endDate, ...}]}`
 *       SSR scraping 보다 직접적이고 빠름.
 *
 * 회차/좌석: 좌석맵은 JS canvas 라 Playwright 필요. 회차 list endpoint 추가 분석 필요 (Phase 3).
 */
import type { SearchResult, SiteFetcher } from '.';
import type { EventIndexEntry, SeatSnapshot } from '@/lib/types/seat';

interface InterparkDoc {
  goodsName?: string;
  goodsCode?: string;
  placeName?: string;
  placeCode?: string;
  startDate?: string;
  endDate?: string;
  bookableYn?: string;
  category?: string;
  subCategory?: string;
}

interface InterparkSearchResp {
  docCount?: number;
  docs?: InterparkDoc[];
}

const SEARCH_URL = (q: string) =>
  `https://tickets.interpark.com/contents/api/search/ticket?hasChildShould=Y&q=${encodeURIComponent(q)}&rows=50&start=0&status=OPENED&status=SCHEDULED`;

function ymdToIso(ymd: string): string {
  const y = ymd.slice(0, 4);
  const m = ymd.slice(4, 6);
  const d = ymd.slice(6, 8);
  return `${y}-${m}-${d}T19:00:00+09:00`;
}

function docsToEntries(docs: InterparkDoc[]): EventIndexEntry[] {
  const out: EventIndexEntry[] = [];
  for (const d of docs) {
    if (!d.goodsCode || !d.goodsName || !d.startDate) continue;
    out.push({
      site: 'interpark',
      externalEventId: d.goodsCode,
      eventDatetime: ymdToIso(d.startDate),
      title: d.goodsName,
      venue: d.placeName ?? '',
      category: d.category ?? undefined,
    });
  }
  return out;
}

export const interparkFetcher: SiteFetcher = {
  async search(query: string): Promise<SearchResult> {
    const res = await fetch(SEARCH_URL(query), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0 Safari/537.36',
        Accept: 'application/json',
        Referer: 'https://tickets.interpark.com/',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`interpark search HTTP ${res.status}`);
    const data = (await res.json()) as InterparkSearchResp;
    return { entries: docsToEntries(data?.docs ?? []) };
  },

  async snapshot(): Promise<SeatSnapshot> {
    throw new Error('interpark 좌석맵 fetch 미구현 — JS canvas 좌석맵 Playwright 필요');
  },
};
