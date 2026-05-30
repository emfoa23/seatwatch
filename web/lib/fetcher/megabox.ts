/**
 * Megabox fetcher — 회차/시간슬롯 단위.
 *
 * 검색: POST `selectMovieList.do` (Vercel 직접)
 * 회차 + 잔여좌석: POST `PcntSeatChoi/selectSeatList.do` body={playSchdlNo, brchNo}
 *   → playSeqList[] 가 같은 (영화, 극장) 다른 회차들 + choiCnt 잔여좌석 + start/end time
 *
 * externalEventId = `mb_<playSchdlNo>` (13자리 — YYMMDD<brchNo>0NN).
 * Search 단계는 영화 단위라 snapshot 호출 시 playSchdlNo 필요 → UI 가 회차 선택 후 호출.
 */
import type { SearchResult, SiteFetcher } from '.';
import type { EventIndexEntry, SeatSnapshot, TimeSlot } from '@/lib/types/seat';

interface MegaboxMovie {
  movieNm?: string;
  rpstMovieNo?: string | number;
  movieNo?: string | number;
  openDe?: string;
}

interface MegaboxSearchResp {
  movieList?: MegaboxMovie[];
}

interface MegaboxSeatResp {
  movieDtlInfo?: {
    playSchdlNo?: string;
    brchNm?: string;
    theabNm?: string;
    movieNm?: string;
    playDe?: string;
    playStartTime?: string;
    playEndTime?: string;
  };
  playSeqList?: Array<{
    playSchdlNo?: string;
    playStartTime?: string;
    playEndTime?: string;
    choiCnt?: number;
  }>;
}

const URL_MOVIE_LIST = 'https://www.megabox.co.kr/on/oh/oha/Movie/selectMovieList.do';
const URL_SEAT_LIST = 'https://www.megabox.co.kr/on/oh/ohz/PcntSeatChoi/selectSeatList.do';

function ymdToIso(ymd?: string): string {
  if (!ymd || ymd.length < 8) {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    return `${kst.toISOString().slice(0, 10)}T19:00:00+09:00`;
  }
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T19:00:00+09:00`;
}

function hhmm(s?: string): string {
  return s && s.length >= 4 ? `${s.slice(0, 2)}:${s.slice(2, 4)}` : '?';
}

function brchNoFromPlaySchdlNo(p: string): string {
  return p.length >= 10 ? p.slice(6, 10) : '0001';
}

function moviesToEntries(movies: MegaboxMovie[], q: string): EventIndexEntry[] {
  const qLower = q.toLowerCase();
  const out: EventIndexEntry[] = [];
  for (const m of movies) {
    const title = m.movieNm;
    if (!title || !title.toLowerCase().includes(qLower)) continue;
    const movieNo = String(m.rpstMovieNo ?? m.movieNo ?? '');
    if (!movieNo) continue;
    out.push({
      site: 'megabox',
      externalEventId: `mb_${movieNo}`.slice(0, 16),
      eventDatetime: ymdToIso(m.openDe),
      title,
      venue: '메가박스',
      meta: { movieNo },
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
        Referer: 'https://www.megabox.co.kr/movie',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        currPage: '1',
        movieStatCd: '2',
        onScreenAt: 'Y',
        pageSize: '100',
        ibxMovieNmSearch: query,
      }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`megabox search HTTP ${res.status}`);
    const data = (await res.json()) as MegaboxSearchResp;
    return { entries: moviesToEntries(data.movieList ?? [], query) };
  },

  /**
   * snapshot — externalEventId 가 playSchdlNo 형식 (mb_<13자리>) 이어야 회차 list 반환.
   * UI 가 영화→극장→날짜 picker 후 첫 회차 playSchdlNo 로 호출.
   */
  async snapshot(externalEventId: string, eventDatetime: string): Promise<SeatSnapshot> {
    const id = externalEventId.startsWith('mb_') ? externalEventId.slice(3) : externalEventId;
    if (id.length < 13) {
      // 영화 단위 → 빈 timeSlots (UI 가 회차 expansion 호출 안 됐을 때)
      return {
        site: 'megabox',
        externalEventId,
        eventDatetime,
        capturedAt: new Date().toISOString(),
        title: '',
        venue: '메가박스',
        timeSlots: [],
      };
    }
    const brchNo = brchNoFromPlaySchdlNo(id);
    const res = await fetch(URL_SEAT_LIST, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json',
        Referer: 'https://www.megabox.co.kr/on/oh/ohz/PcntSeatChoi/selectPcntSeatChoi.do',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ playSchdlNo: id, brchNo }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`megabox seat HTTP ${res.status}`);
    const data = (await res.json()) as MegaboxSeatResp;
    const info = data.movieDtlInfo ?? {};
    const venue = `${info.brchNm ?? ''} ${info.theabNm ?? ''}`.trim();
    const playDe = info.playDe ?? '';

    const timeSlots: TimeSlot[] = (data.playSeqList ?? [])
      .filter((p) => p.playSchdlNo && p.playStartTime)
      .map((p) => ({
        slotId: p.playSchdlNo!,
        time: `${hhmm(p.playStartTime)}~${hhmm(p.playEndTime)}`,
        remain: p.choiCnt ?? undefined,
        available: (p.choiCnt ?? 0) > 0,
        venue,
        screen: info.theabNm,
      }));

    return {
      site: 'megabox',
      externalEventId,
      eventDatetime: playDe
        ? `${playDe.slice(0, 4)}-${playDe.slice(4, 6)}-${playDe.slice(6, 8)}T${hhmm(info.playStartTime).replace('?', '19:00')}:00+09:00`
        : eventDatetime,
      capturedAt: new Date().toISOString(),
      title: info.movieNm ?? '',
      venue,
      timeSlots,
    };
  },
};
