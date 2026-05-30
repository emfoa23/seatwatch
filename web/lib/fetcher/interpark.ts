/**
 * Interpark Ticket fetcher — 회차/시간슬롯 단위.
 *
 * 검색: GET `tickets.interpark.com/contents/api/search/ticket?q=&status=OPENED&status=SCHEDULED`
 * 회차 + 잔여좌석: GET `api-ticketfront.interpark.com/v1/goods/<code>/playSeq?startDate&endDate`
 *   → data[]: playSeq, playDate, playTime, remainSeat
 */
import type { SearchResult, SiteFetcher } from '.';
import type { EventIndexEntry, SeatSnapshot, TimeSlot } from '@/lib/types/seat';

interface InterparkDoc {
  goodsName?: string;
  goodsCode?: string;
  placeName?: string;
  placeCode?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
}

interface InterparkSearchResp {
  docCount?: number;
  docs?: InterparkDoc[];
}

interface InterparkPlaySeqItem {
  playSeq?: string;
  playDate?: string; // YYYYMMDD
  playTime?: string; // HHMM
  remainSeat?: number | null;
}

interface InterparkPlaySeqResp {
  data?: InterparkPlaySeqItem[];
}

const SEARCH_URL = (q: string) =>
  `https://tickets.interpark.com/contents/api/search/ticket?hasChildShould=Y&q=${encodeURIComponent(q)}&rows=50&start=0&status=OPENED&status=SCHEDULED`;

const PLAYSEQ_URL = (code: string, startYmd: string, endYmd: string) =>
  `https://api-ticketfront.interpark.com/v1/goods/${code}/playSeq?endDate=${endYmd}&isBookableDate=true&page=1&pageSize=1000&startDate=${startYmd}`;

function ymdToIso(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T19:00:00+09:00`;
}

function hhmm(hm?: string): string {
  return hm && hm.length >= 4 ? `${hm.slice(0, 2)}:${hm.slice(2, 4)}` : '?';
}

function todayYmd(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
}

function plusDaysYmd(days: number): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000 + days * 86400 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
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
      category: d.category,
      meta: { goodsCode: d.goodsCode, placeCode: d.placeCode ?? '' },
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

  async snapshot(externalEventId: string, eventDatetime: string): Promise<SeatSnapshot> {
    const startYmd = eventDatetime.slice(0, 10).replace(/-/g, '');
    const endYmd = plusDaysYmd(90);
    const url = PLAYSEQ_URL(externalEventId, startYmd >= todayYmd() ? startYmd : todayYmd(), endYmd);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
        Origin: 'https://tickets.interpark.com',
        Referer: 'https://tickets.interpark.com/',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`interpark snapshot HTTP ${res.status}`);
    const data = (await res.json()) as InterparkPlaySeqResp;
    const items = data?.data ?? [];

    const timeSlots: TimeSlot[] = items
      .filter((i) => i.playDate && i.playSeq)
      .map((i) => {
        // Interpark 의 remainSeat 정책:
        //   null = 잔여 정보 비공개 (대부분 공연) → 예매가능으로 간주
        //   0    = 매진
        //   >0   = 잔여 표시
        const r = i.remainSeat;
        const available = r === null || r === undefined ? true : r > 0;
        return {
          slotId: `${i.playDate}-${i.playSeq}`,
          time: `${i.playDate!.slice(0, 4)}-${i.playDate!.slice(4, 6)}-${i.playDate!.slice(6, 8)} ${hhmm(i.playTime)}`,
          remain: r ?? undefined,
          available,
        };
      });

    return {
      site: 'interpark',
      externalEventId,
      eventDatetime,
      capturedAt: new Date().toISOString(),
      title: '',
      venue: '',
      timeSlots,
    };
  },
};
