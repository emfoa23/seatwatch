import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGroup, encodeGroupKey } from '@/lib/events';
import { getCachedSnapshot } from '@/lib/cache';
import { SITE_LABELS, type Site, MOVIE_SITES } from '@/lib/types/seat';
import { loadAllWatchContexts, resolveHighlight } from '@/lib/watch-context';
import { SiteLogo } from './Icons';
import { fmtDayLabel, fmtTime } from '@/lib/format';
import { SnapshotProgressive } from './SnapshotProgressive';
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
  day,
  screen,
  watch,
}: {
  site: Site;
  groupKey: string;
  eid?: string;
  day?: string;
  screen?: string;
  watch?: string;
}) {
  const group = await getGroup(site, groupKey);
  if (!group) notFound();

  const isMovieSite = MOVIE_SITES.includes(site);
  const isRestaurant = site === 'catchtable';

  // 1) 날짜 picker — 식당이면 ?day= 필요, 영화/공연은 default 첫 날짜
  const days = Array.from(new Set(group.entries.map((e) => dayKey(e.eventDatetime)))).sort();
  const selDay = day && days.includes(day)
    ? day
    : eid
      ? dayKey((group.entries.find((e) => e.externalEventId === eid) ?? group.entries[0]).eventDatetime)
      : days[0];

  const dayEntries = group.entries.filter((e) => dayKey(e.eventDatetime) === selDay);

  // 2) 상영관 picker (영화관)
  const screens = isMovieSite
    ? Array.from(new Set(dayEntries.map((e) => e.screen ?? '')))
    : [];
  const selScreen = isMovieSite
    ? (screen && screens.includes(screen)
        ? screen
        : eid
          ? (dayEntries.find((e) => e.externalEventId === eid)?.screen ?? screens[0] ?? '')
          : screens[0] ?? '')
    : '';

  // 3) 시간 picker
  const screenEntries = isMovieSite
    ? dayEntries.filter((e) => (e.screen ?? '') === selScreen).sort((a, b) => a.eventDatetime.localeCompare(b.eventDatetime))
    : dayEntries.sort((a, b) => a.eventDatetime.localeCompare(b.eventDatetime));

  const selectedEntry = eid
    ? screenEntries.find((e) => e.externalEventId === eid) ?? screenEntries[0] ?? dayEntries[0]
    : isRestaurant
      ? dayEntries[0]
      : undefined;

  // Lazy snapshot: 조건 충족 시 fetch 활성화
  // 식당: selDay 만 결정되면 ready
  // 영화/공연: selectedEntry (eid) 가 있어야 ready
  const ready = isRestaurant ? !!selDay : !!selectedEntry;
  const snapshotKey = isRestaurant ? dayEntries[0] : selectedEntry;
  const cachedSnap =
    snapshotKey
      ? await getCachedSnapshot(site, snapshotKey.externalEventId, snapshotKey.eventDatetime)
      : null;

  const contexts = snapshotKey ? await loadAllWatchContexts(site, snapshotKey.externalEventId) : [];
  const highlighted = resolveHighlight(contexts, watch);

  const enc = encodeGroupKey(groupKey);
  const linkFor = (params: { eid?: string; day?: string; screen?: string }) => {
    const q = new URLSearchParams();
    if (params.day) q.set('day', params.day);
    if (params.screen) q.set('screen', params.screen);
    if (params.eid) q.set('eid', params.eid);
    return `/${site}/g/${enc}${q.toString() ? '?' + q.toString() : ''}`;
  };

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
          </p>
        </div>
      </header>

      <section className="picker">
        <h2 className="picker-label">날짜</h2>
        <div className="day-picker">
          {days.map((d) => (
            <Link
              key={d}
              href={linkFor({ day: d })}
              className={`day-chip ${d === selDay ? 'active' : ''}`}
              replace
            >
              {fmtDayLabel(d + 'T00:00:00')}
            </Link>
          ))}
        </div>

        {isMovieSite && screens.length > 0 && (
          <>
            <h2 className="picker-label">상영관</h2>
            <div className="venue-picker">
              {screens.map((sc) => (
                <Link
                  key={sc || '_none'}
                  href={linkFor({ day: selDay, screen: sc })}
                  className={`venue-chip ${sc === selScreen ? 'active' : ''}`}
                  replace
                >
                  <span className="venue-name">{sc || '본관'}</span>
                </Link>
              ))}
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
                  href={linkFor({
                    day: selDay,
                    screen: isMovieSite ? selScreen : undefined,
                    eid: e.externalEventId,
                  })}
                  className={`time-chip ${e.externalEventId === selectedEntry?.externalEventId ? 'active' : ''}`}
                  replace
                >
                  {fmtTime(e.eventDatetime)}
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      <WatchBannerList contexts={contexts} />

      {snapshotKey && (
        <SnapshotProgressive
          site={site}
          externalEventId={snapshotKey.externalEventId}
          initial={cachedSnap}
          registered={highlighted}
          mode={isRestaurant ? 'time' : 'seat'}
          ready={ready}
        />
      )}
    </div>
  );
}
