import { getSnapshot } from '@/lib/snapshot';
import { TimeSlots } from '@/app/_components/TimeSlots';
import { EventHeader } from '@/app/_components/EventHeader';
import { WatchHandler } from '@/app/_components/WatchHandler';
import { WatchBannerList } from '@/app/_components/WatchBannerList';
import { loadAllWatchContexts, resolveHighlight } from '@/lib/watch-context';

export const dynamic = 'force-dynamic';

export default async function CatchtablePage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ watch?: string }>;
}) {
  const { shopId } = await params;
  const { watch } = await searchParams;
  const decoded = decodeURIComponent(shopId);
  const { snapshot, source } = await getSnapshot('catchtable', decoded);
  const contexts = await loadAllWatchContexts('catchtable', decoded);
  const highlighted = resolveHighlight(contexts, watch);
  return (
    <div className="event-page">
      <EventHeader snapshot={snapshot} source={source} />
      <WatchBannerList contexts={contexts} />
      <WatchHandler
        site="catchtable"
        externalEventId={decoded}
        eventDatetime={snapshot.eventDatetime}
        selectorMode="time"
      >
        <TimeSlots snapshot={snapshot} registered={highlighted} />
      </WatchHandler>
    </div>
  );
}
