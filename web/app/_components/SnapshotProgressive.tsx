'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Site, SeatSnapshot } from '@/lib/types/seat';
import { fmtDateTime } from '@/lib/format';
import { SeatMap } from './SeatMap';
import { TimeSlots } from './TimeSlots';
import { WatchHandler } from './WatchHandler';

interface Props {
  site: Site;
  externalEventId: string;
  /** SSR 단계에서 캐시 hit 이면 채워짐. 없으면 null → 클라이언트가 lazy fetch */
  initial: SeatSnapshot | null;
  registered: string[];
  mode: 'seat' | 'time';
  /** 좌석 fetch 가 가능한지 (date/screen/time 까지 모두 특정됐는지) */
  ready: boolean;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

export function SnapshotProgressive({
  site,
  externalEventId,
  initial,
  registered,
  mode,
  ready,
}: Props) {
  const [snapshot, setSnapshot] = useState<SeatSnapshot | null>(initial);
  const [source, setSource] = useState<'cache' | 'fetch' | null>(initial ? 'cache' : null);
  const [status, setStatus] = useState<Status>(initial ? 'ready' : ready ? 'idle' : 'idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const doFetch = useCallback(async () => {
    setStatus('loading');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/snapshot/${site}/${externalEventId}`);
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setErrorMsg(
          res.status === 429
            ? `요청이 너무 많습니다. ${data.retryAfter ?? 60}초 후 다시.`
            : data.error || '좌석 정보를 가져오지 못했습니다.',
        );
        return;
      }
      setSnapshot(data.snapshot);
      setSource(data.source);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setErrorMsg((e as Error).message);
    }
  }, [site, externalEventId]);

  // ready=true 이면 마운트시 자동 fetch (캐시 miss 인 경우)
  useEffect(() => {
    if (ready && !snapshot && status === 'idle') {
      doFetch();
    }
  }, [ready, snapshot, status, doFetch]);

  if (!ready) {
    return (
      <p className="empty">
        {mode === 'time'
          ? '날짜를 선택하면 시간대 정보를 불러옵니다.'
          : '날짜·상영관·시간을 모두 선택하면 좌석 정보를 불러옵니다.'}
      </p>
    );
  }

  if (status === 'loading' || (status === 'idle' && !snapshot)) {
    return (
      <div className="snapshot-loading">
        <div className="skeleton-line skeleton-meta" />
        <div className="seatmap-skeleton" aria-label="좌석 정보를 불러오는 중">
          {Array.from({ length: 8 }).map((_, i) => (
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
        <button type="button" className="btn" onClick={doFetch}>
          다시 시도
        </button>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <>
      <section className="snapshot-meta">
        <span className={`source source-${source ?? 'cache'}`}>
          {source === 'fetch' ? '실시간' : '캐시'}
        </span>
        {snapshot.capturedAt && !Number.isNaN(new Date(snapshot.capturedAt).getTime()) ? (
          <span className="captured">최근 갱신: {fmtDateTime(snapshot.capturedAt)}</span>
        ) : (
          <span className="captured dim">갱신 정보 없음</span>
        )}
        <button type="button" className="btn-refresh" onClick={doFetch} disabled={status as string === 'loading'}>
          새로고침
        </button>
      </section>

      <WatchHandler
        site={site}
        externalEventId={externalEventId}
        eventDatetime={snapshot.eventDatetime}
        selectorMode={mode}
        maxParty={snapshot.maxCapacity}
      >
        {mode === 'time' ? (
          <TimeSlots snapshot={snapshot} registered={registered} />
        ) : (
          <SeatMap snapshot={snapshot} registered={registered} />
        )}
      </WatchHandler>
    </>
  );
}
