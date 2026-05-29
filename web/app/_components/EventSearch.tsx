import Link from 'next/link';
import { listGroups, encodeGroupKey, type EventFilters } from '@/lib/events';
import { SITE_LABELS, type Site } from '@/lib/types/seat';
import { SiteLogo } from './Icons';

import { fmtShortDateTime as fmt } from '@/lib/format';

function uniqueDates(entries: { eventDatetime: string }[]): number {
  const set = new Set(entries.map((e) => e.eventDatetime.slice(0, 10)));
  return set.size;
}

export async function EventSearch({
  site,
  filters,
  placeholder,
}: {
  site: Site;
  filters: EventFilters;
  placeholder: string;
}) {
  const groups = await listGroups(site, filters, 200);

  return (
    <div className="search-page">
      <header className="search-header">
        <h1 className="search-title">
          <SiteLogo site={site} size={28} />
          {SITE_LABELS[site]}
        </h1>
      </header>

      <form className="filter-form" action={`/${site}`}>
        <div className="filter-row">
          <input
            name="q"
            type="search"
            placeholder={placeholder}
            defaultValue={filters.query ?? ''}
            autoComplete="off"
            className="filter-q"
          />
          <button type="submit" className="btn btn-primary">검색</button>
        </div>
        <details className="filter-extra" open={!!(filters.dateFrom || filters.dateTo || filters.timeFrom || filters.timeTo)}>
          <summary>날짜·시간 필터</summary>
          <div className="filter-grid">
            <label>
              <span>날짜 시작</span>
              <input name="date_from" type="date" defaultValue={filters.dateFrom ?? ''} />
            </label>
            <label>
              <span>날짜 끝</span>
              <input name="date_to" type="date" defaultValue={filters.dateTo ?? ''} />
            </label>
            <label>
              <span>시간 시작</span>
              <input name="time_from" type="time" defaultValue={filters.timeFrom ?? ''} />
            </label>
            <label>
              <span>시간 끝</span>
              <input name="time_to" type="time" defaultValue={filters.timeTo ?? ''} />
            </label>
          </div>
        </details>
      </form>

      <p className="search-count">
        {filters.query ? `"${filters.query}" 검색 결과 ` : ''}{groups.length}건
      </p>

      {groups.length === 0 ? (
        <p className="empty">결과가 없습니다.</p>
      ) : (
        <ul className="event-list">
          {groups.map((g) => {
            const dateCount = uniqueDates(g.entries);
            const next = g.entries[0];
            const isRestaurant = site === 'catchtable';
            return (
              <li key={g.groupKey}>
                <Link href={`/${site}/g/${encodeGroupKey(g.groupKey)}`}>
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
