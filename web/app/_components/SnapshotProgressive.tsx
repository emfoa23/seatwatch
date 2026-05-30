'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Site, SeatSnapshot } from '@/lib/types/seat';
import { fmtDateTime } from '@/lib/format';
import { TimeSlots } from './TimeSlots';
import { WatchHandler } from './WatchHandler';

interface Props {
  site: Site;
  externalEventId: string;
  initial: SeatSnapshot | null;
  registered: string[];
  ready: boolean;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

export function SnapshotProgressive({
  site,
  externalEventId,
  initial,
  registered,
  ready,
}: Props) {
  const [snapshot, setSnapshot] = useState<SeatSnapshot | null>(initial);
  const [source, setSource] = useState<'cache' | 'fetch' | 'pending' | null>(initial ? 'cache' : null);
  const [status, setStatus] = useState<Status>(initial ? 'ready' : 'idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const doFetch = useCallback(async () => {
    setStatus('loading');
    setErrorMsg(null);
    try {
      const deadline = Date.now() + 90_000;
      while (true) {
        const res = await fetch(`/api/snapshot/${site}/${externalEventId}`);
        const data = await res.json();
        if (res.status === 202) {
          if (Date.now() >= deadline) {
            setStatus('error');
            setErrorMsg(data.message || '데이터 수집 대기 시간 초과 — 잠시 후 다시 시도.');
            return;
          }
          setSource('pending');
          await new Promise((r) => setTimeout(r, (data.retryAfter ?? 10) * 1000));
          continue;
        }
        if (!res.ok) {
          setStatus('error');
          setErrorMsg(
            res.status === 429
              ? `요청이 너무 많습니다. ${data.retryAfter ?? 60}초 후 다시.`
              : data.error || '시간슬롯 정보를 가져오지 못했습니다.',
          );
          return;
        }
        setSnapshot(data.snapshot);
        setSource(data.source);
        setStatus('ready');
        return;
      }
    } catch (e) {
      setStatus('error');
      setErrorMsg((e as Error).message);
    }
  }, [site, externalEventId]);

  useEffect(() => {
    if (ready && !snapshot && status === 'idle') doFetch();
  }, [ready, snapshot, status, doFetch]);

  if (!ready) {
    return <p className="empty">날짜·극장을 선택하면 회차 정보를 불러옵니다.</p>;
  }

  if (status === 'loading' || (status === 'idle' && !snapshot)) {
    return (
      <div className="snapshot-loading">
        <div className="skeleton-line skeleton-meta" />
        <div className="seatmap-skeleton" aria-label="회차 정보를 불러오는 중">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="snapshot-error">
        <p className="empty">에러: {errorMsg}</p>
        <button type="button" className="btn" onClick={doFetch}>다시 시도</button>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <>
      <section className="snapshot-meta">
        <span className={`source source-${source ?? 'cache'}`}>
          {source === 'fetch' ? '실시간' : source === 'pending' ? '수집중' : '캐시'}
        </span>
        {snapshot.capturedAt && !Number.isNaN(new Date(snapshot.capturedAt).getTime()) ? (
          <span className="captured">최근 갱신: {fmtDateTime(snapshot.capturedAt)}</span>
        ) : (
          <span className="captured dim">갱신 정보 없음</span>
        )}
        <button type="button" className="btn-refresh" onClick={doFetch}>
          새로고침
        </button>
      </section>

      <WatchHandler
        site={site}
        externalEventId={externalEventId}
        eventDatetime={snapshot.eventDatetime}
      >
        <TimeSlots snapshot={snapshot} registered={registered} />
      </WatchHandler>
    </>
  );
}
