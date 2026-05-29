/**
 * 모든 시간 포맷 헬퍼는 KST(Asia/Seoul) 기준.
 * Vercel/Render runtime 의 OS timezone 이 UTC 라 명시 안 하면 UTC 로 표시됨.
 *
 * 입력이 falsy / 파싱 실패 (Invalid Date) 면 PLACEHOLDER 반환 — UI 에 "Invalid Date" 노출 방지.
 */

const KST = 'Asia/Seoul';
const LOCALE = 'ko-KR';
const PLACEHOLDER = '—';

function toValidDate(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDateTime(iso: string | Date | null | undefined): string {
  const d = toValidDate(iso);
  if (!d) return PLACEHOLDER;
  return d.toLocaleString(LOCALE, { timeZone: KST });
}

export function fmtShortDateTime(iso: string | Date | null | undefined): string {
  const d = toValidDate(iso);
  if (!d) return PLACEHOLDER;
  return d.toLocaleString(LOCALE, {
    timeZone: KST,
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDateOnly(iso: string | Date | null | undefined): string {
  const d = toValidDate(iso);
  if (!d) return PLACEHOLDER;
  return d.toLocaleDateString(LOCALE, {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}

export function fmtDayLabel(iso: string | Date | null | undefined): string {
  const d = toValidDate(iso);
  if (!d) return PLACEHOLDER;
  return d.toLocaleDateString(LOCALE, {
    timeZone: KST,
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}

export function fmtTime(iso: string | Date | null | undefined): string {
  const d = toValidDate(iso);
  if (!d) return PLACEHOLDER;
  return d.toLocaleTimeString(LOCALE, {
    timeZone: KST,
    hour: '2-digit',
    minute: '2-digit',
  });
}
