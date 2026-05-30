/**
 * Lotte Cinema fetcher — 회차/시간슬롯 단위.
 *
 * 검색: POST `LCAPI/Home/getMovie` → Movies.Items[].Items[]
 * 회차 + 잔여좌석: POST `LCWS/Ticketing/TicketingData.aspx` GetPlaySequence
 *   → PlaySeqs.Items[]: StartTime, EndTime, TotalSeatCount, BookingSeatCount
 *   → 잔여 = TotalSeatCount - BookingSeatCount
 *
 * cinemaID 필수 ("1|0001|<CinemaID>" 형식). representationMovieCode 만 보내면 빈 응답.
 * 따라서 snapshot 호출 시 cinemaID + representationMovieCode 둘 다 필요 → externalEventId 에 인코딩.
 *
 * externalEventId = `lotte_<repMovieCode>_<cinemaID>` 형식 — search 단계는 영화 단위라
 *   `lotte_<repMovieCode>` 만, UI 가 극장 picker 후 snapshot 호출 시 cinemaID 추가.
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

const URL_GET_MOVIE = 'https://www.lottecinema.co.kr/LCAPI/Home/getMovie';
const URL_TICKETING = 'https://www.lottecinema.co.kr/LCWS/Ticketing/TicketingData.aspx';

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

/** "YYYY-MM-DD HH:MM" 형식 */
function dtLabel(playDt?: string, startTime?: string): string {
  if (!playDt) return startTime ?? '?';
  // playDt 가 "2026-05-30T00:00:00" 같은 ISO 일 수도 있음
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
   * snapshot — externalEventId 가 `lotte_<repMovieCode>_<cinemaID>` 형식이면 cinemaID 로 회차 조회.
   * 아니면 (영화 단위) 빈 timeSlots 반환.
   * 이 한계는 UI 가 극장 picker 후 snapshot 호출하는 패턴으로 해결.
   */
  async snapshot(externalEventId: string, eventDatetime: string): Promise<SeatSnapshot> {
    const id = externalEventId.startsWith('lotte_') ? externalEventId.slice(6) : externalEventId;
    const parts = id.split('_');
    const repCode = parts[0];
    const cinemaID = parts[1];
    if (!cinemaID) {
      return {
        site: 'lotte',
        externalEventId,
        eventDatetime,
        capturedAt: new Date().toISOString(),
        title: '',
        venue: '롯데시네마',
        timeSlots: [],
      };
    }
    const playDate = eventDatetime.slice(0, 10);
    const paramList = JSON.stringify({
      MethodName: 'GetPlaySequence',
      channelType: 'HO',
      osType: 'W',
      osVersion: 'Chrome',
      multiLanguageID: 'KR',
      playDate,
      cinemaID: `1|0001|${cinemaID}`,
      representationMovieCode: repCode,
    });
    // form-urlencoded `paramList=...`
    const body = new URLSearchParams({ paramList }).toString();
    const res = await fetch(URL_TICKETING, {
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
    if (!res.ok) throw new Error(`lotte ticketing HTTP ${res.status}`);
    const data = (await res.json()) as LottePlaySeqResp;
    const items = data?.PlaySeqs?.Items ?? [];

    const timeSlots: TimeSlot[] = items
      .filter((p) => p.StartTime && p.PlaySequence)
      .map((p) => {
        const remain = (p.TotalSeatCount ?? 0) - (p.BookingSeatCount ?? 0);
        return {
          slotId: `${p.CinemaID}-${p.ScreenID}-${p.PlaySequence}-${p.PlayDt ?? playDate}`,
          time: dtLabel(p.PlayDt, p.StartTime),
          remain: Math.max(0, remain),
          capacity: p.TotalSeatCount ?? undefined,
          available: remain > 0,
          venue: p.CinemaNameKR,
          screen: p.BrandNm_KR || p.ScreenDivisionNameKR,
        };
      });

    return {
      site: 'lotte',
      externalEventId,
      eventDatetime,
      capturedAt: new Date().toISOString(),
      title: items[0]?.MovieNameKR ?? '',
      venue: items[0]?.CinemaNameKR ?? '롯데시네마',
      timeSlots,
    };
  },
};
