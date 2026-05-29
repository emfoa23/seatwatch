/**
 * Interpark Ticket fetcher.
 *
 * 검색: `https://tickets.interpark.com/contents/search?keyword=<q>` HTML 응답의
 *       `<script id="__NEXT_DATA__">` 안 JSON 의 `searchResult.goods.docs[]` 가 결과.
 *       각 docs[] 항목 = 한 공연 (goodsCode 단위, startDate/endDate 기간).
 *
 * 회차/좌석: 회차 list endpoint 와 좌석맵 endpoint 는 별도 분석 필요 (Phase 2.2).
 *           현재는 search 만 결선, snapshot 은 throw.
 */
import type { SearchResult, SiteFetcher } from '.';
import type { EventIndexEntry, SeatSnapshot } from '@/lib/types/seat';

interface InterparkGoodsDoc {
  goodsName?: string;
  goodsCode?: string;
  placeName?: string;
  placeCode?: string;
  startDate?: string; // YYYYMMDD
  endDate?: string;
  bookableYn?: string;
}

interface NextData {
  props?: {
    pageProps?: {
      searchResult?: {
        goods?: {
          docs?: InterparkGoodsDoc[];
        };
      };
    };
  };
}

const SEARCH_URL = (q: string) =>
  `https://tickets.interpark.com/contents/search?keyword=${encodeURIComponent(q)}`;

function ymdToIso(ymd: string): string {
  // "20260601" → "2026-06-01T19:00:00+09:00" (default 19:00 KST)
  const y = ymd.slice(0, 4);
  const m = ymd.slice(4, 6);
  const d = ymd.slice(6, 8);
  return `${y}-${m}-${d}T19:00:00+09:00`;
}

function extractNextData(html: string): NextData | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as NextData;
  } catch {
    return null;
  }
}

function docsToEntries(docs: InterparkGoodsDoc[]): EventIndexEntry[] {
  const entries: EventIndexEntry[] = [];
  for (const d of docs) {
    if (!d.goodsCode || !d.goodsName || !d.startDate) continue;
    if (d.bookableYn && d.bookableYn !== 'Y') continue;
    entries.push({
      site: 'interpark',
      externalEventId: d.goodsCode,
      eventDatetime: ymdToIso(d.startDate),
      title: d.goodsName,
      venue: d.placeName ?? '',
    });
  }
  return entries;
}

export const interparkFetcher: SiteFetcher = {
  async search(query: string): Promise<SearchResult> {
    const res = await fetch(SEARCH_URL(query), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`interpark search HTTP ${res.status}`);
    }
    const html = await res.text();
    const data = extractNextData(html);
    const docs = data?.props?.pageProps?.searchResult?.goods?.docs ?? [];
    return { entries: docsToEntries(docs) };
  },

  async snapshot(): Promise<SeatSnapshot> {
    throw new Error(
      'interpark 좌석맵 fetch 미구현 — 회차/좌석 endpoint 분석 필요 (Phase 2.2)',
    );
  },
};
