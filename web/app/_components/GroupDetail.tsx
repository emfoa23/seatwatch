import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGroup } from '@/lib/events';
import { getCachedSnapshot } from '@/lib/cache';
import { SITE_LABELS, type Site } from '@/lib/types/seat';
import { loadAllWatchContexts, resolveHighlight } from '@/lib/watch-context';
import { SiteLogo } from './Icons';
import { SnapshotProgressive } from './SnapshotProgressive';
import { WatchBannerList } from './WatchBannerList';

export async function GroupDetail({
  site,
  groupKey,
  watch,
}: {
  site: Site;
  groupKey: string;
  watch?: string;
}) {
  const group = await getGroup(site, groupKey);
  if (!group) notFound();

  const isRestaurant = site === 'catchtable';
  // 회차 단위 entries 가 같은 title 의 영화/공연/식당 → 첫 entry 가 대표.
  const entry = group.entries[0];

  const cachedSnap = await getCachedSnapshot(site, entry.externalEventId, entry.eventDatetime);
  const contexts = await loadAllWatchContexts(site, entry.externalEventId);
  const highlighted = resolveHighlight(contexts, watch);

  return (
    <div className="group-detail">
      <header className="group-header">
        <div className="group-meta">
          <div className="group-meta-top">
            <SiteLogo site={site} size={20} />
            <span className="badge-text">{SITE_LABELS[site]}</span>
          </div>
          <h1>{group.title}</h1>
          {!isRestaurant && (
            <p className="venue">
              {group.venue}
              {group.region ? ` · ${group.region}` : ''}
            </p>
          )}
          {isRestaurant && <p className="venue">{group.venue}</p>}
          <p className="group-quick-links">
            <Link href={`/${site}?q=${encodeURIComponent(group.title)}`}>
              이 {isRestaurant ? '식당' : '제목'} 다른 검색 ↗
            </Link>
          </p>
        </div>
      </header>

      <WatchBannerList contexts={contexts} />

      <SnapshotProgressive
        site={site}
        externalEventId={entry.externalEventId}
        initial={cachedSnap}
        registered={highlighted}
        ready={true}
      />
    </div>
  );
}
