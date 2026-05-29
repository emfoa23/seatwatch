'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SITE_LABELS, type Site, type EventIndexEntry } from '@/lib/types/seat';
import { encodeGroupKey } from '@/lib/events-key';
import { SiteLogo } from './Icons';
import { fmtShortDateTime as fmt } from '@/lib/format';

interface Group {
  groupKey: string;
  title: string;
  venue: string;
  region?: string;
  firstDatetime: string;
}

function makeGroupKey(site: Site, entry: EventIndexEntry): string {
  if (site === 'cgv' || site === 'megabox' || site === 'lotte') {
    return `${entry.venue}__${entry.title}`;
  }
  return entry.title;
}

function groupEntries(site: Site, entries: EventIndexEntry[]): Group[] {
  const map = new Map<string, Group>();
  for (const e of entries) {
    const key = makeGroupKey(site, e);
    const existing = map.get(key);
    if (existing) {
      if (e.eventDatetime < existing.firstDatetime) existing.firstDatetime = e.eventDatetime;
    } else {
      map.set(key, {
        groupKey: key,
        title: e.title,
        venue: e.venue,
        region: e.region,
        firstDatetime: e.eventDatetime,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.firstDatetime.localeCompare(b.firstDatetime));
}

export function EventSearch({ site, placeholder }: { site: Site; placeholder: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const initialQuery = sp.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'cache' | 'fetch' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setGroups([]);
        setSource(null);
        setErrorMsg(null);
        return;
      }
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setLoading(true);
      setErrorMsg(null);
      try {
        // Pending 일 경우 10초 간격으로 최대 90초까지 retry
        const deadline = Date.now() + 90_000;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const res = await fetch(`/api/search/${site}?q=${encodeURIComponent(trimmed)}`, {
            signal: ctl.signal,
          });
          const data = await res.json();
          if (res.status === 202) {
            // 처리 중 — 잠시 대기 후 retry
            if (Date.now() >= deadline) {
              setSource('error');
              setErrorMsg(data.message || '데이터 수집 대기 시간 초과 — 잠시 후 다시 검색해 주세요.');
              setGroups([]);
              return;
            }
            await new Promise((r) => setTimeout(r, (data.retryAfter ?? 10) * 1000));
            continue;
          }
          if (!res.ok) {
            setSource('error');
            setErrorMsg(
              res.status === 429
                ? `요청이 너무 많습니다. ${data.retryAfter ?? 60}초 후 다시.`
                : data.error || '검색 실패',
            );
            setGroups([]);
            return;
          }
          setSource(data.source);
          setGroups(groupEntries(site, data.entries as EventIndexEntry[]));
          return;
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setSource('error');
        setErrorMsg((e as Error).message);
        setGroups([]);
      } finally {
        setLoading(false);
      }
    },
    [site],
  );

  useEffect(() => {
    if (initialQuery) runSearch(initialQuery);
    // initialQuery 는 첫 마운트에만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    setSubmitted(trimmed);
    const url = trimmed ? `/${site}?q=${encodeURIComponent(trimmed)}` : `/${site}`;
    router.replace(url);
    runSearch(trimmed);
  };

  return (
    <div className="search-page">
      <header className="search-header">
        <h1 className="search-title">
          <SiteLogo site={site} size={28} />
          {SITE_LABELS[site]}
        </h1>
      </header>

      <form className="filter-form" onSubmit={onSubmit}>
        <div className="filter-row">
          <input
            name="q"
            type="search"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            className="filter-q"
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '검색 중…' : '검색'}
          </button>
        </div>
        <p className="filter-hint">
          {site === 'catchtable'
            ? '식당명만 검색 가능합니다. (지역·카테고리 검색은 지원하지 않습니다.)'
            : site === 'interpark'
              ? '공연명만 검색 가능합니다. (장르·공연장 검색은 지원하지 않습니다.)'
              : '영화명만 검색 가능합니다. (극장·지역 검색은 지원하지 않습니다.)'}
        </p>
      </form>

      {!submitted ? (
        <p className="empty">검색어를 입력하면 결과가 나타납니다.</p>
      ) : loading ? (
        <ul className="event-list">
          {[0, 1, 2].map((i) => (
            <li key={i} className="event-skeleton" aria-hidden="true">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-sub" />
              <div className="skeleton-line skeleton-meta" />
            </li>
          ))}
        </ul>
      ) : source === 'error' ? (
        <p className="empty">에러: {errorMsg}</p>
      ) : groups.length === 0 ? (
        <p className="empty">&quot;{submitted}&quot; 검색 결과가 없습니다.</p>
      ) : (
        <>
          <p className="search-count">
            &quot;{submitted}&quot; 검색 결과 {groups.length}건
            {source === 'cache' ? ' · 캐시' : source === 'fetch' ? ' · 실시간' : ''}
          </p>
          <ul className="event-list">
            {groups.map((g) => {
              const isRestaurant = site === 'catchtable';
              return (
                <li key={g.groupKey}>
                  <Link href={`/${site}/g/${encodeGroupKey(g.groupKey)}`}>
                    <div className="event-card-body">
                      <strong className="event-title">{g.title}</strong>
                      {!isRestaurant && (
                        <span className="event-venue">
                          {g.venue}
                          {g.region ? ` · ${g.region}` : ''}
                        </span>
                      )}
                      {isRestaurant && <span className="event-venue">{g.venue}</span>}
                      <span className="event-datetime">가장 빠른 일정: {fmt(g.firstDatetime)}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
