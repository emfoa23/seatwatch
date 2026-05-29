export type Site = 'cgv' | 'megabox' | 'lotte' | 'interpark' | 'catchtable';

export const SITE_LABELS: Record<Site, string> = {
  cgv: 'CGV',
  megabox: '메가박스',
  lotte: '롯데시네마',
  interpark: '인터파크 티켓',
  catchtable: '캐치테이블',
};

export const MOVIE_SITES: Site[] = ['cgv', 'megabox', 'lotte'];
export const SHOW_SITES: Site[] = ['interpark'];
export const RESTAURANT_SITES: Site[] = ['catchtable'];

export type SeatStatus = 'available' | 'occupied';

export interface Seat {
  id: string;
  row: string;
  col: number;
  grade: string;
  price: number;
  status: SeatStatus;
}

export interface TimeSlot {
  time: string;
  partySize: [number, number];
  available: boolean;
}

export interface SeatSnapshot {
  site: Site;
  externalEventId: string;
  eventDatetime: string;
  capturedAt: string;
  title: string;
  venue: string;
  screen?: string;
  seats?: Seat[];
  timeSlots?: TimeSlot[];
  maxCapacity?: number;
}

export interface EventIndexEntry {
  site: Site;
  externalEventId: string;
  eventDatetime: string;
  title: string;
  venue: string;
  screen?: string;
  region?: string;
  category?: string;
}
