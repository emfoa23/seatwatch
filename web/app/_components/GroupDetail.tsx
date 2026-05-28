import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGroup, encodeGroupKey } from '@/lib/events';
import { getSnapshot } from '@/lib/snapshot';
import { SITE_LABELS, type Site } from '@/lib/types/seat';
import { SiteLogo } from './Icons';
import { Thumbnail } from './Thumbnail';
import { SeatMap } from './SeatMap';
import { TimeSlots } from './TimeSlots';
import { WatchHandler } from './WatchHandler';

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function fmtDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export async function GroupDetail({
  site,
  groupKey,
  dt,
}: {
  site: Site;
  groupKey: string;
  dt?: string;
}) {
  const group = await getGroup(site, groupKey);
  if (!group) notFound();

  const days = Array.from(new Set(group.entries.map((e) => dayKey(e.eventDatetime)))).sort();
  const dtDay = dt ? dayKey(dt) : null;
  const selectedDay = dtDay && days.includes(dtDay) ? dtDay : days[0];
  const timesOnDay = group.entries.filter((e) => dayKey(e.eventDatetime) === selectedDay);
  const selectedEntry = timesOnDay.find((e) => e.eventDatetime === dt) ?? timesOnDay[0];

  const { snapshot, source } = await getSnapshot(site, selectedEntry.externalEventId);
  const isRestaurant = site === 'catchtable';

  return (
    <div className="group-detail">
      <header className="group-header">
        <Thumbnail title={group.title} category={group.category} size={88} wide />
        <div className="group-meta">
          <div className="group-meta-top">
            <SiteLogo site={site} size={20} />
            <span className="badge-text">{SITE_LABELS[site]}</span>
          </div>
          <h1>{group.title}</h1>
          {!isRestaurant && <p className="venue">{group.venue}{group.region ? ` · ${group.region}` : ''}</p>}
          {isRestaurant && <p className="venue">{group.venue}</p>}
          <p className="group-summary">
            {days.length}일 · 총 {group.entries.length}회차
            {group.category && <span className="event-category" style={{ marginLeft: 8 }}>{group.category}</span>}
          </p>
          <p className="group-quick-links">
            <Link href={`/${site}?q=${encodeURIComponent(group.title)}`}>이 {isRestaurant ? '식당' : '제목'} 다른 검색 ↗</Link>
            {!isRestaurant && (
              <Link href={`/${site}?q=${encodeURIComponent(group.venue)}`} style={{ marginLeft: 12 }}>
                이 {site === 'interpark' ? '공연장' : '극장'} 다른 일정 ↗
              </Link>
            )}
          </p>
        </div>
      </header>

      <section className="picker">
        <h2 className="picker-label">날짜</h2>
        <div className="day-picker">
          {days.map((d) => {
            const firstOnDay = group.entries.find((e) => dayKey(e.eventDatetime) === d)!;
            return (
              <Link
                key={d}
                href={`/${site}/g/${encodeGroupKey(groupKey)}?dt=${encodeURIComponent(firstOnDay.eventDatetime)}`}
                className={`day-chip ${d === selectedDay ? 'active' : ''}`}
                replace
              >
                {fmtDayLabel(d + 'T00:00:00')}
              </Link>
            );
          })}
        </div>

        <h2 className="picker-label">시간</h2>
        <div className="time-picker">
          {timesOnDay.map((e) => (
            <Link
              key={e.externalEventId}
              href={`/${site}/g/${encodeGroupKey(groupKey)}?dt=${encodeURIComponent(e.eventDatetime)}`}
              className={`time-chip ${e.externalEventId === selectedEntry.externalEventId ? 'active' : ''}`}
              replace
            >
              {fmtTime(e.eventDatetime)}
            </Link>
          ))}
        </div>
      </section>

      <section className="snapshot-meta">
        <span className={`source source-${source}`}>{source === 'valkey' ? '실시간' : 'MOCK'}</span>
        <span className="captured">최근 갱신: {new Date(snapshot.capturedAt).toLocaleString('ko-KR')}</span>
        <Link href={`/${site}/${encodeURIComponent(selectedEntry.externalEventId)}`} className="open-detail">
          단일 회차 전체보기 ↗
        </Link>
      </section>

      <WatchHandler
        site={site}
        externalEventId={selectedEntry.externalEventId}
        eventDatetime={snapshot.eventDatetime}
        selectorMode={isRestaurant ? 'time' : 'seat'}
      >
        {isRestaurant ? <TimeSlots snapshot={snapshot} /> : <SeatMap snapshot={snapshot} />}
      </WatchHandler>
    </div>
  );
}
