import Link from 'next/link';
import { listEvents } from '@/lib/events';
import { SITE_LABELS, type Site } from '@/lib/types/seat';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const events = await listEvents(site, query, 200);

  return (
    <div className="search-page">
      <header className="search-header">
        <h1>{SITE_LABELS[site]}</h1>
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
        {query ? `"${query}" 검색 결과 ` : ''}{events.length}건
      </p>

      {events.length === 0 ? (
        <p className="empty">결과가 없습니다.</p>
      ) : (
        <ul className="event-list">
          {events.map((e) => (
            <li key={e.externalEventId}>
              <Link href={`/${site}/${encodeURIComponent(e.externalEventId)}`}>
                <span className={`badge badge-${site}`}>{SITE_LABELS[site]}</span>
                <div className="event-card-body">
                  <strong className="event-title">{e.title}</strong>
                  <span className="event-venue">{e.venue}{e.region ? ` · ${e.region}` : ''}</span>
                  <span className="event-datetime">{fmt(e.eventDatetime)}</span>
                  {e.category && <span className="event-category">{e.category}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
