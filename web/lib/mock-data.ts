import { createHash } from 'node:crypto';
import type { Seat, SeatSnapshot, Site, EventIndexEntry, TimeSlot } from './types/seat';

function hashId(parts: (string | number)[]): string {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

const MOVIES = [
  '듄: 파트3',
  '미션 임파서블 8',
  '아바타: 불의 길',
  '인사이드 아웃 3',
  '존 윅: 챕터 5',
  '위키드',
];

const CGV_THEATERS = [
  { code: 'yongsan', name: 'CGV 용산아이파크몰', region: '서울' },
  { code: 'gangnam', name: 'CGV 강남', region: '서울' },
  { code: 'wangsimni', name: 'CGV 왕십리', region: '서울' },
  { code: 'songdo', name: 'CGV 송도', region: '인천' },
];
const MEGABOX_THEATERS = [
  { code: 'coex', name: '메가박스 코엑스', region: '서울' },
  { code: 'sinchon', name: '메가박스 신촌', region: '서울' },
  { code: 'gimpo', name: '메가박스 김포공항', region: '서울' },
  { code: 'haeundae', name: '메가박스 해운대(장산)', region: '부산' },
];
const LOTTE_THEATERS = [
  { code: 'gwanghwamun', name: '롯데시네마 광화문', region: '서울' },
  { code: 'gimpo', name: '롯데시네마 김포공항', region: '서울' },
  { code: 'busan-pnu', name: '롯데시네마 부산본점', region: '부산' },
  { code: 'incheon', name: '롯데시네마 인천터미널', region: '인천' },
];

const SHOWS = [
  { title: '오페라의 유령', venue: '예술의전당 오페라극장', category: '뮤지컬' },
  { title: '레미제라블', venue: '블루스퀘어 신한카드홀', category: '뮤지컬' },
  { title: '아이유 콘서트', venue: '올림픽공원 KSPO DOME', category: '콘서트' },
  { title: '백건우 피아노 리사이틀', venue: '예술의전당 콘서트홀', category: '클래식' },
  { title: '햄릿', venue: 'LG아트센터', category: '연극' },
];

const RESTAURANTS = [
  { name: '정식당', venue: '서울 강남구 도산대로', category: '한식' },
  { name: '주옥', venue: '서울 강남구 청담동', category: '한식' },
  { name: '미쉐린 가아', venue: '서울 강남구 청담동', category: '프렌치' },
  { name: '스시 코우지', venue: '서울 용산구 한남동', category: '일식' },
  { name: '레스토랑 알라 프리마', venue: '서울 종로구 안국동', category: '이탈리안' },
];

const TIMES_MOVIE = ['10:30', '13:00', '16:00', '19:00', '21:30'];
const TIMES_RESTAURANT = ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'];

const FUTURE_DAYS = [3, 5, 7, 10, 14];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function futureDate(daysAhead: number, time = '00:00'): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  const offMin = d.getTimezoneOffset();
  const tzSign = offMin <= 0 ? '+' : '-';
  const tzAbs = Math.abs(offMin);
  const tz = `${tzSign}${pad(Math.floor(tzAbs / 60))}:${pad(tzAbs % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${tz}`;
}

function generateSeats(rows: number, cols: number, occupancySeed: number): Seat[] {
  const out: Seat[] = [];
  for (let r = 0; r < rows; r++) {
    const row = String.fromCharCode(65 + r);
    for (let c = 1; c <= cols; c++) {
      const grade = r >= rows - 2 ? 'PREMIUM' : 'STANDARD';
      const price = grade === 'PREMIUM' ? 17000 : 14000;
      const occupied = (r * cols + c + occupancySeed) % 7 === 0 || (r * 31 + c * 13 + occupancySeed) % 11 === 0;
      out.push({
        id: `${row}${c}`,
        row,
        col: c,
        grade,
        price,
        status: occupied ? 'occupied' : 'available',
      });
    }
  }
  return out;
}

function generateTimeSlots(seed: number): TimeSlot[] {
  return TIMES_RESTAURANT.map((time, i) => ({
    time,
    partySize: [2, i % 2 === 0 ? 4 : 6] as [number, number],
    available: ((i * 7 + seed) % 3) !== 0,
  }));
}

interface MovieEvent {
  entry: EventIndexEntry;
  snapshot: SeatSnapshot;
}

function generateMovieSiteEvents(site: Site, theaters: typeof CGV_THEATERS): MovieEvent[] {
  const out: MovieEvent[] = [];
  let seed = 0;
  for (const movie of MOVIES.slice(0, 5)) {
    for (const theater of theaters) {
      for (const time of TIMES_MOVIE.slice(0, 3)) {
        const day = FUTURE_DAYS[seed % FUTURE_DAYS.length];
        const dt = futureDate(day, time);
        const id = hashId([site, theater.code, movie, day, time]);
        const seats = generateSeats(8, 12, seed);
        out.push({
          entry: {
            site,
            externalEventId: id,
            eventDatetime: dt,
            title: movie,
            venue: theater.name,
            region: theater.region,
            category: '영화',
          },
          snapshot: {
            site,
            externalEventId: id,
            eventDatetime: dt,
            capturedAt: new Date().toISOString(),
            title: movie,
            venue: theater.name,
            seats,
          },
        });
        seed += 1;
      }
    }
  }
  return out;
}

function generateInterparkEvents(): MovieEvent[] {
  const out: MovieEvent[] = [];
  let seed = 100;
  for (const show of SHOWS) {
    for (const day of FUTURE_DAYS.slice(0, 3)) {
      const dt = futureDate(day, '19:30');
      const id = hashId(['interpark', show.category, show.title, day]);
      const seats = generateSeats(10, 14, seed);
      out.push({
        entry: {
          site: 'interpark',
          externalEventId: id,
          eventDatetime: dt,
          title: show.title,
          venue: show.venue,
          category: show.category,
        },
        snapshot: {
          site: 'interpark',
          externalEventId: id,
          eventDatetime: dt,
          capturedAt: new Date().toISOString(),
          title: show.title,
          venue: show.venue,
          seats,
        },
      });
      seed += 1;
    }
  }
  return out;
}

function generateCatchtableEvents(): MovieEvent[] {
  const out: MovieEvent[] = [];
  let seed = 200;
  for (const r of RESTAURANTS) {
    for (const day of FUTURE_DAYS.slice(0, 3)) {
      const dt = futureDate(day, '00:00');
      const id = hashId(['catchtable', r.category, r.name, day]);
      out.push({
        entry: {
          site: 'catchtable',
          externalEventId: id,
          eventDatetime: dt,
          title: r.name,
          venue: r.venue,
          category: r.category,
        },
        snapshot: {
          site: 'catchtable',
          externalEventId: id,
          eventDatetime: dt,
          capturedAt: new Date().toISOString(),
          title: r.name,
          venue: r.venue,
          timeSlots: generateTimeSlots(seed),
        },
      });
      seed += 1;
    }
  }
  return out;
}

export function generateAllMockData(): MovieEvent[] {
  return [
    ...generateMovieSiteEvents('cgv', CGV_THEATERS),
    ...generateMovieSiteEvents('megabox', MEGABOX_THEATERS),
    ...generateMovieSiteEvents('lotte', LOTTE_THEATERS),
    ...generateInterparkEvents(),
    ...generateCatchtableEvents(),
  ];
}
