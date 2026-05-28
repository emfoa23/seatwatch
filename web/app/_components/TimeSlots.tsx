import type { SeatSnapshot } from '@/lib/types/seat';

export function TimeSlots({ snapshot }: { snapshot: SeatSnapshot }) {
  if (!snapshot.timeSlots) return <p>시간대 데이터가 없습니다</p>;
  const total = snapshot.timeSlots.length;
  const available = snapshot.timeSlots.filter((s) => s.available).length;

  return (
    <div className="timeslots">
      <div className="seatmap-summary">
        <span>총 {total}개 시간대</span>
        <span className="ok">예약가능 {available}개</span>
        <span className="dim">마감 {total - available}개</span>
      </div>
      <div className="timeslot-list">
        {snapshot.timeSlots.map((s) => (
          <button
            key={s.time}
            type="button"
            className={`timeslot timeslot-${s.available ? 'available' : 'occupied'}`}
            title={`${s.time} · ${s.partySize[0]}-${s.partySize[1]}인 · ${s.available ? '예약가능' : '마감'}`}
          >
            <span className="time">{s.time}</span>
            <span className="party">{s.partySize[0]}-{s.partySize[1]}인</span>
            <span className="status">{s.available ? '예약가능' : '마감'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
