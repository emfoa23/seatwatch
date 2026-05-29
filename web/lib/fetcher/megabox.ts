/**
 * Megabox fetcher.
 *
 * 검색: POST `selectMovieList.do` body `{currPage, movieStatCd:"2", onScreenAt:"Y", pageSize, ibxMovieNmSearch}`
 *       → `movieList[]` 영화 단위.
 *
 * 회차/좌석맵: POST `PcntSeatChoi/selectSeatList.do` body `{playSchdlNo, brchNo}`
 *       → `{movieDtlInfo, playSeqList[], seatListSD01[], seatTicketAmtList[], ...}`
 *       - playSeqList[]: 같은 (영화,극장) 의 다른 회차 + choiCnt (잔여좌석)
 *       - seatListSD01[]: 개별 좌석 (rowNm, seatNo, seatClassCd, seatExpoAt)
 *       - 비로그인 + 쿠키 없이 호출 가능 ✅
 *
 * externalEventId = `mb_<playSchdlNo>` 형식 (playSchdlNo = `YYMMDD<brchNo>0NN` 13자리)
 *   playSchdlNo 의 6-10번째 char = brchNo, 11-13번째 = playSeq.
 *
 * 회차 list endpoint: search 결과는 영화 단위. 영화 → 회차 list 는 selectBokdList.do 의
 *   추가 hop 또는 다른 endpoint 가 필요. 일단 snapshot 은 playSchdlNo 받음.
 */
import type { SearchResult, SiteFetcher } from '.';
import type { EventIndexEntry, Seat, SeatSnapshot } from '@/lib/types/seat';

interface MegaboxMovie {
  movieNm?: string;
  rpstMovieNo?: string | number;
  movieNo?: string | number;
  openDe?: string;
}

interface MegaboxSearchResp {
  movieList?: MegaboxMovie[];
}

interface MegaboxSeatItem {
  smapBaseNo?: number;
  seatUniqNo?: string;
  rowNm?: string;
  seatNo?: number;
  rowNo?: number;
  colNo?: number;
  seatClassCd?: string;
  seatGrpNo?: string | null;
  seatExpoAt?: string; // "Y" 면 노출 (예매 가능 / 매진 별도 필드)
  seatStatCd?: string; // 예매 상태 추정
}

interface MegaboxSeatResp {
  msg?: string;
  movieDtlInfo?: {
    playSchdlNo?: string;
    brchNo?: string;
    brchNm?: string;
    theabNm?: string;
    movieNo?: string;
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
  seatListSD01?: MegaboxSeatItem[];
  seatTicketAmtList?: Array<{ ticketKindCd?: string; clsGernAmt?: number }>;
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

function makeEid(movieNo: string): string {
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
      externalEventId: makeEid(movieNo),
      eventDatetime: ymdToIso(m.openDe),
      title,
      venue: '메가박스',
    });
  }
  return out;
}

/** playSchdlNo (13자리) 에서 brchNo (4자리, position 6-10) 추출 */
function brchNoFromPlaySchdlNo(playSchdlNo: string): string {
  return playSchdlNo.length >= 10 ? playSchdlNo.slice(6, 10) : '0001';
}

/** Megabox seat → 우리 Seat 형식 */
function mapSeats(items: MegaboxSeatItem[], prices?: MegaboxSeatResp['seatTicketAmtList']): Seat[] {
  const adultAmt = prices?.find((p) => p.ticketKindCd === 'TKA')?.clsGernAmt ?? 13000;
  const out: Seat[] = [];
  for (const s of items) {
    if (!s.rowNm || !s.seatNo) continue;
    // Megabox 의 seatExpoAt: Y = 예매 가능 (가시), N = 매진/숨김
    // seatStatCd 가 정확한 매진 정보일 수 있지만 응답에 없으면 seatExpoAt 사용
    const occupied = (s.seatExpoAt && s.seatExpoAt !== 'Y') || s.seatStatCd === 'X';
    const grade =
      s.seatClassCd === 'RECLINE_CLS' ? 'RECLINER' :
      s.seatClassCd === 'DISABLED_CLS' ? 'STANDARD' :
      s.seatClassCd?.includes('PRIM') ? 'PREMIUM' :
      'STANDARD';
    out.push({
      id: `${s.rowNm}${s.seatNo}`,
      row: s.rowNm,
      col: s.seatNo,
      grade,
      price: adultAmt,
      status: occupied ? 'occupied' : 'available',
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
        ibxMovieNmSearch: query,
      }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`megabox search HTTP ${res.status}`);
    const data = (await res.json()) as MegaboxSearchResp;
    return { entries: moviesToEntries(data.movieList ?? [], query) };
  },

  /**
   * snapshot — externalEventId 가 playSchdlNo 형식 (`mb_<13자리>`) 일 때만 좌석맵 반환.
   * 영화 단위 (mb_<movieNo>) 면 회차 list 가 부족하므로 timeSlots 만 추정 — 추가 분석 필요.
   */
  async snapshot(externalEventId: string, eventDatetime: string): Promise<SeatSnapshot> {
    const id = externalEventId.startsWith('mb_') ? externalEventId.slice(3) : externalEventId;
    // playSchdlNo 는 13자리, movieNo 는 보통 8자리 → 길이로 구분
    if (id.length >= 13) {
      // 좌석맵 호출
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
      const seats = mapSeats(data.seatListSD01 ?? [], data.seatTicketAmtList);
      return {
        site: 'megabox',
        externalEventId,
        eventDatetime,
        capturedAt: new Date().toISOString(),
        title: info.movieNm ?? '',
        venue: `${info.brchNm ?? ''} ${info.theabNm ?? ''}`.trim(),
        screen: info.theabNm,
        seats,
        maxCapacity: seats.length,
      };
    }
    // 영화 단위 id 면 회차 list endpoint 가 필요 — 분석 진행 중
    throw new Error(
      `megabox snapshot 은 회차 단위 playSchdlNo (mb_<13자리>) 필요. 받은 id=${externalEventId}`,
    );
  },
};
