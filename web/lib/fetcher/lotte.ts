/**
 * Lotte Cinema fetcher — 회차/시간슬롯 단위.
 *
 * 검색: POST `LCAPI/Home/getMovie` → Movies.Items[].Items[]
 * 극장 list: POST `LCWS/Cinema/CinemaData.aspx` GetCinemaItems → 239 극장
 * 회차 + 잔여좌석: POST `LCWS/Ticketing/TicketingData.aspx` GetPlaySequence (cinemaID 필수)
 *   → PlaySeqs.Items[]: StartTime, EndTime, TotalSeatCount, BookingSeatCount
 *
 * snapshot 흐름:
 *   1) externalEventId = `lotte_<repMovieCode>`
 *   2) 인기 도시 극장 ~20개 만 GetPlaySequence 호출 (서울/수도권 + 광역시 중심)
 *   3) 응답 합쳐 timeSlots[] 매핑
 */
import type { SearchResult, SiteFetcher } from '.';
import type { EventIndexEntry, SeatSnapshot, TimeSlot } from '@/lib/types/seat';

interface LotteMovieItem {
  RepresentationMovieCode?: string;
  MovieNameKR?: string;
  MovieNameUS?: string;
  ReleaseDate?: string;
}

interface LotteMoviesResp {
  Movies?: { Items?: Array<{ Items?: LotteMovieItem[] }> };
}

interface LottePlaySeqItem {
  CinemaNameKR?: string;
  MovieNameKR?: string;
  StartTime?: string;
  EndTime?: string;
  TotalSeatCount?: number;
  BookingSeatCount?: number;
  CinemaID?: number;
  ScreenID?: number;
  PlaySequence?: number;
  PlayDt?: string;
  ScreenDivisionNameKR?: string;
  BrandNm_KR?: string;
}

interface LottePlaySeqResp {
  PlaySeqs?: { Items?: LottePlaySeqItem[] };
}

interface LotteCinemaItem {
  CinemaID?: number;
  CinemaNameKR?: string;
  SortSequence?: number;
}

interface LotteCinemaResp {
  Cinemas?: { Items?: LotteCinemaItem[] };
}

const URL_GET_MOVIE = 'https://www.lottecinema.co.kr/LCAPI/Home/getMovie';
const URL_TICKETING = 'https://www.lottecinema.co.kr/LCWS/Ticketing/TicketingData.aspx';
const URL_CINEMA = 'https://www.lottecinema.co.kr/LCWS/Cinema/CinemaData.aspx';

const MAX_CINEMAS = 25; // 인기 극장만 호출 (전체 239 의 SortSequence 상위)
const CACHE_CINEMAS_KEY = '__lotte_cinemas_cache';
let cinemasCache: { ts: number; items: LotteCinemaItem[] } | null = null;

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
      externalEventId: `lotte_${code}`.slice(0, 24),
      eventDatetime: parseReleaseDate(m.ReleaseDate),
      title,
      venue: '롯데시네마',
      meta: { repMovieCode: code },
    });
  }
  return out;
}

async function postForm(url: string, paramList: Record<string, unknown>): Promise<unknown> {
  const body = new URLSearchParams({ paramList: JSON.stringify(paramList) }).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://www.lottecinema.co.kr/NLCHS/Ticketing',
      Accept: 'application/json',
    },
    body,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`lotte ${paramList.MethodName} HTTP ${res.status}`);
  return res.json();
}

async function getCinemas(): Promise<LotteCinemaItem[]> {
  // process 메모리 cache 5분
  if (cinemasCache && Date.now() - cinemasCache.ts < 5 * 60 * 1000) return cinemasCache.items;
  void CACHE_CINEMAS_KEY;
  const data = (await postForm(URL_CINEMA, {
    MethodName: 'GetCinemaItems',
    channelType: 'HO',
    osType: 'W',
    osVersion: 'Chrome',
    multiLanguageID: 'KR',
  })) as LotteCinemaResp;
  const items = data?.Cinemas?.Items ?? [];
  const sorted = items
    .filter((c) => c.CinemaID && c.CinemaNameKR)
    .sort((a, b) => (a.SortSequence ?? 999) - (b.SortSequence ?? 999));
  cinemasCache = { ts: Date.now(), items: sorted };
  return sorted;
}

function ymdLabel(playDt?: string, startTime?: string): string {
  if (!playDt) return startTime ?? '?';
  const d = playDt.split('T')[0].split(' ')[0];
  return startTime ? `${d} ${startTime}` : d;
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

  /**
   * snapshot — 영화 단위 (externalEventId = lotte_<repMovieCode>) → 인기 극장들의 회차 list 합쳐 반환.
   */
  async snapshot(externalEventId: string, eventDatetime: string): Promise<SeatSnapshot> {
    const repCode = externalEventId.startsWith('lotte_')
      ? externalEventId.slice(6).split('_')[0]
      : externalEventId;
    // eventDatetime 가 release date 일 경우 오늘부터 회차 조회
    const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const requested = eventDatetime.slice(0, 10);
    const playDate = requested >= todayKst ? requested : todayKst;

    const cinemas = await getCinemas();
    const top = cinemas.slice(0, MAX_CINEMAS);
    const allSlots: TimeSlot[] = [];
    let movieName = '';

    // 병렬 호출 (서버 부담 줄이려고 chunk)
    const chunks: LotteCinemaItem[][] = [];
    for (let i = 0; i < top.length; i += 5) chunks.push(top.slice(i, i + 5));

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map((c) =>
          postForm(URL_TICKETING, {
            MethodName: 'GetPlaySequence',
            channelType: 'HO',
            osType: 'W',
            osVersion: 'Chrome',
            multiLanguageID: 'KR',
            playDate,
            cinemaID: `1|0001|${c.CinemaID}`,
            representationMovieCode: repCode,
          }).catch(() => null),
        ),
      );
      for (const r of results) {
        if (!r) continue;
        const items = ((r as LottePlaySeqResp)?.PlaySeqs?.Items ?? []).filter(
          (p) => p.StartTime && p.PlaySequence,
        );
        for (const p of items) {
          if (!movieName) movieName = p.MovieNameKR ?? '';
          const remain = (p.TotalSeatCount ?? 0) - (p.BookingSeatCount ?? 0);
          allSlots.push({
            slotId: `${p.CinemaID}-${p.ScreenID}-${p.PlaySequence}-${p.PlayDt ?? playDate}`,
            time: ymdLabel(p.PlayDt, p.StartTime),
            remain: Math.max(0, remain),
            capacity: p.TotalSeatCount ?? undefined,
            available: remain > 0,
            venue: p.CinemaNameKR,
            screen: p.BrandNm_KR || p.ScreenDivisionNameKR,
          });
        }
      }
    }

    allSlots.sort((a, b) => a.time.localeCompare(b.time));

    return {
      site: 'lotte',
      externalEventId,
      eventDatetime,
      capturedAt: new Date().toISOString(),
      title: movieName,
      venue: '롯데시네마',
      timeSlots: allSlots,
    };
  },
};
