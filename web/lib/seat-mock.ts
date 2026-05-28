import type { Seat, SeatSnapshot, TimeSlot } from './types/seat';

function mockSeats(rows: number, cols: number): Seat[] {
  const out: Seat[] = [];
  for (let r = 0; r < rows; r++) {
    const row = String.fromCharCode(65 + r);
    for (let c = 1; c <= cols; c++) {
      const grade = r < 2 ? 'STANDARD' : r >= rows - 2 ? 'PREMIUM' : 'STANDARD';
      const price = grade === 'PREMIUM' ? 17000 : 14000;
      const occupied = (r * cols + c) % 7 === 0 || (r * 31 + c * 13) % 11 === 0;
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

function mockTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let h = 18; h <= 21; h++) {
    for (const m of [0, 30]) {
      slots.push({
        time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        partySize: [2, 4],
        available: (h + m) % 3 !== 0,
      });
    }
  }
  return slots;
}

export function mockSnapshot(site: 'cgv' | 'interpark' | 'catchtable', eventId: string): SeatSnapshot {
  const base = {
    externalEventId: eventId,
    eventDatetime: '2026-06-15T19:30:00+09:00',
    capturedAt: new Date().toISOString(),
  };
  if (site === 'cgv') {
    return {
      ...base,
      site,
      title: '듄: 파트3 (Mock)',
      venue: 'CGV 용산아이파크몰 4DX 1관',
      seats: mockSeats(8, 12),
    };
  }
  if (site === 'interpark') {
    return {
      ...base,
      site,
      title: '오페라의 유령 (Mock)',
      venue: '예술의전당 오페라극장',
      seats: mockSeats(10, 14),
    };
  }
  return {
    ...base,
    site,
    title: '정식당 (Mock)',
    venue: '서울 강남구 도산대로',
    eventDatetime: '2026-06-15T00:00:00+09:00',
    timeSlots: mockTimeSlots(),
  };
}
