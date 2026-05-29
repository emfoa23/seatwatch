import type { SeatSnapshot } from '@/lib/types/seat';
import { fmtDateTime } from '@/lib/format';

function isValidDateInput(v: unknown): boolean {
  if (!v) return false;
  const d = new Date(v as string | Date);
  return !Number.isNaN(d.getTime());
}

export function EventHeader({
  snapshot,
  source,
}: {
  snapshot: SeatSnapshot;
  source: 'valkey' | 'mock';
}) {
  const dt = new Date(snapshot.eventDatetime).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const hasCaptured = isValidDateInput(snapshot.capturedAt);
  return (
    <div className="event-header">
      <div className="event-meta">
        <span className={`badge badge-${snapshot.site}`}>{snapshot.site.toUpperCase()}</span>
        <h1>{snapshot.title}</h1>
        <p className="venue">{snapshot.venue}</p>
        <p className="datetime">{dt}</p>
      </div>
      <div className="event-source">
        <span className={`source source-${source}`}>{source === 'valkey' ? '실시간' : 'MOCK'}</span>
        {hasCaptured ? (
          <span className="captured">최근 갱신: {fmtDateTime(snapshot.capturedAt)}</span>
        ) : (
          <span className="captured dim">갱신 정보 없음</span>
        )}
      </div>
    </div>
  );
}
