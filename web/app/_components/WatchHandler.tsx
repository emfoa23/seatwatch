'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';
import type { Site } from '@/lib/types/seat';

interface Props {
  site: Site;
  externalEventId: string;
  eventDatetime: string;
  selectorMode: 'seat' | 'time';
  children: ReactNode;
}

export function WatchHandler({ site, externalEventId, eventDatetime, selectorMode, children }: Props) {
  const [toast, setToast] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  async function onClick(e: MouseEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-watchable]');
    if (!target) return;
    e.preventDefault();

    const seatId = target.dataset.watchValue;
    const status = target.dataset.watchStatus;
    if (!seatId) return;

    if (status !== 'occupied') {
      setToast({ kind: 'info', text: '예매가능 자리는 별도 알림이 필요 없습니다.' });
      return;
    }

    const seatSelector = selectorMode === 'seat'
      ? { type: 'seat' as const, id: seatId }
      : { type: 'time' as const, time: seatId };

    const res = await fetch('/api/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site, externalEventId, eventDatetime, seatSelector }),
    });

    if (res.status === 401) {
      const url = new URL('/login', window.location.origin);
      url.searchParams.set('callbackUrl', window.location.pathname);
      window.location.href = url.toString();
      return;
    }
    if (res.status === 409) {
      const data = await res.json();
      if (data.error === 'slot_required') {
        if (confirm(`슬롯이 부족합니다 (사용 ${data.used}/${data.total}). 결제 페이지로 이동할까요?`)) {
          window.location.href = '/my/billing';
        }
        return;
      }
      setToast({ kind: 'err', text: data.message || '슬롯 부족' });
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setToast({ kind: 'ok', text: `알림 등록 완료 (${seatId}) — 빈자리 발생 시 메일로 알림 드립니다.` });
      target.dataset.watchRegistered = '1';
      return;
    }
    const body = await res.text();
    setToast({ kind: 'err', text: `등록 실패: ${res.status} ${body.slice(0, 120)}` });
  }

  return (
    <div onClick={onClick}>
      {toast && (
        <div className={`watch-toast watch-toast-${toast.kind}`} role="status">
          {toast.text}
          <button className="toast-close" onClick={() => setToast(null)} aria-label="닫기">×</button>
        </div>
      )}
      {children}
    </div>
  );
}
