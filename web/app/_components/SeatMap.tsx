import type { SeatSnapshot } from '@/lib/types/seat';

export function SeatMap({ snapshot }: { snapshot: SeatSnapshot }) {
  if (!snapshot.seats) return <p>좌석 데이터가 없습니다</p>;

  const byRow = new Map<string, typeof snapshot.seats>();
  for (const s of snapshot.seats) {
    if (!byRow.has(s.row)) byRow.set(s.row, []);
    byRow.get(s.row)!.push(s);
  }

  const rows = Array.from(byRow.keys()).sort();
  const total = snapshot.seats.length;
  const available = snapshot.seats.filter((s) => s.status === 'available').length;

  return (
    <div className="seatmap">
      <div className="seatmap-summary">
        <span>총 {total}석</span>
        <span className="ok">예매가능 {available}석</span>
        <span className="dim">마감 {total - available}석</span>
      </div>
      <div className="screen">SCREEN</div>
      <div className="seat-rows">
        {rows.map((row) => (
          <div key={row} className="seat-row">
            <span className="row-label">{row}</span>
            <div className="seat-cells">
              {byRow.get(row)!.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`seat seat-${s.status} grade-${s.grade.toLowerCase()}`}
                  title={`${s.id} · ${s.grade} · ${s.price.toLocaleString()}원 · ${
                    s.status === 'available' ? '예매가능' : '마감'
                  }`}
                  data-seat-id={s.id}
                >
                  {s.col}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="seat-legend">
        <span><i className="swatch swatch-available" /> 예매가능</span>
        <span><i className="swatch swatch-occupied" /> 마감</span>
        <span><i className="swatch swatch-premium" /> PREMIUM</span>
        <span><i className="swatch swatch-standard" /> STANDARD</span>
      </div>
    </div>
  );
}
