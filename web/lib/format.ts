/**
 * 모든 시간 포맷 헬퍼는 KST(Asia/Seoul) 기준.
 * Vercel/Render runtime 의 OS timezone 이 UTC 라 명시 안 하면 UTC 로 표시됨.
 */

const KST = 'Asia/Seoul';
const LOCALE = 'ko-KR';

export function fmtDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString(LOCALE, { timeZone: KST });
}

export function fmtShortDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString(LOCALE, {
    timeZone: KST,
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDateOnly(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}

export function fmtDayLabel(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    timeZone: KST,
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}

export function fmtTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    timeZone: KST,
    hour: '2-digit',
    minute: '2-digit',
  });
}
