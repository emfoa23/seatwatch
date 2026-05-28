import Link from 'next/link';
import { listGroups, encodeGroupKey } from '@/lib/events';
import { SITE_LABELS, type Site } from '@/lib/types/seat';
import { SiteLogo } from './Icons';
import { Thumbnail } from './Thumbnail';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}

function uniqueDates(entries: { eventDatetime: string }[]): number {
  const set = new Set(entries.map((e) => e.eventDatetime.slice(0, 10)));
  return set.size;
}

export async function EventSearch({
  site,
  query,
  placeholder,
}: {
  site: Site;
  query?: string;
  placeholder: string;
}) {
  const groups = await listGroups(site, query, 200);
  const isRestaurant = site === 'catchtable';

  return (
    <div className="search-page">
      <header className="search-header">
        <h1 className="search-title">
          <SiteLogo site={site} size={28} />
          {SITE_LABELS[site]}
        </h1>
        <form className="search-form" action={`/${site}`}>
          <input
            name="q"
            type="search"
            placeholder={placeholder}
            defaultValue={query ?? ''}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary">검색</button>
        </form>
      </header>

      <p className="search-count">
        {query ? `"${query}" 검색 결과 ` : ''}{groups.length}건
      </p>

      {groups.length === 0 ? (
        <p className="empty">결과가 없습니다.</p>
      ) : (
        <ul className="event-list">
          {groups.map((g) => {
            const dateCount = uniqueDates(g.entries);
            const next = g.entries[0];
            return (
              <li key={g.groupKey}>
                <Link href={`/${site}/g/${encodeGroupKey(g.groupKey)}`}>
                  <Thumbnail title={g.title} category={g.category} size={72} wide />
                  <div className="event-card-body">
                    <strong className="event-title">{g.title}</strong>
                    {!isRestaurant && <span className="event-venue">{g.venue}{g.region ? ` · ${g.region}` : ''}</span>}
                    {isRestaurant && <span className="event-venue">{g.venue}</span>}
                    <span className="event-datetime">
                      가장 빠른 일정: {fmt(next.eventDatetime)}
                    </span>
                    <span className="event-meta">
                      {dateCount}일 · {g.entries.length}회차
                      {g.category && <span className="event-category">{g.category}</span>}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export { fmt, fmtDateOnly };
