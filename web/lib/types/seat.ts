export type Site = 'cgv' | 'interpark' | 'catchtable';

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
  seats?: Seat[];
  timeSlots?: TimeSlot[];
}
