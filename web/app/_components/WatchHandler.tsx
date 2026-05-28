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

const MAX_SEATS = 20;
const MAX_ADJ = 10;

export function WatchHandler({ site, externalEventId, eventDatetime, selectorMode, children }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [adjacency, setAdjacency] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  function onContainerClick(e: MouseEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-watchable]');
    if (!target) return;
    e.preventDefault();
    const value = target.dataset.watchValue;
    const status = target.dataset.watchStatus;
    if (!value) return;
    if (status !== 'occupied') {
      setToast({ kind: 'info', text: '예매가능 자리는 알림이 필요 없습니다.' });
      return;
    }

    setSelected((prev) => {
      if (prev.includes(value)) {
        target.dataset.watchSelected = '';
        return prev.filter((v) => v !== value);
      }
      if (prev.length >= MAX_SEATS) {
        setToast({ kind: 'err', text: `최대 ${MAX_SEATS}석까지 선택 가능합니다.` });
        return prev;
      }
      target.dataset.watchSelected = '1';
      return [...prev, value];
    });
  }

  function clearSelection() {
    document.querySelectorAll<HTMLElement>('[data-watch-selected="1"]').forEach((el) => {
      el.dataset.watchSelected = '';
    });
    setSelected([]);
  }

  async function submit() {
    if (selected.length === 0) {
      setToast({ kind: 'err', text: '좌석을 1개 이상 선택하세요.' });
      return;
    }
    if (!confirm(
      `${selected.length}개 ${selectorMode === 'seat' ? '좌석' : '시간'} 알림을 등록할까요?` +
      (selectorMode === 'seat' && adjacency > 1 ? `\n조건: ${adjacency}명 연속 자리 발생 시 알림` : '')
    )) return;

    setSubmitting(true);
    const seatSelector = {
      type: 'multi' as const,
      values: selected,
      adjacency: selectorMode === 'seat' ? adjacency : 1,
      mode: selectorMode,
    };

    const res = await fetch('/api/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site, externalEventId, eventDatetime, seatSelector }),
    });
    setSubmitting(false);

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
      setToast({
        kind: 'ok',
        text: `알림 등록 완료! 빈자리 발생 시 메일로 안내드립니다.`,
      });
      clearSelection();
      return;
    }
    const body = await res.text();
    setToast({ kind: 'err', text: `등록 실패: ${res.status} ${body.slice(0, 120)}` });
  }

  return (
    <div onClick={onContainerClick}>
      {toast && (
        <div className={`watch-toast watch-toast-${toast.kind}`} role="status">
          {toast.text}
          <button className="toast-close" onClick={(e) => { e.stopPropagation(); setToast(null); }} aria-label="닫기">×</button>
        </div>
      )}

      {children}

      <div className="watch-panel">
        <div className="watch-panel-info">
          <strong>선택 {selected.length} / {MAX_SEATS}</strong>
          <span className="dim">{selected.length === 0 ? '마감된 자리를 클릭해서 선택하세요' : selected.join(', ')}</span>
        </div>
        {selectorMode === 'seat' && (
          <label className="adj-input">
            <span>붙은 자리 수</span>
            <select
              value={adjacency}
              onChange={(e) => setAdjacency(Number(e.target.value))}
              onClick={(e) => e.stopPropagation()}
            >
              {Array.from({ length: MAX_ADJ }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}명 {n === 1 ? '(단일 자리)' : '연속'}</option>
              ))}
            </select>
          </label>
        )}
        <div className="watch-panel-actions">
          {selected.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); clearSelection(); }}>
              초기화
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || selected.length === 0}
            onClick={(e) => { e.stopPropagation(); submit(); }}
          >
            {submitting ? '등록중...' : '알림 설정'}
          </button>
        </div>
      </div>
    </div>
  );
}
