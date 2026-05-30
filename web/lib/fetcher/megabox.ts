/**
 * Megabox fetcher — 회차/시간슬롯 단위.
 *
 * 검색: POST `selectMovieList.do` (영화 list)
 * 극장 list: selectBokdList.do onLoad=Y 응답의 areaBrchList[]
 * 회차 + 잔여좌석: POST `selectBokdList.do` body={arrMovieNo, brchNo1..5, brchNoListCnt, playDe, ...}
 *   → movieFormList[]: playSchdlNo, playStartTime, theabExpoNm, totSeatCnt, restSeatCnt, bokdAbleAt
 *
 * snapshot:
 *   1) selectBokdList(onLoad=Y, incomeMovieNo) → areaBrchList (116 극장 메타)
 *   2) 서울/수도권 인기 극장 ~15개 추출
 *   3) 5개씩 chunk 로 selectBokdList(arrMovieNo, brchNo1..5, playDe) 동시 호출 (3 호출)
 *   4) movieFormList[] 합쳐 timeSlots[]
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

interface MegaboxBrch {
  brchNo?: string;
  brchNm?: string;
  areaCd?: string;
  areaCdNm?: string;
  brchBokdUnableAt?: string;
}

interface MegaboxFormItem {
  brchNo?: string;
  brchNm?: string;
  areaCdNm?: string;
  playSchdlNo?: string;
  theabExpoNm?: string;
  theabSeatCnt?: number;
  totSeatCnt?: number;
  restSeatCnt?: number;
  bokdAbleAt?: string;
  playStartTime?: string;
  playEndTime?: string;
  movieNm?: string;
  playDe?: string;
}

interface MegaboxBokdResp {
  areaBrchList?: MegaboxBrch[];
  movieFormList?: MegaboxFormItem[] | null;
}

const URL_MOVIE_LIST = 'https://www.megabox.co.kr/on/oh/oha/Movie/selectMovieList.do';
const URL_BOKD = 'https://www.megabox.co.kr/on/oh/ohb/SimpleBooking/selectBokdList.do';

const PREFERRED_AREAS = ['10', '40', '30', '20', '50']; // 서울 > 경기 > 인천 > 부산 > 대구
const MAX_BRCHS = 15;

function ymdToIso(ymd?: string): string {
  if (!ymd || ymd.length < 8) {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    return `${kst.toISOString().slice(0, 10)}T19:00:00+09:00`;
  }
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T19:00:00+09:00`;
}

function todayYmd(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
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

async function postBokd(body: Record<string, unknown>): Promise<MegaboxBokdResp> {
  const res = await fetch(URL_BOKD, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/json;charset=UTF-8',
      Referer: 'https://www.megabox.co.kr/booking',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`megabox selectBokdList HTTP ${res.status}`);
  return (await res.json()) as MegaboxBokdResp;
}

function hhmmColon(s?: string): string {
  // selectBokdList 의 playStartTime 은 이미 "12:35" 형식
  return s ?? '?';
}

/** Megabox 응답의 HTML entity 디코드 (&#40; → '(', &amp; → '&' 등) */
function decodeHtml(s?: string): string {
  if (!s) return '';
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
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
   * snapshot — externalEventId = `mb_<movieNo>` → 인기 극장 15개의 모든 회차 list 반환.
   */
  async snapshot(externalEventId: string, eventDatetime: string): Promise<SeatSnapshot> {
    const movieNo = externalEventId.startsWith('mb_')
      ? externalEventId.slice(3)
      : externalEventId;

    // eventDatetime 이 과거 (release date) 일 수 있어 오늘로 보정
    const requested = eventDatetime.slice(0, 10).replace(/-/g, '');
    const today = todayYmd();
    const playDe = requested >= today ? requested : today;

    // 1) onLoad=Y 호출로 areaBrchList 받기 + 영화 운영 극장 좁히기
    const onLoadResp = await postBokd({
      playDe,
      incomeMovieNo: movieNo,
      onLoad: 'Y',
      sellChnlCd: '',
      incomeTheabKindCd: '',
      incomeBrchNo1: '',
      incomePlayDe: '',
    });

    const brchs = (onLoadResp.areaBrchList ?? [])
      .filter((b) => b.brchBokdUnableAt !== 'Y')
      .filter((b) => PREFERRED_AREAS.includes(b.areaCd ?? ''))
      .sort((a, b) => {
        const ai = PREFERRED_AREAS.indexOf(a.areaCd ?? '');
        const bi = PREFERRED_AREAS.indexOf(b.areaCd ?? '');
        return ai - bi;
      })
      .slice(0, MAX_BRCHS);

    // 2) 5개씩 chunk → selectBokdList 동시 호출
    const chunks: MegaboxBrch[][] = [];
    for (let i = 0; i < brchs.length; i += 5) chunks.push(brchs.slice(i, i + 5));

    const results = await Promise.all(
      chunks.map((chunk) => {
        const body: Record<string, unknown> = {
          arrMovieNo: movieNo,
          playDe,
          brchNoListCnt: chunk.length,
          brchAll: '',
          brchSpcl: '',
          movieNo1: movieNo,
          movieNo2: '',
          movieNo3: '',
          sellChnlCd: '',
        };
        chunk.forEach((b, i) => {
          const n = i + 1;
          body[`brchNo${n}`] = b.brchNo ?? '';
          body[`areaCd${n}`] = b.areaCd ?? '';
          body[`spclbYn${n}`] = 'N';
          body[`theabKindCd${n}`] = '';
        });
        // 남은 슬롯 빈 값
        for (let i = chunk.length; i < 5; i++) {
          const n = i + 1;
          body[`brchNo${n}`] = '';
          body[`areaCd${n}`] = '';
          body[`spclbYn${n}`] = '';
          body[`theabKindCd${n}`] = '';
        }
        return postBokd(body).catch(() => null);
      }),
    );

    const allForms: MegaboxFormItem[] = [];
    let movieName = '';
    for (const r of results) {
      if (!r?.movieFormList) continue;
      for (const f of r.movieFormList) {
        if (!movieName) movieName = f.movieNm ?? '';
        allForms.push(f);
      }
    }

    const timeSlots: TimeSlot[] = allForms.map((f) => {
      const remain = f.restSeatCnt ?? 0;
      const capacity = f.totSeatCnt ?? f.theabSeatCnt ?? undefined;
      const startTimeLabel = hhmmColon(f.playStartTime);
      const endTimeLabel = hhmmColon(f.playEndTime);
      const d = f.playDe ?? playDe;
      const screenName = decodeHtml(f.theabExpoNm);
      return {
        slotId: f.playSchdlNo ?? `${d}-${f.brchNo}-${screenName}-${startTimeLabel}`,
        time: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${startTimeLabel}~${endTimeLabel}`,
        remain,
        capacity,
        available: f.bokdAbleAt === 'Y' && remain > 0,
        venue: decodeHtml(f.brchNm),
        screen: screenName,
      };
    });

    timeSlots.sort((a, b) => a.time.localeCompare(b.time));

    return {
      site: 'megabox',
      externalEventId,
      eventDatetime,
      capturedAt: new Date().toISOString(),
      title: movieName,
      venue: '메가박스',
      timeSlots,
    };
  },
};
