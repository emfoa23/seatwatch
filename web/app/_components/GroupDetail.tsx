import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGroup, encodeGroupKey } from '@/lib/events';
import { getSnapshot } from '@/lib/snapshot';
import { SITE_LABELS, type Site, MOVIE_SITES } from '@/lib/types/seat';
import { loadAllWatchContexts, resolveHighlight } from '@/lib/watch-context';
import { SiteLogo } from './Icons';
import { fmtDayLabel, fmtTime, fmtDateTime } from '@/lib/format';
import { SeatMap } from './SeatMap';
import { TimeSlots } from './TimeSlots';
import { WatchHandler } from './WatchHandler';
import { WatchBannerList } from './WatchBannerList';

function dayKey(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export async function GroupDetail({
  site,
  groupKey,
  eid,
  watch,
}: {
  site: Site;
  groupKey: string;
  eid?: string;
  watch?: string;
}) {
  const group = await getGroup(site, groupKey);
  if (!group) notFound();

  const isMovieSite = MOVIE_SITES.includes(site);
  const isRestaurant = site === 'catchtable';

  const selectedEntry = (eid && group.entries.find((e) => e.externalEventId === eid)) || group.entries[0];
  const selDay = dayKey(selectedEntry.eventDatetime);
  const selScreen = selectedEntry.screen ?? '';

  const days = Array.from(new Set(group.entries.map((e) => dayKey(e.eventDatetime)))).sort();
  const dayEntries = group.entries.filter((e) => dayKey(e.eventDatetime) === selDay);

  // 영화관: dayEntries 안에서 screen 별 entries
  const screens = isMovieSite
    ? Array.from(new Set(dayEntries.map((e) => e.screen ?? '')))
    : [];
  const screenEntries = isMovieSite
    ? dayEntries.filter((e) => (e.screen ?? '') === selScreen).sort((a, b) => a.eventDatetime.localeCompare(b.eventDatetime))
    : dayEntries.sort((a, b) => a.eventDatetime.localeCompare(b.eventDatetime));

  const { snapshot, source } = await getSnapshot(site, selectedEntry.externalEventId);
  const contexts = await loadAllWatchContexts(site, selectedEntry.externalEventId);
  const highlighted = resolveHighlight(contexts, watch);

  const enc = encodeGroupKey(groupKey);
  const linkFor = (entryId: string) => `/${site}/g/${enc}?eid=${encodeURIComponent(entryId)}`;

  return (
    <div className="group-detail">
      <header className="group-header">
        <div className="group-meta">
          <div className="group-meta-top">
            <SiteLogo site={site} size={20} />
            <span className="badge-text">{SITE_LABELS[site]}</span>
          </div>
          <h1>{group.title}</h1>
          {!isRestaurant && <p className="venue">{group.venue}{group.region ? ` · ${group.region}` : ''}</p>}
          {isRestaurant && <p className="venue">{group.venue}</p>}
          <p className="group-quick-links">
            <Link href={`/${site}?q=${encodeURIComponent(group.title)}`}>이 {isRestaurant ? '식당' : '제목'} 다른 검색 ↗</Link>
            {!isRestaurant && (
              <Link href={`/${site}?q=${encodeURIComponent(group.venue)}`} style={{ marginLeft: 12 }}>
                이 {isMovieSite ? '극장' : '공연장'} 다른 일정 ↗
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
                href={linkFor(firstOnDay.externalEventId)}
                className={`day-chip ${d === selDay ? 'active' : ''}`}
                replace
              >
                {fmtDayLabel(d + 'T00:00:00')}
              </Link>
            );
          })}
        </div>

        {isMovieSite && screens.length > 0 && (
          <>
            <h2 className="picker-label">상영관</h2>
            <div className="venue-picker">
              {screens.map((sc) => {
                const firstOnScreen = dayEntries.find((e) => (e.screen ?? '') === sc)!;
                return (
                  <Link
                    key={sc || '_none'}
                    href={linkFor(firstOnScreen.externalEventId)}
                    className={`venue-chip ${sc === selScreen ? 'active' : ''}`}
                    replace
                  >
                    <span className="venue-name">{sc || '본관'}</span>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {!isRestaurant && (
          <>
            <h2 className="picker-label">시간</h2>
            <div className="time-picker">
              {screenEntries.map((e) => (
                <Link
                  key={e.externalEventId}
                  href={linkFor(e.externalEventId)}
                  className={`time-chip ${e.externalEventId === selectedEntry.externalEventId ? 'active' : ''}`}
                  replace
                >
                  {fmtTime(e.eventDatetime)}
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="snapshot-meta">
        <span className={`source source-${source}`}>{source === 'valkey' ? '실시간' : 'MOCK'}</span>
        {snapshot.capturedAt && !Number.isNaN(new Date(snapshot.capturedAt).getTime()) ? (
          <span className="captured">최근 갱신: {fmtDateTime(snapshot.capturedAt)}</span>
        ) : (
          <span className="captured dim">갱신 정보 없음</span>
        )}
      </section>

      <WatchBannerList contexts={contexts} />

      <WatchHandler
        site={site}
        externalEventId={selectedEntry.externalEventId}
        eventDatetime={snapshot.eventDatetime}
        selectorMode={isRestaurant ? 'time' : 'seat'}
        maxParty={snapshot.maxCapacity}
      >
        {isRestaurant
          ? <TimeSlots snapshot={snapshot} registered={highlighted} />
          : <SeatMap snapshot={snapshot} registered={highlighted} />}
      </WatchHandler>
    </div>
  );
}
