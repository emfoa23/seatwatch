import type { SeatSnapshot } from '@/lib/types/seat';

export function TimeSlots({
  snapshot,
  registered = [],
}: {
  snapshot: SeatSnapshot;
  registered?: string[];
}) {
  const regSet = new Set(registered);
  const slots = snapshot.timeSlots ?? [];
  if (slots.length === 0) {
    const movieSite = snapshot.site === 'megabox' || snapshot.site === 'lotte' || snapshot.site === 'cgv';
    return (
      <p className="empty">
        {movieSite
          ? '이 사이트는 영화별 회차 정보를 즉시 가져오지 못합니다. 외부 예매 페이지에서 회차를 확인하신 뒤 다시 시도해주세요.'
          : '회차/시간대 데이터를 가져오지 못했습니다.'}
      </p>
    );
  }
  const total = slots.length;
  const available = slots.filter((s) => s.available).length;

  return (
    <div className="timeslots">
      <div className="seatmap-summary">
        <span>총 {total}개 회차</span>
        <span className="ok">예매가능 {available}개</span>
        <span className="dim">마감 {total - available}개</span>
      </div>
      <div className="timeslot-list">
        {slots.map((s) => {
          const remainText =
            s.remain !== undefined
              ? `잔여 ${s.remain}석`
              : s.partySize
                ? `${s.partySize[0]}-${s.partySize[1]}인`
                : s.available
                  ? '예매가능'
                  : '매진';
          return (
            <button
              key={s.slotId}
              type="button"
              className={`timeslot timeslot-${s.available ? 'available' : 'occupied'}`}
              title={`${s.time} · ${remainText} · ${
                s.available ? '알림 등록 시 잔여 변화 추적' : '클릭 → 빈자리 알림 등록'
              }`}
              data-watchable=""
              data-watch-value={s.slotId}
              data-watch-status={s.available ? 'available' : 'occupied'}
              data-watch-registered={regSet.has(s.slotId) ? '1' : ''}
            >
              <span className="time">{s.time}</span>
              {s.screen && <span className="party">{s.screen}</span>}
              {s.venue && !s.screen && <span className="party">{s.venue}</span>}
              <span className="status">{remainText}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
