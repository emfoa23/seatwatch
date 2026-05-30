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

/**
 * 알림 단위 = TimeSlot (회차 또는 식당 시간슬롯).
 * 5사 통일 단위 — 좌석 단위 알림은 사이트별로 인증/Session 토큰이 다르고 일관 결선 불가.
 */
export interface TimeSlot {
  /** 사용자에게 보일 텍스트 — 예: "2026-05-30 14:30 노원·8관 LASER" */
  time: string;
  /** Site-specific 회차/슬롯 ID — Watch 등록 시 selector value 로 사용 */
  slotId: string;
  /** 잔여좌석/예약가능 인원 (정확한 수치, 없으면 undefined) */
  remain?: number;
  /** 회차당 최대 좌석 수 (영화) — 없을 수도 */
  capacity?: number;
  /** 예약 가능 인원 범위 (식당) */
  partySize?: [number, number];
  /** 매진 안됨이면 true */
  available: boolean;
  /** screen / cinema / venue / region 등 추가 메타 */
  screen?: string;
  venue?: string;
}

export interface SeatSnapshot {
  site: Site;
  externalEventId: string;
  eventDatetime: string;
  capturedAt: string;
  title: string;
  venue: string;
  /** 회차/시간슬롯 list — 5사 통일 알림 단위 */
  timeSlots: TimeSlot[];
}

export interface EventIndexEntry {
  site: Site;
  externalEventId: string;
  eventDatetime: string;
  title: string;
  venue: string;
  /** Site-specific 영화 코드/극장 ID (snapshot 호출 시 필요) */
  meta?: Record<string, string>;
  region?: string;
  category?: string;
}
