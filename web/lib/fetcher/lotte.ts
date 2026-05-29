/**
 * Lotte Cinema fetcher.
 *
 * 검색: POST `https://www.lottecinema.co.kr/LCAPI/Home/getMovie` (JSON body)
 *       응답 `Movies.Items[].Items[]` = 현재 상영중 영화 list.
 *       Lotte 는 자체 검색 endpoint 가 없어 전체 list 받은 후 query 클라이언트 filter.
 *
 * 회차/좌석: `LCWS/Ticketing/TicketingData.aspx` 의 GetTicketingPageTOBE / GetSeatList 등.
 *           paramList= 의 form-urlencoded POST. Phase 2.2.
 */
import type { SearchResult, SiteFetcher } from '.';
import type { EventIndexEntry, SeatSnapshot } from '@/lib/types/seat';

interface LotteMovieItem {
  RepresentationMovieCode?: string;
  MovieNameKR?: string;
  MovieNameUS?: string;
  ReleaseDate?: string;
}

interface LotteMoviesResp {
  Movies?: { Items?: Array<{ Items?: LotteMovieItem[] }> };
}

const URL_GET_MOVIE = 'https://www.lottecinema.co.kr/LCAPI/Home/getMovie';

function parseReleaseDate(s?: string): string {
  if (!s) {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    return `${kst.toISOString().slice(0, 10)}T19:00:00+09:00`;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '2026-01-01T19:00:00+09:00';
  return `${m[1]}-${m[2]}-${m[3]}T19:00:00+09:00`;
}

function moviesToEntries(items: LotteMovieItem[], query: string): EventIndexEntry[] {
  const q = query.toLowerCase();
  const out: EventIndexEntry[] = [];
  for (const m of items) {
    const titleKr = m.MovieNameKR || '';
    const titleEn = m.MovieNameUS || '';
    const title = titleKr || titleEn;
    if (!title) continue;
    if (!(titleKr.toLowerCase().includes(q) || titleEn.toLowerCase().includes(q))) continue;
    const code = String(m.RepresentationMovieCode || '').trim();
    if (!code) continue;
    out.push({
      site: 'lotte',
      externalEventId: `lotte_${code}`.slice(0, 16),
      eventDatetime: parseReleaseDate(m.ReleaseDate),
      title,
      venue: '롯데시네마',
    });
  }
  return out;
}

export const lotteFetcher: SiteFetcher = {
  async search(query: string): Promise<SearchResult> {
    const res = await fetch(URL_GET_MOVIE, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/json',
        Referer: 'https://www.lottecinema.co.kr/NLCHS',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        channelType: 'HO',
        osType: 'W',
        osVersion: 'Mozilla/5.0',
        multiLanguageId: 'KR',
        data: { memberNoOn: '0' },
      }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`lotte search HTTP ${res.status}`);
    const data = (await res.json()) as LotteMoviesResp;
    const items = (data?.Movies?.Items ?? []).flatMap((g) => g.Items ?? []);
    return { entries: moviesToEntries(items, query) };
  },

  async snapshot(): Promise<SeatSnapshot> {
    throw new Error(
      'lotte 좌석맵 fetch 미구현 — Ticketing/TicketingData.aspx GetSeatList endpoint 분석 필요',
    );
  },
};
