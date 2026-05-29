/**
 * Megabox fetcher.
 *
 * 검색: `POST https://www.megabox.co.kr/on/oh/oha/Movie/selectMovieList.do`
 *       body `{currPage, movieStatCd:"2"(상영중), onScreenAt:"Y", pageSize}` → `movieList[]`.
 *       각 항목은 영화 단위 (movieNm/rpstMovieNo) — 회차/극장 X.
 *       → query 로 필터링 후 매칭되는 영화의 (영화, 첫 상영일) entry 1개씩 반환.
 *
 * 회차/좌석: 영화별 회차 endpoint + 좌석 endpoint 별도 분석 필요 (Phase 2.2).
 */
import type { SearchResult, SiteFetcher } from '.';
import type { EventIndexEntry, SeatSnapshot } from '@/lib/types/seat';

interface MegaboxMovie {
  movieNm?: string;
  rpstMovieNo?: string | number;
  movieNo?: string | number;
  openDe?: string; // YYYYMMDD
}

interface MegaboxSearchResp {
  movieList?: MegaboxMovie[];
}

const URL_MOVIE_LIST = 'https://www.megabox.co.kr/on/oh/oha/Movie/selectMovieList.do';

function ymdToIso(ymd?: string): string {
  if (!ymd || ymd.length < 8) {
    // 오늘 19:00 KST fallback
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const d = kst.toISOString().slice(0, 10);
    return `${d}T19:00:00+09:00`;
  }
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T19:00:00+09:00`;
}

function makeEid(movieNo: string, title: string): string {
  // crawler 의 hash 와 다른 패턴이지만 lazy fetch 만이라 새 hash 로 충분
  return `mb_${movieNo}`.slice(0, 16);
}

function moviesToEntries(movies: MegaboxMovie[], q: string): EventIndexEntry[] {
  const qLower = q.toLowerCase();
  const out: EventIndexEntry[] = [];
  for (const m of movies) {
    const title = m.movieNm;
    if (!title) continue;
    if (!title.toLowerCase().includes(qLower)) continue;
    const movieNo = String(m.rpstMovieNo ?? m.movieNo ?? '');
    if (!movieNo) continue;
    out.push({
      site: 'megabox',
      externalEventId: makeEid(movieNo, title),
      eventDatetime: ymdToIso(m.openDe),
      title,
      venue: '메가박스', // 회차 endpoint 결선 후 극장명 채움
    });
  }
  return out;
}

export const megaboxFetcher: SiteFetcher = {
  async search(query: string): Promise<SearchResult> {
    const res = await fetch(URL_MOVIE_LIST, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/json;charset=UTF-8',
        Referer: 'https://www.megabox.co.kr/movie?menuId=movie-list',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        currPage: '1',
        movieStatCd: '2',
        onScreenAt: 'Y',
        pageSize: '100',
      }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`megabox search HTTP ${res.status}`);
    const data = (await res.json()) as MegaboxSearchResp;
    const movies = data.movieList ?? [];
    return { entries: moviesToEntries(movies, query) };
  },

  async snapshot(): Promise<SeatSnapshot> {
    throw new Error(
      'megabox 좌석맵 fetch 미구현 — 영화별 회차/좌석 endpoint 분석 필요 (Phase 2.2)',
    );
  },
};
